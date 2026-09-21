-- 0068 · Two numbers that were right but would not have been believed
--
-- Both came out of running 0067 against real data.
--
-- 1. Speed of service was reading "5,309 minutes". It was arithmetically correct: one ticket from
--    days earlier was marked ready long after the food had gone, and the mean carried it. A single
--    forgotten ticket making the headline absurd is worse than useless — the owner stops trusting
--    the whole report. Anything past four hours is not a cooking time, so it is counted separately
--    and named on screen rather than silently dropped.
--
-- 2. Reports and the Night audit counted occupancy over different denominators — every room here,
--    sellable rooms there. With one room out of order at this property the two screens would have
--    shown different occupancy for the same day, which is exactly how a hospitality system loses
--    the front office's confidence. Both now divide by the rooms that can actually be sold, which
--    is what a hotel means by occupancy.

-- ── 1. Speed of service, without the abandoned tickets ──
create or replace function kitchen_speed(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  r as (select kds_target_minutes as target, kds_warn_minutes as warn from restaurants, rid where restaurants.id = rid.id),
  win as (select (now() - (greatest(1, least(365, p_days)) || ' days')::interval) as since),
  -- every finished ticket in the window, cooked or abandoned
  raw as (
    select k.id, k.created_at, k.recalls, extract(epoch from (k.ready_at - k.created_at)) / 60.0 as mins
    from kots k, rid, win
    where k.restaurant_id = rid.id and k.ready_at is not null and k.ready_at >= k.created_at and k.created_at >= win.since
  ),
  -- four hours is far beyond any real dish; past that the ticket was closed long after service
  k as (select * from raw where mins <= 240),
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
    'ignored',    (select count(*) from raw where mins > 240),
    'recalls',    coalesce((select sum(recalls) from raw), 0),
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

-- ── 2. One definition of occupancy, shared with the night audit ──
-- Rooms available means rooms that can be sold: a room that is out of order cannot be, and counting
-- it against the house makes a full hotel look half empty. night_audit_numbers() already worked this
-- way; this brings the report into line so both screens say the same thing about the same day.
create or replace function hotel_kpis(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  span as (select greatest(1, least(365, p_days)) as n, (now() at time zone 'Asia/Kolkata')::date as today),
  days as (select generate_series(today - (n - 1), today, interval '1 day')::date as d from span),
  tot as (
    select count(*) as all_rooms,
           count(*) filter (where r.status <> 'maintenance') as n,
           count(*) filter (where r.status = 'maintenance') as ooo
    from rooms r, rid where r.restaurant_id = rid.id
  ),
  nights as (
    select d.d, count(b.id) as occupied, coalesce(sum(b.rate), 0) as revenue
    from days d
    left join bookings b on b.restaurant_id = (select id from rid) and b.status in ('checked_in', 'checked_out') and b.check_in <= d.d and b.check_out > d.d
    group by d.d
  ),
  by_day as (
    select to_char(d, 'DD Mon') as day, d, occupied, revenue, (select n from tot) as total,
      case when (select n from tot) > 0 then least(100, round(100.0 * occupied / (select n from tot), 0)) else 0 end as occ_pct,
      case when occupied > 0 then round(revenue / occupied, 0) else 0 end as adr,
      case when (select n from tot) > 0 then round(revenue / (select n from tot), 0) else 0 end as revpar
    from nights
  )
  select jsonb_build_object(
    'rooms',       (select all_rooms from tot),
    'sellable',    (select n from tot),
    'ooo',         (select ooo from tot),
    'days',        (select count(*) from days),
    'room_nights', coalesce((select sum(occupied) from nights), 0),
    'revenue',     coalesce((select sum(revenue) from nights), 0),
    'occ_pct',     case when (select n from tot) > 0 then least(100, round(100.0 * coalesce((select sum(occupied) from nights), 0) / ((select n from tot) * (select count(*) from days)), 0)) else 0 end,
    'adr',         case when coalesce((select sum(occupied) from nights), 0) > 0 then round((select sum(revenue) from nights) / (select sum(occupied) from nights), 0) else 0 end,
    'revpar',      case when (select n from tot) > 0 then round(coalesce((select sum(revenue) from nights), 0) / ((select n from tot) * (select count(*) from days)), 0) else 0 end,
    'by_day',      coalesce((select jsonb_agg(jsonb_build_object('day', day, 'occupied', occupied, 'total', total, 'occ_pct', occ_pct, 'revenue', revenue, 'adr', adr, 'revpar', revpar) order by d) from by_day), '[]'::jsonb)
  );
$$;
revoke all on function hotel_kpis(int) from public, anon;
grant execute on function hotel_kpis(int) to authenticated;
