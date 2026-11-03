-- 0166 — A table or a room is used only once it is free (2026-11-03, the owner: "a table or a room that is being cleaned
-- takes no order and no booking until the cleaning is done; a table QR too; a table that already has an order takes no new
-- one — only a free table goes on to ordering. A room comes to booking free or not by what Room status says.")
--
-- Before: place_order, a table's QR order, Move, seating a booking or a walk-in all set a table being cleaned to occupied —
-- which closed its cleaning job as "Seated again before it was marked clean". place_order also opened a second order on a
-- table that had one. check_in let a guest into a dirty, out-of-order or still-occupied room unless the property inspects;
-- create_booking took an out-of-order room, and a dirty one for tonight.
--
-- 1. _table_busy(table) → null when free, else why: an open cleaning job (table_cleanings pending / in progress), or an
--    open order on it. _room_not_ready(room, booking) → null when a guest can go in, else why: out of order, someone still
--    checked in (or marked occupied), dirty / being cleaned, needs a touch-up, not inspected where the property inspects.
--    Both are internal (no grant), read inside the security definer calls below.
-- 2. place_order (0137's body): a table being cleaned or with an open order is refused — the till's answer is Add to #n
--    (order_add_items, 0165). An order taken offline and synced now (p_placed_at set) already happened: never refused.
-- 3. dine_order (0146's body): a table QR order on a table being cleaned is refused; so is one on a table whose open
--    order already has its bill out (0145's next round joins an open order with no bill — that is unchanged).
-- 4. move_order: not onto a table being cleaned, nor onto one with an open order (that is Merge).
-- 5. reservation_set and walkin_set (0154's / 0164's bodies): seating on a table being cleaned or with an open order is refused.
-- 6. check_in: _room_not_ready. create_booking: an out-of-order room is refused for any dates; for a stay starting today
--    (IST) the room must be ready now. Its "today" was current_date (UTC — wrong from midnight to 5:30 IST); now IST.
-- Unchanged: split_order (a split bill is two orders on one table, on purpose), merge, order_add_items,
-- accept_online_order_for, hold_due (a held table may still be being cleaned — it is seated only once it is clean).
-- No new table, so no new policy.

-- 1 · why a table or a room cannot be used now (null = it can)
create or replace function public._table_busy(p_table uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from table_cleanings c where c.table_id = t.id and c.status in ('pending', 'in_progress'))
      then t.name || ' is being cleaned — it takes an order once it is marked clean'
    when exists (select 1 from orders o where o.table_id = t.id and o.status = 'open')
      then t.name || ' already has #' || (select o.order_no from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1)
           || ' open — add to that order'
  end
  from dining_tables t where t.id = p_table
$$;
revoke all on function public._table_busy(uuid) from public, anon, authenticated;

create or replace function public._room_not_ready(p_room uuid, p_booking uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when r.status = 'maintenance' then 'Room ' || r.number || ' is out of order'
    when r.status = 'occupied' or exists (select 1 from bookings b where b.room_id = r.id and b.status = 'checked_in' and b.id is distinct from p_booking)
      then 'Room ' || r.number || ' still has a guest in it'
    when r.condition = 'dirty' then 'Room ' || r.number || ' is being cleaned — it is ready once Room status marks it clean'
    when r.condition = 'pickup' then 'Room ' || r.number || ' needs a touch-up first'
    when coalesce(x.hk_inspect_required, false) and r.condition is distinct from 'inspected'
      then 'Room ' || r.number || ' has not been inspected — housekeeping signs it off before a guest goes in'
    when r.status = 'cleaning' then 'Room ' || r.number || ' is being cleaned — it is ready once Room status marks it clean'
  end
  from rooms r join restaurants x on x.id = r.restaurant_id where r.id = p_room
$$;
revoke all on function public._room_not_ready(uuid, uuid) from public, anon, authenticated;

-- 2 · place_order (0137's body, live)
CREATE OR REPLACE FUNCTION public.place_order(p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_placed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_promise boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; pl jsonb; c record;
  placed timestamptz; pm integer := null; pp numeric := null; due timestamptz := null; short text;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  -- 0098: the table must be this property's (it is set occupied below)
  if p_table_id is not null and not exists (select 1 from dining_tables where id = p_table_id and restaurant_id = rid) then
    raise exception 'table not found';
  end if;
  -- 0166: a table being cleaned, or with an order open on it, takes no new order (the till offers Add to #n). Locked first,
  -- so two tills sending to one free table cannot both pass. An order taken offline (p_placed_at set) already happened.
  if p_table_id is not null and p_placed_at is null then
    perform 1 from dining_tables where id = p_table_id for update;
    short := _table_busy(p_table_id);
    if short is not null then raise exception '%', short using errcode = 'P0001'; end if;
  end if;
  -- 0137: the pantry must cover what is ordered (the owner's switch, on by default). An order taken offline and synced
  -- now (p_placed_at set) has already happened, so it is never refused.
  if p_placed_at is null and coalesce((select stock_block from restaurants where id = rid), true) then
    short := _stock_short(p_items);
    if short is not null then raise exception 'Not enough in the pantry: %', short using errcode = 'P0001'; end if;
  end if;
  placed := coalesce(p_placed_at, now());
  if coalesce(p_promise, false) then
    select * into r from restaurants where id = rid;
    if r.promise_enabled then
      pm := r.promise_minutes; pp := r.promise_pct;
      due := placed + make_interval(mins => pm);
    end if;
  end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes,
                     created_by, client_id, created_at, synced_at, promise_minutes, promise_pct, promised_at)
    values (rid, next_number('order'), p_table_id, p_type, 'open', p_customer->>'name', p_customer->>'phone', p_note,
            auth.uid(), p_client_id, placed, now(), pm, pp, due)
    returning id into oid;
  for c in select distinct greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) as course from jsonb_array_elements(p_items) x order by 1 loop
    insert into kots(restaurant_id, order_id, kot_no, status, held) values (rid, oid, next_number('kot'), 'pending', c.course > 1) returning id into kid;
    for it in select x from jsonb_array_elements(p_items) x where greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) = c.course loop
      pl := price_line(rid, it);
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status,
                              variant_id, variant_name, addons, components, course)
        values (rid, oid, kid, (pl->>'menu_item_id')::uuid, pl->>'name', (pl->>'price')::numeric,
                greatest(1, round((it->>'qty')::numeric)::int),
                nullif(coalesce(it->>'notes', it->>'note'), ''),
                'pending',
                nullif(pl->>'variant_id', '')::uuid, pl->>'variant_name', coalesce(pl->'addons', '[]'::jsonb), coalesce(pl->'components', '[]'::jsonb), c.course);
    end loop;
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $function$;

-- 3 · dine_order (0146's body, live)
CREATE OR REPLACE FUNCTION public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text DEFAULT 'delivery'::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  grp jsonb := '[]'; tx jsonb; mr numeric; ph text; nowl timestamp := (now() at time zone 'Asia/Kolkata'); dow int := extract(dow from (now() at time zone 'Asia/Kolkata'))::int;
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
    -- 0146: each dish's value at its own GST rate (the property's when the dish has none)
    select m.gst_rate into mr from menu_items m where m.id = nullif(pl->>'menu_item_id', '')::uuid;
    grp := grp || jsonb_build_object('rate', coalesce(mr, r.gst_rate), 'amount', (pl->>'price')::numeric * q);
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
  -- 0146: the quote is the bill's own sum (bill_tax): each rate on its share, the packing / delivery fee taxed with the food,
  -- and no GST at all for a property that may not collect it
  tx := bill_tax(grp, sub - disc + fee, gst_collectable(r.gst_scheme, r.gstin));
  tot := round(sub - disc + fee + (tx->>'cgst')::numeric + (tx->>'sgst')::numeric);

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
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name, 'tax', (tx->>'cgst')::numeric + (tx->>'sgst')::numeric), now(), t.id)
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

-- 4 · move_order (0077's body, live)
CREATE OR REPLACE FUNCTION public.move_order(p_order_id uuid, p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); o orders%rowtype; t dining_tables%rowtype;
begin
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open' for update;
  if not found then raise exception 'order not open'; end if;
  select * into t from dining_tables where id = p_table_id and restaurant_id = rid;
  if not found then raise exception 'table not found'; end if;
  if o.table_id = t.id then return; end if;
  -- 0166: not onto a table being cleaned, nor onto one with its own open order (that is Merge)
  if exists (select 1 from table_cleanings c where c.table_id = t.id and c.status in ('pending', 'in_progress')) then
    raise exception '% is being cleaned — move the order once it is marked clean', t.name using errcode = 'P0001';
  end if;
  if exists (select 1 from orders x where x.table_id = t.id and x.status = 'open' and x.id <> o.id) then
    raise exception '% has its own open order — merge into it instead', t.name using errcode = 'P0001';
  end if;
  update orders set table_id = t.id, type = 'dine_in' where id = o.id;
  update dining_tables set status = 'occupied' where id = t.id;
  if o.table_id is not null then
    update dining_tables x set status = 'free' where x.id = o.table_id and x.status = 'occupied'
      and not exists (select 1 from orders where table_id = x.id and status = 'open');
  end if;
end $function$;

-- 5 · seating a booking (0154's body, live) and a walk-in (0164's body, live)
CREATE OR REPLACE FUNCTION public.reservation_set(p_id uuid, p_status reservation_status, p_table uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v reservations%rowtype;
begin
  select * into v from reservations where id = p_id and restaurant_id = auth_restaurant_id();
  if not found then raise exception 'reservation not found'; end if;
  -- 0098: a table given here must be the reservation's own property's
  if p_table is not null and not exists (select 1 from dining_tables where id = p_table and restaurant_id = v.restaurant_id) then
    raise exception 'table not found';
  end if;
  -- 0166: a party is seated only at a free table
  if p_status = 'seated' and coalesce(p_table, v.table_id) is not null then
    if _table_busy(coalesce(p_table, v.table_id)) is not null then
      raise exception '%', replace(_table_busy(coalesce(p_table, v.table_id)), 'takes an order', 'can be seated') using errcode = 'P0001';
    end if;
  end if;
  update reservations set status = p_status, table_id = coalesce(p_table, table_id),
    seated_at = case when p_status = 'seated' then now() else seated_at end,
    held_at = case when p_status in ('requested', 'confirmed') then held_at end where id = p_id;
  if p_status = 'seated' and coalesce(p_table, v.table_id) is not null then
    update dining_tables set status = 'occupied' where id = coalesce(p_table, v.table_id);
  end if;
  -- 0154: cancelled, a no-show, done, or seated somewhere else — the table held for them is free again
  if v.held_at is not null and v.table_id is not null and p_status not in ('requested', 'confirmed')
     and not (p_status = 'seated' and coalesce(p_table, v.table_id) = v.table_id) then
    update dining_tables set status = 'free' where id = v.table_id and status = 'reserved'
      and not exists (select 1 from reservations y where y.table_id = v.table_id and y.id <> p_id and y.held_at is not null and y.status in ('requested', 'confirmed'));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.walkin_set(p_id uuid, p_status walkin_status, p_table uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); held uuid;
begin
  select table_id into held from walkins where id = p_id and restaurant_id = rid;
  -- 0166: a party is seated only at a free table
  if p_status = 'seated' and coalesce(p_table, held) is not null and _table_busy(coalesce(p_table, held)) is not null then
    raise exception '%', replace(_table_busy(coalesce(p_table, held)), 'takes an order', 'can be seated') using errcode = 'P0001';
  end if;
  update walkins set status = p_status, table_id = coalesce(p_table, table_id),
    called_at = case when p_status = 'called' then now() else called_at end,
    seated_at = case when p_status = 'seated' then now() else seated_at end
  where id = p_id and restaurant_id = rid;
  -- 0164: seated with no table named → the table they hold
  if p_status = 'seated' and coalesce(p_table, held) is not null then update dining_tables set status = 'occupied' where id = coalesce(p_table, held) and restaurant_id = rid; end if;
  if p_status in ('seated', 'left') then perform _walkin_fill(rid); end if;                -- 0164: their hold goes to the next
end $function$;

-- 6 · check_in (0067's body, live) and create_booking (0098's body, live)
CREATE OR REPLACE FUNCTION public.check_in(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b bookings%rowtype; r rooms%rowtype; why text;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'reserved' for update;
  if not found then raise exception 'booking not found or not in reserved state'; end if;
  -- 0166: the guest goes in only when Room status says the room is ready (was: only the inspection, and only where required)
  select * into r from rooms where id = b.room_id for update;
  why := _room_not_ready(b.room_id, b.id);
  if why is not null then raise exception '%', why using errcode = 'P0001'; end if;
  update bookings set status = 'checked_in', checked_in_at = now() where id = b.id;
  update rooms set status = 'occupied' where id = b.room_id;
  update guests set visits = visits + 1 where id = b.guest_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_guest jsonb, p_room_id uuid, p_check_in date, p_check_out date, p_adults integer, p_children integer, p_rate numeric, p_advance numeric, p_source text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); gid uuid; bid uuid; why text; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if rid is null then raise exception 'not signed in'; end if;
  -- 0098: the room, and a guest chosen from the list, must be this property's
  if not exists (select 1 from rooms where id = p_room_id and restaurant_id = rid) then raise exception 'room not found'; end if;
  -- 0166: never an out-of-order room; for a stay from today, only a room Room status calls ready now
  perform 1 from rooms where id = p_room_id for update;
  if exists (select 1 from rooms where id = p_room_id and status = 'maintenance') then
    raise exception '%', _room_not_ready(p_room_id, null) using errcode = 'P0001';
  end if;
  if p_check_in <= v_today then
    why := _room_not_ready(p_room_id, null);
    if why is not null then raise exception '%', why using errcode = 'P0001'; end if;
  end if;
  if exists (select 1 from bookings where room_id = p_room_id and status in ('reserved','checked_in') and check_in < p_check_out and check_out > p_check_in)
    then raise exception 'room is not free for those dates'; end if;
  if p_guest ? 'id' and (p_guest->>'id') <> '' then gid := (p_guest->>'id')::uuid;
    if not exists (select 1 from guests where id = gid and restaurant_id = rid) then raise exception 'guest not found'; end if;   -- 0098
  else insert into guests(restaurant_id, full_name, phone, email, id_type, id_last4, address)
       values (rid, p_guest->>'full_name', p_guest->>'phone', p_guest->>'email', p_guest->>'id_type', p_guest->>'id_last4', p_guest->>'address') returning id into gid; end if;
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, advance, source, notes, created_by)
    values (rid, next_number('booking'), gid, p_room_id, p_check_in, p_check_out, p_adults, p_children, p_rate, coalesce(p_advance,0), p_source, p_notes, auth.uid()) returning id into bid;
  if p_advance > 0 then insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by) values (rid, bid, 'discount', 'Advance received', -p_advance, auth.uid()); end if;
  if p_check_in = v_today then update rooms set status = 'reserved' where id = p_room_id and status = 'available'; end if;
  return bid;
end $function$;

notify pgrst, 'reload schema';
