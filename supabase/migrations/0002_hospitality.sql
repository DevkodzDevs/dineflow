-- DineFlow v2.0 — hotel & resort modules, master control, trial → membership gate.
-- Run AFTER 0001_init.sql.

-- ───────── property type + membership on the tenant ─────────
do $$ begin
  create type property_type as enum ('restaurant','hotel','resort');
  create type membership_status as enum ('trial','active','expired','suspended');
  create type room_status as enum ('available','occupied','reserved','cleaning','maintenance');
  create type booking_status as enum ('reserved','checked_in','checked_out','cancelled','no_show');
  create type charge_kind as enum ('room','restaurant','facility','extra','discount','tax');
  create type hk_status as enum ('pending','in_progress','done');
exception when duplicate_object then null; end $$;

-- menu_items gained is_active after 0001 shipped; keep older databases in step
alter table menu_items add column if not exists is_active boolean not null default true;

alter type user_role add value if not exists 'frontdesk';
alter type order_type add value if not exists 'room_service';
alter type user_role add value if not exists 'housekeeping';

alter table restaurants
  add column if not exists property_type property_type not null default 'restaurant',
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists membership membership_status not null default 'trial',
  add column if not exists membership_plan text,
  add column if not exists membership_ends_at timestamptz,
  add column if not exists check_in_time time not null default '12:00',
  add column if not exists check_out_time time not null default '11:00',
  add column if not exists room_gst_rate numeric(5,2) not null default 12;

-- ───────── hotel: rooms, guests, bookings, folio, housekeeping ─────────
create table if not exists room_types (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null, base_rate numeric(12,2) not null default 0, capacity integer not null default 2,
  amenities text[] not null default '{}', is_active boolean not null default true
);
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  number text not null, floor integer not null default 1,
  room_type_id uuid references room_types(id) on delete set null,
  status room_status not null default 'available',
  notes text, sort_order integer not null default 0,
  unique (restaurant_id, number)
);
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  full_name text not null, phone text, email text, id_type text, id_last4 text, address text, notes text,
  visits integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  booking_no integer not null,
  guest_id uuid not null references guests(id),
  room_id uuid not null references rooms(id),
  check_in date not null, check_out date not null,
  adults integer not null default 2, children integer not null default 0,
  rate numeric(12,2) not null default 0,
  status booking_status not null default 'reserved',
  source text default 'walk_in',
  advance numeric(12,2) not null default 0,
  checked_in_at timestamptz, checked_out_at timestamptz,
  notes text, created_by uuid, created_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists bookings_room_dates_idx on bookings(room_id, check_in, check_out) where status in ('reserved','checked_in');
create table if not exists booking_charges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  kind charge_kind not null,
  description text not null,
  amount numeric(12,2) not null default 0,
  ref_type text, ref_id uuid,
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  kind text not null default 'clean',      -- clean | turndown | maintenance
  status hk_status not null default 'pending',
  assigned_to uuid, notes text,
  created_at timestamptz not null default now(), done_at timestamptz
);
-- resort facilities
create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null, kind text not null default 'activity',   -- spa | activity | venue
  rate numeric(12,2) not null default 0, duration_minutes integer not null default 60,
  capacity integer not null default 1, is_active boolean not null default true
);
create table if not exists facility_bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  facility_id uuid not null references facilities(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,   -- posts to the room folio when set
  guest_name text, starts_at timestamptz not null, people integer not null default 1,
  amount numeric(12,2) not null default 0, status text not null default 'booked',
  created_by uuid, created_at timestamptz not null default now()
);
-- restaurant orders can be posted to a room
alter table orders add column if not exists booking_id uuid references bookings(id) on delete set null;

-- signup now takes a property type
create or replace function create_restaurant(p_name text, p_slug text, p_full_name text, p_type property_type default 'restaurant') returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'already belongs to a property'; end if;
  insert into restaurants(name, slug, property_type) values (p_name, p_slug, p_type) returning id into rid;
  insert into profiles(id, restaurant_id, full_name, email, role)
    values (auth.uid(), rid, p_full_name, (select email from auth.users where id = auth.uid()), 'owner');
  insert into categories(restaurant_id, name, sort_order) values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order) select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
  if p_type in ('hotel','resort') then
    insert into room_types(restaurant_id, name, base_rate, capacity) values (rid,'Standard',2500,2),(rid,'Deluxe',4000,3),(rid,'Suite',7500,4);
    insert into rooms(restaurant_id, number, floor, room_type_id, sort_order)
      select rid, (f*100+n)::text, f, (select id from room_types where restaurant_id = rid and name = case when n<=6 then 'Standard' when n<=9 then 'Deluxe' else 'Suite' end), f*100+n
      from generate_series(1,2) f, generate_series(1,10) n;
  end if;
  if p_type = 'resort' then
    insert into facilities(restaurant_id, name, kind, rate, duration_minutes) values (rid,'Spa — Ayurvedic massage','spa',2500,60),(rid,'Kayaking','activity',800,45),(rid,'Bonfire evening','activity',1500,120),(rid,'Pool cabana','venue',1200,240);
  end if;
  return rid;
end $$;

-- ───────── master control (platform owner) ─────────
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
create table if not exists membership_keys (
  code text primary key,
  plan text not null,                 -- 'monthly' | 'yearly'
  days integer not null,
  restaurant_id uuid references restaurants(id) on delete set null,  -- null = any tenant can redeem
  redeemed_by uuid references restaurants(id),
  redeemed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists admin_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid, action text not null, target uuid, meta jsonb, created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- Trial/membership state for the caller's tenant: 'trial' | 'active' | 'expired' | 'suspended'
create or replace function membership_state() returns text
language plpgsql stable security definer set search_path = public as $$
declare r restaurants%rowtype;
begin
  select * into r from restaurants where id = auth_restaurant_id();
  if not found then return 'none'; end if;
  if r.membership = 'suspended' then return 'suspended'; end if;
  if r.membership = 'active' and (r.membership_ends_at is null or r.membership_ends_at > now()) then return 'active'; end if;
  if r.membership = 'trial' and r.trial_ends_at > now() then return 'trial'; end if;
  return 'expired';
end $$;

-- Tenant redeems a membership key (the "membership login")
create or replace function redeem_membership(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare k membership_keys%rowtype; rid uuid := auth_restaurant_id(); base timestamptz;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner','manager') then raise exception 'only the owner can activate membership'; end if;
  select * into k from membership_keys where code = upper(p_code) and redeemed_at is null and (restaurant_id is null or restaurant_id = rid);
  if not found then raise exception 'membership key is invalid or already used'; end if;
  select greatest(now(), coalesce(membership_ends_at, now())) into base from restaurants where id = rid;
  update restaurants set membership = 'active', membership_plan = k.plan, membership_ends_at = base + make_interval(days => k.days) where id = rid;
  update membership_keys set redeemed_by = rid, redeemed_at = now() where code = k.code;
  return k.plan;
end $$;

-- Master control actions
create or replace function admin_issue_key(p_plan text, p_days integer, p_restaurant_id uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  c := upper(substr(encode(gen_random_bytes(8),'hex'),1,4) || '-' || substr(encode(gen_random_bytes(8),'hex'),1,4) || '-' || substr(encode(gen_random_bytes(8),'hex'),1,4));
  insert into membership_keys(code, plan, days, restaurant_id, created_by) values (c, p_plan, p_days, p_restaurant_id, auth.uid());
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'issue_key', p_restaurant_id, jsonb_build_object('plan', p_plan, 'days', p_days));
  return c;
end $$;

create or replace function admin_set_membership(p_restaurant_id uuid, p_status membership_status, p_days integer default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  update restaurants set
    membership = p_status,
    trial_ends_at = case when p_status = 'trial' and p_days is not null then now() + make_interval(days => p_days) else trial_ends_at end,
    membership_ends_at = case when p_status = 'active' and p_days is not null then now() + make_interval(days => p_days) else membership_ends_at end
  where id = p_restaurant_id;
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'set_membership', p_restaurant_id, jsonb_build_object('status', p_status, 'days', p_days));
end $$;

-- Master overview across all tenants
create or replace function admin_overview() returns table (
  id uuid, name text, property_type property_type, membership membership_status, trial_ends_at timestamptz, membership_ends_at timestamptz,
  plan text, users integer, sales_today numeric, sales_30d numeric, open_orders integer, rooms integer, occupied_rooms integer, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.property_type, r.membership, r.trial_ends_at, r.membership_ends_at, r.membership_plan,
    (select count(*) from profiles p where p.restaurant_id = r.id)::int,
    coalesce((select sum(total) from bills b where b.restaurant_id = r.id and b.status='paid' and b.paid_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),0),
    coalesce((select sum(total) from bills b where b.restaurant_id = r.id and b.status='paid' and b.paid_at > now() - interval '30 days'),0),
    (select count(*) from orders o where o.restaurant_id = r.id and o.status='open')::int,
    (select count(*) from rooms x where x.restaurant_id = r.id)::int,
    (select count(*) from rooms x where x.restaurant_id = r.id and x.status='occupied')::int,
    r.created_at
  from restaurants r where is_platform_admin() order by r.created_at desc
$$;

-- ───────── front desk RPCs ─────────
create or replace function create_booking(p_guest jsonb, p_room_id uuid, p_check_in date, p_check_out date, p_adults int, p_children int, p_rate numeric, p_advance numeric, p_source text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); gid uuid; bid uuid;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from bookings where room_id = p_room_id and status in ('reserved','checked_in') and check_in < p_check_out and check_out > p_check_in)
    then raise exception 'room is not free for those dates'; end if;
  if p_guest ? 'id' and (p_guest->>'id') <> '' then gid := (p_guest->>'id')::uuid;
  else insert into guests(restaurant_id, full_name, phone, email, id_type, id_last4, address)
       values (rid, p_guest->>'full_name', p_guest->>'phone', p_guest->>'email', p_guest->>'id_type', p_guest->>'id_last4', p_guest->>'address') returning id into gid; end if;
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, advance, source, notes, created_by)
    values (rid, next_number('booking'), gid, p_room_id, p_check_in, p_check_out, p_adults, p_children, p_rate, coalesce(p_advance,0), p_source, p_notes, auth.uid()) returning id into bid;
  if p_advance > 0 then insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by) values (rid, bid, 'discount', 'Advance received', -p_advance, auth.uid()); end if;
  if p_check_in = current_date then update rooms set status = 'reserved' where id = p_room_id and status = 'available'; end if;
  return bid;
end $$;

create or replace function check_in(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'reserved';
  if not found then raise exception 'booking not found or not in reserved state'; end if;
  update bookings set status = 'checked_in', checked_in_at = now() where id = b.id;
  update rooms set status = 'occupied' where id = b.room_id;
  update guests set visits = visits + 1 where id = b.guest_id;
end $$;

-- Posts nightly room charges + GST, returns folio totals
create or replace function folio_totals(p_booking_id uuid) returns table (nights int, room_total numeric, extras numeric, discounts numeric, taxable numeric, gst numeric, total numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare b bookings%rowtype; r restaurants%rowtype; n int; rt numeric; ex numeric; ds numeric; pd numeric; tx numeric;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id();
  select * into r from restaurants where id = b.restaurant_id;
  n := greatest(1, b.check_out - b.check_in);
  rt := n * b.rate;
  select coalesce(sum(amount),0) into ex from booking_charges where booking_id = b.id and kind in ('restaurant','facility','extra');
  select coalesce(-sum(amount),0) into ds from booking_charges where booking_id = b.id and kind = 'discount' and description <> 'Advance received';
  select coalesce(-sum(amount),0) into pd from booking_charges where booking_id = b.id and kind = 'discount' and description = 'Advance received';
  select coalesce(sum(amount),0) into tx from booking_charges where booking_id = b.id and kind = 'tax';  -- restaurant GST already on bills
  nights := n; room_total := rt; extras := ex; discounts := ds;
  taxable := rt - ds;
  gst := round(taxable * r.room_gst_rate/100, 2);
  total := round(taxable + gst + ex + tx, 2);
  paid := pd;
  balance := total - pd;
  return next;
end $$;

create or replace function check_out(p_booking_id uuid, p_payments jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype; f record; p jsonb; paid numeric := 0;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'checked_in';
  if not found then raise exception 'guest is not checked in'; end if;
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
end $$;

-- Post a restaurant order to a room (charge to folio). Used when an order has booking_id and is billed.
create or replace function post_order_to_room(p_order_id uuid, p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); amt numeric; ono int;
begin
  if not exists (select 1 from bookings where id = p_booking_id and restaurant_id = rid and status = 'checked_in') then raise exception 'guest not checked in'; end if;
  select coalesce(sum(price_snapshot*qty),0), max(o.order_no) into amt, ono from order_items i join orders o on o.id = i.order_id where i.order_id = p_order_id and i.status <> 'cancelled';
  update orders set booking_id = p_booking_id, status = 'billed' where id = p_order_id and restaurant_id = rid;
  update order_items set status = 'served' where order_id = p_order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = p_order_id;
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    values (rid, p_booking_id, 'restaurant', 'Restaurant order #'||ono, amt, 'order', p_order_id, auth.uid());
  -- restaurant GST on the posted amount
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    select rid, p_booking_id, 'tax', 'GST on order #'||ono, round(amt * r.gst_rate/100, 2), 'order', p_order_id, auth.uid() from restaurants r where r.id = rid;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = p_order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $$;

-- housekeeping done → room available
create or replace function hk_done() returns trigger language plpgsql security definer as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
    update rooms set status = 'available' where id = new.room_id and status in ('cleaning','maintenance');
  end if;
  return new;
end $$;
drop trigger if exists trg_hk_done on housekeeping_tasks;
create trigger trg_hk_done before update of status on housekeeping_tasks for each row execute function hk_done();

-- facility booking posts to folio when linked
create or replace function facility_to_folio() returns trigger language plpgsql security definer as $$
begin
  if new.booking_id is not null then
    insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
      select new.restaurant_id, new.booking_id, 'facility', f.name, new.amount, 'facility_booking', new.id, auth.uid() from facilities f where f.id = new.facility_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_facility_folio on facility_bookings;
create trigger trg_facility_folio after insert on facility_bookings for each row execute function facility_to_folio();

-- ───────── RLS for new tables + platform admin read-through ─────────
do $$ declare t text; begin
  foreach t in array array['room_types','rooms','guests','bookings','booking_charges','housekeeping_tasks','facilities','facility_bookings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
    execute format('create policy tenant_all on %I for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id())', t);
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;
-- platform admins can read every tenant + profile (for master control)
drop policy if exists admin_read on restaurants; create policy admin_read on restaurants for select using (is_platform_admin());
drop policy if exists admin_read on profiles;    create policy admin_read on profiles for select using (is_platform_admin());
alter table platform_admins enable row level security;
drop policy if exists self_read on platform_admins; create policy self_read on platform_admins for select using (user_id = auth.uid());
alter table membership_keys enable row level security;
drop policy if exists admin_keys on membership_keys; create policy admin_keys on membership_keys for select using (is_platform_admin());
alter table admin_log enable row level security;
drop policy if exists admin_log_read on admin_log; create policy admin_log_read on admin_log for select using (is_platform_admin());

do $$ begin
  alter publication supabase_realtime add table rooms, bookings, housekeeping_tasks, facility_bookings;
exception when others then null; end $$;

-- ───────── make yourself the master admin (run once, replace the email) ─────────
-- insert into platform_admins(user_id, label) select id, 'master' from auth.users where email = 'you@yourcompany.in';
