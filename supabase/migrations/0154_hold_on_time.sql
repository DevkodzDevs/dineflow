-- 0154 — A booking holds its table or room when its time comes (2026-10-29, the owner: "when a table or room is reserved
-- by phone or online, at that time it should be reserved automatically — the table or room already chosen, or one that
-- fits the party").
--
-- Before: a table booking held nothing on the Orders floor (only the Tables page drew it as booked), and one with no table
-- never got one until the host seated it by hand. A room booked for a later day stayed "Ready" on its arrival day — the room
-- was marked reserved only when the booking was made for today — so it could be given to a walk-in.
--
-- hold_due() — run by the screens that show tables and rooms each time they draw (they refresh every 30–60 s and on any
-- change, so nothing has to be scheduled):
--   tables  from half an hour before a booking's time, its table is held (status reserved); a booking with no table gets the
--           smallest free table that seats the party (not one with an open order, nor one another booking has within 90
--           minutes; one being cleaned last). Half an hour after its time, a party not yet seated lets the table go — the
--           booking stays, shown Late, for the host. A hold is made once (held_at): a host who frees the table keeps it free.
--   rooms   on the arrival day a booked room that is Ready becomes Arriving (reserved). The room was always chosen.
-- reservation_set now lets a held table go when the booking is cancelled, a no-show or done, or seated at another table.

alter table public.reservations add column if not exists held_at timestamptz;

create or replace function public.hold_due() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id();
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  d date := v_now::date;
  r record; tid uuid; n_held int := 0; n_given int := 0; n_freed int := 0; n_rooms int := 0;
begin
  if rid is null then return jsonb_build_object('ok', false); end if;
  perform pg_advisory_xact_lock(hashtext('hold_due:' || rid));   -- two screens drawing at once must not give one table twice

  -- a party half an hour late lets its table go; the booking stays (Late) for the host
  for r in select x.id, x.table_id from reservations x
            where x.restaurant_id = rid and x.on_date between d - 1 and d and x.status in ('requested', 'confirmed')
              and x.held_at is not null and x.table_id is not null and x.on_date + x.at_time < v_now - interval '30 minutes' loop
    update reservations set held_at = null where id = r.id;
    update dining_tables set status = 'free' where id = r.table_id and status = 'reserved'
      and not exists (select 1 from reservations y where y.table_id = r.table_id and y.id <> r.id and y.held_at is not null and y.status in ('requested', 'confirmed'));
    if found then n_freed := n_freed + 1; end if;
  end loop;

  -- due now: hold the chosen table, or find one for the party
  for r in select x.id, x.table_id, x.party_size, x.on_date + x.at_time as due from reservations x
            where x.restaurant_id = rid and x.on_date between d - 1 and d + 1 and x.status in ('requested', 'confirmed') and x.held_at is null
              and x.on_date + x.at_time between v_now - interval '30 minutes' and v_now + interval '30 minutes'
            order by x.on_date, x.at_time, x.party_size desc loop
    tid := r.table_id;
    if tid is null then
      select dt.id into tid from dining_tables dt
       where dt.restaurant_id = rid and dt.status = 'free' and dt.capacity >= r.party_size
         and not exists (select 1 from orders o where o.table_id = dt.id and o.status = 'open')
         and not exists (select 1 from reservations y where y.table_id = dt.id and y.id <> r.id and y.status in ('requested', 'confirmed', 'seated')
                          and y.on_date between d - 1 and d + 1 and abs(extract(epoch from (y.on_date + y.at_time) - r.due)) < 5400)
       order by exists (select 1 from table_cleanings c where c.table_id = dt.id and c.status in ('pending', 'in_progress')), dt.capacity, dt.sort_order
       limit 1;
      continue when tid is null;                                  -- nothing seats them: the host does it by hand
      update reservations set table_id = tid where id = r.id; n_given := n_given + 1;
    end if;
    update dining_tables set status = 'reserved' where id = tid and status = 'free'
      and not exists (select 1 from orders o where o.table_id = tid and o.status = 'open');
    if found then update reservations set held_at = now() where id = r.id; n_held := n_held + 1; end if;
  end loop;

  -- rooms: the arrival day holds the booked room
  update rooms rm set status = 'reserved' from bookings b
   where b.restaurant_id = rid and b.room_id = rm.id and b.status = 'reserved' and not b.is_block
     and b.check_in <= d and b.check_out > d and rm.status = 'available';
  get diagnostics n_rooms = row_count;

  return jsonb_build_object('ok', true, 'tables_held', n_held, 'tables_given', n_given, 'tables_freed', n_freed, 'rooms_held', n_rooms);
end $$;
revoke all on function public.hold_due() from public, anon;
grant execute on function public.hold_due() to authenticated;

-- the same function as 0098, plus: a held table goes back when its booking ends without it
CREATE OR REPLACE FUNCTION public.reservation_set(p_id uuid, p_status reservation_status, p_table uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v reservations%rowtype;
begin
  select * into v from reservations where id = p_id and restaurant_id = auth_restaurant_id();
  if not found then raise exception 'reservation not found'; end if;
  -- 0098: a table given here must be the reservation's own property's
  if p_table is not null and not exists (select 1 from dining_tables where id = p_table and restaurant_id = v.restaurant_id) then
    raise exception 'table not found';
  end if;
  update reservations set status = p_status, table_id = coalesce(p_table, table_id),
    seated_at = case when p_status = 'seated' then now() else seated_at end,
    held_at = case when p_status in ('requested', 'confirmed') then held_at end where id = p_id;
  if p_status = 'seated' and coalesce(p_table, v.table_id) is not null then
    update dining_tables set status = 'occupied' where id = coalesce(p_table, v.table_id);
  end if;
  -- 0154: cancelled, a no-show, done, or seated somewhere else — the table held for them is free again
  if v.held_at is not null and v.table_id is not null and p_status not in ('requested', 'confirmed')
     and not (p_status = 'seated' and coalesce(p_table, v.table_id) = v.table_id) then
    update dining_tables set status = 'free' where id = v.table_id and status = 'reserved'
      and not exists (select 1 from reservations y where y.table_id = v.table_id and y.id <> p_id and y.held_at is not null and y.status in ('requested', 'confirmed'));
  end if;
end $function$;

notify pgrst, 'reload schema';
