-- 0164 · Pulse: a waiting guest holds a table, and seating one stays put (2026-11-03).
--
-- The owner: "when I add a guest to the waiting list, a table should be added for their party — only if one is free,
-- otherwise they wait until one frees; the waiting list should get a table by itself when one frees, or I set one by
-- hand — and when I set a table and refresh, it is gone."
--
-- Two causes, both fixed here:
--   1. 0131 (the *seated* stage) was written on 2026-10-21 and moved to supabase/pending/, and never applied. A party
--      seated through Pulse showed "just seated" only until the page refreshed; table_pulse, reading open orders alone,
--      put the table back to Free. 0131's two functions are carried here unchanged (the live table_pulse and
--      table_pulse_for are still the ones it was written against), and supabase/pending/0131 is removed.
--   2. A waiting guest could not hold a table at all — `walkins.table_id` was written only on Seat.
--
-- Now `walkins.table_id` on a waiting or called guest is the table **held** for them (`held_at` when it was):
--   * `_walkin_free_tables(rid)` — what may be given out: no open order, no walk-in seated there in the last 3 hours
--     with nothing ordered since (0131's rule), not held for another guest, no cleaning job pending or in progress, and
--     no table booking today still to come (from 30 minutes before its time — the rule Pulse's Reserved tab uses), no
--     booking holding it (0154), and no booked party seated there in the last 3 hours with nothing ordered since.
--   * `_walkin_fill(rid)` — first come, first served: each waiting/called guest without a table gets the smallest free
--     table that seats their party. A hold lapses when someone else sits there after it was held: an order opened on
--     the table, another walk-in seated at it, or a booked party seated at it. One at a time per property (an advisory lock), so two calls never hand out one table twice.
--   * It runs from walkin_add, queue_join and walkin_set (a seated or gone guest frees their hold), from `walkin_fill()`
--     (the Pulse and Join by QR pages, on every load), and from triggers when a table frees: an order leaves 'open', a
--     cleaning job is done or skipped, a table booking is cancelled, a no-show, completed or moved. A trigger never fails the write that
--     fired it — the fill is wrapped and its error dropped.
--   * `walkin_hold(id, table)` — the host sets a table by hand: the caller's own property, a guest still waiting or
--     called, a table of theirs that has no open order and is not held for someone else.
--   * walkin_set … 'seated' with no table seats them at the table they hold.
--   * queue_status: a guest holding a table reads 0 minutes ("Any minute now") — the table is free and theirs.
--
-- Additive: one column (`walkins.held_at`); walkins' tenant policy (0016) already covers it. The two private helpers
-- take a property id, so they are revoked from every API role; the public calls answer for the caller's own property.

alter table walkins add column if not exists held_at timestamptz;

-- ─── 0131, unchanged: a table a walk-in was just seated at reads 'seated', not 'free' ───
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


-- ─── the tables a waiting guest may be given ───
create or replace function public._walkin_free_tables(p_rid uuid)
returns table (id uuid, name text, capacity int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.capacity from dining_tables t
  where t.restaurant_id = p_rid
    and not exists (select 1 from orders o where o.table_id = t.id and o.status = 'open')
    and not exists (select 1 from walkins w where w.restaurant_id = p_rid and w.table_id = t.id and w.status = 'seated'
                      and w.seated_at > now() - interval '3 hours'
                      and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at))
    and not exists (select 1 from walkins w where w.restaurant_id = p_rid and w.table_id = t.id and w.status in ('waiting', 'called'))
    and not exists (select 1 from table_cleanings c where c.table_id = t.id and c.status in ('pending', 'in_progress'))
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id
                      and r.status in ('requested', 'confirmed') and r.on_date = (now() at time zone 'Asia/Kolkata')::date
                      and (r.on_date + r.at_time) >= (now() at time zone 'Asia/Kolkata') - interval '30 minutes')
    -- a booking holding the table (0154), and a booked party just seated there with nothing ordered yet
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id
                      and r.held_at is not null and r.status in ('requested', 'confirmed'))
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id and r.status = 'seated'
                      and r.seated_at > now() - interval '3 hours'
                      and not exists (select 1 from orders o3 where o3.table_id = t.id and o3.created_at >= r.seated_at))
$$;

-- ─── first come, first served: a free table that fits, for everyone waiting without one ───
create or replace function public._walkin_fill(p_rid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare w record; t uuid; n int := 0;
begin
  if p_rid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('walkin_fill:' || p_rid));
  -- someone else sat at a held table: an order opened on it after it was held
  update walkins x set table_id = null, held_at = null
   where x.restaurant_id = p_rid and x.status in ('waiting', 'called') and x.table_id is not null
     and (exists (select 1 from orders o where o.table_id = x.table_id and o.status = 'open' and o.created_at > coalesce(x.held_at, x.joined_at))
       -- or another walk-in, or a booked party, was seated there after it was held (no order yet)
       or exists (select 1 from walkins y where y.table_id = x.table_id and y.id <> x.id and y.status = 'seated' and y.seated_at >= coalesce(x.held_at, x.joined_at))
       or exists (select 1 from reservations r where r.table_id = x.table_id and r.status = 'seated' and r.seated_at >= coalesce(x.held_at, x.joined_at)));
  for w in select x.id, x.party from walkins x where x.restaurant_id = p_rid and x.status in ('waiting', 'called') and x.table_id is null order by x.joined_at loop
    select f.id into t from _walkin_free_tables(p_rid) f where f.capacity >= w.party order by f.capacity, f.name limit 1;
    continue when t is null;
    update walkins set table_id = t, held_at = now() where id = w.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public._walkin_free_tables(uuid) from public, anon, authenticated;
revoke all on function public._walkin_fill(uuid) from public, anon, authenticated;

-- the screens' call: hand out what has freed since, for the caller's own property
create or replace function public.walkin_fill()
returns int language plpgsql security definer set search_path = public as $$
begin
  return _walkin_fill(auth_restaurant_id());
end $$;
revoke all on function public.walkin_fill() from public, anon;
grant execute on function public.walkin_fill() to authenticated;

-- the host sets a table by hand
create or replace function public.walkin_hold(p_id uuid, p_table uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); w walkins; tn text; other text;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('walkin_fill:' || rid));
  select * into w from walkins where id = p_id and restaurant_id = rid;
  if not found or w.status not in ('waiting', 'called') then raise exception 'that guest is no longer waiting'; end if;
  select name into tn from dining_tables where id = p_table and restaurant_id = rid;
  if tn is null then raise exception 'no such table'; end if;
  select x.name into other from walkins x where x.restaurant_id = rid and x.table_id = p_table and x.status in ('waiting', 'called') and x.id <> p_id limit 1;
  if other is not null then raise exception '% is held for %', tn, other; end if;
  if exists (select 1 from orders o where o.table_id = p_table and o.status = 'open') then raise exception '% is in use', tn; end if;
  update walkins set table_id = p_table, held_at = now() where id = p_id;
  return jsonb_build_object('table', tn);
end $$;
revoke all on function public.walkin_hold(uuid, uuid) from public, anon;
grant execute on function public.walkin_hold(uuid, uuid) to authenticated;

-- ─── the walk-in calls, as live (pg_get_functiondef), each with the fill added ───
create or replace function public.walkin_add(p_name text, p_phone text, p_party integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); q int; w walkins;
begin
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, p_name, nullif(p_phone, ''), p_party, q, 'host') returning * into w;
  perform _walkin_fill(rid);                                                                  -- 0164
  select * into w from walkins where id = w.id;
  return jsonb_build_object('id', w.id, 'token', w.token, 'quoted_min', q, 'position', (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'table', (select t.name from dining_tables t where t.id = w.table_id), 'table_id', w.table_id);
end $function$;

create or replace function public.walkin_set(p_id uuid, p_status walkin_status, p_table uuid default null::uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); held uuid;
begin
  select table_id into held from walkins where id = p_id and restaurant_id = rid;
  update walkins set status = p_status, table_id = coalesce(p_table, table_id),
    called_at = case when p_status = 'called' then now() else called_at end,
    seated_at = case when p_status = 'seated' then now() else seated_at end
  where id = p_id and restaurant_id = rid;
  -- 0164: seated with no table named → the table they hold
  if p_status = 'seated' and coalesce(p_table, held) is not null then update dining_tables set status = 'occupied' where id = coalesce(p_table, held) and restaurant_id = rid; end if;
  if p_status in ('seated', 'left') then perform _walkin_fill(rid); end if;                -- 0164: their hold goes to the next
end $function$;

create or replace function public.queue_join(p_slug text, p_name text, p_phone text, p_party integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid; q int; w walkins; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed and membership_state_for(id) in ('trial','active');   -- 0100
  if rid is null then raise exception 'this place is not taking a queue right now'; end if;
  if p_party < 1 or p_party > 20 then raise exception 'party size must be between 1 and 20'; end if;
  if (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting') >= 60 then raise exception 'the queue is full — please ask at the counter'; end if;
  -- 0098: three joins an hour per phone number, a hundred and fifty an hour per place
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if ph <> '' and not _hit('queue:' || rid || ':' || ph, 3, interval '1 hour') then raise exception 'this number has joined a few times already — please ask at the counter'; end if;
  if not _hit('queue:' || rid, 150, interval '1 hour') then raise exception 'the queue is very busy — please ask at the counter'; end if;
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, left(p_name, 60), nullif(left(p_phone, 20), ''), p_party, q, 'qr') returning * into w;
  perform _walkin_fill(rid);                                                                  -- 0164
  return queue_status(w.token);
end $function$;

create or replace function public.queue_status(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'token', w.token, 'name', w.name, 'party', w.party, 'status', w.status, 'joined_at', w.joined_at,
    'place', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'waiting', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting'),
    -- 0164: a guest holding a table is next to be called — any minute now
    'minutes', case when w.status = 'waiting' and w.table_id is null then quote_wait(w.party, w.restaurant_id) else 0 end,
    'table', (select t.name from dining_tables t where t.id = w.table_id),
    'restaurant', r.name, 'slug', r.booking_slug)
  from walkins w join restaurants r on r.id = w.restaurant_id where w.token = p_token
$function$;

-- ─── when a table frees, the next guest gets it ───
create or replace function public._walkin_fill_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform _walkin_fill(new.restaurant_id);
  exception when others then null;   -- never fail the payment, the cleaning or the booking that freed it
  end;
  return null;
end $$;
revoke all on function public._walkin_fill_trg() from public, anon, authenticated;

drop trigger if exists walkin_fill_on_order on orders;
create trigger walkin_fill_on_order after update of status on orders
  for each row when (old.status = 'open' and new.status <> 'open' and new.table_id is not null) execute function _walkin_fill_trg();
drop trigger if exists walkin_fill_on_clean on table_cleanings;
create trigger walkin_fill_on_clean after update of status on table_cleanings
  for each row when (old.status in ('pending', 'in_progress') and new.status in ('done', 'skipped')) execute function _walkin_fill_trg();
drop trigger if exists walkin_fill_on_booking on reservations;
create trigger walkin_fill_on_booking after update of status, table_id on reservations
  for each row when (old.table_id is not null and (new.status in ('cancelled', 'no_show', 'completed') or new.table_id is distinct from old.table_id)) execute function _walkin_fill_trg();

notify pgrst, 'reload schema';
