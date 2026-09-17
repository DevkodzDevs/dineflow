-- ═══════════ Fix: "Load demo data" has never worked ═══════════
--
-- seed_demo_data() carries two leftover no-op loops that assign the wrong type to a uuid variable:
--
--     for gid in select unnest(array[1,2,3,4,5]) loop null; end loop;   -- gid is uuid
--     for lab in select unnest(array['x'])       loop null; end loop;   -- lab is uuid
--
-- Both bodies are `null`, so they do nothing except raise:
--
--     ERROR: invalid input syntax for type uuid: "1"      (hotels and resorts)
--     ERROR: invalid input syntax for type uuid: "x"      (restaurants)
--
-- The first sits inside the hotel/resort branch, the second in the labour section, so every
-- property type hits one of them. That means Settings → "Load demo data" fails, and so did the
-- "Fill it with sample data" tick box when creating a property — which is why the copy of
-- admin_create_property running on this database had been changed to skip the seed and record
-- `demo_seed_deferred` instead of calling it.
--
-- This migration is the live definition of the function with those two lines deleted and nothing
-- else altered. It was generated from pg_get_functiondef() rather than retyped, so no other drift
-- between the database and the repository is carried in or out.

CREATE OR REPLACE FUNCTION public.seed_demo_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; cat_id uuid; ing record; mi record;
        rt_std uuid; rt_del uuid; rt_ste uuid; rm uuid; gid uuid; bid uuid; lab uuid; ch uuid; made jsonb;
        n_dish int := 0; n_ing int := 0; n_room int := 0; n_book int := 0; n_lab int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner','manager') then raise exception 'only the owner can load demo data'; end if;
  select * into r from restaurants where id = rid;

  -- categories
  insert into categories(restaurant_id, name, sort_order)
  select rid, x.n, x.s from (values ('Starters',1),('Mains',2),('Breads & Rice',3),('Drinks',4),('Desserts',5)) x(n,s)
  where not exists (select 1 from categories c where c.restaurant_id = rid and c.name = x.n);

  -- pantry with barcodes and stock
  for ing in select * from (values
    ('Basmati rice','kg','grocery','India Gate',null,25,5,95),
    ('Chicken','kg','meat',null,null,12,3,240),
    ('Paneer','kg','dairy','Amul','8901262010016',4,2,420),
    ('Tomato','kg','vegetable',null,null,8,3,40),
    ('Onion','kg','vegetable',null,null,15,5,35),
    ('Coriander bunch','pcs','vegetable',null,null,10,4,10),
    ('Refined oil','l','grocery','Fortune','8901396151005',10,3,150),
    ('Amul butter 500 g','pcs','dairy','Amul','8901262090018',6,2,285),
    ('Milk','l','dairy','Aavin',null,20,6,54),
    ('Wheat flour','kg','grocery','Aashirvaad','8901725111120',18,5,52),
    ('Curd','kg','dairy','Aavin',null,7,2,60),
    ('Prawns','kg','seafood',null,null,5,2,520)
  ) v(nm,un,ca,br,bc,qty,rl,cost) loop
    if not exists (select 1 from ingredients where restaurant_id = rid and name = ing.nm) then
      insert into ingredients(restaurant_id, name, unit, category, brand, barcode, reorder_level, cost_per_unit, pack_qty)
        values (rid, ing.nm, ing.un::stock_unit, ing.ca, ing.br, ing.bc, ing.rl, ing.cost, case when ing.bc is not null then 1 else null end);
      insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, note)
        select rid, id, ing.qty, 'opening', 'demo opening stock' from ingredients where restaurant_id = rid and name = ing.nm;
      n_ing := n_ing + 1;
    end if;
  end loop;

  -- menu
  for mi in select * from (values
    ('Chicken biryani','Mains',280,false,'Seeraga samba rice, slow dum'),
    ('Mutton chukka','Mains',340,false,'Pepper roast, curry leaves'),
    ('Paneer butter masala','Mains',240,true,'Creamy tomato gravy'),
    ('Prawn thokku','Mains',360,false,'Coastal style, spicy'),
    ('Veg fried rice','Mains',180,true,null),
    ('Chicken 65','Starters',220,false,'Crisp, curd-marinated'),
    ('Gobi Manchurian','Starters',180,true,null),
    ('Onion pakoda','Starters',120,true,null),
    ('Butter naan','Breads & Rice',45,true,null),
    ('Parotta','Breads & Rice',25,true,null),
    ('Curd rice','Breads & Rice',110,true,null),
    ('Filter coffee','Drinks',40,true,'Kumbakonam degree'),
    ('Lime soda','Drinks',60,true,null),
    ('Mango lassi','Drinks',90,true,null),
    ('Gulab jamun','Desserts',80,true,null),
    ('Payasam','Desserts',90,true,null)
  ) v(nm,ct,pr,veg,ds) loop
    select id into cat_id from categories where restaurant_id = rid and name = mi.ct limit 1;
    if not exists (select 1 from menu_items where restaurant_id = rid and name = mi.nm) then
      insert into menu_items(restaurant_id, category_id, name, price, is_veg, description) values (rid, cat_id, mi.nm, mi.pr, mi.veg, mi.ds);
      n_dish := n_dish + 1;
    end if;
  end loop;

  -- a couple of recipes so stock actually moves when a dish sells
  insert into recipe_items(restaurant_id, menu_item_id, ingredient_id, qty)
  select rid, m.id, i.id, v.q from (values ('Chicken biryani','Basmati rice',0.2),('Chicken biryani','Chicken',0.18),('Chicken biryani','Onion',0.08),
     ('Paneer butter masala','Paneer',0.15),('Paneer butter masala','Tomato',0.12),('Butter naan','Wheat flour',0.09),('Butter naan','Amul butter 500 g',0.02),
     ('Filter coffee','Milk',0.12),('Prawn thokku','Prawns',0.2)) v(dish,ingr,q)
  join menu_items m on m.restaurant_id = rid and m.name = v.dish
  join ingredients i on i.restaurant_id = rid and i.name = v.ingr
  where not exists (select 1 from recipe_items ri where ri.menu_item_id = m.id and ri.ingredient_id = i.id);

  -- tables
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
  select rid, 'T'||g, case when g % 3 = 0 then 6 else 4 end, case when g <= 6 then 'Main hall' else 'Garden' end, g
  from generate_series(1,12) g where not exists (select 1 from dining_tables t where t.restaurant_id = rid and t.name = 'T'||g);

  -- rooms for hotels & resorts
  if r.property_type in ('hotel','resort') then
    select id into rt_std from room_types where restaurant_id = rid and name = 'Standard';
    if rt_std is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (rid,'Standard',2500,2,'{AC,"Hot water",TV}') returning id into rt_std; end if;
    select id into rt_del from room_types where restaurant_id = rid and name = 'Deluxe';
    if rt_del is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (rid,'Deluxe',4000,3,'{AC,Balcony,TV,"Mini fridge"}') returning id into rt_del; end if;
    select id into rt_ste from room_types where restaurant_id = rid and name = 'Suite';
    if rt_ste is null then insert into room_types(restaurant_id, name, base_rate, capacity, amenities) values (rid,'Suite',7500,4,'{AC,"Sea view","Living room",Bathtub}') returning id into rt_ste; end if;
    insert into rooms(restaurant_id, number, floor, room_type_id, sort_order)
    select rid, (f*100+n)::text, f, case when n <= 6 then rt_std when n <= 9 then rt_del else rt_ste end, f*100+n
    from generate_series(1,2) f, generate_series(1,10) n
    where not exists (select 1 from rooms x where x.restaurant_id = rid and x.number = (f*100+n)::text);
    select count(*) into n_room from rooms where restaurant_id = rid;

    -- guests & bookings across yesterday → next week
    insert into guests(restaurant_id, full_name, phone, id_type, id_last4)
    select rid, v.nm, v.ph, 'Aadhaar', v.l4 from (values ('Arjun Prakash','9840012345','4471'),('Meera Sundaram','9884456789','2210'),
      ('Sanjay Menon','9995512340','8890'),('Thomas George','9847712233','1123'),('Divya Ramesh','9600087654','5567')) v(nm,ph,l4)
    where not exists (select 1 from guests g where g.restaurant_id = rid and g.full_name = v.nm);

    -- one in-house guest, one arriving today, one next week
    select id into gid from guests where restaurant_id = rid and full_name = 'Arjun Prakash';
    select id into rm from rooms where restaurant_id = rid and number = '101';
    if not exists (select 1 from bookings b where b.room_id = rm and b.status = 'checked_in') then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source, checked_in_at)
        values (rid, next_number('booking'), gid, rm, current_date - 1, current_date + 2, 2500, 'checked_in', 'walk_in', now() - interval '1 day') returning id into bid;
      update rooms set status = 'occupied' where id = rm;
      insert into booking_charges(restaurant_id, booking_id, kind, description, amount) values (rid, bid, 'extra', 'Laundry', 350);
      n_book := n_book + 1;
    end if;
    select id into gid from guests where restaurant_id = rid and full_name = 'Meera Sundaram';
    select id into rm from rooms where restaurant_id = rid and number = '105';
    if not exists (select 1 from bookings b where b.room_id = rm and b.status = 'reserved') then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source)
        values (rid, next_number('booking'), gid, rm, current_date, current_date + 2, 2500, 'reserved', 'phone');
      update rooms set status = 'reserved' where id = rm; n_book := n_book + 1;
    end if;
    select id into gid from guests where restaurant_id = rid and full_name = 'Thomas George';
    select id into rm from rooms where restaurant_id = rid and number = '110';
    if not exists (select 1 from bookings b where b.room_id = rm) then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source)
        values (rid, next_number('booking'), gid, rm, current_date + 5, current_date + 8, 7500, 'reserved', 'ota'); n_book := n_book + 1;
    end if;
    -- one room to clean, one under maintenance
    update rooms set status = 'cleaning' where restaurant_id = rid and number = '107' and status = 'available';
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes) select rid, id, 'clean', 'Checkout clean' from rooms where restaurant_id = rid and number = '107'
      and not exists (select 1 from housekeeping_tasks h where h.room_id = rooms.id and h.status <> 'done');
    update rooms set status = 'maintenance' where restaurant_id = rid and number = '109' and status = 'available';
    -- 30 days of rates
    perform set_rate_inventory(rt_std, current_date, current_date + 30, 2500, null, false, 1);
    perform set_rate_inventory(rt_del, current_date, current_date + 30, 4000, null, false, 1);
    perform set_rate_inventory(rt_ste, current_date, current_date + 30, 7500, null, false, 2);
  end if;

  if r.property_type = 'resort' then
    insert into facilities(restaurant_id, name, kind, rate, duration_minutes, capacity)
    select rid, v.n, v.k, v.r, v.d, v.c from (values ('Spa — Ayurvedic massage','spa',2500,60,2),('Kayaking','activity',800,45,6),
      ('Bonfire evening','activity',1500,120,20),('Pool cabana','venue',1200,240,4),('Sunset catamaran','activity',1800,90,8)) v(n,k,r,d,c)
    where not exists (select 1 from facilities f where f.restaurant_id = rid and f.name = v.n);
  end if;

  -- labour
  insert into labourers(restaurant_id, code, full_name, phone, skill, daily_wage, id_type, id_last4)
  select rid, next_labour_code(), v.nm, v.ph, v.sk, v.w, 'Aadhaar', v.l4 from (values
    ('Murugan','9994412345','gardener',600,'7781'),('Selvi','9994498765','housekeeping',550,'3345'),
    ('Karuppan','9994456780','security',650,'9902'),('Lakshmi','9994433221','cleaner',500,'4410'),
    ('Ravi','9994411002','cook helper',700,'6653')) v(nm,ph,sk,w,l4)
  where not exists (select 1 from labourers l where l.restaurant_id = rid and l.full_name = v.nm);
  select count(*) into n_lab from labourers where restaurant_id = rid;
  -- today's attendance for three of them
  insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage)
  select rid, id, current_date, now() - interval '5 hours', daily_wage from labourers where restaurant_id = rid and full_name in ('Murugan','Selvi','Ravi')
    and not exists (select 1 from labour_attendance a where a.labourer_id = labourers.id and a.work_date = current_date);

  -- a browser printer so printing works out of the box
  insert into printers(restaurant_id, name, kind, transport, width, is_default)
  select rid, 'Counter (browser)', 'both', 'browser', 80, true where not exists (select 1 from printers p where p.restaurant_id = rid);

  -- demo channels with dummy tokens, plus two sample online orders
  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes)
  select rid, 'swiggy', 'Swiggy — demo outlet', 'DEMO-SWG-001', 22, 20 where not exists (select 1 from order_channels c where c.restaurant_id = rid and c.kind = 'swiggy');
  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes)
  select rid, 'zomato', 'Zomato — demo outlet', 'DEMO-ZOM-001', 20, 20 where not exists (select 1 from order_channels c where c.restaurant_id = rid and c.kind = 'zomato');
  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes, is_live)
  select rid, 'website', 'My website', 'DEMO-WEB', 0, 25, true where not exists (select 1 from order_channels c where c.restaurant_id = rid and c.kind = 'website');

  select id into ch from order_channels where restaurant_id = rid and kind = 'swiggy';
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, placed_at)
  select rid, ch, 'DEMO-1001', '1001', 'Ravi Kumar', '9840099887', '12 Gandhi Street, Nagercoil',
    jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Chicken biryani'), 'name','Chicken biryani','qty',2,'price',280,'note','extra raita'),
                      jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Butter naan'), 'name','Butter naan','qty',2,'price',45,'note',null)),
    650, 143, 507, now() - interval '4 minutes'
  where not exists (select 1 from online_orders o where o.restaurant_id = rid and o.external_id = 'DEMO-1001');
  select id into ch from order_channels where restaurant_id = rid and kind = 'zomato';
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, items, unmatched, gross, commission, payout, is_prepaid, placed_at)
  select rid, ch, 'DEMO-2002', '2002', 'Priya S', '9884400112',
    jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Paneer butter masala'), 'name','Paneer butter masala','qty',1,'price',240,'note',null),
                      jsonb_build_object('menu_item_id', null, 'name','Jeera rice','qty',1,'price',150,'note',null)),
    jsonb_build_array('Jeera rice'), 390, 78, 312, false, now() - interval '9 minutes'
  where not exists (select 1 from online_orders o where o.restaurant_id = rid and o.external_id = 'DEMO-2002');

  -- an iCal OTA channel pointing at nothing (safe: sync just reports "no feed")
  if r.property_type in ('hotel','resort') then
    insert into ota_channels(restaurant_id, kind, label, mode, commission_pct)
    select rid, 'booking_com', 'Booking.com — demo', 'ical', 15 where not exists (select 1 from ota_channels o where o.restaurant_id = rid);
    insert into ota_channels(restaurant_id, kind, label, mode, commission_pct)
    select rid, 'airbnb', 'Airbnb — demo', 'ical', 3 where not exists (select 1 from ota_channels o where o.restaurant_id = rid and o.kind = 'airbnb');
  end if;

  -- a couple of live table orders so the kitchen has something to show
  if not exists (select 1 from orders where restaurant_id = rid and status = 'open') then
    perform place_order((select id from dining_tables where restaurant_id = rid and name = 'T2'), 'dine_in',
      jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Chicken biryani'), 'qty', 2),
                        jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Butter naan'), 'qty', 3, 'note', 'less butter')),
      '{}'::jsonb, null, null, null);
    perform place_order((select id from dining_tables where restaurant_id = rid and name = 'T7'), 'dine_in',
      jsonb_build_array(jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Paneer butter masala'), 'qty', 1),
                        jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = rid and name = 'Filter coffee'), 'qty', 4)),
      '{}'::jsonb, null, null, null);
  end if;

  update restaurants set booking_slug = coalesce(booking_slug, slug),
    tagline = coalesce(tagline, 'Comfortable rooms and honest food'),
    policies = coalesce(policies, 'Free cancellation up to 48 hours before arrival. Government ID required at check-in.'),
    gstin = coalesce(gstin, '33ABCDE1234F1Z5'), address = coalesce(address, 'Beach Road, Kanyakumari 629702'), phone = coalesce(phone, '+91 98765 43210')
  where id = rid;

  made := jsonb_build_object('dishes', n_dish, 'ingredients', n_ing, 'rooms', n_room, 'bookings', n_book, 'labourers', n_lab);
  return made;
end $function$
;
