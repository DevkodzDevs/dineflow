-- 0181 — Own online ordering: pay by UPI before the order reaches the counter (2026-11-10).
--
-- The owner's own storefront (`dine_order`, the 'website' channel, 0 commission) already takes delivery and takeaway orders.
-- Until now one landed straight in the counter's New list, so a prank or a mis-tap could start the kitchen before any money
-- moved. With a connected Razorpay gateway (0022 / 0178) the owner can switch on **prepay**: the order is HELD in online_orders
-- with pay_status='pending' — not shown to the counter, not in the kitchen — until the guest pays the dynamic UPI QR issued for
-- it. Razorpay sends qr_code.credited to /api/webhooks/razorpay, `dine_prepay_settle` marks the order paid, and only then does it
-- appear in New (marked Paid) for the counter to accept or reject. Unpaid holds older than 20 minutes are swept to 'rejected'
-- (they never reached the kitchen). With the switch off, or no gateway, `dine_order` behaves exactly as before.
--
-- Reuses the money rail of 0178: the SAME payment_gateways credentials, the SAME Razorpay helper (lib/razorpay.ts) and the SAME
-- webhook URL. New and parallel to the bill's pay_token — a pay_token on the online_orders row, read only by the service role
-- through dine_prepay_gateway / _qr_set / _settle (each checks auth.role() itself). Nothing here touches a bill, the day-close or
-- the kitchen; a paid order is an ordinary online order from the moment the counter accepts it.
--
-- NOT in this migration: a refund when the counter rejects a PAID order (the owner refunds from the Razorpay dashboard and
-- cancels the order for now); card payment on the storefront (UPI QR only); WhatsApp order updates and storefront loyalty (0182/0183).

-- 1 · the owner's switch, and the hold's own payment fields on the order
alter table restaurants add column if not exists online_prepay boolean not null default false;
grant select (online_prepay) on public.restaurants to anon, authenticated;   -- 0098 built the column grant from the columns then present

alter table online_orders
  add column if not exists pay_status text not null default 'none',   -- none = pay at the counter · pending = awaiting UPI · paid
  add column if not exists pay_token text,
  add column if not exists pay_qr_id text,
  add column if not exists pay_qr_url text,
  add column if not exists pay_qr_amount numeric(12,2),
  add column if not exists paid_at timestamptz;
alter table online_orders add constraint online_orders_pay_status_ck check (pay_status in ('none', 'pending', 'paid')) not valid;
create unique index if not exists online_orders_pay_token_key on online_orders(pay_token) where pay_token is not null;
create index if not exists online_orders_pending_idx on online_orders(restaurant_id, placed_at) where pay_status = 'pending';

-- 2 · sweep stale holds (called by dine_order; service role / definer only)
create or replace function public._dine_prepay_sweep(p_rid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update online_orders
     set status = 'rejected', pay_status = 'none',
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('rejected_reason', 'payment not completed')
   where restaurant_id = p_rid and pay_status = 'pending' and order_id is null and placed_at < now() - interval '20 minutes';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._dine_prepay_sweep(uuid) from public, anon, authenticated;

-- 3 · the server's view of the gateway for ONE held order (mirror of pay_link_gateway, 0178). Service role only.
create or replace function public.dine_prepay_gateway(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select jsonb_build_object('key_id', g.key_id, 'key_secret', g.key_secret, 'webhook_secret', g.webhook_secret, 'provider', g.provider,
                            'total', o.gross, 'name', r.name, 'order_id', o.id, 'ref', o.display_id, 'pay_status', o.pay_status,
                            'qr_id', o.pay_qr_id, 'qr_url', o.pay_qr_url, 'qr_amount', o.pay_qr_amount)
    into out
  from online_orders o join restaurants r on r.id = o.restaurant_id
       join payment_gateways g on g.restaurant_id = r.id
  where o.pay_token = p_token and o.pay_status in ('pending', 'paid') and nullif(g.key_secret, '') is not null;
  return out;   -- null: no such held order, or the property has no gateway
end $$;
revoke all on function public.dine_prepay_gateway(text) from public, anon, authenticated;

-- 4 · remember the UPI code issued for a held order (mirror of pay_link_qr_set). Service role only.
create or replace function public.dine_prepay_qr_set(p_token text, p_id text, p_url text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  update online_orders set pay_qr_id = p_id, pay_qr_url = p_url, pay_qr_amount = p_amount where pay_token = p_token and pay_status = 'pending';
  if not found then raise exception 'order not open for payment'; end if;
end $$;
revoke all on function public.dine_prepay_qr_set(text, text, text, numeric) from public, anon, authenticated;

-- 5 · the UPI code was paid: mark the held order paid so the counter sees it (mirror of pay_link_settle). Service role only;
--     idempotent (the browser's confirm and the webhook can both arrive).
create or replace function public.dine_prepay_settle(p_token text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; was_paid boolean := false;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select * into o from online_orders where pay_token = p_token for update;
  if not found then raise exception 'no such order'; end if;
  if o.pay_status = 'paid' then
    was_paid := true;
  else
    update online_orders
       set pay_status = 'paid', is_prepaid = true, paid_at = now(), status = case when status = 'rejected' then 'new' else status end,
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('pay_ref', p_ref, 'prepaid_upi', true)
     where id = o.id;
  end if;
  return jsonb_build_object('ok', true, 'already', was_paid, 'id', o.id, 'ref', o.display_id);
end $$;
revoke all on function public.dine_prepay_settle(text, text) from public, anon, authenticated;

-- 6 · the guest's pay page polls this (no secret in it). anon.
create or replace function public.dine_prepay_status(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', o.pay_status, 'total', o.gross, 'ref', o.display_id, 'name', r.name, 'track', o.track_token)
  from online_orders o join restaurants r on r.id = o.restaurant_id
  where o.pay_token = p_token and o.pay_status in ('pending', 'paid');
$$;
revoke all on function public.dine_prepay_status(text) from public;
grant execute on function public.dine_prepay_status(text) to anon, authenticated;

-- 7 · dine_order: the prepay branch and the sweep (0170's body, with 0181's two additions)
CREATE OR REPLACE FUNCTION public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text DEFAULT 'delivery'::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text, p_room text DEFAULT NULL::text, p_pass text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  grp jsonb := '[]'; tx jsonb; mr numeric; ph text; nowl timestamp := (now() at time zone 'Asia/Kolkata'); dow int := extract(dow from (now() at time zone 'Asia/Kolkata'))::int;
  rm rooms%rowtype; bk bookings%rowtype; gu guests%rowtype; gph text; pass text := null;   -- 0170
  ptok text := null; prepay boolean := false;   -- 0181 prepay
begin
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial','active');   -- 0100
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  perform _dine_prepay_sweep(rid);   -- 0181: drop holds nobody paid for (older than 20 min) so the counter list stays clean
  if p_mode = 'dine_in' then
    select * into t from dining_tables where restaurant_id = rid and qr_token = p_table and p_table is not null;
    if not found then raise exception 'scan the code on your table to order'; end if;
    if not r.dining_enabled then raise exception 'ordering at the table is not switched on here'; end if;
    -- 0166: not while the table is being cleaned, and not once its open order's bill is out (a round joins an open order with
    -- no bill — accept_online_order_for, 0145)
    if exists (select 1 from table_cleanings c where c.table_id = t.id and c.status in ('pending', 'in_progress')) then
      raise exception 'this table is still being cleaned — please order once it is ready';
    end if;
    if exists (select 1 from orders o where o.table_id = t.id and o.status = 'open')
       and not exists (select 1 from orders o where o.table_id = t.id and o.status = 'open'
                         and not exists (select 1 from bills b where b.order_id = o.id and b.status in ('unpaid', 'paid'))) then
      raise exception 'the bill for this table is already out — please ask the staff to add anything more';
    end if;
  elsif p_mode = 'room' then
    -- 0170: the code in a room. The guest staying there proves it is them once — the last four digits of the phone on the
    -- booking — and gets a pass for the rest of the stay; the next guest in the room needs their own. Five wrong tries in
    -- half an hour and the room orders through reception. A wrong try is answered, not raised, so the try is counted.
    select * into rm from rooms where restaurant_id = rid and qr_token = p_room and p_room is not null;
    if not found then raise exception 'scan the code in your room to order'; end if;
    select * into bk from bookings where restaurant_id = rid and room_id = rm.id and status = 'checked_in' order by checked_in_at desc nulls last limit 1;
    if not found then raise exception 'room % has no guest checked in — please call reception', rm.number; end if;
    select * into gu from guests where id = bk.guest_id;
    if bk.room_pass is not null and p_pass is not null and p_pass = bk.room_pass then
      pass := bk.room_pass;
    else
      if (select count(*) from rate_hits where bucket = 'roompass:' || bk.id and at > clock_timestamp() - interval '30 minutes') >= 5 then
        return jsonb_build_object('ok', false, 'verify', true, 'error', 'too many tries — please call reception to order');
      end if;
      gph := regexp_replace(coalesce(gu.phone, ''), '\D', '', 'g');
      if length(gph) < 4 then raise exception 'please call reception to order — there is no phone number on this booking'; end if;
      if coalesce(regexp_replace(coalesce(p_pass, ''), '\D', '', 'g'), '') <> right(gph, 4) then
        perform _hit('roompass:' || bk.id, 1000, interval '30 minutes');
        return jsonb_build_object('ok', false, 'verify', true, 'error', 'those digits do not match the phone number on this room''s booking');
      end if;
      pass := coalesce(bk.room_pass, encode(extensions.gen_random_bytes(12), 'hex'));
      if bk.room_pass is null then update bookings set room_pass = pass where id = bk.id; end if;
    end if;
    p_guest := jsonb_build_object('full_name', coalesce(nullif(gu.full_name, ''), 'Room ' || rm.number), 'phone', gu.phone);
  else
    if not r.is_listed then raise exception 'this place is not taking orders'; end if;
    if p_mode = 'delivery' and not r.delivery_enabled then raise exception 'delivery is not available here'; end if;
    if p_mode = 'takeaway' and not r.takeaway_enabled then raise exception 'takeaway is not available here'; end if;
    -- the kitchen asked for a breather: online orders wait; a guest at a table is never turned away
    if r.online_paused_until > now() then
      if r.online_paused_until = 'infinity' then raise exception 'not taking online orders right now'; end if;
      raise exception 'not taking online orders right now — back at %', to_char(r.online_paused_until at time zone 'Asia/Kolkata', 'HH12:MI am');
    end if;
  end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;
  -- 0098: at most 100 lines, a phone number the restaurant can call, ten orders an hour per number
  -- and three hundred an hour per place
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 100 then raise exception 'that basket is too large — please call the restaurant'; end if;
  ph := right(regexp_replace(p_guest->>'phone', '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the restaurant can call'; end if;
  if not _hit('order:' || rid || ':' || ph, 10, interval '1 hour') then raise exception 'this number has ordered a lot in the last hour — please call the restaurant'; end if;
  if not _hit('order:' || rid, 300, interval '1 hour') then raise exception 'the kitchen is very busy — please try again in a few minutes'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select m.is_active and m.is_available and (p_mode in ('dine_in', 'room') or m.online_available) into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := least(99, greatest(1, (it->>'qty')::numeric));                                     -- 0098: at most 99 of a dish
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', left(it->>'note', 200),
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
    -- 0146: each dish's value at its own GST rate (the property's when the dish has none)
    select m.gst_rate into mr from menu_items m where m.id = nullif(pl->>'menu_item_id', '')::uuid;
    grp := grp || jsonb_build_object('rate', coalesce(mr, r.gst_rate), 'amount', (pl->>'price')::numeric * q);
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if p_mode not in ('dine_in', 'room') and sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    -- 0144: the scope as text (it was enum = text, which failed every order with an offer), money off only for a flat %
    -- or amount, and only on its days and hours
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active
      and scope::text in (case when p_mode in ('dine_in', 'room') then 'dining' else 'delivery' end, 'both') and sub >= min_order
      and kind::text in ('flat_pct', 'flat_amount')
      and (starts_on is null or starts_on <= nowl::date) and (ends_on is null or ends_on >= nowl::date)
      and (coalesce(cardinality(days), 0) = 0 or dow = any(days) or (dow = 0 and 7 = any(days)))
      and (from_time is null or to_time is null or nowl::time between from_time and to_time);
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  -- at the table there is nothing to pack and nothing to deliver
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + case when p_mode in ('dine_in', 'room') then 0 else r.packing_charge end;
  -- 0146: the quote is the bill's own sum (bill_tax): each rate on its share, the packing / delivery fee taxed with the food,
  -- and no GST at all for a property that may not collect it
  tx := bill_tax(grp, sub - disc + fee, gst_collectable(r.gst_scheme, r.gstin));
  tot := round(sub - disc + fee + (tx->>'cgst')::numeric + (tx->>'sgst')::numeric);

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := case when p_mode = 'dine_in' then 'TBL-' when p_mode = 'room' then 'RM-' else 'WEB-' end || to_char(now(), 'YYMMDDHH24MISS') || '-' || encode(extensions.gen_random_bytes(2), 'hex');   -- 0098
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at, table_id, room_id, booking_id)
    values (rid, ch.id, ext, right(ext, 6), left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20),
            case when p_mode = 'dine_in' then 'Table ' || t.name when p_mode = 'room' then 'Room ' || rm.number else left(p_guest->>'address', 300) end,
            items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name, 'room', rm.number, 'tax', (tx->>'cgst')::numeric + (tx->>'sgst')::numeric), now(), t.id, rm.id, bk.id)
    returning id into oid;
  -- a table order goes straight to the kitchen when the website channel accepts on its own
  if p_mode in ('dine_in', 'room') and ch.auto_accept then
    accepted := accept_online_order_for(oid, rid);
    select order_no into ono from orders where id = accepted;
  end if;
  -- 0181: prepay. A delivery/takeaway order from the owner's own storefront, when the owner switched prepay on AND a
  -- payment gateway is connected, is HELD for payment: it is not in the counter's New list and not in the kitchen until the
  -- guest pays its UPI QR (/dine/pay/<token> → qr_code.credited → dine_prepay_settle marks it paid; then the counter sees it).
  -- A fake or mis-tapped order costs the kitchen nothing. Without the switch or a gateway this branch is skipped and the order
  -- reaches the counter exactly as before.
  prepay := p_mode in ('delivery', 'takeaway') and coalesce(r.online_prepay, false)
            and exists (select 1 from payment_gateways g where g.restaurant_id = rid and nullif(g.key_secret, '') is not null);
  if prepay then
    ptok := encode(extensions.gen_random_bytes(16), 'hex');
    update online_orders set pay_status = 'pending', pay_token = ptok where id = oid;
    return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
      'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'prepay', true, 'pay_token', ptok);
  end if;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'table', t.name, 'room', rm.number, 'pass', pass, 'accepted', accepted is not null, 'order_no', ono,
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end
           + case when r.rush_until > now() then coalesce(r.rush_extra_min, 0) else 0 end);
end $function$;
revoke all on function public.dine_order(text, jsonb, jsonb, text, text, uuid, text, text, text) from public;
grant execute on function public.dine_order(text, jsonb, jsonb, text, text, uuid, text, text, text) to anon, authenticated;


notify pgrst, 'reload schema';
