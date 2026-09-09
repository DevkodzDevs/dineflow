-- DineFlow v10.0 — Hybrid: the Box runs the building, the cloud faces the world, and the two
-- keep each other in step whenever the internet is up. Run AFTER 0009 on BOTH the cloud and the Box.
--
--  Box  ──push──▶  cloud : menu, rooms & rates, local bookings, online-order status, sealed months,
--                          purchase prices (for Neighbours), daily covers, surplus & standby, proof links
--  Box  ◀──pull──  cloud : online orders from Swiggy/Zomato/website, OTA & direct bookings,
--                          membership state, Neighbours results, surplus & standby from neighbours
--
-- Same row ids on both sides, so nothing is ever created twice.

alter table bookings add column if not exists origin text not null default 'local';        -- local | cloud
alter table online_orders add column if not exists origin text not null default 'local';
alter table surplus_listings add column if not exists origin text not null default 'local';
alter table labour_standby add column if not exists origin text not null default 'local';
alter table restaurants add column if not exists is_shadow boolean not null default false;  -- cloud copy of a Box property

-- Box-side bookkeeping
create table if not exists sync_state (key text primary key, cursor timestamptz, note text, updated_at timestamptz not null default now());
create table if not exists neighbours_cache (kind text primary key, payload jsonb not null, fetched_at timestamptz not null default now());

-- ═══════════ CLOUD SIDE: receive a push from a Box ═══════════
create or replace function box_push(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prop restaurants%rowtype; x jsonb; n int := 0;
begin
  select * into prop from restaurants where box_token = p_token; if not found then raise exception 'unknown box'; end if;
  update restaurants set box_last_seen = now(), runs_on_box = true where id = prop.id;

  -- menu: needed so online orders map to dishes and the menu can be pushed to aggregators
  for x in select * from jsonb_array_elements(coalesce(p->'menu_items','[]')) loop
    insert into menu_items(id, restaurant_id, category_id, name, price, is_veg, is_available, is_active, external_refs, barcode, description)
    values ((x->>'id')::uuid, prop.id, nullif(x->>'category_id','')::uuid, x->>'name', (x->>'price')::numeric, coalesce((x->>'is_veg')::boolean,true), coalesce((x->>'is_available')::boolean,true), coalesce((x->>'is_active')::boolean,true), coalesce(x->'external_refs','{}'), x->>'barcode', x->>'description')
    on conflict (id) do update set name = excluded.name, price = excluded.price, is_veg = excluded.is_veg, is_available = excluded.is_available, is_active = excluded.is_active, external_refs = excluded.external_refs, barcode = excluded.barcode, description = excluded.description, category_id = excluded.category_id;
    n := n + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'categories','[]')) loop
    insert into categories(id, restaurant_id, name, sort_order) values ((x->>'id')::uuid, prop.id, x->>'name', coalesce((x->>'sort_order')::int,0))
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
  end loop;
  -- rooms & rates: the booking page and OTA feeds must see the building's real inventory
  for x in select * from jsonb_array_elements(coalesce(p->'room_types','[]')) loop
    insert into room_types(id, restaurant_id, name, base_rate, capacity, amenities, is_active) values ((x->>'id')::uuid, prop.id, x->>'name', (x->>'base_rate')::numeric, coalesce((x->>'capacity')::int,2), coalesce((select array_agg(a) from jsonb_array_elements_text(coalesce(x->'amenities','[]')) a), '{}'), coalesce((x->>'is_active')::boolean,true))
    on conflict (id) do update set name = excluded.name, base_rate = excluded.base_rate, capacity = excluded.capacity, amenities = excluded.amenities, is_active = excluded.is_active;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'rooms','[]')) loop
    insert into rooms(id, restaurant_id, number, floor, room_type_id, status, sort_order) values ((x->>'id')::uuid, prop.id, x->>'number', coalesce((x->>'floor')::int,1), nullif(x->>'room_type_id','')::uuid, coalesce((x->>'status')::room_status,'available'), coalesce((x->>'sort_order')::int,0))
    on conflict (id) do update set number = excluded.number, floor = excluded.floor, room_type_id = excluded.room_type_id, status = excluded.status, sort_order = excluded.sort_order;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'rate_inventory','[]')) loop
    insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
    values (prop.id, (x->>'room_type_id')::uuid, (x->>'stay_date')::date, nullif(x->>'rate','')::numeric, nullif(x->>'open_rooms','')::int, coalesce((x->>'stop_sell')::boolean,false), coalesce((x->>'min_nights')::int,1), now())
    on conflict (restaurant_id, room_type_id, stay_date) do update set rate = excluded.rate, open_rooms = excluded.open_rooms, stop_sell = excluded.stop_sell, min_nights = excluded.min_nights, updated_at = now();
  end loop;
  -- bookings made in the building → cloud must block those dates for OTAs and the booking page
  for x in select * from jsonb_array_elements(coalesce(p->'bookings','[]')) loop
    insert into guests(id, restaurant_id, full_name, phone) values ((x->>'guest_id')::uuid, prop.id, coalesce(x->>'guest_name','Guest'), x->>'guest_phone')
    on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;
    insert into bookings(id, restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, origin, is_block)
    values ((x->>'id')::uuid, prop.id, (x->>'booking_no')::int, (x->>'guest_id')::uuid, (x->>'room_id')::uuid, (x->>'check_in')::date, (x->>'check_out')::date, coalesce((x->>'adults')::int,2), coalesce((x->>'children')::int,0), coalesce((x->>'rate')::numeric,0), (x->>'status')::booking_status, x->>'source', 'local', coalesce((x->>'is_block')::boolean,false))
    on conflict (id) do update set room_id = excluded.room_id, check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status, rate = excluded.rate;
  end loop;
  -- online order status decided in the building
  for x in select * from jsonb_array_elements(coalesce(p->'online_status','[]')) loop
    update online_orders set status = (x->>'status')::online_status where id = (x->>'id')::uuid and restaurant_id = prop.id;
  end loop;
  -- sealed months → Proof of Business links served from the cloud
  for x in select * from jsonb_array_elements(coalesce(p->'periods','[]')) loop
    insert into business_periods(id, restaurant_id, period, rooms_revenue, dining_revenue, delivery_revenue, total_revenue, gst_collected, supplier_paid, wages_paid, covers, invoices_issued, room_nights_sold, room_nights_available, occupancy_pct, avg_ticket, days_traded, prev_hash, hash, sealed_at)
    values ((x->>'id')::uuid, prop.id, (x->>'period')::date, (x->>'rooms_revenue')::numeric, (x->>'dining_revenue')::numeric, (x->>'delivery_revenue')::numeric, (x->>'total_revenue')::numeric, (x->>'gst_collected')::numeric, (x->>'supplier_paid')::numeric, (x->>'wages_paid')::numeric, (x->>'covers')::int, (x->>'invoices_issued')::int, (x->>'room_nights_sold')::int, (x->>'room_nights_available')::int, nullif(x->>'occupancy_pct','')::numeric, nullif(x->>'avg_ticket','')::numeric, (x->>'days_traded')::int, x->>'prev_hash', x->>'hash', (x->>'sealed_at')::timestamptz)
    on conflict (restaurant_id, period) do nothing;   -- a sealed month never changes
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'proof_links','[]')) loop
    insert into proof_links(id, restaurant_id, token, label, purpose, from_period, to_period, show_costs, expires_at, revoked, created_at)
    values ((x->>'id')::uuid, prop.id, x->>'token', x->>'label', x->>'purpose', (x->>'from_period')::date, (x->>'to_period')::date, coalesce((x->>'show_costs')::boolean,true), (x->>'expires_at')::timestamptz, coalesce((x->>'revoked')::boolean,false), coalesce((x->>'created_at')::timestamptz, now()))
    on conflict (id) do update set revoked = excluded.revoked, expires_at = excluded.expires_at;
  end loop;
  -- Neighbours contributions: purchase prices (anonymous by construction) and daily covers
  for x in select * from jsonb_array_elements(coalesce(p->'purchases','[]')) loop
    insert into ingredients(id, restaurant_id, name, unit, cost_per_unit) values ((x->>'ingredient_id')::uuid, prop.id, x->>'name', (x->>'unit')::stock_unit, (x->>'unit_cost')::numeric)
    on conflict (id) do update set name = excluded.name, cost_per_unit = excluded.cost_per_unit;
    insert into stock_ledger(id, restaurant_id, ingredient_id, qty, reason, unit_cost, note, created_at)
    values ((x->>'id')::uuid, prop.id, (x->>'ingredient_id')::uuid, (x->>'qty')::numeric, 'purchase', (x->>'unit_cost')::numeric, 'from box', (x->>'created_at')::timestamptz)
    on conflict (id) do nothing;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'covers','[]')) loop
    -- one synthetic order per cover keeps network_demand() working without shipping every order
    insert into orders(id, restaurant_id, order_no, type, status, created_at)
    select gen_random_uuid(), prop.id, 0, 'dine_in', 'billed', (x->>'day')::date + interval '12 hours' from generate_series(1, greatest(0, (x->>'covers')::int - coalesce((select count(*) from orders o where o.restaurant_id = prop.id and (o.created_at at time zone 'Asia/Kolkata')::date = (x->>'day')::date), 0)));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'surplus','[]')) loop
    insert into surplus_listings(id, restaurant_id, item, qty, unit, best_before, price, note, status, origin, created_at)
    values ((x->>'id')::uuid, prop.id, x->>'item', (x->>'qty')::numeric, x->>'unit', nullif(x->>'best_before','')::date, coalesce((x->>'price')::numeric,0), x->>'note', (x->>'status')::surplus_status, 'local', coalesce((x->>'created_at')::timestamptz, now()))
    on conflict (id) do update set qty = excluded.qty, status = excluded.status;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'standby','[]')) loop
    insert into labourers(id, restaurant_id, code, full_name, phone, skill, daily_wage, id_last4) values ((x->>'labourer_id')::uuid, prop.id, x->>'code', x->>'name', x->>'phone', x->>'skill', coalesce((x->>'daily_wage')::numeric,0), x->>'id_last4')
    on conflict (id) do update set full_name = excluded.full_name, skill = excluded.skill, daily_wage = excluded.daily_wage;
    insert into labour_standby(id, restaurant_id, labourer_id, for_date, from_time, to_time, note, status, origin)
    values ((x->>'id')::uuid, prop.id, (x->>'labourer_id')::uuid, (x->>'for_date')::date, nullif(x->>'from_time','')::time, nullif(x->>'to_time','')::time, x->>'note', x->>'status', 'local')
    on conflict (labourer_id, for_date) do update set status = excluded.status, from_time = excluded.from_time, to_time = excluded.to_time;
  end loop;
  if p ? 'network' then
    insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
    values (prop.id, coalesce((p->'network'->>'share_prices')::boolean,false), coalesce((p->'network'->>'share_surplus')::boolean,false), coalesce((p->'network'->>'share_labour')::boolean,false), coalesce((p->'network'->>'share_demand')::boolean,false), coalesce((p->'network'->>'radius_km')::int,40), now())
    on conflict (restaurant_id) do update set share_prices = excluded.share_prices, share_surplus = excluded.share_surplus, share_labour = excluded.share_labour, share_demand = excluded.share_demand, radius_km = excluded.radius_km;
    update restaurants set district = coalesce(p->'network'->>'district', district), pincode = coalesce(p->'network'->>'pincode', pincode), network_alias = coalesce(p->'network'->>'alias', network_alias) where id = prop.id;
  end if;
  return jsonb_build_object('ok', true, 'received', n, 'at', now());
end $$;

-- ═══════════ CLOUD SIDE: what the Box should pull ═══════════
create or replace function box_pull(p_token text, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; out jsonb;
begin
  select * into r from restaurants where box_token = p_token; if not found then raise exception 'unknown box'; end if;
  -- act as the property for the Neighbours functions (they key off auth_restaurant_id)
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where restaurant_id = r.id and role = 'owner' limit 1))::text, true);
  out := jsonb_build_object(
    'membership', membership_state_for(r.id), 'trial_ends_at', r.trial_ends_at, 'membership_ends_at', r.membership_ends_at, 'membership_plan', r.membership_plan,
    'online_orders', coalesce((select jsonb_agg(to_jsonb(o)) from online_orders o where o.restaurant_id = r.id and o.origin = 'local' and o.created_at > coalesce(p_since, now() - interval '2 days')), '[]'),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'booking_no', b.booking_no, 'guest_id', b.guest_id, 'guest_name', g.full_name, 'guest_phone', g.phone, 'guest_email', g.email,
        'room_id', b.room_id, 'check_in', b.check_in, 'check_out', b.check_out, 'adults', b.adults, 'children', b.children, 'rate', b.rate, 'status', b.status, 'source', b.source,
        'ota_channel_id', b.ota_channel_id, 'external_ref', b.external_ref, 'is_block', b.is_block, 'created_at', b.created_at))
      from bookings b join guests g on g.id = b.guest_id where b.restaurant_id = r.id and b.origin = 'local' and b.source in ('direct','ota','booking_com','airbnb','agoda','makemytrip','goibibo','expedia','ical','other') and b.created_at > coalesce(p_since, now() - interval '30 days')), '[]'),
    'neighbours', jsonb_build_object(
      'status', network_status(),
      'prices', coalesce((select jsonb_agg(to_jsonb(x)) from network_prices(21) x), '[]'),
      'demand', network_demand(),
      'surplus', coalesce((select jsonb_agg(to_jsonb(x)) from surplus_feed() x where not x.mine), '[]'),
      'standby', coalesce((select jsonb_agg(to_jsonb(x)) from standby_feed(current_date) x where not x.mine), '[]')),
    'proof_views', coalesce((select jsonb_agg(jsonb_build_object('link_id', v.link_id, 'viewed_at', v.viewed_at)) from proof_views v join proof_links l on l.id = v.link_id where l.restaurant_id = r.id and v.viewed_at > coalesce(p_since, now() - interval '30 days')), '[]'),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'label', c.label, 'webhook_token', c.webhook_token)) from order_channels c where c.restaurant_id = r.id), '[]'),
    'at', now());
  return out;
end $$;
grant execute on function box_push(text, jsonb), box_pull(text, timestamptz) to anon;

-- ═══════════ BOX SIDE: export what changed, apply what arrived ═══════════
create or replace function box_export(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select id as rid, district as rdistrict, pincode as rpincode, network_alias as ralias from restaurants order by created_at limit 1)
  select jsonb_build_object(
    'menu_items', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'category_id', m.category_id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'is_available', m.is_available, 'is_active', m.is_active, 'external_refs', m.external_refs, 'barcode', m.barcode, 'description', m.description)) from menu_items m where m.restaurant_id = r.rid), '[]'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order)) from categories c where c.restaurant_id = r.rid), '[]'),
    'room_types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'base_rate', t.base_rate, 'capacity', t.capacity, 'amenities', to_jsonb(t.amenities), 'is_active', t.is_active)) from room_types t where t.restaurant_id = r.rid), '[]'),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'floor', x.floor, 'room_type_id', x.room_type_id, 'status', x.status, 'sort_order', x.sort_order)) from rooms x where x.restaurant_id = r.rid), '[]'),
    'rate_inventory', coalesce((select jsonb_agg(jsonb_build_object('room_type_id', ri.room_type_id, 'stay_date', ri.stay_date, 'rate', ri.rate, 'open_rooms', ri.open_rooms, 'stop_sell', ri.stop_sell, 'min_nights', ri.min_nights)) from rate_inventory ri where ri.restaurant_id = r.rid and ri.stay_date >= current_date and ri.stay_date < current_date + 120), '[]'),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'booking_no', b.booking_no, 'guest_id', b.guest_id, 'guest_name', g.full_name, 'guest_phone', g.phone, 'room_id', b.room_id, 'check_in', b.check_in, 'check_out', b.check_out, 'adults', b.adults, 'children', b.children, 'rate', b.rate, 'status', b.status, 'source', b.source, 'is_block', b.is_block))
        from bookings b join guests g on g.id = b.guest_id where b.restaurant_id = r.rid and b.origin = 'local' and b.check_out >= current_date - 7), '[]'),
    'online_status', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status)) from online_orders o where o.restaurant_id = r.rid and o.origin = 'cloud' and o.placed_at > now() - interval '3 days'), '[]'),
    'periods', coalesce((select jsonb_agg(to_jsonb(bp)) from business_periods bp where bp.restaurant_id = r.rid), '[]'),
    'proof_links', coalesce((select jsonb_agg(to_jsonb(pl)) from proof_links pl where pl.restaurant_id = r.rid), '[]'),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', sl.id, 'ingredient_id', i.id, 'name', i.name, 'unit', i.unit, 'qty', sl.qty, 'unit_cost', coalesce(sl.unit_cost, i.cost_per_unit), 'created_at', sl.created_at))
        from stock_ledger sl join ingredients i on i.id = sl.ingredient_id where sl.restaurant_id = r.rid and sl.reason = 'purchase' and sl.qty > 0 and sl.created_at > coalesce(p_since, now() - interval '30 days')), '[]'),
    'covers', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'covers', n)) from (
        select (o2.created_at at time zone 'Asia/Kolkata')::date d, count(*) n from orders o2
        where o2.restaurant_id = r.rid and o2.status <> 'cancelled' and o2.created_at > now() - interval '60 days' group by 1) cv), '[]'),
    'surplus', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'item', sp.item, 'qty', sp.qty, 'unit', sp.unit, 'best_before', sp.best_before, 'price', sp.price, 'note', sp.note, 'status', sp.status, 'created_at', sp.created_at))
        from surplus_listings sp where sp.restaurant_id = r.rid and sp.origin = 'local' and sp.created_at > now() - interval '14 days'), '[]'),
    'standby', coalesce((select jsonb_agg(jsonb_build_object('id', sb.id, 'labourer_id', l.id, 'code', l.code, 'name', l.full_name, 'phone', l.phone, 'skill', l.skill, 'daily_wage', l.daily_wage, 'id_last4', l.id_last4, 'for_date', sb.for_date, 'from_time', sb.from_time, 'to_time', sb.to_time, 'note', sb.note, 'status', sb.status))
        from labour_standby sb join labourers l on l.id = sb.labourer_id where sb.restaurant_id = r.rid and sb.origin = 'local' and sb.for_date >= current_date - 1), '[]'),
    'network', (select jsonb_build_object('share_prices', n.share_prices, 'share_surplus', n.share_surplus, 'share_labour', n.share_labour, 'share_demand', n.share_demand, 'radius_km', n.radius_km, 'district', r.rdistrict, 'pincode', r.rpincode, 'alias', r.ralias) from network_settings n where n.restaurant_id = r.rid),
    'today', jsonb_build_object(
      'sales_today', coalesce((select sum(bl.total) from bills bl where bl.restaurant_id = r.rid and bl.status = 'paid' and bl.paid_at::date = current_date), 0),
      'open_orders', (select count(*) from orders o3 where o3.restaurant_id = r.rid and o3.status = 'open'),
      'rooms', (select count(*) from rooms r2 where r2.restaurant_id = r.rid),
      'occupied', (select count(*) from rooms r3 where r3.restaurant_id = r.rid and r3.status = 'occupied'),
      'users', (select count(*) from profiles pf where pf.restaurant_id = r.rid)))
  from r
$$;

create or replace function box_apply(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; x jsonb; n int := 0; rm uuid;
begin
  select id into rid from restaurants order by created_at limit 1;
  if p ? 'membership' then
    update restaurants set membership = (p->>'membership')::membership_status, trial_ends_at = coalesce((p->>'trial_ends_at')::timestamptz, trial_ends_at), membership_ends_at = (p->>'membership_ends_at')::timestamptz, membership_plan = p->>'membership_plan' where id = rid
      and (p->>'membership') in ('trial','active','expired','suspended');
  end if;
  -- online orders from Swiggy/Zomato/website, into the local kitchen
  for x in select * from jsonb_array_elements(coalesce(p->'online_orders','[]')) loop
    insert into online_orders(id, restaurant_id, channel_id, external_id, display_id, status, customer_name, customer_phone, address, items, unmatched, gross, commission, payout, is_prepaid, raw, placed_at, origin)
    values ((x->>'id')::uuid, rid, nullif(x->>'channel_id','')::uuid, x->>'external_id', x->>'display_id', 'new', x->>'customer_name', x->>'customer_phone', x->>'address', coalesce(x->'items','[]'), coalesce(x->'unmatched','[]'), (x->>'gross')::numeric, (x->>'commission')::numeric, (x->>'payout')::numeric, coalesce((x->>'is_prepaid')::boolean,true), x->'raw', (x->>'placed_at')::timestamptz, 'cloud')
    on conflict (restaurant_id, external_id) do nothing;
    n := n + 1;
  end loop;
  -- OTA and direct bookings, into the local front desk (first free room of the type if the cloud's room is taken locally)
  for x in select * from jsonb_array_elements(coalesce(p->'bookings','[]')) loop
    if exists (select 1 from bookings where id = (x->>'id')::uuid) then continue; end if;
    insert into guests(id, restaurant_id, full_name, phone, email) values ((x->>'guest_id')::uuid, rid, coalesce(x->>'guest_name','Guest'), x->>'guest_phone', x->>'guest_email') on conflict (id) do nothing;
    rm := (x->>'room_id')::uuid;
    if exists (select 1 from bookings b where b.room_id = rm and b.status in ('reserved','checked_in') and b.check_in < (x->>'check_out')::date and b.check_out > (x->>'check_in')::date) then
      select r2.id into rm from rooms r2 where r2.room_type_id = (select room_type_id from rooms where id = (x->>'room_id')::uuid) and r2.status <> 'maintenance'
        and not exists (select 1 from bookings b where b.room_id = r2.id and b.status in ('reserved','checked_in') and b.check_in < (x->>'check_out')::date and b.check_out > (x->>'check_in')::date) order by r2.sort_order limit 1;
    end if;
    if rm is null then
      insert into ota_sync_log(restaurant_id, direction, ok, message) values (rid, 'import', false, 'overbooking: cloud booking '||coalesce(x->>'external_ref', x->>'id')||' has no free room');
      continue;
    end if;
    insert into bookings(id, restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, ota_channel_id, external_ref, is_block, origin, notes)
    values ((x->>'id')::uuid, rid, next_number('booking', rid), (x->>'guest_id')::uuid, rm, (x->>'check_in')::date, (x->>'check_out')::date, coalesce((x->>'adults')::int,2), coalesce((x->>'children')::int,0), coalesce((x->>'rate')::numeric,0), coalesce((x->>'status')::booking_status,'reserved'), x->>'source', nullif(x->>'ota_channel_id','')::uuid, x->>'external_ref', coalesce((x->>'is_block')::boolean,false), 'cloud', 'From '||coalesce(x->>'source','online'));
    if (x->>'check_in')::date = current_date then update rooms set status = 'reserved' where id = rm and status = 'available'; end if;
    n := n + 1;
  end loop;
  -- neighbours results and other people's listings, for display while offline
  if p ? 'neighbours' then
    insert into neighbours_cache(kind, payload, fetched_at) values ('all', p->'neighbours', now()) on conflict (kind) do update set payload = excluded.payload, fetched_at = now();
  end if;
  for x in select * from jsonb_array_elements(coalesce(p->'proof_views','[]')) loop
    insert into proof_views(link_id, viewed_at) select (x->>'link_id')::uuid, (x->>'viewed_at')::timestamptz where exists (select 1 from proof_links where id = (x->>'link_id')::uuid)
      and not exists (select 1 from proof_views v where v.link_id = (x->>'link_id')::uuid and v.viewed_at = (x->>'viewed_at')::timestamptz);
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'channels','[]')) loop
    insert into order_channels(id, restaurant_id, kind, label, webhook_token) values ((x->>'id')::uuid, rid, (x->>'kind')::channel_kind, x->>'label', x->>'webhook_token')
    on conflict (id) do update set label = excluded.label, webhook_token = excluded.webhook_token;
  end loop;
  insert into sync_state(key, cursor, note) values ('pull', (p->>'at')::timestamptz, n||' items') on conflict (key) do update set cursor = excluded.cursor, note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true, 'applied', n);
end $$;

-- next_number with explicit tenant is used by box_apply
-- (already supports p_restaurant_id since 0004)

alter table sync_state enable row level security;
alter table neighbours_cache enable row level security;
drop policy if exists read_all on sync_state; create policy read_all on sync_state for select using (true);
drop policy if exists read_all on neighbours_cache; create policy read_all on neighbours_cache for select using (true);
