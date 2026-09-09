-- DineFlow v15 — the guest-facing storefront: discovery, table reservations with offers,
-- and online ordering. Everything a diner does lands in a screen the property already uses.
-- Run AFTER 0014.

-- ═══════════ storefront settings ═══════════
alter table restaurants
  add column if not exists is_listed boolean not null default false,        -- appears in /dine
  add column if not exists dining_enabled boolean not null default true,    -- take table bookings
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists takeaway_enabled boolean not null default true,
  add column if not exists cuisines text[] not null default '{}',
  add column if not exists price_for_two numeric(10,2),
  add column if not exists photos text[] not null default '{}',
  add column if not exists opens_at time not null default '11:00',
  add column if not exists closes_at time not null default '23:00',
  add column if not exists slot_minutes int not null default 30,
  add column if not exists seats_per_slot int,                              -- null = derive from tables
  add column if not exists min_order numeric(10,2) not null default 0,
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists packing_charge numeric(10,2) not null default 0,
  add column if not exists delivery_radius_km numeric(5,1) not null default 6,
  add column if not exists rating numeric(3,2), add column if not exists rating_count int not null default 0;

-- ═══════════ table reservations ═══════════
do $$ begin
  create type reservation_status as enum ('requested','confirmed','seated','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  reservation_no integer not null,
  guest_name text not null, guest_phone text not null, guest_email text,
  on_date date not null, at_time time not null, party_size int not null default 2,
  occasion text, note text,
  status reservation_status not null default 'requested',
  table_id uuid references dining_tables(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  offer_id uuid, offer_label text, discount_pct numeric(5,2) not null default 0,
  source text not null default 'storefront',
  seated_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists reservations_day_idx on reservations(restaurant_id, on_date, at_time);

-- ═══════════ offers (the "flat 20% off" chips Zomato shows) ═══════════
do $$ begin
  create type offer_kind as enum ('flat_pct','flat_amount','happy_hour','free_item');
  create type offer_scope as enum ('dining','delivery','both');
exception when duplicate_object then null; end $$;

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  title text not null, kind offer_kind not null default 'flat_pct',
  value numeric(10,2) not null default 0,
  scope offer_scope not null default 'both',
  min_order numeric(10,2) not null default 0,
  days int[] not null default '{1,2,3,4,5,6,7}',       -- isodow
  from_time time, to_time time,
  code text, max_per_guest int not null default 0,
  starts_on date, ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ═══════════ reviews ═══════════
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  guest_name text, rating int not null check (rating between 1 and 5),
  body text, reservation_id uuid references reservations(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  reply text, replied_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function refresh_rating() returns trigger language plpgsql security definer as $$
begin
  update restaurants set rating = (select round(avg(rating)::numeric, 2) from reviews where restaurant_id = coalesce(new.restaurant_id, old.restaurant_id)),
    rating_count = (select count(*) from reviews where restaurant_id = coalesce(new.restaurant_id, old.restaurant_id))
  where id = coalesce(new.restaurant_id, old.restaurant_id);
  return new;
end $$;
drop trigger if exists trg_rating on reviews;
create trigger trg_rating after insert or update or delete on reviews for each row execute function refresh_rating();

-- ═══════════ what a diner sees (all anon) ═══════════
/** The discovery list: every listed property, nearest first when coordinates are given. */
create or replace function dine_discover(p_q text default null, p_city text default null, p_lat numeric default null, p_lng numeric default null, p_mode text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->'sort'), '[]') from (
    select jsonb_build_object(
      'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'cuisines', to_jsonb(r.cuisines),
      'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
      'district', r.district, 'address', r.address, 'photo', coalesce(r.photos[1], r.cover_url),
      'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
      'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
      'open_now', (current_time between r.opens_at and r.closes_at),
      'km', km_between(p_lat, p_lng, r.lat, r.lng),
      'offers', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'kind', o.kind, 'value', o.value))
                          from offers o where o.restaurant_id = r.id and o.is_active
                            and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
      'sort', coalesce(km_between(p_lat, p_lng, r.lat, r.lng), 999) - coalesce(r.rating, 0)
    ) x
    from restaurants r
    where r.is_listed and r.membership in ('trial','active')
      and (p_q is null or r.name ilike '%'||p_q||'%' or exists (select 1 from unnest(r.cuisines) c where c ilike '%'||p_q||'%')
           or exists (select 1 from menu_items m where m.restaurant_id = r.id and m.is_active and m.name ilike '%'||p_q||'%'))
      and (p_city is null or r.district ilike '%'||p_city||'%')
      and (p_mode is null or (p_mode = 'dining' and r.dining_enabled) or (p_mode = 'delivery' and r.delivery_enabled) or (p_mode = 'rooms' and exists (select 1 from rooms rm where rm.restaurant_id = r.id)))
  ) y
$$;

/** One property's public page: details, menu by category, offers, reviews. */
create or replace function dine_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'tagline', r.tagline,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'phone', r.phone, 'district', r.district, 'photos', to_jsonb(r.photos), 'policies', r.policies,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'gst_rate', r.gst_rate, 'room_gst_rate', r.room_gst_rate,
    'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
    'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
    'min_order', r.min_order, 'delivery_fee', r.delivery_fee, 'packing_charge', r.packing_charge,
    'open_now', (current_time between r.opens_at and r.closes_at),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available) order by m.name)
                           from menu_items m where m.category_id = c.id and m.is_active), '[]')) order by c.sort_order)
      from categories c where c.restaurant_id = r.id), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'value', o.value, 'scope', o.scope, 'min_order', o.min_order, 'code', o.code, 'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)))
      from offers o where o.restaurant_id = r.id and o.is_active and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
      from (select * from reviews where restaurant_id = r.id order by created_at desc limit 20) v), '[]'))
  from restaurants r where r.booking_slug = p_slug and r.is_listed and r.membership in ('trial','active')
$$;

/** Bookable time slots for a date: seats left per slot, and any offer that applies then. */
create or replace function dine_slots(p_slug text, p_date date, p_party int default 2) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r restaurants%rowtype; cap int; t time; out jsonb := '[]'; taken int; off record; dow int := extract(isodow from p_date);
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and dining_enabled;
  if not found then return '[]'; end if;
  cap := coalesce(r.seats_per_slot, greatest(8, (select coalesce(sum(capacity), 0) from dining_tables where restaurant_id = r.id)));
  t := r.opens_at;
  while t < r.closes_at loop
    if p_date > current_date or t > current_time + interval '45 minutes' then
      select coalesce(sum(party_size), 0) into taken from reservations
        where restaurant_id = r.id and on_date = p_date and status in ('requested','confirmed','seated')
          and at_time >= t - make_interval(mins => r.slot_minutes) and at_time < t + make_interval(mins => r.slot_minutes);
      select o.id, o.title, o.value into off from offers o
        where o.restaurant_id = r.id and o.is_active and o.scope in ('dining','both') and dow = any(o.days)
          and (o.from_time is null or t >= o.from_time) and (o.to_time is null or t <= o.to_time)
          and (o.starts_on is null or o.starts_on <= p_date) and (o.ends_on is null or o.ends_on >= p_date)
        order by o.value desc limit 1;
      out := out || jsonb_build_object('time', to_char(t, 'HH24:MI'), 'left', greatest(0, cap - taken),
        'full', (cap - taken) < p_party, 'offer_id', off.id, 'offer', off.title, 'offer_pct', off.value);
    end if;
    t := t + make_interval(mins => r.slot_minutes);
  end loop;
  return out;
end $$;

/** Book a table. Returns the reservation number the guest shows at the door. */
create or replace function dine_reserve(p_slug text, p_guest jsonb, p_date date, p_time time, p_party int, p_occasion text default null, p_note text default null, p_offer uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; rid uuid; no int; cap int; taken int; off offers%rowtype; res_id uuid;
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and dining_enabled and membership in ('trial','active');
  if not found then raise exception 'this place is not taking bookings'; end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;
  if p_date < current_date then raise exception 'choose a future time'; end if;
  rid := r.id;
  cap := coalesce(r.seats_per_slot, greatest(8, (select coalesce(sum(capacity), 0) from dining_tables where restaurant_id = rid)));
  select coalesce(sum(party_size), 0) into taken from reservations
    where restaurant_id = rid and on_date = p_date and status in ('requested','confirmed','seated')
      and at_time >= p_time - make_interval(mins => r.slot_minutes) and at_time < p_time + make_interval(mins => r.slot_minutes);
  if cap - taken < p_party then raise exception 'that time just filled up — please pick another'; end if;
  if p_offer is not null then select * into off from offers where id = p_offer and restaurant_id = rid and is_active; end if;
  select coalesce(max(reservation_no), 0) + 1 into no from reservations where restaurant_id = rid;
  insert into reservations(restaurant_id, reservation_no, guest_name, guest_phone, guest_email, on_date, at_time, party_size, occasion, note, status, offer_id, offer_label, discount_pct)
    values (rid, no, p_guest->>'full_name', p_guest->>'phone', p_guest->>'email', p_date, p_time, greatest(1, p_party), p_occasion, p_note,
            'confirmed', off.id, off.title, case when off.kind = 'flat_pct' then off.value else 0 end)
    returning id into res_id;
  return jsonb_build_object('ok', true, 'id', res_id, 'no', no, 'name', r.name, 'date', p_date, 'time', to_char(p_time, 'HH24:MI'),
    'party', p_party, 'offer', off.title, 'discount_pct', case when off.kind = 'flat_pct' then off.value else 0 end, 'phone', r.phone, 'address', r.address);
end $$;

/** Order online — delivery or takeaway. Lands in the property's Online orders screen. */
create or replace function dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text default 'delivery', p_note text default null, p_offer uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; mi menu_items%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid;
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and membership in ('trial','active');
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  if p_mode = 'delivery' and not r.delivery_enabled then raise exception 'delivery is not available here'; end if;
  if p_mode = 'takeaway' and not r.takeaway_enabled then raise exception 'takeaway is not available here'; end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it->>'id')::uuid and restaurant_id = rid and is_active and is_available;
    if found then
      items := items || jsonb_build_object('menu_item_id', mi.id, 'name', mi.name, 'qty', greatest(1, (it->>'qty')::numeric), 'price', mi.price, 'note', it->>'note');
      sub := sub + mi.price * greatest(1, (it->>'qty')::numeric);
    end if;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active and scope in ('delivery','both') and sub >= min_order;
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + r.packing_charge;
  tot := round(sub - disc + fee + round((sub - disc) * r.gst_rate / 100, 2));

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := 'WEB-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at)
    values (rid, ch.id, ext, right(ext, 6), p_guest->>'full_name', p_guest->>'phone', p_guest->>'address', items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', p_note, 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title), now())
    returning id into oid;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end);
end $$;

/** Track an order or reservation with just its reference and phone. */
create or replace function dine_track(p_ref text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('kind','order','status', o.status, 'ref', o.display_id, 'name', r.name, 'items', o.items, 'total', o.gross, 'placed_at', o.placed_at, 'phone', r.phone)
     from online_orders o join restaurants r on r.id = o.restaurant_id where o.display_id = p_ref and o.customer_phone = p_phone limit 1),
    (select jsonb_build_object('kind','reservation','status', v.status, 'ref', v.reservation_no::text, 'name', r.name, 'date', v.on_date, 'time', to_char(v.at_time,'HH24:MI'), 'party', v.party_size, 'offer', v.offer_label, 'phone', r.phone)
     from reservations v join restaurants r on r.id = v.restaurant_id where v.reservation_no::text = p_ref and v.guest_phone = p_phone limit 1))
$$;

create or replace function dine_review(p_slug text, p_guest text, p_rating int, p_body text, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed;
  if rid is null then raise exception 'not found'; end if;
  insert into reviews(restaurant_id, guest_name, rating, body, reservation_id)
  values (rid, p_guest, greatest(1, least(5, p_rating)), p_body,
    (select id from reservations where restaurant_id = rid and reservation_no::text = p_ref limit 1));
  return jsonb_build_object('ok', true);
end $$;

grant execute on function dine_discover(text, text, numeric, numeric, text), dine_storefront(text), dine_slots(text, date, int),
  dine_reserve(text, jsonb, date, time, int, text, text, uuid), dine_order(text, jsonb, jsonb, text, text, uuid),
  dine_track(text, text), dine_review(text, text, int, text, text) to anon;

-- ═══════════ the property's side ═══════════
create or replace function reservation_set(p_id uuid, p_status reservation_status, p_table uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v reservations%rowtype;
begin
  select * into v from reservations where id = p_id and restaurant_id = auth_restaurant_id();
  if not found then raise exception 'reservation not found'; end if;
  update reservations set status = p_status, table_id = coalesce(p_table, table_id),
    seated_at = case when p_status = 'seated' then now() else seated_at end where id = p_id;
  if p_status = 'seated' and coalesce(p_table, v.table_id) is not null then
    update dining_tables set status = 'occupied' where id = coalesce(p_table, v.table_id);
  end if;
end $$;

alter table reservations enable row level security;
alter table offers enable row level security;
alter table reviews enable row level security;
do $$ declare t text; begin
  foreach t in array array['reservations','offers','reviews'] loop
    execute format('drop policy if exists tenant_all on %I', t);
    execute format('create policy tenant_all on %I for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id())', t);
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table reservations; exception when others then null; end $$;

-- ═══════════ make the sample estate visible on /dine ═══════════
create or replace function seed_storefront(p_rid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype;
begin
  select * into r from restaurants where id = p_rid;
  update restaurants set
    is_listed = true, dining_enabled = true,
    delivery_enabled = (property_type = 'restaurant'), takeaway_enabled = true,
    cuisines = case property_type when 'restaurant' then array['South Indian','Chettinad','Seafood']
                                  when 'hotel' then array['Multi-cuisine','North Indian','Continental']
                                  else array['Coastal','Barbecue','Multi-cuisine'] end,
    price_for_two = case property_type when 'restaurant' then 500 when 'hotel' then 900 else 1400 end,
    opens_at = '11:00', closes_at = '23:00', slot_minutes = 30,
    min_order = 200, delivery_fee = 40, packing_charge = 15,
    tagline = coalesce(tagline, 'Honest food, cooked to order')
  where id = p_rid;

  insert into offers(restaurant_id, title, kind, value, scope, min_order, from_time, to_time, code)
  select p_rid, v.t, v.k::offer_kind, v.val, v.sc::offer_scope, v.mo, v.ft::time, v.tt::time, v.cd
  from (values
    ('15% off before 7pm','flat_pct',15,'dining',0,'11:00','19:00',null),
    ('Flat ₹100 off above ₹600','flat_amount',100,'delivery',600,null,null,'SAVE100'),
    ('10% off every day','flat_pct',10,'both',0,null,null,null)
  ) v(t,k,val,sc,mo,ft,tt,cd)
  where not exists (select 1 from offers o where o.restaurant_id = p_rid and o.title = v.t);

  insert into reviews(restaurant_id, guest_name, rating, body)
  select p_rid, v.g, v.r, v.b from (values
    ('Ramesh K',5,'Biryani was excellent and the table was ready at the exact time we booked.'),
    ('Divya S',4,'Good food, service a little slow on Saturday evening.'),
    ('Anand M',5,'Booked through the offer, saved a fair bit. Will come again.')
  ) v(g,r,b) where not exists (select 1 from reviews x where x.restaurant_id = p_rid);
end $$;

-- call it for every property the estate created
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
    insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
      values (rid, true, true, true, true, 40, now())
      on conflict (restaurant_id) do update set share_prices = true, share_surplus = true, share_labour = true, share_demand = true;
    perform seed_property(rid, 60);
    perform seed_storefront(rid);
    made := made || jsonb_build_object('name', v.name, 'type', v.ptype, 'email', v.email, 'password', 'Dine@1234', 'id', rid);
  end loop;
  delete from admin_context where user_id = auth.uid();
  return jsonb_build_object('ok', true, 'properties', made);
end $$;
