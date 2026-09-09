-- DineFlow v14 — a full sample estate: 2 restaurants, 2 hotels, 2 resorts,
-- each with its own owner login, 60 days of trading history, and all six in one
-- district so the Neighbours network has enough contributors to show real figures.
-- Run AFTER 0013.  Install it from Master control → "Load sample estate".
--
--   Owner logins (all use the same password so they are easy to test):
--     owner@annapoorna.in        Annapoorna Mess            restaurant
--     owner@marina.in            Marina Grill House         restaurant
--     owner@tamizh.in            Hotel Tamizh Residency     hotel
--     owner@pearl.in             Pearl City Hotel           hotel
--     owner@bayresort.in         Kanyakumari Bay Resort     resort
--     owner@pinehill.in          Ooty Pine Hill Resort      resort
--   password for all six:  Dine@1234

create or replace function demo_user(p_email text, p_password text, p_name text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is not null then return uid; end if;
  uid := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

/**
 * Fills one property with everything: menu + recipes, pantry with priced purchases,
 * tables, rooms & rates, guests & bookings, facilities, labour, printers, channels,
 * and `p_days` of past trading so the Tomorrow brief and Proof of business have history.
 * Sets admin_context first so every trigger and helper resolves to this property.
 */
create or replace function seed_property(p_rid uuid, p_days int default 60) returns void
language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; cat_id uuid; d date; n_orders int; oid uuid; kid uuid; mi record; bno int;
  sub numeric; gst numeric; tot numeric; rt_std uuid; rt_del uuid; rt_ste uuid; rm uuid; gid uuid; bid uuid;
  pid uuid; i record; seedv int;
begin
  if not is_platform_admin() then raise exception 'only master control can seed'; end if;
  select * into r from restaurants where id = p_rid;
  -- act as this property so next_number(), triggers and RLS all resolve correctly
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), p_rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id;

  -- ── categories & menu ─────────────────────────────────────────────
  insert into categories(restaurant_id, name, sort_order)
  select p_rid, x.n, x.s from (values ('Starters',1),('Mains',2),('Breads & Rice',3),('Drinks',4),('Desserts',5)) x(n,s)
  where not exists (select 1 from categories c where c.restaurant_id = p_rid and c.name = x.n);

  for mi in select * from (values
    ('Chicken biryani','Mains',280,false),('Mutton chukka','Mains',340,false),('Paneer butter masala','Mains',240,true),
    ('Prawn thokku','Mains',360,false),('Veg fried rice','Mains',180,true),('Fish curry meals','Mains',260,false),
    ('Chicken 65','Starters',220,false),('Gobi Manchurian','Starters',180,true),('Onion pakoda','Starters',120,true),
    ('Butter naan','Breads & Rice',45,true),('Parotta','Breads & Rice',25,true),('Curd rice','Breads & Rice',110,true),
    ('Filter coffee','Drinks',40,true),('Lime soda','Drinks',60,true),('Mango lassi','Drinks',90,true),
    ('Gulab jamun','Desserts',80,true),('Payasam','Desserts',90,true)
  ) v(nm,ct,pr,veg) loop
    select id into cat_id from categories where restaurant_id = p_rid and name = mi.ct limit 1;
    insert into menu_items(restaurant_id, category_id, name, price, is_veg)
    select p_rid, cat_id, mi.nm, mi.pr, mi.veg where not exists (select 1 from menu_items m where m.restaurant_id = p_rid and m.name = mi.nm);
  end loop;

  -- ── pantry, with real purchase prices (this is what Neighbours pools) ──
  for i in select * from (values
    ('Basmati rice','kg','grocery','India Gate',null,5,92),('Chicken','kg','meat',null,null,3,238),
    ('Paneer','kg','dairy','Amul','8901262010016',2,432),('Tomato','kg','vegetable',null,null,3,34),
    ('Onion','kg','vegetable',null,null,5,32),('Coriander bunch','pcs','vegetable',null,null,4,10),
    ('Refined oil','l','grocery','Fortune','8901396151005',3,156),('Amul butter 500 g','pcs','dairy','Amul','8901262090018',2,285),
    ('Milk','l','dairy','Aavin',null,6,54),('Wheat flour','kg','grocery','Aashirvaad','8901725111120',5,52),
    ('Curd','kg','dairy','Aavin',null,2,62),('Prawns','kg','seafood',null,null,2,515),('Fish','kg','seafood',null,null,2,320)
  ) v(nm,un,ca,br,bc,rl,cost) loop
    insert into ingredients(restaurant_id, name, unit, category, brand, barcode, reorder_level, cost_per_unit, pack_qty)
    select p_rid, i.nm, i.un::stock_unit, i.ca, i.br, i.bc, i.rl, i.cost, case when i.bc is not null then 1 else null end
    where not exists (select 1 from ingredients x where x.restaurant_id = p_rid and x.name = i.nm);
  end loop;

  -- recipes, so stock moves and the Tomorrow brief can write a shopping list
  insert into recipe_items(restaurant_id, menu_item_id, ingredient_id, qty)
  select p_rid, m.id, ing.id, v.q from (values
    ('Chicken biryani','Basmati rice',0.2),('Chicken biryani','Chicken',0.18),('Chicken biryani','Onion',0.08),
    ('Mutton chukka','Onion',0.06),('Paneer butter masala','Paneer',0.15),('Paneer butter masala','Tomato',0.12),
    ('Prawn thokku','Prawns',0.2),('Fish curry meals','Fish',0.18),('Veg fried rice','Basmati rice',0.15),
    ('Butter naan','Wheat flour',0.09),('Butter naan','Amul butter 500 g',0.02),('Parotta','Wheat flour',0.07),
    ('Curd rice','Curd',0.15),('Filter coffee','Milk',0.12),('Mango lassi','Curd',0.1),('Chicken 65','Chicken',0.15)
  ) v(dish,ingr,q)
  join menu_items m on m.restaurant_id = p_rid and m.name = v.dish
  join ingredients ing on ing.restaurant_id = p_rid and ing.name = v.ingr
  where not exists (select 1 from recipe_items ri where ri.menu_item_id = m.id and ri.ingredient_id = ing.id);

  -- three months of weekly purchases, each with the price actually paid (slight per-property variation)
  seedv := (('x' || substr(md5(p_rid::text), 1, 8))::bit(32)::int % 17);
  for d in select generate_series(current_date - p_days, current_date, interval '7 days')::date loop
    insert into purchases(restaurant_id, supplier, invoice_no, total, created_at)
      values (p_rid, 'Local market', 'INV-' || to_char(d, 'MMDD'), 0, d + interval '7 hours') returning id into pid;
    insert into purchase_items(restaurant_id, purchase_id, ingredient_id, qty, unit_cost)
    select p_rid, pid, x.id,
      round((case x.unit when 'kg' then 8 when 'l' then 6 else 10 end * (0.8 + random() * 0.5))::numeric, 2),
      round((x.cost_per_unit * (1 + (seedv - 8)::numeric / 100) * (0.94 + random() * 0.12))::numeric, 2)
    from ingredients x where x.restaurant_id = p_rid and x.is_active;
    update purchases set total = (select sum(qty * unit_cost) from purchase_items where purchase_id = pid) where id = pid;
  end loop;

  -- ── tables ────────────────────────────────────────────────────────
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
  select p_rid, 'T'||g, case when g % 3 = 0 then 6 else 4 end, case when g <= 6 then 'Main hall' else 'Garden' end, g
  from generate_series(1,12) g where not exists (select 1 from dining_tables t where t.restaurant_id = p_rid and t.name = 'T'||g);

  -- ── rooms (hotel & resort) ────────────────────────────────────────
  if r.property_type in ('hotel','resort') then
    select id into rt_std from room_types where restaurant_id = p_rid and name = 'Standard';
    if rt_std is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (p_rid,'Standard',2500,2,'{AC,"Hot water",TV}') returning id into rt_std; end if;
    select id into rt_del from room_types where restaurant_id = p_rid and name = 'Deluxe';
    if rt_del is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (p_rid,'Deluxe',4000,3,'{AC,Balcony,TV,"Mini fridge"}') returning id into rt_del; end if;
    select id into rt_ste from room_types where restaurant_id = p_rid and name = 'Suite';
    if rt_ste is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (p_rid,'Suite',7500,4,'{AC,"Sea view","Living room",Bathtub}') returning id into rt_ste; end if;
    insert into rooms(restaurant_id, number, floor, room_type_id, sort_order)
    select p_rid, (f*100+n)::text, f, case when n <= 6 then rt_std when n <= 9 then rt_del else rt_ste end, f*100+n
    from generate_series(1,2) f, generate_series(1,10) n
    where not exists (select 1 from rooms x where x.restaurant_id = p_rid and x.number = (f*100+n)::text);
    perform set_rate_inventory(rt_std, current_date, current_date + 60, 2500, null, false, 1);
    perform set_rate_inventory(rt_del, current_date, current_date + 60, 4000, null, false, 1);
    perform set_rate_inventory(rt_ste, current_date, current_date + 60, 7500, null, false, 2);

    insert into guests(restaurant_id, full_name, phone, id_type, id_last4)
    select p_rid, v.nm, v.ph, 'Aadhaar', v.l4 from (values
      ('Arjun Prakash','9840012345','4471'),('Meera Sundaram','9884456789','2210'),('Sanjay Menon','9995512340','8890'),
      ('Thomas George','9847712233','1123'),('Divya Ramesh','9600087654','5567'),('Nila Krishnan','9840033445','7781')) v(nm,ph,l4)
    where not exists (select 1 from guests g where g.restaurant_id = p_rid and g.full_name = v.nm);

    -- past stays, so occupancy and Proof of business have history
    for d in select generate_series(current_date - p_days, current_date - 3, interval '3 days')::date loop
      select g.id into gid from guests g where g.restaurant_id = p_rid order by random() limit 1;
      select x.id into rm from rooms x where x.restaurant_id = p_rid
        and not exists (select 1 from bookings b where b.room_id = x.id and b.check_in < d + 2 and b.check_out > d) order by random() limit 1;
      if rm is not null then
        insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source, checked_in_at, checked_out_at, created_at)
          values (p_rid, next_number('booking'), gid, rm, d, d + 2, (array[2500,4000,7500])[1 + floor(random()*3)], 'checked_out', 'walk_in', d + interval '13 hours', d + interval '2 day 11 hours', d) returning id into bid;
        insert into booking_charges(restaurant_id, booking_id, kind, description, amount)
          values (p_rid, bid, 'discount', 'Payment · CASH', -(select round(greatest(1, check_out - check_in) * rate * 1.12) from bookings where id = bid));
      end if;
    end loop;
    -- one in house now, one arriving today, one next week
    select g.id into gid from guests g where g.restaurant_id = p_rid and g.full_name = 'Arjun Prakash';
    select x.id into rm from rooms x where x.restaurant_id = p_rid and x.number = '101';
    if not exists (select 1 from bookings b where b.room_id = rm and b.status = 'checked_in') then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source, checked_in_at)
        values (p_rid, next_number('booking'), gid, rm, current_date - 1, current_date + 2, 2500, 'checked_in', 'walk_in', now() - interval '1 day') returning id into bid;
      update rooms set status = 'occupied' where id = rm;
      insert into booking_charges(restaurant_id, booking_id, kind, description, amount) values (p_rid, bid, 'extra', 'Laundry', 350);
    end if;
    select g.id into gid from guests g where g.restaurant_id = p_rid and g.full_name = 'Meera Sundaram';
    select x.id into rm from rooms x where x.restaurant_id = p_rid and x.number = '105';
    if not exists (select 1 from bookings b where b.room_id = rm and b.status = 'reserved') then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source)
        values (p_rid, next_number('booking'), gid, rm, current_date, current_date + 2, 2500, 'reserved', 'phone');
      update rooms set status = 'reserved' where id = rm;
    end if;
    update rooms set status = 'cleaning' where restaurant_id = p_rid and number = '107' and status = 'available';
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
      select p_rid, id, 'clean', 'Checkout clean' from rooms where restaurant_id = p_rid and number = '107'
      and not exists (select 1 from housekeeping_tasks h where h.room_id = rooms.id and h.status <> 'done');
    update rooms set status = 'maintenance' where restaurant_id = p_rid and number = '109' and status = 'available';
  end if;

  if r.property_type = 'resort' then
    insert into facilities(restaurant_id, name, kind, rate, duration_minutes, capacity)
    select p_rid, v.n, v.k, v.r, v.d, v.c from (values ('Spa — Ayurvedic massage','spa',2500,60,2),('Kayaking','activity',800,45,6),
      ('Bonfire evening','activity',1500,120,20),('Pool cabana','venue',1200,240,4),('Sunset catamaran','activity',1800,90,8)) v(n,k,r,d,c)
    where not exists (select 1 from facilities f where f.restaurant_id = p_rid and f.name = v.n);
  end if;

  -- ── labour ────────────────────────────────────────────────────────
  insert into labourers(restaurant_id, code, full_name, phone, skill, daily_wage, id_type, id_last4)
  select p_rid, next_labour_code(), v.nm, v.ph, v.sk, v.w, 'Aadhaar', v.l4 from (values
    ('Murugan','9994412345','gardener',600,'7781'),('Selvi','9994498765','housekeeping',550,'3345'),
    ('Karuppan','9994456780','security',650,'9902'),('Lakshmi','9994433221','cleaner',500,'4410'),
    ('Ravi','9994411002','cook helper',700,'6653')) v(nm,ph,sk,w,l4)
  where not exists (select 1 from labourers l where l.restaurant_id = p_rid and l.full_name = v.nm);
  insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage)
  select p_rid, l.id, wd::date, wd + interval '8 hours', l.daily_wage
  from labourers l, generate_series(current_date - 25, current_date, interval '1 day') wd
  where l.restaurant_id = p_rid and random() < 0.8
    and not exists (select 1 from labour_attendance a where a.labourer_id = l.id and a.work_date = wd::date);
  insert into labour_payments(restaurant_id, labourer_id, amount, method, period_from, period_to, note)
  select p_rid, l.id, l.daily_wage * 12, 'cash', current_date - 25, current_date - 12, 'Fortnight settlement'
  from labourers l where l.restaurant_id = p_rid
    and not exists (select 1 from labour_payments x where x.labourer_id = l.id);

  -- ── printer & channels ────────────────────────────────────────────
  insert into printers(restaurant_id, name, kind, transport, width, is_default)
  select p_rid, 'Counter (browser)', 'both', 'browser', 80, true where not exists (select 1 from printers x where x.restaurant_id = p_rid);
  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes)
  select p_rid, 'swiggy', 'Swiggy — ' || r.name, 'DEMO-SWG-' || left(p_rid::text, 4), 22, 20
  where not exists (select 1 from order_channels c where c.restaurant_id = p_rid and c.kind = 'swiggy');
  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes, is_live)
  select p_rid, 'website', 'My website', 'DEMO-WEB-' || left(p_rid::text, 4), 0, 25, true
  where not exists (select 1 from order_channels c where c.restaurant_id = p_rid and c.kind = 'website');

  -- ── trading history: real orders, items and paid bills, back-dated ──
  if not exists (select 1 from orders o where o.restaurant_id = p_rid and o.created_at < now() - interval '2 days') then
    for d in select generate_series(current_date - p_days, current_date - 1, interval '1 day')::date loop
      -- busier at weekends, quieter on Mondays; a little per-property character
      n_orders := greatest(3, round((8 + seedv * 0.4 + case extract(isodow from d) when 6 then 6 when 7 then 5 when 1 then -2 else 0 end) * (0.75 + random() * 0.5)));
      for i in select generate_series(1, n_orders) loop
        insert into orders(restaurant_id, order_no, table_id, type, status, created_at, synced_at)
          values (p_rid, next_number('order'),
            (select id from dining_tables t where t.restaurant_id = p_rid order by random() limit 1),
            (array['dine_in','dine_in','dine_in','takeaway','delivery'])[1 + floor(random()*5)]::order_type,
            'billed', d + (interval '11 hours') + (random() * interval '11 hours'), now())
          returning id into oid;
        insert into kots(restaurant_id, order_id, kot_no, status) values (p_rid, oid, next_number('kot'), 'served') returning id into kid;
        sub := 0;
        for mi in select m.id, m.name, m.price from menu_items m where m.restaurant_id = p_rid order by random() limit (2 + floor(random()*3))::int loop
          insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, status)
            values (p_rid, oid, kid, mi.id, mi.name, mi.price, 1 + floor(random()*2), 'served');
          sub := sub + mi.price;
        end loop;
        select coalesce(sum(qty * price_snapshot), 0) into sub from order_items where order_id = oid;
        gst := round(sub * r.gst_rate / 100, 2);
        tot := round(sub + gst);
        insert into bills(restaurant_id, bill_no, order_id, subtotal, discount_amount, cgst, sgst, round_off, total, status, paid_at, created_at)
          values (p_rid, next_number('bill'), oid, sub, 0, gst/2, gst/2, tot - (sub + gst), tot, 'paid',
                  d + interval '20 hours', d + interval '20 hours') returning id into bid;
        insert into payments(restaurant_id, bill_id, method, amount, created_at)
          values (p_rid, bid, (array['cash','upi','upi','card'])[1 + floor(random()*4)]::payment_method, tot, d + interval '20 hours');
      end loop;
    end loop;
  end if;

  -- two live orders sitting in the kitchen right now
  if not exists (select 1 from orders o where o.restaurant_id = p_rid and o.status = 'open') then
    perform place_order((select id from dining_tables where restaurant_id = p_rid and name = 'T2'), 'dine_in',
      jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Chicken biryani'), 'qty', 2),
                        jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Butter naan'), 'qty', 3, 'note', 'less butter')),
      '{}'::jsonb, null, null, null);
    perform place_order((select id from dining_tables where restaurant_id = p_rid and name = 'T7'), 'dine_in',
      jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Paneer butter masala'), 'qty', 1),
                        jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Filter coffee'), 'qty', 4)),
      '{}'::jsonb, null, null, null);
  end if;

  -- one waiting online order
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, placed_at)
  select p_rid, c.id, 'DEMO-' || left(p_rid::text, 4), '1001', 'Ravi Kumar', '9840099887', '12 Gandhi Street',
    jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Chicken biryani'), 'name','Chicken biryani','qty',2,'price',280,'note','extra raita'),
                      jsonb_build_object('menu_item_id', null, 'name','Jeera rice','qty',1,'price',150,'note',null)),
    710, 156, 554, now() - interval '5 minutes'
  from order_channels c where c.restaurant_id = p_rid and c.kind = 'swiggy'
    and not exists (select 1 from online_orders o where o.restaurant_id = p_rid);

  -- seal the closed months so Proof of business has a verified record
  perform seal_all_periods(6);
end $$;

/**
 * The whole estate in one press: six properties, six owner logins, one district.
 * Six contributors is exactly the Neighbours minimum, so the price index has real data.
 */
create or replace function install_sample_estate() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record; rid uuid; uid uuid; made jsonb := '[]'; slug text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  for v in select * from (values
    ('Annapoorna Mess','restaurant','owner@annapoorna.in','Senthil Kumar','Nagercoil','629001',8.1780,77.4310,'A mess in Nagercoil'),
    ('Marina Grill House','restaurant','owner@marina.in','Fathima Beevi','Kanyakumari','629702',8.0883,77.5385,'A grill house near the beach'),
    ('Hotel Tamizh Residency','hotel','owner@tamizh.in','Rajesh Iyer','Nagercoil','629002',8.1900,77.4200,'A hotel in Nagercoil'),
    ('Pearl City Hotel','hotel','owner@pearl.in','Anitha Raman','Kanyakumari','629701',8.0780,77.5500,'A city hotel'),
    ('Kanyakumari Bay Resort','resort','owner@bayresort.in','Priya Kumar','Kanyakumari','629702',8.0700,77.5560,'A resort near the beach'),
    ('Ooty Pine Hill Resort','resort','owner@pinehill.in','Vikram Shah','Kanyakumari','629703',8.0500,77.5300,'A hill resort')
  ) x(name, ptype, email, owner, district, pincode, lat, lng, alias) loop
    select id into rid from restaurants where name = v.name;
    if rid is null then
      slug := regexp_replace(lower(v.name), '[^a-z0-9]+', '-', 'g');
      insert into restaurants(name, slug, property_type, booking_slug, district, pincode, lat, lng, network_alias,
        address, phone, gstin, tagline, policies, membership, membership_plan, membership_ends_at)
        values (v.name, slug, v.ptype::property_type, slug, v.district, v.pincode, v.lat, v.lng, v.alias,
          v.district || ', Tamil Nadu ' || v.pincode, '+91 98765 ' || lpad((random()*99999)::int::text, 5, '0'),
          '33' || upper(substr(md5(v.name), 1, 5)) || '1234F1Z5', 'Honest food, comfortable rooms',
          'Free cancellation up to 48 hours before arrival. Government ID required at check-in.',
          'active', 'yearly', now() + interval '300 days')
        returning id into rid;
    end if;
    uid := demo_user(v.email, 'Dine@1234', v.owner);
    insert into profiles(id, restaurant_id, full_name, email, role) values (uid, rid, v.owner, v.email, 'owner')
      on conflict (id) do update set restaurant_id = excluded.restaurant_id, full_name = excluded.full_name;
    -- everyone contributes to Neighbours, so the district has real figures
    insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
      values (rid, true, true, true, true, 40, now())
      on conflict (restaurant_id) do update set share_prices = true, share_surplus = true, share_labour = true, share_demand = true;
    perform seed_property(rid, 60);
    made := made || jsonb_build_object('name', v.name, 'type', v.ptype, 'email', v.email, 'password', 'Dine@1234', 'id', rid);
  end loop;
  delete from admin_context where user_id = auth.uid();   -- back to the plain master view
  return jsonb_build_object('ok', true, 'properties', made);
end $$;
