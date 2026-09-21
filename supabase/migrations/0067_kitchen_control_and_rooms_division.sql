-- 0067 · Kitchen control and rooms division
--
-- What the big operators run, brought to a property of any size. The kitchen half is what a
-- McDonald's KVS or a Starbucks production screen does: every station sees only its own items,
-- a ticket changes colour against a target the owner sets rather than a number baked into the
-- screen, a bumped ticket can be recalled, an "all-day" count sums what is on the fire, and a
-- customer-facing board shows what is ready. The rooms half is what OPERA calls housekeeping and
-- night audit: a room's condition (dirty → clean → inspected) lives beside its front-office status
-- instead of being crushed into it, a supervisor signs a room off before a guest is put in it, the
-- day's task sheet is built in one press, and the night audit closes the business date with the
-- numbers every hotel reports — occupancy, ADR, RevPAR — and every discrepancy it found.
--
-- Everything here is additive. No column changes meaning, no existing call changes shape.

-- ═══════════════════════════ Kitchen control ═══════════════════════════

alter table restaurants
  add column if not exists kds_stations text[] not null default '{}',
  add column if not exists kds_warn_minutes int not null default 10,
  add column if not exists kds_target_minutes int not null default 15,
  add column if not exists hk_inspect_required boolean not null default false;

-- station routing: a category names the station that makes it; a dish can override its category
alter table categories add column if not exists station text;
alter table menu_items add column if not exists station text;

-- the timestamps a speed-of-service report needs. ready_at existed; the other two did not.
alter table kots
  add column if not exists started_at timestamptz,
  add column if not exists served_at timestamptz,
  add column if not exists recalls int not null default 0;

-- The ticket's status was already derived from its lines; the timestamps now follow the same
-- rule, and served_at clears when a ticket is recalled so the board can show it again.
create or replace function sync_kot_status() returns trigger language plpgsql security definer set search_path = public as $$
declare k kot_status;
begin
  if new.kot_id is null then return new; end if;
  select case
    when bool_and(status in ('ready','served','cancelled')) and bool_or(status = 'served') then 'served'
    when bool_and(status in ('ready','cancelled')) then 'ready'
    when bool_or(status = 'preparing') then 'preparing'
    else 'pending' end::kot_status
  into k from order_items where kot_id = new.kot_id;
  update kots set status = k,
    started_at = case when k in ('preparing','ready','served') then coalesce(started_at, now()) else started_at end,
    ready_at   = case when k in ('ready','served') then coalesce(ready_at, now()) else ready_at end,
    served_at  = case when k = 'served' then coalesce(served_at, now()) else null end
  where id = new.kot_id;
  return new;
end $$;

-- Recall: a ticket bumped by mistake comes straight back to "ready". Only lines that were served
-- move, so a cancelled line stays cancelled, and the count of recalls is kept for the report.
create or replace function recall_kot(p_kot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from kots where id = p_kot_id and restaurant_id = rid) then raise exception 'ticket not found'; end if;
  update order_items set status = 'ready' where kot_id = p_kot_id and status = 'served';
  if found then update kots set recalls = recalls + 1 where id = p_kot_id; end if;
end $$;
revoke all on function recall_kot(uuid) from public, anon;
grant execute on function recall_kot(uuid) to authenticated;

-- Speed of service, the number every QSR chain manages by: how long a ticket takes from the
-- moment it prints to the moment the kitchen calls it ready, against the property's own target.
create or replace function kitchen_speed(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  r as (select kds_target_minutes as target, kds_warn_minutes as warn from restaurants, rid where restaurants.id = rid.id),
  win as (select (now() - (greatest(1, least(365, p_days)) || ' days')::interval) as since),
  k as (
    select k.id, k.created_at, k.recalls, extract(epoch from (k.ready_at - k.created_at)) / 60.0 as mins
    from kots k, rid, win
    where k.restaurant_id = rid.id and k.ready_at is not null and k.ready_at >= k.created_at and k.created_at >= win.since
  ),
  by_hour as (
    select extract(hour from (created_at at time zone 'Asia/Kolkata'))::int as h, count(*) as n, avg(mins) as avg_min,
           avg(case when mins <= (select target from r) then 1 else 0 end) as within
    from k group by 1
  ),
  by_day as (
    select to_char((created_at at time zone 'Asia/Kolkata')::date, 'DD Mon') as day, (created_at at time zone 'Asia/Kolkata')::date as d,
           count(*) as n, avg(mins) as avg_min, avg(case when mins <= (select target from r) then 1 else 0 end) as within
    from k group by 1, 2
  ),
  dish as (
    select oi.name_snapshot as name, count(distinct k.id) as n, avg(k.mins) as avg_min
    from order_items oi join k on k.id = oi.kot_id
    where oi.status <> 'cancelled'
    group by 1 having count(distinct k.id) >= 3
    order by 3 desc limit 8
  )
  select jsonb_build_object(
    'target',     (select target from r),
    'warn',       (select warn from r),
    'tickets',    (select count(*) from k),
    'recalls',    coalesce((select sum(recalls) from k), 0),
    'avg_min',    coalesce((select round(avg(mins)::numeric, 1) from k), 0),
    'p90_min',    coalesce((select round((percentile_cont(0.9) within group (order by mins))::numeric, 1) from k), 0),
    'within_pct', coalesce((select round(100 * avg(case when mins <= (select target from r) then 1 else 0 end)::numeric, 0) from k), 0),
    'by_hour',    coalesce((select jsonb_agg(jsonb_build_object('h', h, 'n', n, 'avg_min', round(avg_min::numeric, 1), 'within', round(100 * within::numeric, 0)) order by h) from by_hour), '[]'::jsonb),
    'by_day',     coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n, 'avg_min', round(avg_min::numeric, 1), 'within', round(100 * within::numeric, 0)) order by d) from by_day), '[]'::jsonb),
    'slowest',    coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'avg_min', round(avg_min::numeric, 1))) from dish), '[]'::jsonb)
  );
$$;
revoke all on function kitchen_speed(int) from public, anon;
grant execute on function kitchen_speed(int) to authenticated;

create index if not exists kots_rid_ready_idx on kots(restaurant_id, ready_at desc) where ready_at is not null;
create index if not exists kots_rid_served_idx on kots(restaurant_id, served_at desc) where served_at is not null;

-- ═══════════════════════════ Rooms division ═══════════════════════════

-- A room's condition is housekeeping's word; its status is the front office's. OPERA keeps them
-- apart for a reason: "vacant" says whether a room can be sold, "inspected" says whether it should be.
do $$ begin
  create type room_condition as enum ('dirty', 'clean', 'inspected', 'pickup');
exception when duplicate_object then null; end $$;

alter table rooms
  add column if not exists condition room_condition not null default 'clean',
  add column if not exists condition_at timestamptz not null default now(),
  add column if not exists inspected_by uuid;

-- what the front desk should know before the guest reaches the counter
alter table guests
  add column if not exists vip boolean not null default false,
  add column if not exists preferences text;

-- A room sent to cleaning is dirty; nothing else about it changes.
create or replace function rooms_condition_follow() returns trigger language plpgsql as $$
begin
  if new.status = 'cleaning' and old.status is distinct from 'cleaning' then
    new.condition := 'dirty'; new.condition_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_rooms_condition on rooms;
create trigger trg_rooms_condition before update of status on rooms for each row execute function rooms_condition_follow();

-- Housekeeping done. A finished clean makes the room clean; whether that also makes it sellable is
-- the owner's rule: with inspections on, the room waits for a supervisor; with them off, it goes
-- straight back to available, exactly as it did before this migration.
create or replace function hk_done() returns trigger language plpgsql security definer set search_path = public as $$
declare req boolean;
begin
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
    if new.kind = 'maintenance' then
      update rooms set status = 'available' where id = new.room_id and status in ('cleaning', 'maintenance');
    else
      select hk_inspect_required into req from restaurants where id = new.restaurant_id;
      update rooms set condition = 'clean', condition_at = now(), inspected_by = null,
        status = case when status = 'cleaning' and not coalesce(req, false) then 'available' else status end
      where id = new.room_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_hk_done on housekeeping_tasks;
create trigger trg_hk_done before update of status on housekeeping_tasks for each row execute function hk_done();

-- The supervisor's walk-through. Pass: inspected, and sellable if it was waiting. Fail: dirty again,
-- with a fresh ticket that says why, so the attendant does not have to ask.
create or replace function inspect_room(p_room_id uuid, p_pass boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r rooms%rowtype;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'supervisor_2') then
    raise exception 'only an owner, manager or supervisor can sign off an inspection';
  end if;
  select * into r from rooms where id = p_room_id and restaurant_id = rid;
  if not found then raise exception 'room not found'; end if;
  if p_pass then
    update rooms set condition = 'inspected', condition_at = now(), inspected_by = auth.uid(),
      status = case when status = 'cleaning' then 'available' else status end
    where id = r.id;
  else
    update rooms set condition = 'dirty', condition_at = now(), inspected_by = null,
      status = case when status = 'available' then 'cleaning' else status end
    where id = r.id;
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
      values (rid, r.id, 'clean', concat('Failed inspection', case when length(trim(p_note)) > 0 then ': ' || trim(p_note) end));
  end if;
end $$;
revoke all on function inspect_room(uuid, boolean, text) from public, anon;
grant execute on function inspect_room(uuid, boolean, text) to authenticated;

-- Housekeeping's own word on a room, from the corridor: dirty, clean, or pickup (a touch-up after a
-- short occupancy). "Inspected" is not on this path — that is the supervisor's signature.
create or replace function set_room_condition(p_room_id uuid, p_condition room_condition) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); req boolean;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_condition = 'inspected' then raise exception 'an inspection is signed off, not set'; end if;
  select hk_inspect_required into req from restaurants where id = rid;
  update rooms set condition = p_condition, condition_at = now(), inspected_by = null,
    status = case
      when p_condition = 'clean' and status = 'cleaning' and not coalesce(req, false) then 'available'
      when p_condition = 'dirty' and status = 'available' then 'cleaning'
      else status end
  where id = p_room_id and restaurant_id = rid;
  if not found then raise exception 'room not found'; end if;
end $$;
revoke all on function set_room_condition(uuid, room_condition) from public, anon;
grant execute on function set_room_condition(uuid, room_condition) to authenticated;

-- The day's task sheet in one press: a stayover service for every room whose guest stays tonight
-- and has no open ticket, and a clean for any dirty room that somehow has none. Safe to press twice.
create or replace function hk_build_sheet() returns int
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date; a int := 0; b int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;
  insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
  select rid, r.id, 'stayover', 'Daily service'
  from rooms r
  where r.restaurant_id = rid and r.status = 'occupied'
    and exists (select 1 from bookings bk where bk.room_id = r.id and bk.status = 'checked_in' and bk.check_out > today)
    and not exists (select 1 from housekeeping_tasks t where t.room_id = r.id and t.status <> 'done')
    and not exists (select 1 from housekeeping_tasks t where t.room_id = r.id and t.kind = 'stayover' and (t.created_at at time zone 'Asia/Kolkata')::date = today);
  get diagnostics a = row_count;
  insert into housekeeping_tasks(restaurant_id, room_id, kind, notes)
  select rid, r.id, 'clean', 'Dirty with no ticket'
  from rooms r
  where r.restaurant_id = rid and r.condition = 'dirty' and r.status <> 'maintenance'
    and not exists (select 1 from housekeeping_tasks t where t.room_id = r.id and t.status <> 'done');
  get diagnostics b = row_count;
  return a + b;
end $$;
revoke all on function hk_build_sheet() from public, anon;
grant execute on function hk_build_sheet() to authenticated;

-- Check-in, with the inspection rule. Off (the default) it behaves exactly as before.
create or replace function check_in(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype; r rooms%rowtype; req boolean;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'reserved';
  if not found then raise exception 'booking not found or not in reserved state'; end if;
  select * into r from rooms where id = b.room_id;
  select hk_inspect_required into req from restaurants where id = b.restaurant_id;
  if coalesce(req, false) and r.condition <> 'inspected' then
    raise exception 'room % has not been inspected — housekeeping signs it off before a guest goes in', r.number;
  end if;
  update bookings set status = 'checked_in', checked_in_at = now() where id = b.id;
  update rooms set status = 'occupied' where id = b.room_id;
  update guests set visits = visits + 1 where id = b.guest_id;
end $$;

-- ─── Night audit ───
-- The close of a hotel's business date. It does not post charges — the folio prices every night at
-- check-out and would be charged twice — it settles the day: who never arrived, who is still in a
-- room they should have left, which rooms the two sides of the house disagree about, and the
-- numbers the day is remembered by.
create table if not exists night_audits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  business_date date not null,
  rooms_total int not null default 0, rooms_sellable int not null default 0, occupied int not null default 0,
  arrivals int not null default 0, departures int not null default 0, no_shows int not null default 0, in_house int not null default 0,
  room_revenue numeric(12,2) not null default 0, occupancy_pct numeric(5,2) not null default 0,
  adr numeric(12,2) not null default 0, revpar numeric(12,2) not null default 0,
  dirty_rooms int not null default 0, ooo_rooms int not null default 0, discrepancies int not null default 0,
  notes text, closed_by uuid, closed_at timestamptz not null default now(),
  unique (restaurant_id, business_date)
);
alter table night_audits enable row level security;
drop policy if exists tenant_all on night_audits;
create policy tenant_all on night_audits for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on night_audits;
create trigger trg_set_rid before insert on night_audits for each row execute function set_restaurant_id();

create or replace function night_audit_numbers(p_date date) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  rm as (select r.* from rooms r, rid where r.restaurant_id = rid.id),
  bk as (
    select b.id, b.booking_no, b.status, b.check_in, b.check_out, b.rate, b.room_id, g.full_name, g.vip, r.number as room
    from bookings b join guests g on g.id = b.guest_id join rooms r on r.id = b.room_id, rid
    where b.restaurant_id = rid.id
  ),
  night as (select * from bk where status in ('checked_in', 'checked_out') and check_in <= p_date and check_out > p_date),
  arr as (select * from bk where check_in = p_date and status <> 'cancelled'),
  dep as (select * from bk where check_out = p_date and status in ('checked_in', 'checked_out')),
  disc as (
    select 'occupied_no_guest' as kind, number as room, null::text as who from rm
      where status = 'occupied' and not exists (select 1 from bk where bk.room_id = rm.id and bk.status = 'checked_in')
    union all
    select 'guest_room_not_occupied', rm.number, bk.full_name from bk join rm on rm.id = bk.room_id
      where bk.status = 'checked_in' and rm.status <> 'occupied'
    union all
    select 'sellable_but_dirty', number, null from rm where status = 'available' and condition = 'dirty'
    union all
    select 'stayed_past_checkout', rm.number, bk.full_name from bk join rm on rm.id = bk.room_id
      where bk.status = 'checked_in' and bk.check_out < p_date
  )
  select jsonb_build_object(
    'date',           p_date,
    'rooms_total',    (select count(*) from rm),
    'ooo_rooms',      (select count(*) from rm where status = 'maintenance'),
    'rooms_sellable', (select count(*) from rm where status <> 'maintenance'),
    'dirty_rooms',    (select count(*) from rm where condition = 'dirty'),
    'occupied',       (select count(*) from night),
    'in_house',       (select count(*) from bk where status = 'checked_in'),
    'room_revenue',   coalesce((select sum(rate) from night), 0),
    'occupancy_pct',  case when (select count(*) from rm where status <> 'maintenance') > 0
                        then round(100.0 * (select count(*) from night) / (select count(*) from rm where status <> 'maintenance'), 1) else 0 end,
    'adr',            case when (select count(*) from night) > 0 then round((select sum(rate) from night) / (select count(*) from night), 0) else 0 end,
    'revpar',         case when (select count(*) from rm where status <> 'maintenance') > 0
                        then round(coalesce((select sum(rate) from night), 0) / (select count(*) from rm where status <> 'maintenance'), 0) else 0 end,
    'arrivals',       (select count(*) from arr),
    'arrived',        (select count(*) from arr where status in ('checked_in', 'checked_out')),
    'not_arrived',    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'no', booking_no, 'room', room, 'guest', full_name, 'vip', vip) order by room) from arr where status = 'reserved'), '[]'::jsonb),
    'no_shows',       (select count(*) from arr where status = 'no_show'),
    'departures',     (select count(*) from dep),
    'departed',       (select count(*) from dep where status = 'checked_out'),
    'due_out',        coalesce((select jsonb_agg(jsonb_build_object('id', id, 'no', booking_no, 'room', room, 'guest', full_name, 'vip', vip) order by room) from bk where status = 'checked_in' and check_out <= p_date), '[]'::jsonb),
    'discrepancies',  coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'room', room, 'who', who) order by room) from disc), '[]'::jsonb),
    'closed',         (select jsonb_build_object('closed_at', closed_at, 'notes', notes, 'no_shows', no_shows) from night_audits n, rid where n.restaurant_id = rid.id and n.business_date = p_date)
  );
$$;
revoke all on function night_audit_numbers(date) from public, anon;
grant execute on function night_audit_numbers(date) to authenticated;

create or replace function run_night_audit(p_date date, p_mark_no_shows boolean default true, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n jsonb; ns int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'frontdesk') then
    raise exception 'only an owner, manager, supervisor or front desk can close the day';
  end if;
  if p_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'that day has not happened yet'; end if;
  if p_mark_no_shows then
    -- a reservation that never arrived by the close of its day is a no-show; its room is released
    with gone as (
      update bookings set status = 'no_show' where restaurant_id = rid and status = 'reserved' and check_in <= p_date returning room_id
    )
    update rooms set status = 'available' where id in (select room_id from gone) and status = 'reserved';
  end if;
  select count(*) into ns from bookings where restaurant_id = rid and status = 'no_show' and check_in = p_date;
  n := night_audit_numbers(p_date);
  insert into night_audits(restaurant_id, business_date, rooms_total, rooms_sellable, occupied, arrivals, departures, no_shows, in_house,
                           room_revenue, occupancy_pct, adr, revpar, dirty_rooms, ooo_rooms, discrepancies, notes, closed_by)
  values (rid, p_date, (n->>'rooms_total')::int, (n->>'rooms_sellable')::int, (n->>'occupied')::int, (n->>'arrivals')::int, (n->>'departures')::int,
          ns, (n->>'in_house')::int, (n->>'room_revenue')::numeric, (n->>'occupancy_pct')::numeric, (n->>'adr')::numeric, (n->>'revpar')::numeric,
          (n->>'dirty_rooms')::int, (n->>'ooo_rooms')::int, jsonb_array_length(n->'discrepancies'),
          case when length(trim(p_notes)) > 0 then trim(p_notes) end, auth.uid())
  on conflict (restaurant_id, business_date) do update set
    rooms_total = excluded.rooms_total, rooms_sellable = excluded.rooms_sellable, occupied = excluded.occupied, arrivals = excluded.arrivals,
    departures = excluded.departures, no_shows = excluded.no_shows, in_house = excluded.in_house, room_revenue = excluded.room_revenue,
    occupancy_pct = excluded.occupancy_pct, adr = excluded.adr, revpar = excluded.revpar, dirty_rooms = excluded.dirty_rooms,
    ooo_rooms = excluded.ooo_rooms, discrepancies = excluded.discrepancies, notes = coalesce(excluded.notes, night_audits.notes),
    closed_by = excluded.closed_by, closed_at = now();
  return night_audit_numbers(p_date);
end $$;
revoke all on function run_night_audit(date, boolean, text) from public, anon;
grant execute on function run_night_audit(date, boolean, text) to authenticated;

-- Occupancy, ADR and RevPAR by day — the three numbers every hotel dashboard opens with.
-- A night is sold when a stay covers it; the rate is the booking's, so the figures match the folio.
create or replace function hotel_kpis(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  span as (select greatest(1, least(365, p_days)) as n, (now() at time zone 'Asia/Kolkata')::date as today),
  days as (select generate_series(today - (n - 1), today, interval '1 day')::date as d from span),
  tot as (select count(*) as n from rooms r, rid where r.restaurant_id = rid.id),
  nights as (
    select d.d, count(b.id) as occupied, coalesce(sum(b.rate), 0) as revenue
    from days d
    left join bookings b on b.restaurant_id = (select id from rid) and b.status in ('checked_in', 'checked_out') and b.check_in <= d.d and b.check_out > d.d
    group by d.d
  ),
  by_day as (
    select to_char(d, 'DD Mon') as day, d, occupied, revenue, (select n from tot) as total,
      case when (select n from tot) > 0 then round(100.0 * occupied / (select n from tot), 0) else 0 end as occ_pct,
      case when occupied > 0 then round(revenue / occupied, 0) else 0 end as adr,
      case when (select n from tot) > 0 then round(revenue / (select n from tot), 0) else 0 end as revpar
    from nights
  )
  select jsonb_build_object(
    'rooms',       (select n from tot),
    'days',        (select count(*) from days),
    'room_nights', coalesce((select sum(occupied) from nights), 0),
    'revenue',     coalesce((select sum(revenue) from nights), 0),
    'occ_pct',     case when (select n from tot) > 0 then round(100.0 * coalesce((select sum(occupied) from nights), 0) / ((select n from tot) * (select count(*) from days)), 0) else 0 end,
    'adr',         case when coalesce((select sum(occupied) from nights), 0) > 0 then round((select sum(revenue) from nights) / (select sum(occupied) from nights), 0) else 0 end,
    'revpar',      case when (select n from tot) > 0 then round(coalesce((select sum(revenue) from nights), 0) / ((select n from tot) * (select count(*) from days)), 0) else 0 end,
    'by_day',      coalesce((select jsonb_agg(jsonb_build_object('day', day, 'occupied', occupied, 'total', total, 'occ_pct', occ_pct, 'revenue', revenue, 'adr', adr, 'revpar', revpar) order by d) from by_day), '[]'::jsonb)
  );
$$;
revoke all on function hotel_kpis(int) from public, anon;
grant execute on function hotel_kpis(int) to authenticated;

create index if not exists bookings_rid_status_dates_idx on bookings(restaurant_id, status, check_in, check_out);
create index if not exists rooms_rid_condition_idx on rooms(restaurant_id, condition);
