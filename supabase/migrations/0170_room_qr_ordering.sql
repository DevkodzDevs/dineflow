-- 0170 — Order from the room (2026-11-03, the owner: "guests in rooms order food by scanning the room's QR, and the bill goes
-- to that room's billing").
--
-- A QR code in each room opens the menu for that room (/dine/<slug>?r=<rooms.qr_token>). The guest staying there proves it is
-- them once — the last four digits of the phone number on their booking — and the phone keeps a pass for the rest of the stay
-- (bookings.room_pass, new per stay, so the next guest in the room cannot order on the last one's pass or the other way round).
-- The order is a room-service order on the guest's stay (orders.booking_id); the kitchen cooks it as usual, and when its
-- last dish is marked served it is charged to the room's folio by itself (the restaurant charge and its GST, as
-- post_order_to_room does since 0155). Check-out refuses while room service is still open on the stay, so nothing is lost.
--
-- Additive: new columns, new arguments with defaults (the old signatures dropped so PostgREST is never ambiguous), one new
-- trigger. Everything else in the rebuilt functions is their live body.

-- 1 · a code per room, a pass per stay, and where a website order came from
alter table rooms add column if not exists qr_token text;
update rooms set qr_token = encode(extensions.gen_random_bytes(9), 'hex') where qr_token is null;
alter table rooms alter column qr_token set default encode(extensions.gen_random_bytes(9), 'hex');
create unique index if not exists rooms_qr_idx on rooms(qr_token);

alter table bookings add column if not exists room_pass text;

alter table online_orders add column if not exists room_id uuid references rooms(id) on delete set null;
alter table online_orders add column if not exists booking_id uuid references bookings(id) on delete set null;
create index if not exists online_orders_booking_idx on online_orders(booking_id) where booking_id is not null;
create index if not exists orders_booking_open_idx on orders(booking_id) where booking_id is not null and status = 'open';

-- 2 · an order's room and stay belong to its property (0157's pattern)
drop trigger if exists zz_same_property on online_orders;
create trigger zz_same_property before insert or update of booking_id, channel_id, order_id, room_id, table_id, restaurant_id on online_orders
  for each row execute function _same_property('booking_id', 'bookings', 'id', 'channel_id', 'order_channels', 'id', 'order_id', 'orders', 'id',
                                               'room_id', 'rooms', 'id', 'table_id', 'dining_tables', 'id');

-- 3 · the storefront knows the room's code (0147's body, live)
drop function if exists public.dine_storefront(text, text);
CREATE OR REPLACE FUNCTION public.dine_storefront(p_slug text, p_table text DEFAULT NULL::text, p_room text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'tagline', r.tagline,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'phone', r.phone, 'district', r.district, 'photos', to_jsonb(r.photos), 'policies', r.policies,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'gst_rate', r.gst_rate, 'gst_collect', gst_collectable(r.gst_scheme, r.gstin), 'room_gst_rate', r.room_gst_rate,
    'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
    'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
    'min_order', r.min_order, 'delivery_fee', r.delivery_fee, 'packing_charge', r.packing_charge,
    'open_now', (current_time between r.opens_at and r.closes_at),
    'online_paused', coalesce(r.online_paused_until > now(), false),
    'table', (select jsonb_build_object('id', t.id, 'name', t.name, 'zone', t.zone) from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table and p_table is not null),
    -- 0170: the code in a room — its number, and whether a guest is staying in it (never who)
    'room', (select jsonb_build_object('number', rm.number, 'in_house', exists (select 1 from bookings b where b.room_id = rm.id and b.status = 'checked_in'))
               from rooms rm where rm.restaurant_id = r.id and rm.qr_token = p_room and p_room is not null),
    -- every add-on group this property offers, once, with only the add-ons that can be sold today
    'addon_groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min', g.min_select, 'max', g.max_select,
               'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_veg', a.is_veg) order by a.sort_order, a.name)
                                   from addons a where a.group_id = g.id and a.is_active and a.is_available), '[]'::jsonb)) order by g.sort_order, g.name)
      from addon_groups g
      where g.restaurant_id = r.id and g.is_active
        and exists (select 1 from menu_item_addon_groups l join menu_items m on m.id = l.menu_item_id
                    where l.group_id = g.id and m.restaurant_id = r.id and m.is_active)), '[]'::jsonb),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'name', m.name, 'price', m.price, 'gst_rate', m.gst_rate, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available, 'online', m.online_available,
                    'is_combo', m.is_combo, 'image_url', m.image_url, 'image_credit', m.image_credit,
                    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'is_default', v.is_default) order by v.sort_order, v.name)
                                          from menu_variants v where v.menu_item_id = m.id and v.is_active), '[]'::jsonb),
                    -- just the ids; the groups themselves are above
                    'addon_group_ids', coalesce((select jsonb_agg(l.group_id) from menu_item_addon_groups l join addon_groups g on g.id = l.group_id
                                                 where l.menu_item_id = m.id and g.is_active), '[]'::jsonb),
                    'components', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'qty', ci.qty) order by x.name)
                                            from combo_items ci join menu_items x on x.id = ci.menu_item_id where ci.combo_id = m.id), '[]'::jsonb)
                  ) order by m.name)
                           from menu_items m where m.category_id = c.id and m.is_active), '[]')) order by c.sort_order)
      from categories c where c.restaurant_id = r.id), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'value', o.value, 'scope', o.scope, 'min_order', o.min_order, 'code', o.code, 'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)))
      from offers o where o.restaurant_id = r.id and o.is_active and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
      from (select * from reviews where restaurant_id = r.id order by created_at desc limit 20) v), '[]'))
  from restaurants r
  where r.booking_slug = p_slug and membership_state_for(r.id) in ('trial','active')
    and (r.is_listed or exists (select 1 from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table)
         or exists (select 1 from rooms rm where rm.restaurant_id = r.id and rm.qr_token = p_room))
$function$;
revoke all on function public.dine_storefront(text, text, text) from public;
grant execute on function public.dine_storefront(text, text, text) to anon, authenticated;

-- 4 · dine_order takes a room (0166's body, live — the cleaning and bill-out checks stay)
drop function if exists public.dine_order(text, jsonb, jsonb, text, text, uuid, text);
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
begin
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial','active');   -- 0100
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
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
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'table', t.name, 'room', rm.number, 'pass', pass, 'accepted', accepted is not null, 'order_no', ono,
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end
           + case when r.rush_until > now() then coalesce(r.rush_extra_min, 0) else 0 end);
end $function$;
revoke all on function public.dine_order(text, jsonb, jsonb, text, text, uuid, text, text, text) from public;
grant execute on function public.dine_order(text, jsonb, jsonb, text, text, uuid, text, text, text) to anon, authenticated;

-- 5 · accepting a room order (0163's body, live)
CREATE OR REPLACE FUNCTION public.accept_online_order_for(p_id uuid, p_rid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype; gnote text; lnote text; own boolean;
begin
  -- for update: the second person to press Accept waits, then finds it already accepted
  select * into o from online_orders where id = p_id and restaurant_id = p_rid for update;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  gnote := nullif(left(trim(coalesce(o.raw->>'note', '')), 200), '');
  own := exists (select 1 from order_channels ch where ch.id = o.channel_id and ch.kind = 'website');
  -- 0145: a table's next round joins its open ticket while no bill has been printed on it
  if o.table_id is not null then
    select ord.id into oid from orders ord
     where ord.restaurant_id = p_rid and ord.table_id = o.table_id and ord.status = 'open'
       and not exists (select 1 from bills b where b.order_id = ord.id and b.status in ('unpaid', 'paid'))
     order by ord.created_at desc limit 1;
  end if;
  -- 0170: a room's next order joins its open room-service order while no bill has been printed on it
  if oid is null and o.booking_id is not null then
    select ord.id into oid from orders ord
     where ord.restaurant_id = p_rid and ord.booking_id = o.booking_id and ord.type = 'room_service' and ord.status = 'open'
       and not exists (select 1 from bills b where b.order_id = ord.id and b.status in ('unpaid', 'paid'))
     order by ord.created_at desc limit 1;
  end if;
  if oid is null then
    -- 0163: `notes` is the whole order's cooking request — the reference is on the ticket (kots.online_order_id)
    insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by, booking_id)
      values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type when o.room_id is not null then 'room_service'::order_type else 'delivery'::order_type end, o.table_id, 'open',
              case when o.room_id is not null then concat_ws(' · ', o.address, o.customer_name) else o.customer_name end, o.customer_phone, null, o.channel_id, auth.uid(), o.booking_id)
      returning id into oid;
  end if;
  -- 0146: what the guest was quoted travels with the ticket — the offer's money off and the packing / delivery fee
  if own then
    update orders set discount_amount = discount_amount + greatest(0, coalesce((o.raw->>'discount')::numeric, 0)),
                      extra_charges = extra_charges + greatest(0, coalesce((o.raw->>'fee')::numeric, 0)),
                      offer_title = coalesce(nullif(o.raw->>'offer', ''), offer_title)
     where id = oid;
  end if;
  insert into kots(restaurant_id, order_id, kot_no, status, online_order_id)
    values (p_rid, oid, next_number('kot', p_rid), 'pending', o.id) returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    -- 0145: the guest's note for the kitchen rides on every dish of the ticket
    lnote := nullif(concat_ws(' · ', nullif(trim(coalesce(it->>'note', '')), ''), gnote), '');
    select * into mi from menu_items where restaurant_id = p_rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, mi.id, coalesce(nullif(it->>'name', ''), mi.name), coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, lnote, 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, lnote, 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    end if;
  end loop;
  if o.table_id is not null then update dining_tables set status = 'occupied' where id = o.table_id; end if;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $function$;

-- 6 · check-out (0003's body, live)
CREATE OR REPLACE FUNCTION public.check_out(p_booking_id uuid, p_payments jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b bookings%rowtype; f record; p jsonb; paid numeric := 0; iid uuid; ono integer;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'checked_in';
  if not found then raise exception 'guest is not checked in'; end if;
  -- 0170: room service still on its way would never reach the invoice — post it (or bill it) first
  select order_no into ono from orders where booking_id = b.id and status = 'open' order by created_at limit 1;
  if found then raise exception 'room service order #% is still open — post it to the room or bill it before check-out', ono; end if;
  select * into f from folio_totals(b.id);
  for p in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by)
      values (b.restaurant_id, b.id, 'discount', 'Payment · '||upper(p->>'method')||coalesce(' '||(p->>'ref'),''), -(p->>'amount')::numeric, auth.uid());
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < f.balance then raise exception 'balance % remains', f.balance - paid; end if;
  update bookings set status = 'checked_out', checked_out_at = now() where id = b.id;
  update rooms set status = 'cleaning' where id = b.room_id;
  insert into housekeeping_tasks(restaurant_id, room_id, kind, notes) values (b.restaurant_id, b.room_id, 'clean', 'Checkout clean');
  iid := generate_stay_invoice(b.id);
  return iid;
end $function$;

-- 7 · served → on the room's bill. post_order_to_room's sum (0155: each dish at its own GST rate), for an order whose food has
-- all gone up: no dish or ticket is touched, the order is closed as billed on the stay.
create or replace function public._post_room_order(p_order_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare o orders%rowtype; r restaurants%rowtype; amt numeric; grp jsonb; tx jsonb; gst numeric;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.status <> 'open' or o.booking_id is null then return; end if;
  if not exists (select 1 from bookings where id = o.booking_id and restaurant_id = o.restaurant_id and status = 'checked_in') then return; end if;
  select * into r from restaurants where id = o.restaurant_id;
  select coalesce(sum(price_snapshot * qty), 0) into amt from order_items where order_id = o.id and status <> 'cancelled';
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'amount', a)), '[]'::jsonb) into grp
    from (select coalesce(gst_rate, r.gst_rate) rate, sum(price_snapshot * qty) a from order_items
           where order_id = o.id and status <> 'cancelled' group by 1) g;
  update orders set status = 'billed' where id = o.id;
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    values (o.restaurant_id, o.booking_id, 'restaurant', 'Room service #' || o.order_no, amt, 'order', o.id, auth.uid());
  if gst_collectable(r.gst_scheme, r.gstin) and amt > 0 then
    tx := bill_tax(grp, amt, true);
    gst := (tx->>'cgst')::numeric + (tx->>'sgst')::numeric;
    if gst > 0 then
      insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
        values (o.restaurant_id, o.booking_id, 'tax', 'GST on room service #' || o.order_no, gst, 'order', o.id, auth.uid());
    end if;
  end if;
end $function$;
revoke all on function public._post_room_order(uuid) from public, anon, authenticated;

create or replace function public._room_order_served()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare o orders%rowtype;
begin
  if new.status not in ('served', 'cancelled') then return null; end if;
  select * into o from orders where id = new.order_id;
  if not found or o.status <> 'open' or o.type <> 'room_service' or o.booking_id is null then return null; end if;
  -- every dish has gone up (or was cancelled), at least one went up, and nobody printed a bill on it instead
  if exists (select 1 from order_items where order_id = o.id and status not in ('served', 'cancelled')) then return null; end if;
  if not exists (select 1 from order_items where order_id = o.id and status = 'served') then return null; end if;
  if exists (select 1 from bills b where b.order_id = o.id and b.status in ('unpaid', 'paid')) then return null; end if;
  perform _post_room_order(o.id);
  return null;
end $function$;
revoke all on function public._room_order_served() from public, anon, authenticated;

drop trigger if exists zz_room_order_served on order_items;
create trigger zz_room_order_served after update of status on order_items
  for each row when (new.status is distinct from old.status) execute function _room_order_served();

notify pgrst, 'reload schema';
