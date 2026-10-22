-- 0131 · Pulse sees a walk-in who has been seated (2026-10-21).
--
-- "Seat now" (walkin_set … 'seated', table) marked the table occupied, but table_pulse and table_pulse_for decide a
-- table's stage from its open order alone — no order yet, so the table stayed "free": still in Free, still offered to
-- the next party, and quote_wait counted it as free now. The owner: "I seat them now and it still shows the free table".
--
-- Now a table with no open order is **seated** when a walk-in was seated there in the last 3 hours and no order has
-- been started on it since (once one is, the order's own stages take over, and once that order is paid the table is
-- free again — the walk-in does not bring it back). dining_tables.status is not used for this: it is also left
-- 'occupied' by orders closed without a bill, and would hold a table for good.
--
-- A seated table: stage 'seated', its age from the seating, minutes left as for a table that has just ordered
-- (at least 15, the dwell less its age). free_now / seats_free_now count stage 'free' only; next_free_min any other.
-- No table, column or policy is added; grants on the two functions are kept by create or replace.

create or replace function public.table_pulse()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); med jsonb; out jsonb;
begin
  med := dwell_medians(rid);
  with occ as (
    select t.id, t.name, t.capacity, t.status, o.id as order_id, coalesce(o.created_at, sw.seated_at) as created_at, t.capacity as covers,
      sw.seated_at,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, coalesce(o.created_at, sw.seated_at)) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    left join lateral (
      select w.seated_at from walkins w
      where w.restaurant_id = rid and w.table_id = t.id and w.status = 'seated' and w.seated_at > now() - interval '3 hours'
        and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at)
      order by w.seated_at desc limit 1) sw on o.id is null
    where t.restaurant_id = rid
  ),
  est as (
    select *, extract(epoch from (now() - created_at)) / 60 as age,
      case
        when order_id is null and seated_at is null then 0
        when order_id is null then greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))   -- seated, not ordered yet
        when billed then 8
        when items > 0 and done = items then greatest(6, round(dwell * 0.22))     -- everything served: coffee and the bill
        when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
        else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
      end as mins_left,
      case when order_id is null and seated_at is not null then 'seated' when order_id is null then 'free' when billed then 'billed'
           when items > 0 and done = items then 'served' when done > 0 then 'eating' else 'ordered' end as stage
    from occ
  )
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'stage', stage, 'covers', covers, 'age', coalesce(round(age), 0), 'mins_left', mins_left, 'free_at', to_char((now() + (mins_left || ' minutes')::interval) at time zone 'Asia/Kolkata', 'HH24:MI')) order by mins_left, name) from est), '[]'),
    'free_now', (select count(*) from est where stage = 'free'),
    'seats_free_now', coalesce((select sum(capacity) from est where stage = 'free'), 0),
    'next_free_min', (select min(mins_left) from est where stage <> 'free'),
    'avg_dwell', round(dwell_pick(med, 2, now())),
    'history_days', (select count(distinct (b.paid_at at time zone 'Asia/Kolkata')::date) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > now() - interval '90 days'))
  into out;
  return out;
end $function$;

create or replace function public.table_pulse_for(p_rid uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare med jsonb; out jsonb;
begin
  med := dwell_medians(p_rid);
  with occ as (
    select t.id, t.name, t.capacity, o.id as order_id, coalesce(o.created_at, sw.seated_at) as created_at, t.capacity as covers, sw.seated_at,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, coalesce(o.created_at, sw.seated_at)) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    left join lateral (
      select w.seated_at from walkins w
      where w.restaurant_id = p_rid and w.table_id = t.id and w.status = 'seated' and w.seated_at > now() - interval '3 hours'
        and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at)
      order by w.seated_at desc limit 1) sw on o.id is null
    where t.restaurant_id = p_rid
  ),
  est as (select *, case when order_id is null and seated_at is null then 0
                    when order_id is null then greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    when billed then 8 when items > 0 and done = items then greatest(6, round(dwell * 0.22))
                    when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60)) end as mins_left from occ)
  select jsonb_build_object('tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'mins_left', mins_left) order by mins_left) from est), '[]')) into out;
  return out;
end $function$;
