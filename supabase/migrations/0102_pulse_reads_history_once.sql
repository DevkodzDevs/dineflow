-- 0102 · The floor's pulse reads the dwell history once, not once per table (2026-10-13)
--
-- table_pulse() and table_pulse_for(p_rid) called dwell_minutes(rid, capacity, created_at) for every
-- dining table — free ones too, whose answer is thrown away — and each call is a scan of 90 days of
-- paid dine-in orders plus three medians. A 28-table floor did 28 scans every time Pulse refreshed,
-- and Pulse is live (a refresh on every change, and every minute). It was the busiest of the app's
-- heavy functions (pg_stat_statements: 7,585 calls, 80 ms average, the second most database time).
--
-- dwell_medians(p_rid) reads that history once and returns its medians by party size and sitting;
-- dwell_pick() chooses from them with exactly dwell_minutes' fallbacks — size and sitting with at
-- least 8 visits, then size, then every visit, then 45 minutes — so every figure is unchanged
-- (dry102.cjs compares old and new for every property inside one transaction, the same now()).
-- dwell_minutes() itself is untouched for its other callers. Only the two helpers are new, and
-- neither is callable from outside: the pulse functions are security definer and call them as owner.

create or replace function public.dwell_medians(p_rid uuid) returns jsonb
language sql stable set search_path = public as $$
  with h as (
    select extract(epoch from (b.paid_at - o.created_at)) / 60 as mins,
           case when t.capacity >= 6 then 'big' when t.capacity >= 3 then 'mid' else 'small' end as bucket,
           case when extract(hour from o.created_at at time zone 'Asia/Kolkata') >= 17 then 'dinner' else 'lunch' end as sitting
    from orders o join bills b on b.order_id = o.id join dining_tables t on t.id = o.table_id
    where o.restaurant_id = p_rid and o.type = 'dine_in' and b.status = 'paid' and b.paid_at is not null
      and b.paid_at > now() - interval '90 days'
      and b.paid_at - o.created_at between interval '10 minutes' and interval '4 hours'
  )
  select coalesce((select jsonb_object_agg(x.bucket || ':' || x.sitting, x.m)
                     from (select bucket, sitting, percentile_cont(0.5) within group (order by mins) as m
                             from h group by bucket, sitting having count(*) >= 8) x), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(x.bucket, x.m)
                     from (select bucket, percentile_cont(0.5) within group (order by mins) as m
                             from h group by bucket having count(*) >= 8) x), '{}'::jsonb)
      || coalesce((select jsonb_build_object('all', percentile_cont(0.5) within group (order by mins))
                     from h having count(*) >= 8), '{}'::jsonb)
$$;
revoke execute on function public.dwell_medians(uuid) from public, anon, authenticated;

-- dwell_minutes(rid, p_party, p_at)'s answer, picked from dwell_medians(rid) instead of a fresh scan
create or replace function public.dwell_pick(p_med jsonb, p_party integer, p_at timestamptz) returns numeric
language sql stable set search_path = public as $$
  select coalesce(
    (p_med ->> ((case when p_party >= 6 then 'big' when p_party >= 3 then 'mid' else 'small' end) || ':' ||
                (case when extract(hour from p_at at time zone 'Asia/Kolkata') >= 17 then 'dinner' else 'lunch' end)))::float8,
    (p_med ->> (case when p_party >= 6 then 'big' when p_party >= 3 then 'mid' else 'small' end))::float8,
    (p_med ->> 'all')::float8,
    45)::numeric
$$;
revoke execute on function public.dwell_pick(jsonb, integer, timestamptz) from public, anon, authenticated;

-- the live body of table_pulse (pg_get_functiondef, 2026-10-13); only the two dwell lines changed
CREATE OR REPLACE FUNCTION public.table_pulse()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); med jsonb; out jsonb;
begin
  med := dwell_medians(rid);
  with occ as (
    select t.id, t.name, t.capacity, t.status, o.id as order_id, o.created_at, t.capacity as covers,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, o.created_at) as dwell
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
    'avg_dwell', round(dwell_pick(med, 2, now())),
    'history_days', (select count(distinct (b.paid_at at time zone 'Asia/Kolkata')::date) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > now() - interval '90 days'))
  into out;
  return out;
end $function$;

-- the live body of table_pulse_for (pg_get_functiondef, 2026-10-13); only the dwell line changed
CREATE OR REPLACE FUNCTION public.table_pulse_for(p_rid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare med jsonb; out jsonb;
begin
  med := dwell_medians(p_rid);
  with occ as (
    select t.id, t.name, t.capacity, o.id as order_id, o.created_at, t.capacity as covers,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, o.created_at) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    where t.restaurant_id = p_rid
  ),
  est as (select *, case when order_id is null then 0 when billed then 8 when items > 0 and done = items then greatest(6, round(dwell * 0.22))
                    when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60)) end as mins_left from occ)
  select jsonb_build_object('tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'mins_left', mins_left) order by mins_left) from est), '[]')) into out;
  return out;
end $function$;
