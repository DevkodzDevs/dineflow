-- ═══════════ Demo fill — TEST DATA for two named properties only ═══════════
--
-- Fills every section of the app with believable dummy data: food items and recipes, pantry with
-- priced purchases, tables, rooms and rates, guests, stays and folios, facilities, labour, printers,
-- delivery channels, reservations and offers, ~3 months of trading (orders, bills, payments), then
-- the whole Tax & GST section — registration profile, statutory documents, filed returns, stay
-- invoices and B2B tax invoices carrying a guest GSTIN.
--
-- NOTHING here runs against a property unless its name matches one of the two below. Every other
-- property in the database is untouched. The numbers are invented; they are for testing screens,
-- not for filing anything.
--
--   Tan Resort    resort   regular scheme, MONTHLY GSTR-1/3B, rooms above ₹7,500 → 18% + 10% service charge
--   manoooo       hotel    regular scheme, QUARTERLY (QRMP), rooms below ₹7,500 → 5%, one return left overdue
--
-- The two are deliberately set up differently so both paths through the Tax screen can be tested:
-- monthly vs quarterly returns, 18% vs 5%, service charge vs none, clean vs overdue.
--
-- The properties are matched by name at the bottom of this file. If neither exists when the
-- migration runs, nothing is seeded and a notice says so — which migrate.mjs swallows. Check with:
--
--   select name, gstin, gst_scheme, gst_monthly,
--          (select count(*) from compliance_docs c where c.restaurant_id = r.id)     as docs,
--          (select count(*) from compliance_filings f where f.restaurant_id = r.id)  as filings,
--          (select count(*) from bills b where b.restaurant_id = r.id)               as bills
--     from restaurants r order by name;
--
-- To seed a property by hand afterwards (as the postgres role, or from Master control):
--
--   select seed_demo_full('<restaurant uuid>', 'Legal Name LLP', 'AACFT4567P', '33AACFT4567P1ZK',
--                         '12419026000876', true,
--                         '{"name":"CA name","firm":"Firm","membership":"223145",
--                           "email":"ca@example.in","phone":"+91 90000 00000"}'::jsonb,
--                         90, false);

-- Three months of trading is a few thousand rows per property, and every order item fires the
-- recipe-consumption trigger. Give it room: the Supabase SQL editor otherwise cuts in at 2 minutes
-- and rolls the whole thing back.
set statement_timeout = '15min';

-- ── the Indian financial year of a date, written 2026-27 (matches financialYear() in the app) ──
create or replace function demo_fy(d date) returns text
language sql immutable as $$
  select case when extract(month from d) >= 4
              then extract(year from d)::int::text || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
              else (extract(year from d)::int - 1)::text || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end
$$;

-- ── 'Q2 2026-27' for a quarter-END month (Jun, Sep, Dec, Mar) ──
create or replace function demo_quarter(d date) returns text
language sql immutable as $$
  select 'Q' || (case extract(month from d)::int when 6 then 1 when 9 then 2 when 12 then 3 when 3 then 4 end)::text
         || ' ' || demo_fy(d)
$$;


create or replace function seed_demo_full(
  p_rid          uuid,
  p_legal_name   text,
  p_pan          text,
  p_gstin        text,
  p_fssai        text,
  p_gst_monthly  boolean,
  p_ca           jsonb,                    -- {name, firm, membership, email, phone}
  p_days         int     default 90,
  p_overdue_gap  boolean default false     -- leave the most recent past-due GST return unfiled
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r restaurants%rowtype;
  is_stay boolean; is_resort boolean;
  cat uuid; d date; mi record; ing record; rtv record; dv record;
  oid uuid; kid uuid; bid uuid; pid uuid; gid uuid; rmid uuid; bkid uuid;
  rt_a uuid; rt_b uuid; rt_c uuid; rt_d uuid;
  n_orders int; sub numeric; disc numeric; svc numeric; taxable numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; half numeric;
  nights int; room_amt numeric; extra_amt numeric; lines jsonb; line_gst numeric;
  per text; owner_uid uuid; seedv int; gst_r numeric; room_r numeric;
  n_dish int := 0; n_room int := 0; n_bill int := 0; n_doc int := 0; n_fil int := 0; n_inv int := 0; n_book int := 0;
begin
  -- This rewrites a property's registration, rates and membership, so it is not something a tenant
  -- may point at another tenant. EXECUTE is revoked from PUBLIC below; this is the second lock:
  -- no signed-in caller except Master control gets through. A migration has no auth.uid() at all.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'seed_demo_full is for Master control or a migration only';
  end if;
  select * into r from restaurants where id = p_rid;
  if not found then raise exception 'property % not found', p_rid; end if;
  is_stay   := r.property_type in ('hotel','resort');
  is_resort := r.property_type = 'resort';
  seedv     := abs(('x' || substr(md5(p_rid::text), 1, 7))::bit(28)::int) % 11;

  -- ═════ 1. registration, rates and the shop front ═════
  -- A resort with villas above ₹7,500 a night puts the whole property on 18% with input credit;
  -- a hotel whose dearest room is ₹4,000 stays on 5% without credit. Both are the real rule.
  gst_r  := case when is_resort then 18 else 5 end;
  room_r := case when is_resort then 18 else 5 end;
  update restaurants set
    legal_name = p_legal_name, pan = p_pan, gstin = p_gstin,
    gst_scheme = 'regular', gst_state_code = left(p_gstin, 2), gst_monthly = p_gst_monthly,
    fssai_no = p_fssai,
    ca_name = p_ca->>'name', ca_firm = p_ca->>'firm', ca_membership_no = p_ca->>'membership',
    ca_email = p_ca->>'email', ca_phone = p_ca->>'phone',
    gst_rate = gst_r, room_gst_rate = room_r,
    service_charge_pct = case when is_resort then 10 else 0 end,
    address = coalesce(nullif(address,''), case when is_resort then 'Sunset Point Road, Kovalam, Kanyakumari 629702'
                                                 else '14 Bazaar Street, Nagercoil 629001' end),
    phone = coalesce(nullif(phone,''), case when is_resort then '+91 98430 77120' else '+91 98430 22118' end),
    district = coalesce(district, 'Kanyakumari'),
    pincode  = coalesce(pincode, case when is_resort then '629702' else '629001' end),
    lat = coalesce(lat, case when is_resort then 8.0700 else 8.1780 end),
    lng = coalesce(lng, case when is_resort then 77.5560 else 77.4310 end),
    network_alias = coalesce(network_alias, case when is_resort then 'A resort in Kanyakumari' else 'A hotel in Nagercoil' end),
    tagline = coalesce(tagline, case when is_resort then 'Sea-facing villas, slow mornings, honest food'
                                     else 'Clean rooms and a kitchen that does not cut corners' end),
    policies = coalesce(policies, 'Free cancellation up to 48 hours before arrival. Government photo ID required at check-in. Children under 5 stay free.'),
    booking_slug = coalesce(booking_slug, slug),
    check_in_time = '14:00', check_out_time = '11:00',
    membership = 'active', membership_plan = coalesce(membership_plan, 'yearly'),
    membership_ends_at = greatest(coalesce(membership_ends_at, now()), now() + interval '300 days'),
    is_listed = true, dining_enabled = true, takeaway_enabled = true, delivery_enabled = true,
    price_for_two = coalesce(price_for_two, case when is_resort then 1600 else 700 end),
    cuisines = case when cardinality(cuisines) = 0
                    then case when is_resort then array['South Indian','Seafood','Continental']
                              else array['South Indian','Chettinad','Tandoor'] end
                    else cuisines end,
    advance_pct = case when is_stay then 25 else advance_pct end,
    upi_vpa = coalesce(upi_vpa, regexp_replace(lower(slug), '[^a-z0-9]', '', 'g') || '@okaxis'),
    upi_payee = coalesce(upi_payee, p_legal_name)
  where id = p_rid;
  select * into r from restaurants where id = p_rid;

  -- ═════ 2. food items — categories, dishes, recipes ═════
  insert into categories(restaurant_id, name, sort_order)
  select p_rid, x.n, x.s from (values
    ('Starters',1),('Soups & Salads',2),('Mains',3),('Seafood',4),('Breads & Rice',5),
    ('Tiffin',6),('Drinks',7),('Desserts',8)
  ) x(n,s) where not exists (select 1 from categories c where c.restaurant_id = p_rid and c.name = x.n);

  for mi in select * from (values
    -- name, category, price, veg, prep minutes, description, resort-only
    ('Chicken 65','Starters',240,false,14,'Crisp, curd-marinated, curry-leaf tempered',false),
    ('Gobi Manchurian','Starters',190,true,14,'Indo-Chinese, dry',false),
    ('Onion pakoda','Starters',120,true,10,'Served with coconut chutney',false),
    ('Chettinad pepper chicken','Starters',280,false,18,'Dry roast, heavy on pepper',false),
    ('Grilled prawns','Starters',420,false,20,'Charcoal grill, lime and butter',true),
    ('Rasam shot','Soups & Salads',70,true,6,'Pepper and tamarind, served hot',false),
    ('Sweet corn soup','Soups & Salads',140,true,10,null,false),
    ('Kachumber salad','Soups & Salads',110,true,6,'Cucumber, onion, tomato, lime',false),
    ('Chicken biryani','Mains',320,false,25,'Seeraga samba rice, slow dum',false),
    ('Mutton chukka','Mains',380,false,28,'Pepper roast with curry leaves',false),
    ('Paneer butter masala','Mains',260,true,18,'Creamy tomato gravy',false),
    ('Veg fried rice','Mains',190,true,15,null,false),
    ('Kerala beef fry','Mains',340,false,25,'Coconut slivers, black pepper',false),
    ('Continental grill platter','Mains',620,false,30,'Chicken, sausage, sautéed vegetables',true),
    ('Meen kuzhambu','Seafood',330,false,22,'Tamarind fish curry, Nagercoil style',false),
    ('Prawn thokku','Seafood',390,false,22,'Coastal, spicy, thick masala',false),
    ('Crab masala','Seafood',520,false,30,'Whole crab, roasted spice',true),
    ('Fish curry meals','Seafood',280,false,20,'Unlimited rice, three sides',false),
    ('Butter naan','Breads & Rice',50,true,8,null,false),
    ('Parotta','Breads & Rice',30,true,8,'Flaky, made to order',false),
    ('Curd rice','Breads & Rice',120,true,8,'With pomegranate and curry leaf',false),
    ('Ghee rice','Breads & Rice',150,true,12,null,false),
    ('Masala dosa','Tiffin',120,true,12,'Potato masala, two chutneys, sambar',false),
    ('Idli — 2 nos','Tiffin',60,true,6,'Steamed, with molaga podi',false),
    ('Appam with stew','Tiffin',160,true,14,'Lace-edged appam, vegetable stew',false),
    ('Filter coffee','Drinks',50,true,5,'Kumbakonam degree',false),
    ('Lime soda','Drinks',70,true,4,'Sweet, salt or mixed',false),
    ('Mango lassi','Drinks',100,true,5,null,false),
    ('Tender coconut','Drinks',80,true,3,null,true),
    ('Gulab jamun','Desserts',90,true,5,null,false),
    ('Payasam','Desserts',100,true,6,'Semiya, cardamom, cashew',false),
    ('Elaneer pudding','Desserts',140,true,8,'Tender coconut set with cream',true)
  ) v(nm,ct,pr,veg,prep,ds,resort_only) loop
    if mi.resort_only and not is_resort then continue; end if;
    select id into cat from categories where restaurant_id = p_rid and name = mi.ct limit 1;
    if not exists (select 1 from menu_items m where m.restaurant_id = p_rid and m.name = mi.nm) then
      insert into menu_items(restaurant_id, category_id, name, price, is_veg, prep_minutes, description)
        values (p_rid, cat, mi.nm, mi.pr, mi.veg, mi.prep, mi.ds);
      n_dish := n_dish + 1;
    end if;
  end loop;
  -- two dishes off today, so the menu screen has something to show
  update menu_items set is_available = false
    where restaurant_id = p_rid and name in ('Crab masala','Kerala beef fry') and is_available;

  -- ═════ 3. pantry, with opening stock and priced purchases ═════
  for ing in select * from (values
    ('Basmati rice','kg','grocery','India Gate',null,60,10,94),
    ('Seeraga samba rice','kg','grocery',null,null,40,8,118),
    ('Chicken','kg','meat',null,null,30,6,242),
    ('Mutton','kg','meat',null,null,12,3,760),
    ('Prawns','kg','seafood',null,null,14,3,520),
    ('Seer fish','kg','seafood',null,null,12,3,690),
    ('Crab','kg','seafood',null,null,8,2,480),
    ('Paneer','kg','dairy','Amul','8901262010016',10,2,432),
    ('Milk','l','dairy','Aavin',null,50,10,54),
    ('Curd','kg','dairy','Aavin',null,20,4,62),
    ('Amul butter 500 g','pcs','dairy','Amul','8901262090018',14,3,285),
    ('Tomato','kg','vegetable',null,null,25,5,36),
    ('Onion','kg','vegetable',null,null,45,8,34),
    ('Potato','kg','vegetable',null,null,30,6,30),
    ('Cauliflower','kg','vegetable',null,null,14,3,45),
    ('Coriander bunch','pcs','vegetable',null,null,24,6,10),
    ('Curry leaves bunch','pcs','vegetable',null,null,20,5,8),
    ('Wheat flour','kg','grocery','Aashirvaad','8901725111120',40,8,52),
    ('Maida','kg','grocery',null,null,25,5,46),
    ('Refined oil','l','grocery','Fortune','8901396151005',30,6,154),
    ('Coconut oil','l','grocery','KLF',null,12,3,240),
    ('Black pepper','kg','grocery',null,null,5,1,720),
    ('Coffee powder','kg','beverage','Narasus',null,8,2,540),
    ('Sugar','kg','grocery',null,null,30,6,44),
    ('Tender coconut','pcs','beverage',null,null,40,10,38)
  ) v(nm,un,ca,br,bc,qty,rl,cost) loop
    if not exists (select 1 from ingredients where restaurant_id = p_rid and name = ing.nm) then
      insert into ingredients(restaurant_id, name, unit, category, brand, barcode, reorder_level, cost_per_unit, pack_qty)
        values (p_rid, ing.nm, ing.un::stock_unit, ing.ca, ing.br, ing.bc, ing.rl, ing.cost,
                case when ing.bc is not null then 1 else null end);
      insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, note, unit_cost, created_at)
        select p_rid, id, ing.qty, 'opening', 'Opening stock (demo)', ing.cost, now() - make_interval(days => p_days)
        from ingredients where restaurant_id = p_rid and name = ing.nm;
    end if;
  end loop;

  insert into recipe_items(restaurant_id, menu_item_id, ingredient_id, qty)
  select p_rid, m.id, i.id, v.q from (values
    ('Chicken biryani','Seeraga samba rice',0.20),('Chicken biryani','Chicken',0.18),('Chicken biryani','Onion',0.08),
    ('Mutton chukka','Mutton',0.20),('Mutton chukka','Onion',0.06),('Mutton chukka','Black pepper',0.004),
    ('Chettinad pepper chicken','Chicken',0.16),('Chettinad pepper chicken','Black pepper',0.005),
    ('Chicken 65','Chicken',0.15),('Chicken 65','Curd',0.04),
    ('Paneer butter masala','Paneer',0.15),('Paneer butter masala','Tomato',0.12),('Paneer butter masala','Amul butter 500 g',0.02),
    ('Kerala beef fry','Coconut oil',0.02),('Kerala beef fry','Onion',0.07),
    ('Meen kuzhambu','Seer fish',0.18),('Meen kuzhambu','Tomato',0.08),
    ('Prawn thokku','Prawns',0.20),('Prawn thokku','Onion',0.06),
    ('Grilled prawns','Prawns',0.18),('Crab masala','Crab',0.35),
    ('Fish curry meals','Seer fish',0.15),('Fish curry meals','Basmati rice',0.18),
    ('Veg fried rice','Basmati rice',0.16),('Veg fried rice','Cauliflower',0.05),
    ('Ghee rice','Basmati rice',0.18),('Butter naan','Maida',0.09),('Butter naan','Amul butter 500 g',0.02),
    ('Parotta','Maida',0.08),('Masala dosa','Potato',0.10),('Idli — 2 nos','Basmati rice',0.06),
    ('Appam with stew','Milk',0.10),('Curd rice','Curd',0.16),('Mango lassi','Curd',0.12),
    ('Filter coffee','Milk',0.12),('Filter coffee','Coffee powder',0.012),
    ('Payasam','Milk',0.15),('Payasam','Sugar',0.05),('Tender coconut','Tender coconut',1.0),
    ('Gobi Manchurian','Cauliflower',0.16),('Onion pakoda','Onion',0.12),('Sweet corn soup','Milk',0.05),
    ('Rasam shot','Tomato',0.04),('Kachumber salad','Tomato',0.06)
  ) v(dish,ingr,q)
  join menu_items m   on m.restaurant_id = p_rid and m.name = v.dish
  join ingredients i  on i.restaurant_id = p_rid and i.name = v.ingr
  where not exists (select 1 from recipe_items ri where ri.menu_item_id = m.id and ri.ingredient_id = i.id);

  -- weekly market runs with the price actually paid (this is what the Neighbours index pools)
  if not exists (select 1 from purchases where restaurant_id = p_rid) then
    for d in select generate_series(current_date - p_days, current_date, interval '7 days')::date loop
      insert into purchases(restaurant_id, supplier, invoice_no, total, purchased_at, created_at)
        values (p_rid, (array['Nagercoil wholesale market','Kovalam fish landing','Aavin depot'])[1 + (extract(day from d)::int % 3)],
                'PUR-' || to_char(d, 'YYMMDD'), 0, d, d + interval '7 hours')
        returning id into pid;
      insert into purchase_items(restaurant_id, purchase_id, ingredient_id, qty, unit_cost)
      select p_rid, pid, x.id,
             round((case x.unit when 'kg' then 9 when 'l' then 7 else 12 end * (0.8 + random() * 0.5))::numeric, 2),
             round((x.cost_per_unit * (1 + (seedv - 5)::numeric / 120) * (0.95 + random() * 0.10))::numeric, 2)
      from ingredients x where x.restaurant_id = p_rid and x.is_active;
      update purchases set total = (select sum(qty * unit_cost) from purchase_items where purchase_id = pid) where id = pid;
    end loop;
  end if;

  -- ═════ 4. dining tables ═════
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
  select p_rid, 'T' || g, case when g % 4 = 0 then 6 when g % 3 = 0 then 2 else 4 end,
         case when g <= 6 then 'Main hall' when g <= 10 then 'Garden' else 'Terrace' end, g
  from generate_series(1, 14) g
  where not exists (select 1 from dining_tables t where t.restaurant_id = p_rid and t.name = 'T' || g);

  -- ═════ 5. rooms and 90 days of rates ═════
  if is_stay then
    for rtv in select * from (values
      ('Deluxe Cottage', 4500, 2, '{AC,"Hot water",TV,"Private sit-out"}', true),
      ('Garden Villa',   7800, 3, '{AC,Balcony,TV,"Mini fridge","Garden access"}', true),
      ('Family Villa',   9500, 4, '{AC,"Two bedrooms",TV,"Mini fridge",Kitchenette}', true),
      ('Sea View Suite', 12500, 2, '{AC,"Sea view","Living room",Bathtub,"Butler service"}', true),
      ('Standard',       1800, 2, '{AC,"Hot water",TV}', false),
      ('Deluxe',         2800, 3, '{AC,Balcony,TV,"Mini fridge"}', false),
      ('Executive Suite',4000, 4, '{AC,"Living room",TV,"Work desk","Mini fridge"}', false)
    ) v(nm, rate, cap, amen, resort_only) loop
      if rtv.resort_only <> is_resort then continue; end if;
      if not exists (select 1 from room_types where restaurant_id = p_rid and name = rtv.nm) then
        insert into room_types(restaurant_id, name, base_rate, capacity, amenities)
          values (p_rid, rtv.nm, rtv.rate, rtv.cap, rtv.amen::text[]);
      end if;
    end loop;

    if is_resort then
      select id into rt_a from room_types where restaurant_id = p_rid and name = 'Deluxe Cottage';
      select id into rt_b from room_types where restaurant_id = p_rid and name = 'Garden Villa';
      select id into rt_c from room_types where restaurant_id = p_rid and name = 'Family Villa';
      select id into rt_d from room_types where restaurant_id = p_rid and name = 'Sea View Suite';
      insert into rooms(restaurant_id, number, floor, room_type_id, sort_order)
      select p_rid, (f * 100 + n)::text, f,
             case when n <= 4 then rt_a when n <= 6 then rt_b when n <= 7 then rt_c else rt_d end, f * 100 + n
      from generate_series(1,2) f, generate_series(1,8) n
      where not exists (select 1 from rooms x where x.restaurant_id = p_rid and x.number = (f * 100 + n)::text);
    else
      select id into rt_a from room_types where restaurant_id = p_rid and name = 'Standard';
      select id into rt_b from room_types where restaurant_id = p_rid and name = 'Deluxe';
      select id into rt_c from room_types where restaurant_id = p_rid and name = 'Executive Suite';
      rt_d := rt_c;
      insert into rooms(restaurant_id, number, floor, room_type_id, sort_order)
      select p_rid, (f * 100 + n)::text, f,
             case when n <= 5 then rt_a when n <= 7 then rt_b else rt_c end, f * 100 + n
      from generate_series(1,3) f, generate_series(1,8) n
      where not exists (select 1 from rooms x where x.restaurant_id = p_rid and x.number = (f * 100 + n)::text);
    end if;
    select count(*) into n_room from rooms where restaurant_id = p_rid;

    insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
    select p_rid, t.id, dd::date, t.base_rate,
           null::int, false, case when t.base_rate >= 9000 then 2 else 1 end, now()
    from room_types t, generate_series(current_date - 7, current_date + 90, interval '1 day') dd
    where t.restaurant_id = p_rid
    on conflict (restaurant_id, room_type_id, stay_date) do nothing;

    -- guests, a few of them corporate (their GSTIN is what puts a stay into GSTR-1 table 4)
    insert into guests(restaurant_id, full_name, phone, email, id_type, id_last4, address)
    select p_rid, v.nm, v.ph, v.em, 'Aadhaar', v.id4, v.town from (values
      ('Arjun Prakash','9840012345','arjun.p@example.in','4471','T. Nagar, Chennai'),
      ('Meera Sundaram','9884456789','meera.s@example.in','2210','Kochi, Kerala'),
      ('Sanjay Menon','9995512340','sanjay.menon@example.in','8890','Bengaluru'),
      ('Thomas George','9847712233','tgeorge@example.in','1123','Thiruvananthapuram'),
      ('Divya Ramesh','9600087654','divya.r@example.in','5567','Madurai'),
      ('Nila Krishnan','9840033445','nila.k@example.in','7781','Coimbatore'),
      ('Ashwin Rao','9845511223','ashwin.rao@example.in','3398','Hyderabad'),
      ('Fathima Beevi','9895544332','fathima.b@example.in','6612','Kollam')
    ) v(nm, ph, em, id4, town)
    where not exists (select 1 from guests g where g.restaurant_id = p_rid and g.full_name = v.nm);

    -- past stays, each closed with a tax invoice so the GST summary has accommodation rows
    if not exists (select 1 from bookings b where b.restaurant_id = p_rid and b.status = 'checked_out') then
      for d in select generate_series(current_date - p_days, current_date - 4, interval '4 days')::date loop
        select g.id into gid from guests g where g.restaurant_id = p_rid order by random() limit 1;
        select x.id into rmid from rooms x where x.restaurant_id = p_rid
          and not exists (select 1 from bookings b where b.room_id = x.id and b.check_in < d + 3 and b.check_out > d)
          order by random() limit 1;
        if rmid is null then continue; end if;
        nights := 1 + floor(random() * 3)::int;
        select coalesce(t.base_rate, 2500) into room_amt from rooms x
          left join room_types t on t.id = x.room_type_id where x.id = rmid;
        insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, rate,
                             status, source, checked_in_at, checked_out_at, created_at)
          values (p_rid, next_number('booking', p_rid), gid, rmid, d, d + nights,
                  1 + floor(random() * 3)::int, room_amt, 'checked_out',
                  (array['walk_in','phone','ota','website'])[1 + floor(random() * 4)],
                  d + interval '14 hours', d + make_interval(days => nights) + interval '11 hours', d - 3)
          returning id into bkid;

        -- folio: room nights + one or two extras, then the invoice that closes it
        extra_amt := (array[0, 350, 600, 1200])[1 + floor(random() * 4)];
        if extra_amt > 0 then
          insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_at)
            values (p_rid, bkid, 'extra',
                    (array['Laundry','Airport pickup','Extra bed','Mini bar'])[1 + floor(random() * 4)],
                    extra_amt, d + interval '18 hours');
        end if;

        room_amt  := nights * room_amt;
        line_gst  := round(room_amt * room_r / 100, 2);
        lines     := jsonb_build_array(jsonb_build_object(
                       'description', 'Room · ' || nights || ' night' || case when nights > 1 then 's' else '' end,
                       'qty', nights, 'rate', round(room_amt / nights, 2), 'amount', room_amt,
                       'gst_rate', room_r, 'gst', line_gst));
        cg := line_gst / 2; sg := line_gst / 2; sub := room_amt;
        if extra_amt > 0 then
          line_gst := round(extra_amt * room_r / 100, 2);
          lines := lines || jsonb_build_object('description', 'Folio extras', 'qty', 1, 'rate', extra_amt,
                                               'amount', extra_amt, 'gst_rate', room_r, 'gst', line_gst);
          cg := cg + line_gst / 2; sg := sg + line_gst / 2; sub := sub + extra_amt;
        end if;
        cg := round(cg, 2); sg := round(sg, 2);
        raw := sub + cg + sg; tot := round(raw);
        insert into invoices(restaurant_id, invoice_no, kind, booking_id, guest_name, guest_phone, guest_gstin,
                             lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, issued_at)
        select p_rid, next_number('invoice', p_rid), 'stay', bkid, g.full_name, g.phone,
               -- roughly one stay in five is a company booking that wants input credit
               case when (extract(day from d)::int % 5) = 0
                    then (array['33AABCS1429P1ZT','29AAACI1195H1ZF','33AAFCT8823K1ZQ','27AAACR5055K1Z7'])[1 + (extract(day from d)::int % 4)]
                    end,
               lines, sub, 0, cg, sg, tot - raw, tot, tot,
               jsonb_build_array(jsonb_build_object('description', 'Payment · CARD', 'amount', tot,
                                                    'at', d + make_interval(days => nights) + interval '11 hours')),
               'paid', d + make_interval(days => nights) + interval '11 hours'
        from guests g where g.id = gid;
        n_inv := n_inv + 1; n_book := n_book + 1;
      end loop;
    end if;

    -- one in house, one arriving today, one next week
    select g.id into gid from guests g where g.restaurant_id = p_rid and g.full_name = 'Arjun Prakash';
    select x.id into rmid from rooms x where x.restaurant_id = p_rid order by x.sort_order limit 1;
    if not exists (select 1 from bookings b where b.restaurant_id = p_rid and b.status = 'checked_in') then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, rate, status, source, checked_in_at)
        values (p_rid, next_number('booking', p_rid), gid, rmid, current_date - 1, current_date + 2, 2,
                case when is_resort then 7800 else 2800 end, 'checked_in', 'website', now() - interval '20 hours')
        returning id into bkid;
      update rooms set status = 'occupied' where id = rmid;
      insert into booking_charges(restaurant_id, booking_id, kind, description, amount) values
        (p_rid, bkid, 'extra', 'Laundry', 350),
        (p_rid, bkid, 'restaurant', 'Dinner posted to room', 860),
        (p_rid, bkid, 'discount', 'Advance received', -5000);
      n_book := n_book + 1;
    end if;
    select g.id into gid from guests g where g.restaurant_id = p_rid and g.full_name = 'Meera Sundaram';
    select x.id into rmid from rooms x where x.restaurant_id = p_rid and x.status = 'available' order by x.sort_order offset 3 limit 1;
    if rmid is not null and not exists (select 1 from bookings b where b.restaurant_id = p_rid and b.status = 'reserved' and b.check_in = current_date) then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, rate, status, source, advance)
        values (p_rid, next_number('booking', p_rid), gid, rmid, current_date, current_date + 2, 2,
                case when is_resort then 4500 else 1800 end, 'reserved', 'phone', 2000);
      update rooms set status = 'reserved' where id = rmid;
      n_book := n_book + 1;
    end if;
    select g.id into gid from guests g where g.restaurant_id = p_rid and g.full_name = 'Thomas George';
    select x.id into rmid from rooms x where x.restaurant_id = p_rid and x.status = 'available' order by x.sort_order desc limit 1;
    if rmid is not null and not exists (select 1 from bookings b where b.restaurant_id = p_rid and b.check_in > current_date + 3) then
      insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, advance)
        values (p_rid, next_number('booking', p_rid), gid, rmid, current_date + 6, current_date + 9, 2, 1,
                case when is_resort then 12500 else 4000 end, 'reserved', 'ota', 9000);
      n_book := n_book + 1;
    end if;

    -- housekeeping: one to clean, one under maintenance
    update rooms set status = 'cleaning' where restaurant_id = p_rid and status = 'available'
      and number = (select number from rooms where restaurant_id = p_rid and status = 'available' order by sort_order offset 5 limit 1);
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
    select p_rid, id, 'clean', 'Checkout clean — check the balcony' from rooms
     where restaurant_id = p_rid and status = 'cleaning'
       and not exists (select 1 from housekeeping_tasks h where h.room_id = rooms.id and h.status <> 'done');
    update rooms set status = 'maintenance' where restaurant_id = p_rid and status = 'available'
      and number = (select number from rooms where restaurant_id = p_rid and status = 'available' order by sort_order desc offset 1 limit 1);
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
    select p_rid, id, 'maintenance', 'Geyser leaking — plumber booked' from rooms
     where restaurant_id = p_rid and status = 'maintenance'
       and not exists (select 1 from housekeeping_tasks h where h.room_id = rooms.id and h.status <> 'done');

    -- OTA channels (iCal mode, no credentials — sync just reports "no feed")
    insert into ota_channels(restaurant_id, kind, label, mode, commission_pct)
    select p_rid, v.ota::ota_kind, v.label, 'ical', v.commission from (values
      ('booking_com','Booking.com — demo',15),('airbnb','Airbnb — demo',3),('makemytrip','MakeMyTrip — demo',18)
    ) v(ota, label, commission)
    where not exists (select 1 from ota_channels o where o.restaurant_id = p_rid and o.kind = v.ota::ota_kind);
  end if;

  -- ═════ 6. resort facilities ═════
  if is_resort then
    insert into facilities(restaurant_id, name, kind, rate, duration_minutes, capacity)
    select p_rid, v.title, v.kind, v.rate, v.mins, v.cap from (values
      ('Spa — Ayurvedic massage','spa',2500,60,2),('Spa — couple ritual','spa',4200,90,2),
      ('Kayaking','activity',800,45,6),('Sunset catamaran','activity',1800,90,8),
      ('Bonfire evening','activity',1500,120,20),('Pool cabana','venue',1200,240,4),
      ('Banquet lawn','venue',18000,300,150)
    ) v(title, kind, rate, mins, cap)
    where not exists (select 1 from facilities f where f.restaurant_id = p_rid and f.name = v.title);

    insert into facility_bookings(restaurant_id, facility_id, guest_name, starts_at, people, amount, status)
    select p_rid, f.id, v.guest, current_date + v.days_ahead + v.hour_of_day, v.pax, f.rate, 'booked'
    from (values
      ('Nila Krishnan', 'Spa — Ayurvedic massage', 0, interval '17 hours', 2),
      ('Ashwin Rao',    'Kayaking',                1, interval '10 hours', 4),
      ('Divya Ramesh',  'Bonfire evening',         3, interval '18 hours', 6)
    ) v(guest, facility, days_ahead, hour_of_day, pax)
    join facilities f on f.restaurant_id = p_rid and f.name = v.facility
    where not exists (select 1 from facility_bookings x where x.restaurant_id = p_rid and x.guest_name = v.guest);
  end if;

  -- ═════ 7. labour ═════
  -- next_labour_code() reads the signed-in property, which a migration has no notion of, so the
  -- badge code is built here from the same counter.
  insert into labourers(restaurant_id, code, full_name, phone, skill, daily_wage, id_type, id_last4, joined_on)
  select p_rid, 'L' || lpad(next_number('labour', p_rid)::text, 4, '0'), v.nm, v.ph, v.sk, v.w, 'Aadhaar', v.l4, current_date - v.since from (values
    ('Murugan','9994412345','gardener',600,'7781',420),
    ('Selvi','9994498765','housekeeping',550,'3345',310),
    ('Karuppan','9994456780','security',700,'9902',260),
    ('Lakshmi','9994433221','cleaner',520,'4410',180),
    ('Ravi','9994411002','cook helper',750,'6653',150),
    ('Anbu','9994477889','porter',560,'2287',95),
    ('Vasanthi','9994466778','housekeeping',550,'1140',60)
  ) v(nm,ph,sk,w,l4,since)
  where not exists (select 1 from labourers l where l.restaurant_id = p_rid and l.full_name = v.nm);

  insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, out_at, hours, wage)
  select p_rid, l.id, wd::date, wd + interval '8 hours', wd + interval '17 hours', 9, l.daily_wage
  from labourers l, generate_series(current_date - 30, current_date - 1, interval '1 day') wd
  where l.restaurant_id = p_rid and random() < 0.85
    and not exists (select 1 from labour_attendance a where a.labourer_id = l.id and a.work_date = wd::date);
  -- three are on the floor right now (punched in, not out)
  insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage)
  select p_rid, l.id, current_date, now() - interval '5 hours', l.daily_wage
  from labourers l where l.restaurant_id = p_rid and l.full_name in ('Murugan','Selvi','Ravi')
    and not exists (select 1 from labour_attendance a where a.labourer_id = l.id and a.work_date = current_date);

  insert into labour_payments(restaurant_id, labourer_id, amount, method, period_from, period_to, note)
  select p_rid, l.id, l.daily_wage * 13, 'cash', current_date - 30, current_date - 16, 'Fortnight settlement'
  from labourers l where l.restaurant_id = p_rid
    and not exists (select 1 from labour_payments x where x.labourer_id = l.id);

  -- ═════ 8. printer, delivery channels, offers, reservations ═════
  insert into printers(restaurant_id, name, kind, transport, width, is_default, footer)
  select p_rid, 'Counter (browser)', 'both', 'browser', 80, true, 'Thank you. Visit again.'
  where not exists (select 1 from printers x where x.restaurant_id = p_rid);
  insert into printers(restaurant_id, name, kind, transport, width, station)
  select p_rid, 'Kitchen (browser)', 'kot', 'browser', 80, 'Hot kitchen'
  where not exists (select 1 from printers x where x.restaurant_id = p_rid and x.kind = 'kot');

  insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, prep_minutes, is_live)
  select p_rid, v.k::channel_kind, v.l, v.ref || '-' || left(p_rid::text, 4), v.c, v.p, v.live from (values
    ('swiggy','Swiggy — ' || r.name,'DEMO-SWG',22,20,false),
    ('zomato','Zomato — ' || r.name,'DEMO-ZOM',20,20,false),
    ('website','My website','DEMO-WEB',0,25,true)
  ) v(k,l,ref,c,p,live)
  where not exists (select 1 from order_channels c2 where c2.restaurant_id = p_rid and c2.kind = v.k::channel_kind);

  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone,
                            address, items, unmatched, gross, commission, payout, is_prepaid, placed_at)
  select p_rid, c.id, 'DEMO-' || left(p_rid::text, 4) || '-1001', '1001', 'Ravi Kumar', '9840099887',
         '12 Gandhi Street, Nagercoil',
         jsonb_build_array(
           jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Chicken biryani'),
                              'name','Chicken biryani','qty',2,'price',320,'note','extra raita'),
           jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Butter naan'),
                              'name','Butter naan','qty',3,'price',50,'note',null)),
         '[]'::jsonb, 790, 174, 616, true, now() - interval '6 minutes'
  from order_channels c where c.restaurant_id = p_rid and c.kind = 'swiggy'
    and not exists (select 1 from online_orders o where o.restaurant_id = p_rid and o.external_id = 'DEMO-' || left(p_rid::text, 4) || '-1001');

  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone,
                            items, unmatched, gross, commission, payout, is_prepaid, placed_at)
  select p_rid, c.id, 'DEMO-' || left(p_rid::text, 4) || '-2002', '2002', 'Priya S', '9884400112',
         jsonb_build_array(
           jsonb_build_object('menu_item_id', (select id from menu_items where restaurant_id = p_rid and name = 'Paneer butter masala'),
                              'name','Paneer butter masala','qty',1,'price',260,'note',null),
           jsonb_build_object('menu_item_id', null, 'name','Jeera rice','qty',1,'price',160,'note',null)),
         jsonb_build_array('Jeera rice'), 420, 84, 336, false, now() - interval '11 minutes'
  from order_channels c where c.restaurant_id = p_rid and c.kind = 'zomato'
    and not exists (select 1 from online_orders o where o.restaurant_id = p_rid and o.external_id = 'DEMO-' || left(p_rid::text, 4) || '-2002');

  insert into offers(restaurant_id, title, kind, value, scope, min_order, days, from_time, to_time, code, starts_on, ends_on)
  select p_rid, v.title, v.kind::offer_kind, v.val, v.scope::offer_scope, v.min_order, v.days::int[],
         v.from_t::time, v.to_t::time, v.code, current_date - 20, current_date + 60
  from (values
    ('Weekday lunch — flat 15% off','flat_pct',15,'dining',0,'{1,2,3,4,5}','12:00','15:00','LUNCH15'),
    ('₹150 off on orders above ₹999','flat_amount',150,'delivery',999,'{1,2,3,4,5,6,7}',null,null,'SAVE150'),
    ('Happy hours — 20% off starters','happy_hour',20,'dining',0,'{4,5,6}','17:00','19:00','HAPPY20')
  ) v(title, kind, val, scope, min_order, days, from_t, to_t, code)
  where not exists (select 1 from offers o where o.restaurant_id = p_rid and o.title = v.title);

  insert into reservations(restaurant_id, reservation_no, guest_name, guest_phone, guest_email, on_date, at_time,
                           party_size, occasion, note, status, source)
  -- reservations number themselves off max(reservation_no), not the counters table — book_table() does
  -- the same, so the sequence stays unbroken when a real booking comes in next.
  select p_rid,
         ((select coalesce(max(x.reservation_no), 0) from reservations x where x.restaurant_id = p_rid)
           + row_number() over (order by v.days_ahead, v.clock))::int,
         v.guest, v.phone, v.email,
         current_date + v.days_ahead, v.clock::time, v.pax, v.occasion, v.note, v.state::reservation_status, 'storefront'
  from (values
    ('Gokul Anand','9840111222','gokul.a@example.in',0,'20:00',4,'Birthday','Window table if possible','confirmed'),
    ('Reshma Nair','9895222333','reshma.n@example.in',0,'13:00',2,null,null,'seated'),
    ('Vignesh R','9600333444','vignesh.r@example.in',1,'19:30',6,'Anniversary','Cake at 9pm','confirmed'),
    ('Haritha Pillai','9847444555','haritha.p@example.in',2,'12:30',3,null,'Vegetarian only','requested'),
    ('Imran Sheikh','9845555666','imran.s@example.in',4,'20:30',8,'Business dinner',null,'requested')
  ) v(guest, phone, email, days_ahead, clock, pax, occasion, note, state)
  where not exists (select 1 from reservations x where x.restaurant_id = p_rid and x.guest_name = v.guest);

  insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
  values (p_rid, true, true, true, true, 40, now())
  on conflict (restaurant_id) do update set share_prices = true, share_surplus = true,
    share_labour = true, share_demand = true;

  -- ═════ 9. trading history — orders, items, paid bills, payments ═════
  -- The bill arithmetic below is exactly what generate_bill() does, so the Tax screen derives the
  -- same rate from the tax actually charged.
  half := r.gst_rate / 2;
  if not exists (select 1 from orders o where o.restaurant_id = p_rid and o.created_at < now() - interval '2 days') then
    for d in select generate_series(current_date - p_days, current_date - 1, interval '1 day')::date loop
      n_orders := greatest(4, round((9 + seedv * 0.5 +
                    case extract(isodow from d) when 6 then 7 when 7 then 6 when 1 then -2 else 0 end)
                    * (0.75 + random() * 0.5))::int);
      for k in 1 .. n_orders loop
        insert into orders(restaurant_id, order_no, table_id, type, status, created_at, synced_at)
          values (p_rid, next_number('order', p_rid),
                  (select id from dining_tables t where t.restaurant_id = p_rid order by random() limit 1),
                  (array['dine_in','dine_in','dine_in','dine_in','takeaway','delivery'])[1 + floor(random() * 6)]::order_type,
                  'billed', d + interval '11 hours' + (random() * interval '11 hours'), now())
          returning id into oid;
        insert into kots(restaurant_id, order_id, kot_no, status, created_at)
          values (p_rid, oid, next_number('kot', p_rid), 'served', d + interval '12 hours')
          returning id into kid;
        insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, status, created_at)
        select p_rid, oid, kid, m.id, m.name, m.price, 1 + floor(random() * 2)::int, 'served', d + interval '12 hours'
        from (select id, name, price from menu_items where restaurant_id = p_rid and is_active
              order by random() limit (2 + floor(random() * 4))::int) m;

        select coalesce(sum(qty * price_snapshot), 0) into sub from order_items where order_id = oid;
        -- one bill in eight carries a small discount, so the discount column is exercised
        disc     := case when random() < 0.125 then round(sub * 0.1, 2) else 0 end;
        taxable  := sub - disc;
        svc      := round(taxable * r.service_charge_pct / 100, 2);
        cg       := round((taxable + svc) * half / 100, 2);
        sg       := cg;
        raw      := taxable + svc + cg + sg;
        tot      := round(raw);
        insert into bills(restaurant_id, bill_no, order_id, subtotal, discount_pct, discount_amount, service_charge,
                          cgst, sgst, round_off, total, status, paid_at, created_at)
          values (p_rid, next_number('bill', p_rid), oid, sub, case when disc > 0 then 10 else 0 end, disc, svc,
                  cg, sg, tot - raw, tot, 'paid', d + interval '20 hours', d + interval '20 hours')
          returning id into bid;
        insert into payments(restaurant_id, bill_id, method, amount, created_at)
          values (p_rid, bid, (array['cash','upi','upi','upi','card'])[1 + floor(random() * 5)]::payment_method,
                  tot, d + interval '20 hours');
        n_bill := n_bill + 1;
      end loop;
    end loop;
  end if;

  -- B2B dining tax invoices: a company guest's GSTIN on the invoice puts it in GSTR-1 table 4.
  -- Mirrors generate_dining_invoice(): the invoice carries the bill's own figures.
  if not exists (select 1 from invoices i where i.restaurant_id = p_rid and i.kind = 'dining') then
    for dv in
      select b.id, b.order_id, b.subtotal, b.discount_amount, b.cgst, b.sgst, b.round_off, b.total, b.paid_at,
             row_number() over (order by b.paid_at) as rn
      from bills b where b.restaurant_id = p_rid and b.status = 'paid'
        and b.paid_at >= date_trunc('month', current_date) - interval '3 months'
      order by b.paid_at limit 18
    loop
      select coalesce(jsonb_agg(jsonb_build_object('description', name_snapshot, 'qty', qty, 'rate', price_snapshot,
               'amount', price_snapshot * qty, 'gst_rate', r.gst_rate,
               'gst', round(price_snapshot * qty * r.gst_rate / 100, 2))), '[]')
        into lines from order_items where order_id = dv.order_id and status <> 'cancelled';
      insert into invoices(restaurant_id, invoice_no, kind, bill_id, guest_name, guest_phone, guest_gstin, lines,
                           subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, issued_at)
      values (p_rid, next_number('invoice', p_rid), 'dining', dv.id,
              (array['Sundar Logistics Pvt Ltd','Coastal Infra LLP','Ipsum Software India','Rameswaram Traders'])[1 + (dv.rn::int % 4)],
              (array['9840500011','9884500022','9995500033','9847500044'])[1 + (dv.rn::int % 4)],
              (array['33AABCS1429P1ZT','33AAFCT8823K1ZQ','29AAACI1195H1ZF','33AAGCR2201M1ZD'])[1 + (dv.rn::int % 4)],
              lines, dv.subtotal, dv.discount_amount, dv.cgst, dv.sgst, dv.round_off, dv.total, dv.total,
              jsonb_build_array(jsonb_build_object('description', 'Payment · UPI', 'amount', dv.total, 'at', dv.paid_at)),
              'paid', dv.paid_at);
      n_inv := n_inv + 1;
    end loop;
  end if;

  -- two orders sitting in the kitchen right now, one still unpaid at the counter
  if not exists (select 1 from orders o where o.restaurant_id = p_rid and o.status = 'open') then
    for dv in select t.id, t.name from dining_tables t where t.restaurant_id = p_rid and t.name in ('T2','T7','T11') loop
      insert into orders(restaurant_id, order_no, table_id, type, status, notes, created_at, synced_at)
        values (p_rid, next_number('order', p_rid), dv.id, 'dine_in', 'open',
                case when dv.name = 'T7' then 'No coriander on anything' end,
                now() - (random() * interval '40 minutes'), now())
        returning id into oid;
      insert into kots(restaurant_id, order_id, kot_no, status)
        values (p_rid, oid, next_number('kot', p_rid), (case when dv.name = 'T2' then 'preparing' else 'pending' end)::kot_status)
        returning id into kid;
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, status, notes)
      select p_rid, oid, kid, m.id, m.name, m.price, 1 + floor(random() * 2)::int,
             (case when dv.name = 'T2' then 'preparing' else 'pending' end)::item_status,
             case when m.name = 'Butter naan' then 'less butter' end
      from (select id, name, price from menu_items where restaurant_id = p_rid and is_active and is_available
            order by random() limit 3) m;
      update dining_tables set status = 'occupied' where id = dv.id;
    end loop;
  end if;

  -- ═════ 10. Tax & GST — statutory documents ═════
  for dv in select * from (values
    ('gst_reg','GST registration certificate (REG-06)', p_gstin, 'Central Board of Indirect Taxes & Customs', -1100, null::int, null::text),
    ('pan','PAN card of the business', p_pan, 'Income Tax Department', -1400, null, null),
    ('fssai','FSSAI state licence', p_fssai, 'FSSAI — Tamil Nadu', -680, 45, null),
    ('trade_licence','Trade licence — corporation', 'TL/2026/' || lpad((seedv * 137 + 41)::text, 5, '0'),
     'Nagercoil Municipal Corporation', -260, 200, 'Renewed every financial year'),
    ('shop_estab','Shops & Establishments registration', 'SE/TN/' || lpad((seedv * 211 + 77)::text, 6, '0'),
     'Tamil Nadu Labour Department', -900, 400, null),
    ('fire_noc','Fire safety NOC', 'FS/NOC/' || lpad((seedv * 91 + 19)::text, 5, '0'),
     'Tamil Nadu Fire & Rescue Services', -720, 120, null),
    ('audit_3cd','Tax audit report — Form 3CB with 3CD', null, p_ca->>'firm', -350, null, 'Signed and uploaded by the CA'),
    ('itr_ack','Income-tax return acknowledgement (ITR-V)', 'ACK' || lpad((seedv * 7919 + 1201)::text, 9, '0'),
     'Income Tax Department', -330, null, null),
    ('bank_stmt','Bank statements — current account', 'XXXXXX' || lpad((seedv * 313 + 55)::text, 4, '0'),
     'HDFC Bank, Nagercoil branch', -30, null, 'Downloaded monthly for the books')
  ) v(kind, title, num, issuer, issued_off, expires_off, note) loop
    if not exists (select 1 from compliance_docs c where c.restaurant_id = p_rid and c.kind = dv.kind and c.title = dv.title) then
      insert into compliance_docs(restaurant_id, kind, title, number, issuer, issued_on, expires_on, period, url, notes)
      values (p_rid, dv.kind, dv.title, dv.num, dv.issuer,
              current_date + dv.issued_off,
              case when dv.expires_off is null then null else current_date + dv.expires_off end,
              case dv.kind when 'audit_3cd' then 'FY ' || demo_fy(current_date - 400)
                           when 'itr_ack'  then 'FY ' || demo_fy(current_date - 400)
                           when 'bank_stmt' then to_char(current_date - interval '1 month', 'YYYY-MM') end,
              'https://example.invalid/demo/' || dv.kind || '.pdf', dv.note);
      n_doc := n_doc + 1;
    end if;
  end loop;

  -- a bar licence only where alcohol is served, and it is already expired so the red state shows
  if is_resort and not exists (select 1 from compliance_docs c where c.restaurant_id = p_rid and c.kind = 'bar_licence') then
    insert into compliance_docs(restaurant_id, kind, title, number, issuer, issued_on, expires_on, url, notes)
    values (p_rid, 'bar_licence', 'Bar licence (FL-3)', 'FL3/' || lpad((seedv * 53 + 9)::text, 5, '0'),
            'Tamil Nadu State Marketing Corporation', current_date - 380, current_date - 15,
            'https://example.invalid/demo/bar_licence.pdf', 'RENEWAL OVERDUE — demo data');
    n_doc := n_doc + 1;
  end if;

  -- the acknowledgement of the last GST return that was filed
  if not exists (select 1 from compliance_docs c where c.restaurant_id = p_rid and c.kind = 'gstr_filing') then
    insert into compliance_docs(restaurant_id, kind, title, number, issuer, issued_on, period, url, notes)
    values (p_rid, 'gstr_filing', 'GSTR-3B acknowledgement',
            'AA33' || to_char(current_date - interval '2 months', 'MMYY') || lpad((seedv * 971 + 13)::text, 7, '0'),
            'GST Portal', current_date - 45, to_char(current_date - interval '2 months', 'YYYY-MM'),
            'https://example.invalid/demo/gstr3b.pdf', 'ARN from gst.gov.in');
    n_doc := n_doc + 1;
  end if;

  -- ═════ 11. Tax & GST — the returns, with the ones whose date has passed marked filed ═════
  -- form + period must match what statutoryCalendar() builds in the app, or the screen will not
  -- pair a filing with its calendar row.
  if p_gst_monthly then
    for d in select generate_series(date_trunc('month', current_date) - interval '15 months',
                                    date_trunc('month', current_date), interval '1 month')::date loop
      per := to_char(d, 'YYYY-MM');
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'GSTR-1', per, (d + interval '1 month')::date + 10) on conflict do nothing;
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'GSTR-3B', per, (d + interval '1 month')::date + 19) on conflict do nothing;
    end loop;
  else
    -- QRMP: GSTR-1 by the 13th after the quarter, GSTR-3B by the 22nd in the southern/western states
    for d in select generate_series(date_trunc('month', current_date) - interval '15 months',
                                    date_trunc('month', current_date), interval '1 month')::date loop
      if extract(month from d)::int not in (3, 6, 9, 12) then continue; end if;
      per := demo_quarter(d);
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'GSTR-1', per, (d + interval '1 month')::date + 12) on conflict do nothing;
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'GSTR-3B', per, (d + interval '1 month')::date + 21) on conflict do nothing;
    end loop;
  end if;

  -- income tax: advance tax for this year and last, and last year's audit and return
  for d in select generate_series(current_date - interval '24 months', current_date + interval '6 months', interval '1 month')::date loop
    if extract(month from d)::int = 6 then
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'ADV-TAX', 'Q1 ' || demo_fy(d), make_date(extract(year from d)::int, 6, 15)) on conflict do nothing;
    elsif extract(month from d)::int = 9 then
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'ADV-TAX', 'Q2 ' || demo_fy(d), make_date(extract(year from d)::int, 9, 15)) on conflict do nothing;
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'TAX-AUDIT', 'FY ' || demo_fy(d - 365), make_date(extract(year from d)::int, 9, 30)) on conflict do nothing;
    elsif extract(month from d)::int = 12 then
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'ADV-TAX', 'Q3 ' || demo_fy(d), make_date(extract(year from d)::int, 12, 15)) on conflict do nothing;
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'GSTR-9', 'FY ' || demo_fy(d - 365), make_date(extract(year from d)::int, 12, 31)) on conflict do nothing;
    elsif extract(month from d)::int = 3 then
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'ADV-TAX', 'Q4 ' || demo_fy(d), make_date(extract(year from d)::int, 3, 15)) on conflict do nothing;
    elsif extract(month from d)::int = 10 then
      insert into compliance_filings(restaurant_id, form, period, due_on)
        values (p_rid, 'ITR', 'FY ' || demo_fy(d - 365), make_date(extract(year from d)::int, 10, 31)) on conflict do nothing;
    end if;
  end loop;

  -- Everything whose date has passed is filed, a day or three before the deadline, with the portal
  -- reference against it. The digits come from an md5 of the form and period, so a re-run produces
  -- the same acknowledgement number rather than a new one.
  update compliance_filings set
    filed_on = due_on - (1 + ((length(form) + length(period)) % 4)),
    ack_no   = case when form like 'GSTR%'
                    then 'AA' || left(p_gstin, 2) || to_char(due_on, 'MMYY')
                         || lpad(((('x' || substr(md5(form || period), 1, 7))::bit(28)::int) % 9999999)::text, 7, '0')
                    else 'ITNS' || lpad(((('x' || substr(md5(form || period), 1, 7))::bit(28)::int) % 999999)::text, 6, '0') end,
    updated_at = now()
  where restaurant_id = p_rid and filed_on is null and due_on <= current_date - 2;

  -- one property is left with a genuine overdue return, so the red state can be tested
  if p_overdue_gap then
    update compliance_filings set filed_on = null, ack_no = null
    where id = (select id from compliance_filings
                 where restaurant_id = p_rid and form in ('GSTR-1','GSTR-3B') and due_on < current_date
                 order by due_on desc limit 1);
  end if;
  select count(*) into n_fil from compliance_filings where restaurant_id = p_rid;
  select count(*) into n_doc from compliance_docs where restaurant_id = p_rid;

  -- ═════ 12. tidy up the pantry after all that trading, and seal the closed months ═════
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, note, unit_cost)
  select p_rid, i.id, round((i.reorder_level * 4) - i.current_stock, 3), 'adjustment', 'Physical count (demo)', i.cost_per_unit
  from ingredients i where i.restaurant_id = p_rid and i.is_active and i.current_stock < i.reorder_level * 2;

  -- Proof of business seals a month by hashing its figures, and those helpers read the signed-in
  -- property. Borrow the owner's identity for the length of this transaction so they resolve.
  select id into owner_uid from profiles where restaurant_id = p_rid and role = 'owner' and is_active limit 1;
  if owner_uid is not null then
    begin
      -- both spellings, because auth.uid() reads one or the other depending on the Supabase version
      perform set_config('request.jwt.claim.sub', owner_uid::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', owner_uid::text)::text, true);
      perform seal_all_periods(12);
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', '', true);
      raise notice 'Proof-of-business sealing skipped for %: %', r.name, sqlerrm;
    end;
  else
    raise notice 'No owner profile on % — Proof of business left unsealed.', r.name;
  end if;

  select count(*) into n_bill from bills where restaurant_id = p_rid;
  select count(*) into n_inv  from invoices where restaurant_id = p_rid;
  return jsonb_build_object('property', r.name, 'type', r.property_type, 'gstin', p_gstin,
    'dishes', n_dish, 'rooms', n_room, 'bookings', n_book, 'bills', n_bill,
    'invoices', n_inv, 'documents', n_doc, 'filings', n_fil);
end $$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC. A security-definer seeder that takes an
-- arbitrary restaurant id must not be reachable from the app's anon or authenticated roles.
revoke all on function seed_demo_full(uuid, text, text, text, text, boolean, jsonb, int, boolean) from public;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Apply to the two test properties, and to nothing else.
-- The match ignores case, spaces and punctuation, and tolerates the property type being typed into
-- the name ("Tan Resort resort") or a different number of o's in "manoooo".
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare rid uuid; res jsonb; n int := 0;
begin
  for rid in
    select id from restaurants
     where not is_shadow
       and lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) ~ '^tanresort(resort)?$'
  loop
    res := seed_demo_full(
      rid,
      'Tan Resorts & Leisure LLP',
      'AACFT4567P',
      '33AACFT4567P1ZK',                       -- Tamil Nadu (33); characters 3–12 are the PAN
      '12419026000876',
      true,                                     -- monthly GSTR-1 and GSTR-3B
      jsonb_build_object('name','S. Rajalakshmi','firm','Rajalakshmi & Associates',
                         'membership','223145','email','ca.rajalakshmi@example.in','phone','+91 98430 11223'),
      90, false);
    raise notice 'Seeded %', res;  n := n + 1;
  end loop;

  for rid in
    select id from restaurants
     where not is_shadow
       and lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) ~ '^mano{3,}(hotel|hotels)?$'
  loop
    res := seed_demo_full(
      rid,
      'Manoooo Hospitality Private Limited',
      'AAECM8821L',
      '33AAECM8821L1ZB',
      '12418026000459',
      false,                                    -- quarterly (QRMP): GSTR-1 by the 13th, GSTR-3B by the 22nd
      jsonb_build_object('name','K. Venkatesan','firm','Venkatesan & Co.',
                         'membership','218907','email','ca.venkatesan@example.in','phone','+91 98430 44556'),
      90, true);                                -- leaves one return overdue on purpose
    raise notice 'Seeded %', res;  n := n + 1;
  end loop;

  if n = 0 then
    raise notice 'No property named "Tan Resort" or "manoooo" found — nothing was seeded. Rename the property, or call seed_demo_full(<id>, …) yourself.';
  end if;
end $$;
