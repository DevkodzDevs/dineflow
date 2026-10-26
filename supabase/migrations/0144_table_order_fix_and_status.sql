-- 0144 · A table's QR order (2026-10-27, the owner: "I can't place the order"). Additive: one function replaced, one added,
-- no table or policy changed.
--
-- 1. dine_order: every order with an offer failed since 0074 with "operator does not exist: offer_scope = text" — the
--    scope test compared the enum column with a CASE that yields text. The storefront sends its best offer whenever one
--    applies, so a table at happy hour (or any dining offer) could never order; the public page has no toast, so the guest
--    saw nothing at all. The scope is compared as text now. The offer is also held to what it says: only a flat % or a flat
--    amount takes money off (a happy hour or a free item never did here — the page showed ₹20 off and the server would
--    have charged it), and only on its days and between its hours (Asia/Kolkata; days 0–6 from Sunday, 7 also Sunday;
--    no days or no hours means any). The storefront picks with the same rule, so the guest pays what the sheet showed.
-- 2. dine_table_orders(slug, table token, ids): what a guest at a table may know about the orders this phone placed there —
--    reference, dishes, total and where it stands (sent · accepted · cooking · ready · served · rejected), from the
--    online order and, once accepted, its order's dishes. The table's token and the order's id are both needed; at most
--    ten ids, the last twelve hours. Granted to anon on purpose (since 0098 new functions are not anon's by default).

create or replace function public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text default 'delivery', p_note text default null, p_offer uuid default null, p_table text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  ph text; nowl timestamp := (now() at time zone 'Asia/Kolkata'); dow int := extract(dow from (now() at time zone 'Asia/Kolkata'))::int;
begin
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial','active');   -- 0100
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  if p_mode = 'dine_in' then
    select * into t from dining_tables where restaurant_id = rid and qr_token = p_table and p_table is not null;
    if not found then raise exception 'scan the code on your table to order'; end if;
    if not r.dining_enabled then raise exception 'ordering at the table is not switched on here'; end if;
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
    select m.is_active and m.is_available and (p_mode = 'dine_in' or m.online_available) into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := least(99, greatest(1, (it->>'qty')::numeric));                                     -- 0098: at most 99 of a dish
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', left(it->>'note', 200),
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if p_mode <> 'dine_in' and sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    -- 0144: the scope as text (it was enum = text, which failed every order with an offer), money off only for a flat %
    -- or amount, and only on its days and hours
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active
      and scope::text in (case when p_mode = 'dine_in' then 'dining' else 'delivery' end, 'both') and sub >= min_order
      and kind::text in ('flat_pct', 'flat_amount')
      and (starts_on is null or starts_on <= nowl::date) and (ends_on is null or ends_on >= nowl::date)
      and (coalesce(cardinality(days), 0) = 0 or dow = any(days) or (dow = 0 and 7 = any(days)))
      and (from_time is null or to_time is null or nowl::time between from_time and to_time);
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  -- at the table there is nothing to pack and nothing to deliver
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + case when p_mode = 'dine_in' then 0 else r.packing_charge end;
  tot := round(sub - disc + fee + round((sub - disc) * r.gst_rate / 100, 2));

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := case when p_mode = 'dine_in' then 'TBL-' else 'WEB-' end || to_char(now(), 'YYMMDDHH24MISS') || '-' || encode(extensions.gen_random_bytes(2), 'hex');   -- 0098
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at, table_id)
    values (rid, ch.id, ext, right(ext, 6), left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20),
            case when p_mode = 'dine_in' then 'Table ' || t.name else left(p_guest->>'address', 300) end,
            items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name), now(), t.id)
    returning id into oid;
  -- a table order goes straight to the kitchen when the website channel accepts on its own
  if p_mode = 'dine_in' and ch.auto_accept then
    accepted := accept_online_order_for(oid, rid);
    select order_no into ono from orders where id = accepted;
  end if;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'table', t.name, 'accepted', accepted is not null, 'order_no', ono,
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end
           + case when r.rush_until > now() then coalesce(r.rush_extra_min, 0) else 0 end);
end $function$;

create or replace function public.dine_table_orders(p_slug text, p_table text, p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'ref', o.display_id, 'at', o.created_at, 'total', o.gross, 'order_no', ord.order_no,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', (i->>'qty')::numeric)), '[]'::jsonb) from jsonb_array_elements(o.items) i),
      'n', coalesce(s.n, 0), 'ready', coalesce(s.ready, 0) + coalesce(s.served, 0), 'served', coalesce(s.served, 0),
      'stage', case
        when o.status::text in ('rejected', 'cancelled') or ord.status::text = 'cancelled' then 'rejected'
        when o.order_id is null then 'sent'
        when coalesce(s.n, 0) = 0 then 'accepted'
        when s.served = s.n then 'served'
        when s.ready + s.served = s.n then 'ready'
        when s.cooking + s.ready + s.served > 0 then 'cooking'
        else 'accepted' end) as x
    from online_orders o
    join dining_tables t on t.id = o.table_id and t.qr_token = p_table
    join restaurants r on r.id = o.restaurant_id and r.booking_slug = p_slug
    left join orders ord on ord.id = o.order_id
    left join lateral (
      select count(*) filter (where i.status <> 'cancelled') as n, count(*) filter (where i.status = 'preparing') as cooking,
             count(*) filter (where i.status = 'ready') as ready, count(*) filter (where i.status = 'served') as served
        from order_items i where i.order_id = o.order_id) s on true
    where p_table is not null and o.id = any(p_ids[1:10]) and o.created_at > now() - interval '12 hours'
  ) q
$$;
revoke all on function public.dine_table_orders(text, text, uuid[]) from public;
grant execute on function public.dine_table_orders(text, text, uuid[]) to anon, authenticated;
