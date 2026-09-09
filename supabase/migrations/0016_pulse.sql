-- DineFlow v14 — Pulse: honest wait times and a walk-in queue.
-- Run AFTER 0015. Predicts when each occupied table frees up from its own ticket progress and the
-- restaurant's history, quotes a wait for a party of any size, and lets walk-ins join by QR and
-- watch their place from their own phone. No SMS, no app.

-- ───────── walk-in queue ─────────
do $$ begin create type walkin_status as enum ('waiting','called','seated','left'); exception when duplicate_object then null; end $$;
create table if not exists walkins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(6), 'hex'),
  name text not null,
  phone text,
  party int not null default 2,
  quoted_min int,
  status walkin_status not null default 'waiting',
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  seated_at timestamptz,
  table_id uuid references dining_tables(id) on delete set null,
  source text not null default 'host'          -- host | qr
);
create index if not exists walkins_rid_status_idx on walkins(restaurant_id, status, joined_at);
alter table walkins enable row level security;
drop policy if exists walkins_tenant on walkins;
create policy walkins_tenant on walkins for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());

-- ───────── how long a table takes here ─────────
-- Median minutes from first order to bill paid, by party-size bucket and lunch/dinner.
-- Falls back to the restaurant's overall median, then to 45 minutes when there is no history yet.
create or replace function dwell_minutes(p_rid uuid, p_party int, p_at timestamptz default now()) returns numeric
language sql stable as $$
  with h as (
    select extract(epoch from (b.paid_at - o.created_at)) / 60 as mins,
           case when t.capacity >= 6 then 'big' when t.capacity >= 3 then 'mid' else 'small' end as bucket,
           case when extract(hour from o.created_at at time zone 'Asia/Kolkata') >= 17 then 'dinner' else 'lunch' end as sitting
    from orders o join bills b on b.order_id = o.id join dining_tables t on t.id = o.table_id
    where o.restaurant_id = p_rid and o.type = 'dine_in' and b.status = 'paid' and b.paid_at is not null
      and b.paid_at > now() - interval '90 days'
      and b.paid_at - o.created_at between interval '10 minutes' and interval '4 hours'
  ),
  want as (select case when p_party >= 6 then 'big' when p_party >= 3 then 'mid' else 'small' end as bucket,
                  case when extract(hour from p_at at time zone 'Asia/Kolkata') >= 17 then 'dinner' else 'lunch' end as sitting)
  select coalesce(
    (select percentile_cont(0.5) within group (order by h.mins) from h, want where h.bucket = want.bucket and h.sitting = want.sitting having count(*) >= 8),
    (select percentile_cont(0.5) within group (order by h.mins) from h, want where h.bucket = want.bucket having count(*) >= 8),
    (select percentile_cont(0.5) within group (order by h.mins) from h having count(*) >= 8),
    45)::numeric
$$;

-- ───────── the pulse: every table, and when it frees up ─────────
-- Per occupied table: how far the meal has got (ordered → cooking → served → billed) and the minutes left.
-- Served tables get the tail of the sitting; a printed bill means "about 8 minutes".
create or replace function table_pulse() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  with occ as (
    select t.id, t.name, t.capacity, t.status, o.id as order_id, o.created_at, t.capacity as covers,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_minutes(rid, t.capacity, o.created_at) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    where t.restaurant_id = rid
  ),
  est as (
    select *, extract(epoch from (now() - created_at)) / 60 as age,
      case
        when order_id is null then 0
        when billed then 8
        when items > 0 and done = items then greatest(6, round(dwell * 0.22))     -- everything served: coffee and the bill
        when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
        else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
      end as mins_left,
      case when order_id is null then 'free' when billed then 'billed' when items > 0 and done = items then 'served' when done > 0 then 'eating' else 'ordered' end as stage
    from occ
  )
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'stage', stage, 'covers', covers, 'age', round(age), 'mins_left', mins_left, 'free_at', to_char((now() + (mins_left || ' minutes')::interval) at time zone 'Asia/Kolkata', 'HH24:MI')) order by mins_left, name) from est), '[]'),
    'free_now', (select count(*) from est where order_id is null),
    'seats_free_now', coalesce((select sum(capacity) from est where order_id is null), 0),
    'next_free_min', (select min(mins_left) from est where order_id is not null),
    'avg_dwell', round(dwell_minutes(rid, 2)),
    'history_days', (select count(distinct (b.paid_at at time zone 'Asia/Kolkata')::date) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > now() - interval '90 days'))
  into out;
  return out;
end $$;

-- same as table_pulse, but for an explicit restaurant — used by quote_wait and the public queue page
create or replace function table_pulse_for(p_rid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  with occ as (
    select t.id, t.name, t.capacity, o.id as order_id, o.created_at, t.capacity as covers,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_minutes(p_rid, t.capacity, o.created_at) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    where t.restaurant_id = p_rid
  ),
  est as (select *, case when order_id is null then 0 when billed then 8 when items > 0 and done = items then greatest(6, round(dwell * 0.22))
                    when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60)) end as mins_left from occ)
  select jsonb_build_object('tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'mins_left', mins_left) order by mins_left) from est), '[]')) into out;
  return out;
end $$;

-- ───────── quote a wait for a party ─────────
-- Walk the tables big enough for the party in order of when they free up; each waiting party of
-- that size ahead takes the next one. What's left is the honest number.
create or replace function quote_wait(p_party int, p_rid uuid default null) returns int
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := coalesce(p_rid, auth_restaurant_id()); ahead int; pulse jsonb; slot jsonb; n int := 0;
begin
  select count(*) into ahead from walkins w where w.restaurant_id = rid and w.status in ('waiting','called')
    and (case when p_party >= 5 then w.party >= 5 when p_party >= 3 then w.party between 3 and 4 else w.party <= 2 end);
  pulse := table_pulse_for(rid);
  for slot in select * from jsonb_array_elements(pulse->'tables') where (value->>'capacity')::int >= p_party order by (value->>'mins_left')::int loop
    if n = ahead then return (slot->>'mins_left')::int; end if;
    n := n + 1;
  end loop;
  return null;   -- nothing big enough at all
end $$;

-- ───────── host actions ─────────
create or replace function walkin_add(p_name text, p_phone text, p_party int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); q int; w walkins;
begin
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, p_name, nullif(p_phone, ''), p_party, q, 'host') returning * into w;
  return jsonb_build_object('id', w.id, 'token', w.token, 'quoted_min', q, 'position', (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting' and x.joined_at <= w.joined_at));
end $$;

create or replace function walkin_set(p_id uuid, p_status walkin_status, p_table uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  update walkins set status = p_status, table_id = coalesce(p_table, table_id),
    called_at = case when p_status = 'called' then now() else called_at end,
    seated_at = case when p_status = 'seated' then now() else seated_at end
  where id = p_id and restaurant_id = rid;
  if p_status = 'seated' and p_table is not null then update dining_tables set status = 'occupied' where id = p_table and restaurant_id = rid; end if;
end $$;

-- ───────── the guest's side: join by QR, watch your place ─────────
create or replace function queue_join(p_slug text, p_name text, p_phone text, p_party int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; q int; w walkins;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed and membership in ('trial','active');
  if rid is null then raise exception 'this place is not taking a queue right now'; end if;
  if p_party < 1 or p_party > 20 then raise exception 'party size must be between 1 and 20'; end if;
  if (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting') >= 60 then raise exception 'the queue is full — please ask at the counter'; end if;
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, left(p_name, 60), nullif(p_phone, ''), p_party, q, 'qr') returning * into w;
  return queue_status(w.token);
end $$;

create or replace function queue_status(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', w.token, 'name', w.name, 'party', w.party, 'status', w.status, 'joined_at', w.joined_at,
    'place', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'waiting', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting'),
    'minutes', case when w.status = 'waiting' then quote_wait(w.party, w.restaurant_id) else 0 end,
    'table', (select t.name from dining_tables t where t.id = w.table_id),
    'restaurant', r.name, 'slug', r.booking_slug)
  from walkins w join restaurants r on r.id = w.restaurant_id where w.token = p_token
$$;

create or replace function queue_leave(p_token text) returns void
language sql security definer set search_path = public as $$ update walkins set status = 'left' where token = p_token and status in ('waiting','called') $$;

grant execute on function queue_join(text, text, text, int), queue_status(text), queue_leave(text) to anon, authenticated;
alter publication supabase_realtime add table walkins;
