-- Stock is deducted by the trg_consume_recipe trigger on order_items, so nothing extra is needed here.
-- DineFlow v4.0 — offline sync, printers, online-order channels, OTA channel manager,
-- direct booking engine. Run AFTER 0003.

-- ═════════ 1. OFFLINE SYNC — idempotency keys so a replayed queue never doubles ═════════
alter table orders          add column if not exists client_id uuid;
alter table bills           add column if not exists client_id uuid;
alter table payments        add column if not exists client_id uuid;
alter table stock_ledger    add column if not exists client_id uuid;
alter table booking_charges add column if not exists client_id uuid;
create unique index if not exists orders_client_idx       on orders(restaurant_id, client_id)          where client_id is not null;
create unique index if not exists bills_client_idx        on bills(restaurant_id, client_id)           where client_id is not null;
create unique index if not exists payments_client_idx     on payments(restaurant_id, client_id)        where client_id is not null;
create unique index if not exists stock_client_idx        on stock_ledger(restaurant_id, client_id)    where client_id is not null;
create unique index if not exists charges_client_idx      on booking_charges(restaurant_id, client_id) where client_id is not null;

-- orders placed while offline keep the device's local number until they sync
alter table orders add column if not exists offline_no text, add column if not exists synced_at timestamptz;

-- place_order with idempotency: same client_id twice → returns the first order
create or replace function place_order(p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb default '{}', p_note text default null, p_client_id uuid default null, p_placed_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes, created_by, client_id, created_at, synced_at)
    values (rid, next_number('order'), p_table_id, p_type, 'open', p_customer->>'name', p_customer->>'phone', p_note, auth.uid(), p_client_id, coalesce(p_placed_at, now()), now())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it->>'menu_item_id')::uuid and restaurant_id = rid;
    if not found then raise exception 'dish not found'; end if;
    insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status)
      values (rid, oid, kid, mi.id, mi.name, mi.price, (it->>'qty')::numeric, it->>'note', 'pending');
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;

create or replace function settle_bill(p_bill_id uuid, p_payments jsonb, p_client_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; p jsonb; paid numeric := 0;
begin
  select * into b from bills where id = p_bill_id and restaurant_id = rid;
  if not found then raise exception 'bill not found'; end if;
  if b.status = 'paid' then return; end if;                -- replay-safe
  for p in select * from jsonb_array_elements(p_payments) loop
    insert into payments(restaurant_id, bill_id, method, amount, ref, client_id)
      values (rid, b.id, (p->>'method')::payment_method, (p->>'amount')::numeric, p->>'ref', nullif(p->>'client_id','')::uuid)
      on conflict do nothing;
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < b.total then raise exception 'short by %', b.total - paid; end if;
  update bills set status = 'paid', paid_at = now() where id = b.id;
  update orders set status = 'billed' where id = b.order_id;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = b.order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $$;

-- ═════════ 2. PRINTERS (thermal / ESC-POS) ═════════
do $$ begin
  create type printer_kind as enum ('bill','kot','both','label');
  create type printer_transport as enum ('bluetooth','usb','network','browser');
exception when duplicate_object then null; end $$;
create table if not exists printers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  kind printer_kind not null default 'bill',
  transport printer_transport not null default 'browser',
  width integer not null default 80,             -- 58 or 80 mm
  address text,                                  -- network ip:port, or saved BT/USB device name
  station text,                                  -- kitchen station filter for KOTs (null = all)
  copies integer not null default 1,
  cut boolean not null default true,
  drawer boolean not null default false,
  header text, footer text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  printer_id uuid references printers(id) on delete set null,
  kind printer_kind not null,
  ref_type text, ref_id uuid,
  payload jsonb not null default '{}',
  status text not null default 'queued',         -- queued | printed | failed
  error text, attempts integer not null default 0,
  created_at timestamptz not null default now(), printed_at timestamptz
);
create index if not exists print_jobs_queue_idx on print_jobs(restaurant_id, status, created_at);
do $$ begin alter publication supabase_realtime add table print_jobs; exception when others then null; end $$;

-- a KOT is created → queue a print job for the kitchen printer(s)
create or replace function queue_kot_print() returns trigger language plpgsql security definer as $$
begin
  insert into print_jobs(restaurant_id, printer_id, kind, ref_type, ref_id, payload)
  select new.restaurant_id, p.id, 'kot', 'kot', new.id, jsonb_build_object('kot_no', new.kot_no, 'order_id', new.order_id)
  from printers p where p.restaurant_id = new.restaurant_id and p.is_active and p.kind in ('kot','both');
  return new;
end $$;
drop trigger if exists trg_kot_print on kots;
create trigger trg_kot_print after insert on kots for each row execute function queue_kot_print();

-- ═════════ 3. ONLINE ORDER CHANNELS (Swiggy / Zomato / own site) ═════════
do $$ begin
  create type channel_kind as enum ('swiggy','zomato','ondc','website','other');
  create type online_status as enum ('new','accepted','rejected','preparing','ready','picked_up','cancelled');
exception when duplicate_object then null; end $$;
create table if not exists order_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind channel_kind not null,
  label text not null,
  outlet_ref text,                               -- the outlet id the aggregator knows you by
  webhook_token text not null default encode(gen_random_bytes(18),'hex'),
  api_base text, api_key text,                   -- filled once you (or your aggregator partner) have credentials
  auto_accept boolean not null default false,
  prep_minutes integer not null default 20,
  commission_pct numeric(5,2) not null default 0,
  is_live boolean not null default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, kind, outlet_ref)
);
create unique index if not exists order_channels_token_idx on order_channels(webhook_token);
create table if not exists online_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  channel_id uuid references order_channels(id) on delete set null,
  external_id text not null,
  display_id text,
  status online_status not null default 'new',
  customer_name text, customer_phone text, address text,
  items jsonb not null default '[]',
  unmatched jsonb not null default '[]',         -- lines we could not map to a dish
  gross numeric(12,2) not null default 0, commission numeric(12,2) not null default 0, payout numeric(12,2) not null default 0,
  is_prepaid boolean not null default true,
  order_id uuid references orders(id) on delete set null,
  raw jsonb, placed_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (restaurant_id, external_id)
);
alter table menu_items add column if not exists external_refs jsonb not null default '{}';   -- {"swiggy":"12345","zomato":"abc"}
alter table orders add column if not exists channel_id uuid references order_channels(id) on delete set null;
do $$ begin alter publication supabase_realtime add table online_orders; exception when others then null; end $$;

-- Accept an online order → becomes a normal order + KOT in the kitchen
create or replace function accept_online_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  select * into o from online_orders where id = p_id and restaurant_id = rid;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  insert into orders(restaurant_id, order_no, type, status, customer_name, customer_phone, notes, channel_id, created_by)
    values (rid, next_number('order'), 'delivery', 'open', o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    select * into mi from menu_items where restaurant_id = rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status)
        values (rid, oid, kid, mi.id, mi.name, coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, it->>'note', 'pending');
      else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status)
        values (rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, it->>'note', 'pending');
    end if;
  end loop;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $$;

-- ═════════ 4. OTA CHANNEL MANAGER (MakeMyTrip / Booking.com / Airbnb / Agoda) ═════════
do $$ begin
  create type ota_kind as enum ('makemytrip','booking_com','airbnb','agoda','goibibo','expedia','ical','other');
  create type ota_mode as enum ('ical','api');
exception when duplicate_object then null; end $$;
create table if not exists ota_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind ota_kind not null,
  label text not null,
  mode ota_mode not null default 'ical',
  room_type_id uuid references room_types(id) on delete cascade,   -- iCal is per room type / room
  room_id uuid references rooms(id) on delete cascade,
  import_url text,                       -- their iCal feed → blocks our calendar
  export_token text not null default encode(gen_random_bytes(18),'hex'),  -- our feed → they block theirs
  api_base text, api_key text, hotel_ref text,
  commission_pct numeric(5,2) not null default 15,
  rate_offset_pct numeric(5,2) not null default 0,
  push_rates boolean not null default true, push_inventory boolean not null default true,
  is_live boolean not null default false,
  last_import_at timestamptz, last_push_at timestamptz, last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists ota_export_token_idx on ota_channels(export_token);
create table if not exists ota_sync_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  channel_id uuid references ota_channels(id) on delete cascade,
  direction text not null,               -- import | export | push_ari
  ok boolean not null default true, message text, count integer default 0,
  created_at timestamptz not null default now()
);
-- per-day rate & availability the channel manager pushes out
create table if not exists rate_inventory (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  room_type_id uuid not null references room_types(id) on delete cascade,
  stay_date date not null,
  rate numeric(12,2),
  open_rooms integer,                    -- null = derive from physical rooms minus bookings
  stop_sell boolean not null default false,
  min_nights integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, room_type_id, stay_date)
);
alter table bookings add column if not exists ota_channel_id uuid references ota_channels(id) on delete set null,
  add column if not exists external_ref text, add column if not exists commission numeric(12,2) not null default 0,
  add column if not exists is_block boolean not null default false;   -- imported iCal busy period
create unique index if not exists bookings_external_idx on bookings(restaurant_id, external_ref) where external_ref is not null;

-- Rooms free for a date range, by type (used by the booking engine and ARI push)
create or replace function availability(p_from date, p_to date, p_room_type_id uuid default null)
returns table (room_type_id uuid, stay_date date, total int, booked int, free int, rate numeric, stop_sell boolean)
language sql stable security definer set search_path = public as $$
  with d as (select generate_series(p_from, p_to - 1, interval '1 day')::date as stay_date),
  t as (select rt.id, rt.base_rate, count(r.id)::int as total from room_types rt left join rooms r on r.room_type_id = rt.id and r.status <> 'maintenance'
        where rt.restaurant_id = auth_restaurant_id() and rt.is_active and (p_room_type_id is null or rt.id = p_room_type_id) group by rt.id, rt.base_rate)
  select t.id, d.stay_date, t.total,
    (select count(*)::int from bookings b join rooms r2 on r2.id = b.room_id where r2.room_type_id = t.id and b.status in ('reserved','checked_in') and b.check_in <= d.stay_date and b.check_out > d.stay_date),
    greatest(0, coalesce(ri.open_rooms, t.total) - (select count(*)::int from bookings b join rooms r2 on r2.id = b.room_id where r2.room_type_id = t.id and b.status in ('reserved','checked_in') and b.check_in <= d.stay_date and b.check_out > d.stay_date)),
    coalesce(ri.rate, t.base_rate), coalesce(ri.stop_sell, false)
  from t cross join d left join rate_inventory ri on ri.room_type_id = t.id and ri.stay_date = d.stay_date and ri.restaurant_id = auth_restaurant_id()
  order by t.id, d.stay_date
$$;

-- Bulk rate / availability update (calendar screen and ARI push both use this)
create or replace function set_rate_inventory(p_room_type_id uuid, p_from date, p_to date, p_rate numeric, p_open int, p_stop boolean, p_min int default null)
returns int language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n int := 0;
begin
  insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
  select rid, p_room_type_id, d::date, p_rate, p_open, coalesce(p_stop,false), coalesce(p_min,1), now()
  from generate_series(p_from, p_to, interval '1 day') d
  on conflict (restaurant_id, room_type_id, stay_date) do update
    set rate = coalesce(excluded.rate, rate_inventory.rate),
        open_rooms = coalesce(excluded.open_rooms, rate_inventory.open_rooms),
        stop_sell = excluded.stop_sell, min_nights = excluded.min_nights, updated_at = now();
  get diagnostics n = row_count; return n;
end $$;

-- An OTA/iCal reservation arrives → book the first free room of that type (service-role callable)
create or replace function ingest_ota_booking(p_channel_id uuid, p_external_ref text, p_guest jsonb, p_check_in date, p_check_out date, p_rate numeric, p_is_block boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare ch ota_channels%rowtype; rid uuid; rm uuid; gid uuid; bid uuid;
begin
  select * into ch from ota_channels where id = p_channel_id; if not found then raise exception 'channel not found'; end if;
  rid := ch.restaurant_id;
  select id into bid from bookings where restaurant_id = rid and external_ref = p_external_ref;
  if found then
    update bookings set check_in = p_check_in, check_out = p_check_out where id = bid and status = 'reserved';
    return bid;
  end if;
  select r.id into rm from rooms r where r.restaurant_id = rid and (ch.room_id is null or r.id = ch.room_id) and (ch.room_type_id is null or r.room_type_id = ch.room_type_id)
    and r.status <> 'maintenance'
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status in ('reserved','checked_in') and b.check_in < p_check_out and b.check_out > p_check_in)
    order by r.sort_order limit 1;
  if rm is null then
    insert into ota_sync_log(restaurant_id, channel_id, direction, ok, message) values (rid, ch.id, 'import', false, 'overbooking: no free room for '||p_external_ref);
    return null;
  end if;
  insert into guests(restaurant_id, full_name, phone, email) values (rid, coalesce(p_guest->>'full_name', ch.label||' guest'), p_guest->>'phone', p_guest->>'email') returning id into gid;
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, rate, status, source, ota_channel_id, external_ref, commission, is_block, notes)
    values (rid, next_number('booking'), gid, rm, p_check_in, p_check_out, coalesce(p_rate,0), 'reserved', ch.kind::text, ch.id, p_external_ref,
            round(coalesce(p_rate,0) * (p_check_out - p_check_in) * ch.commission_pct/100, 2), p_is_block, case when p_is_block then 'Blocked by '||ch.label else 'From '||ch.label end)
    returning id into bid;
  insert into ota_sync_log(restaurant_id, channel_id, direction, ok, message, count) values (rid, ch.id, 'import', true, 'booked '||p_external_ref, 1);
  return bid;
end $$;

-- ═════════ 5. DIRECT BOOKING ENGINE (commission-free, public page) ═════════
alter table restaurants add column if not exists booking_engine boolean not null default true,
  add column if not exists booking_slug text, add column if not exists tagline text, add column if not exists cover_url text,
  add column if not exists policies text, add column if not exists advance_pct numeric(5,2) not null default 0;
create unique index if not exists restaurants_booking_slug_idx on restaurants(booking_slug) where booking_slug is not null;
update restaurants set booking_slug = slug where booking_slug is null;

-- Public: what a visitor may see (no auth). Security definer, read-only.
create or replace function public_property(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'name', r.name, 'tagline', r.tagline, 'address', r.address, 'phone', r.phone,
    'cover_url', r.cover_url, 'policies', r.policies, 'check_in_time', r.check_in_time, 'check_out_time', r.check_out_time,
    'room_gst_rate', r.room_gst_rate, 'advance_pct', r.advance_pct, 'property_type', r.property_type,
    'room_types', (select coalesce(jsonb_agg(jsonb_build_object('id', rt.id, 'name', rt.name, 'base_rate', rt.base_rate, 'capacity', rt.capacity, 'amenities', rt.amenities)), '[]')
                   from room_types rt where rt.restaurant_id = r.id and rt.is_active))
  from restaurants r where r.booking_slug = p_slug and r.booking_engine and r.membership in ('trial','active')
$$;

create or replace function public_availability(p_slug text, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select id from restaurants where booking_slug = p_slug and booking_engine),
  d as (select generate_series(p_from, p_to - 1, interval '1 day')::date sd),
  t as (select rt.id, rt.base_rate, count(rm.id)::int total from room_types rt join r on r.id = rt.restaurant_id
        left join rooms rm on rm.room_type_id = rt.id and rm.status <> 'maintenance' where rt.is_active group by rt.id, rt.base_rate)
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object('free', mf, 'rate', mr, 'stop', ms)), '{}') from (
    select t.id, min(greatest(0, coalesce(ri.open_rooms, t.total) - coalesce((select count(*) from bookings b join rooms r2 on r2.id = b.room_id
        where r2.room_type_id = t.id and b.status in ('reserved','checked_in') and b.check_in <= d.sd and b.check_out > d.sd), 0)))::int mf,
      max(coalesce(ri.rate, t.base_rate)) mr, bool_or(coalesce(ri.stop_sell,false)) ms
    from t cross join d left join rate_inventory ri on ri.room_type_id = t.id and ri.stay_date = d.sd group by t.id) t
$$;

create or replace function public_book(p_slug text, p_room_type_id uuid, p_check_in date, p_check_out date, p_guest jsonb, p_adults int default 2, p_children int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid; rm uuid; gid uuid; bid uuid; rt numeric; n int; bno int;
begin
  select id into rid from restaurants where booking_slug = p_slug and booking_engine and membership in ('trial','active');
  if rid is null then raise exception 'bookings are closed'; end if;
  if p_check_out <= p_check_in or p_check_in < current_date then raise exception 'choose valid dates'; end if;
  n := p_check_out - p_check_in;
  select r.id into rm from rooms r where r.restaurant_id = rid and r.room_type_id = p_room_type_id and r.status <> 'maintenance'
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status in ('reserved','checked_in') and b.check_in < p_check_out and b.check_out > p_check_in)
    order by r.sort_order limit 1;
  if rm is null then raise exception 'those dates just filled up'; end if;
  select coalesce(max(coalesce(ri.rate, rt2.base_rate)), 0) into rt from room_types rt2
    left join rate_inventory ri on ri.room_type_id = rt2.id and ri.stay_date between p_check_in and p_check_out - 1
    where rt2.id = p_room_type_id;
  insert into guests(restaurant_id, full_name, phone, email) values (rid, p_guest->>'full_name', p_guest->>'phone', p_guest->>'email') returning id into gid;
  select next_number('booking') into bno;   -- next_number is tenant-scoped via auth; fall back below
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, notes)
    values (rid, coalesce(bno, (select coalesce(max(booking_no),0)+1 from bookings where restaurant_id = rid)), gid, rm, p_check_in, p_check_out, p_adults, p_children, rt, 'reserved', 'direct', p_guest->>'note')
    returning id into bid;
  return jsonb_build_object('booking_id', bid, 'nights', n, 'rate', rt, 'total', rt * n);
end $$;
grant execute on function public_property(text), public_availability(text, date, date), public_book(text, uuid, date, date, jsonb, int, int) to anon;

-- next_number must work without a session for direct bookings
-- the 1-arg version from 0001 must go, or `next_number('order')` is ambiguous against this one
drop function if exists next_number(text);
create or replace function next_number(p_kind text, p_restaurant_id uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(p_restaurant_id, auth_restaurant_id()); n integer;
begin
  if rid is null then return null; end if;
  insert into counters(restaurant_id, kind, value) values (rid, p_kind, 1)
    on conflict (restaurant_id, kind) do update set value = counters.value + 1 returning value into n;
  return n;
end $$;

-- ═════════ 6. RLS ═════════
do $$ declare t text; begin
  foreach t in array array['printers','print_jobs','order_channels','online_orders','ota_channels','ota_sync_log','rate_inventory'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
    execute format('create policy tenant_all on %I for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id())', t);
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;
