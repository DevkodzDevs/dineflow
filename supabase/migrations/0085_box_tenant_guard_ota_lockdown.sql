-- 0085 · Cross-tenant writes through the Box sync, the OTA functions in public reach, one payment
-- settling two bills.
--
-- 1 · box_push upserted menu items, categories, room types, rooms, guests, bookings, proof links,
--     ingredients, surplus and labourers by bare id: `on conflict (id) do update` with no check that
--     the existing row was the caller's. Menu-item, category and room-type ids are public (storefront,
--     booking page), and a demo sandbox gives anyone an owner login and so a box token — enough to
--     rewrite another property's prices and names. Every `do update` now applies only to a row of the
--     box's own property; a foreign id is left untouched. Body copied from the live definition
--     (pg_get_functiondef, 2026-10-10) with only those eleven WHERE clauses added.
-- 2 · ical_channels(null) returned every property's OTA channels — import URLs, API keys — to the
--     anon key; ingest_ota_booking and ota_log wrote bookings and logs for any channel id. They are
--     the iCal sync's tools: service role only now (/api/ota/sync runs with it).
-- 3 · A Razorpay payment id can settle one bill only.

-- 1 · box_push, scoped to the box's own property
CREATE OR REPLACE FUNCTION public.box_push(p_token text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; x jsonb; n int := 0;
begin
  select * into r from restaurants where box_token = p_token; if not found then raise exception 'unknown box'; end if;
  update restaurants set box_last_seen = now(), runs_on_box = true where id = r.id;

  -- menu: needed so online orders map to dishes and the menu can be pushed to aggregators
  for x in select * from jsonb_array_elements(coalesce(p->'menu_items','[]')) loop
    insert into menu_items(id, restaurant_id, category_id, name, price, is_veg, is_available, external_refs, barcode, description)
    values ((x->>'id')::uuid, r.id, nullif(x->>'category_id','')::uuid, x->>'name', (x->>'price')::numeric, coalesce((x->>'is_veg')::boolean,true), coalesce((x->>'is_available')::boolean,true), coalesce(x->'external_refs','{}'), x->>'barcode', x->>'description')
    on conflict (id) do update set name = excluded.name, price = excluded.price, is_veg = excluded.is_veg, is_available = excluded.is_available, external_refs = excluded.external_refs, barcode = excluded.barcode, description = excluded.description, category_id = excluded.category_id
      where menu_items.restaurant_id = r.id;
    n := n + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'categories','[]')) loop
    insert into categories(id, restaurant_id, name, sort_order) values ((x->>'id')::uuid, r.id, x->>'name', coalesce((x->>'sort_order')::int,0))
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order
      where categories.restaurant_id = r.id;
  end loop;
  -- rooms & rates: the booking page and OTA feeds must see the building's real inventory
  for x in select * from jsonb_array_elements(coalesce(p->'room_types','[]')) loop
    insert into room_types(id, restaurant_id, name, base_rate, capacity, amenities, is_active) values ((x->>'id')::uuid, r.id, x->>'name', (x->>'base_rate')::numeric, coalesce((x->>'capacity')::int,2), coalesce((select array_agg(a) from jsonb_array_elements_text(coalesce(x->'amenities','[]')) a), '{}'), coalesce((x->>'is_active')::boolean,true))
    on conflict (id) do update set name = excluded.name, base_rate = excluded.base_rate, capacity = excluded.capacity, amenities = excluded.amenities, is_active = excluded.is_active
      where room_types.restaurant_id = r.id;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'rooms','[]')) loop
    insert into rooms(id, restaurant_id, number, floor, room_type_id, status, sort_order) values ((x->>'id')::uuid, r.id, x->>'number', coalesce((x->>'floor')::int,1), nullif(x->>'room_type_id','')::uuid, coalesce((x->>'status')::room_status,'available'), coalesce((x->>'sort_order')::int,0))
    on conflict (id) do update set number = excluded.number, floor = excluded.floor, room_type_id = excluded.room_type_id, status = excluded.status, sort_order = excluded.sort_order
      where rooms.restaurant_id = r.id;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'rate_inventory','[]')) loop
    insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
    values (r.id, (x->>'room_type_id')::uuid, (x->>'stay_date')::date, nullif(x->>'rate','')::numeric, nullif(x->>'open_rooms','')::int, coalesce((x->>'stop_sell')::boolean,false), coalesce((x->>'min_nights')::int,1), now())
    on conflict (restaurant_id, room_type_id, stay_date) do update set rate = excluded.rate, open_rooms = excluded.open_rooms, stop_sell = excluded.stop_sell, min_nights = excluded.min_nights, updated_at = now();
  end loop;
  -- bookings made in the building → cloud must block those dates for OTAs and the booking page
  for x in select * from jsonb_array_elements(coalesce(p->'bookings','[]')) loop
    insert into guests(id, restaurant_id, full_name, phone) values ((x->>'guest_id')::uuid, r.id, coalesce(x->>'guest_name','Guest'), x->>'guest_phone')
    on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone
      where guests.restaurant_id = r.id;
    insert into bookings(id, restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, origin, is_block)
    values ((x->>'id')::uuid, r.id, (x->>'booking_no')::int, (x->>'guest_id')::uuid, (x->>'room_id')::uuid, (x->>'check_in')::date, (x->>'check_out')::date, coalesce((x->>'adults')::int,2), coalesce((x->>'children')::int,0), coalesce((x->>'rate')::numeric,0), (x->>'status')::booking_status, x->>'source', 'local', coalesce((x->>'is_block')::boolean,false))
    on conflict (id) do update set room_id = excluded.room_id, check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status, rate = excluded.rate
      where bookings.restaurant_id = r.id;
  end loop;
  -- online order status decided in the building
  for x in select * from jsonb_array_elements(coalesce(p->'online_status','[]')) loop
    update online_orders set status = (x->>'status')::online_status where id = (x->>'id')::uuid and restaurant_id = r.id;
  end loop;
  -- sealed months → Proof of Business links served from the cloud
  for x in select * from jsonb_array_elements(coalesce(p->'periods','[]')) loop
    insert into business_periods(id, restaurant_id, period, rooms_revenue, dining_revenue, delivery_revenue, total_revenue, gst_collected, supplier_paid, wages_paid, covers, invoices_issued, room_nights_sold, room_nights_available, occupancy_pct, avg_ticket, days_traded, prev_hash, hash, sealed_at)
    values ((x->>'id')::uuid, r.id, (x->>'period')::date, (x->>'rooms_revenue')::numeric, (x->>'dining_revenue')::numeric, (x->>'delivery_revenue')::numeric, (x->>'total_revenue')::numeric, (x->>'gst_collected')::numeric, (x->>'supplier_paid')::numeric, (x->>'wages_paid')::numeric, (x->>'covers')::int, (x->>'invoices_issued')::int, (x->>'room_nights_sold')::int, (x->>'room_nights_available')::int, nullif(x->>'occupancy_pct','')::numeric, nullif(x->>'avg_ticket','')::numeric, (x->>'days_traded')::int, x->>'prev_hash', x->>'hash', (x->>'sealed_at')::timestamptz)
    on conflict (restaurant_id, period) do nothing;   -- a sealed month never changes
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'proof_links','[]')) loop
    insert into proof_links(id, restaurant_id, token, label, purpose, from_period, to_period, show_costs, expires_at, revoked, created_at)
    values ((x->>'id')::uuid, r.id, x->>'token', x->>'label', x->>'purpose', (x->>'from_period')::date, (x->>'to_period')::date, coalesce((x->>'show_costs')::boolean,true), (x->>'expires_at')::timestamptz, coalesce((x->>'revoked')::boolean,false), coalesce((x->>'created_at')::timestamptz, now()))
    on conflict (id) do update set revoked = excluded.revoked, expires_at = excluded.expires_at
      where proof_links.restaurant_id = r.id;
  end loop;
  -- Neighbours contributions: purchase prices (anonymous by construction) and daily covers
  for x in select * from jsonb_array_elements(coalesce(p->'purchases','[]')) loop
    insert into ingredients(id, restaurant_id, name, unit, cost_per_unit) values ((x->>'ingredient_id')::uuid, r.id, x->>'name', (x->>'unit')::stock_unit, (x->>'unit_cost')::numeric)
    on conflict (id) do update set name = excluded.name, cost_per_unit = excluded.cost_per_unit
      where ingredients.restaurant_id = r.id;
    insert into stock_ledger(id, restaurant_id, ingredient_id, qty, reason, unit_cost, note, created_at)
    values ((x->>'id')::uuid, r.id, (x->>'ingredient_id')::uuid, (x->>'qty')::numeric, 'purchase', (x->>'unit_cost')::numeric, 'from box', (x->>'created_at')::timestamptz)
    on conflict (id) do nothing;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'covers','[]')) loop
    -- one synthetic order per cover keeps network_demand() working without shipping every order
    insert into orders(id, restaurant_id, order_no, type, status, created_at)
    select gen_random_uuid(), r.id, 0, 'dine_in', 'billed', (x->>'day')::date + interval '12 hours' from generate_series(1, greatest(0, (x->>'covers')::int - coalesce((select count(*) from orders o where o.restaurant_id = r.id and (o.created_at at time zone 'Asia/Kolkata')::date = (x->>'day')::date), 0)));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'surplus','[]')) loop
    insert into surplus_listings(id, restaurant_id, item, qty, unit, best_before, price, note, status, origin, created_at)
    values ((x->>'id')::uuid, r.id, x->>'item', (x->>'qty')::numeric, x->>'unit', nullif(x->>'best_before','')::date, coalesce((x->>'price')::numeric,0), x->>'note', (x->>'status')::surplus_status, 'local', coalesce((x->>'created_at')::timestamptz, now()))
    on conflict (id) do update set qty = excluded.qty, status = excluded.status
      where surplus_listings.restaurant_id = r.id;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'standby','[]')) loop
    insert into labourers(id, restaurant_id, code, full_name, phone, skill, daily_wage, id_last4) values ((x->>'labourer_id')::uuid, r.id, x->>'code', x->>'name', x->>'phone', x->>'skill', coalesce((x->>'daily_wage')::numeric,0), x->>'id_last4')
    on conflict (id) do update set full_name = excluded.full_name, skill = excluded.skill, daily_wage = excluded.daily_wage
      where labourers.restaurant_id = r.id;
    insert into labour_standby(id, restaurant_id, labourer_id, for_date, from_time, to_time, note, status, origin)
    values ((x->>'id')::uuid, r.id, (x->>'labourer_id')::uuid, (x->>'for_date')::date, nullif(x->>'from_time','')::time, nullif(x->>'to_time','')::time, x->>'note', x->>'status', 'local')
    on conflict (labourer_id, for_date) do update set status = excluded.status, from_time = excluded.from_time, to_time = excluded.to_time
      where labour_standby.restaurant_id = r.id;
  end loop;
  if p ? 'network' then
    insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
    values (r.id, coalesce((p->'network'->>'share_prices')::boolean,false), coalesce((p->'network'->>'share_surplus')::boolean,false), coalesce((p->'network'->>'share_labour')::boolean,false), coalesce((p->'network'->>'share_demand')::boolean,false), coalesce((p->'network'->>'radius_km')::int,40), now())
    on conflict (restaurant_id) do update set share_prices = excluded.share_prices, share_surplus = excluded.share_surplus, share_labour = excluded.share_labour, share_demand = excluded.share_demand, radius_km = excluded.radius_km;
    update restaurants set district = coalesce(p->'network'->>'district', district), pincode = coalesce(p->'network'->>'pincode', pincode), network_alias = coalesce(p->'network'->>'alias', network_alias) where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'received', n, 'at', now());
end $function$
;

-- 2 · the OTA sync's functions: service role only
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('ical_channels', 'ingest_ota_booking', 'ota_log') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- 3 · one gateway payment, one bill (Razorpay payment ids start "pay_"; cash and UPI refs are free text)
create unique index if not exists payments_gateway_ref_once on public.payments (ref) where ref like 'pay\_%';
