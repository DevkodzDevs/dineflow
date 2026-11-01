-- 0158 — the owner's 2026-11-01 round.
--
-- 1. A kitchen ticket whose dishes are all cancelled closes (the owner: "I press Served, it says done, and it comes back
--    again and again"). sync_kot_status read "every dish ready or cancelled" as Ready, so cancelling a whole order put its
--    ticket on the pass for good: Served moves only dishes that are not cancelled, found none, reported no error, and the
--    ticket came back on the next read — 30 such tickets were open (manoooo 8, Tan Resort 22). It is now "served" with no
--    served_at (closed, never served), off every board, and the open ones are closed here.
-- 2. A job is its own people's (the owner: "I'll take it only for the people whose work it is; Assign lists only them, never
--    the top three"): _clean_boss, _clean_fits — the database's copy of lib/notify.ts CLEAN_BOSSES / doesWork — and
--    clean_take refuses anyone else, unless the job was given to them. clean_board's people carry their position (a Busser
--    cleans tables though their team is Service).
-- 3. Nobody took it → a free cleaner gets it (the owner: "after 5 minutes, if nobody assigned it, give it to a cleaner who is
--    free, at random — the same for rooms"). restaurants.clean_auto_minutes (5; 0 = off, clean_auto_save, owner or
--    manager) and clean_auto_assign(), which every signed-in device of the property calls once a minute (there is no
--    pg_cron): a table or room pending, given to nobody, older than that, goes to a random person whose work it is, on
--    duty (when anyone at the property has clocked in today) and free (nothing open given to them or taken by them). The
--    assignment carries no assigned_by — the board says "automatically". A transaction-local flag lets it past the 0156
--    guard and keeps _hk_who from naming the caller.

-- ── 1 · tickets ────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_kot_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare k kot_status; gone boolean;
begin
  if new.kot_id is null then return new; end if;
  select bool_and(status = 'cancelled'), case
    when bool_and(status = 'cancelled') then 'served'
    when bool_and(status in ('ready','served','cancelled')) and bool_or(status = 'served') then 'served'
    when bool_and(status in ('ready','cancelled')) then 'ready'
    when bool_or(status = 'preparing') then 'preparing'
    else 'pending' end::kot_status
  into gone, k from order_items where kot_id = new.kot_id;
  update kots set status = k,
    started_at = case when k in ('preparing','ready','served') and not gone then coalesce(started_at, now()) else started_at end,
    ready_at   = case when k in ('ready','served') and not gone then coalesce(ready_at, now()) else ready_at end,
    served_at  = case when k = 'served' and not gone then coalesce(served_at, now()) when k = 'served' then served_at else null end
  where id = new.kot_id;
  return new;
end $$;

update kots k set status = 'served'
 where k.status in ('pending', 'preparing', 'ready')
   and exists (select 1 from order_items i where i.kot_id = k.id)
   and not exists (select 1 from order_items i where i.kot_id = k.id and i.status <> 'cancelled');

-- ── 2 · whose job ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- the ones who give jobs out and never take them (lib/notify.ts CLEAN_BOSSES)
create or replace function public._clean_boss(p_role text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_role in ('owner', 'manager', 'supervisor', 'supervisor_2'), false) $$;

-- is this job this person's work (lib/notify.ts doesWork): a table — the Housekeeping team or a Busser; a room — the
-- Housekeeping team; any other job — its department's people, or anyone when it has none. Never a boss.
create or replace function public._clean_fits(p_kind text, p_dept text, p_profile uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r text; d text; pos text;
begin
  select p.role::text, coalesce(p.department, case p.role::text when 'housekeeping' then 'housekeeping' when 'waiter' then 'service'
           when 'cashier' then 'service' when 'chef' then 'kitchen' when 'frontdesk' then 'front_office' when 'store' then 'stores' end), p.position
    into r, d, pos from profiles p where p.id = p_profile and p.is_active;
  if not found or _clean_boss(r) then return false; end if;
  if p_kind = 'table' then return d = 'housekeeping' or pos = 'busser'; end if;
  if p_kind = 'room' then return d = 'housekeeping'; end if;
  return p_dept is null or d = p_dept;
end $$;

create or replace function public.clean_take(p_kind text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me(); k text := p_kind; dept text;
begin
  select * into j from _clean_job(p_kind, p_id);
  if j.status = 'in_progress' then
    if j.taken_by = me then return jsonb_build_object('ok', true); end if;
    raise exception '% is already on it', _clean_name(j.taken_by);
  end if;
  if j.assigned_to is distinct from me then
    -- what kind of work it is: a room under repair is Engineering's, a job its department's
    if p_kind = 'room' then select case when h.kind = 'maintenance' then 'job' else 'room' end, case when h.kind = 'maintenance' then 'engineering' end
                              into k, dept from housekeeping_tasks h where h.id = p_id;
    elsif p_kind = 'job' then select j2.department into dept from jobs j2 where j2.id = p_id; end if;
    if _clean_boss(auth_role()::text) then raise exception 'Owners, managers and supervisors give jobs out — tap Assign' using errcode = '42501'; end if;
    if not _clean_fits(k, dept, me) then
      raise exception '%', case k when 'table' then 'Tables are the cleaners'' — ask a supervisor to give it to you'
        when 'room' then 'Rooms are Housekeeping''s — ask a supervisor to give it to you'
        else 'That job is for another team — ask a supervisor to give it to you' end using errcode = '42501';
    end if;
    if j.assigned_to is not null then
      raise exception 'This one is given to % — ask a supervisor to give it to you', _clean_name(j.assigned_to);
    end if;
  end if;
  if p_kind = 'table' then update table_cleanings set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id;
  elsif p_kind = 'job' then update jobs set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id;
  else update housekeeping_tasks set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- clean_board as 0116 left it, its people now with their position
create or replace function public.clean_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
        boss boolean := _clean_may_assign(); req boolean;
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select coalesce(hk_inspect_required, false) into req from restaurants where id = rid;
  return jsonb_build_object(
    'can_assign', boss,
    'tables_on', coalesce((select table_cleaning from restaurants where id = rid), true),
    'inspect_required', req,
    'jobs', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select c.created_at as ts, jsonb_build_object('kind', 'table', 'id', c.id, 'place', coalesce(nullif(c.place, ''), t.name, 'Table'), 'zone', t.zone,
          'what', 'After guests', 'status', c.status, 'note', c.note, 'created_at', c.created_at,
          'assigned_to', c.assigned_to, 'assigned_name', case when c.assigned_to is not null then _clean_name(c.assigned_to) end,
          'assigned_by_name', case when c.assigned_by is not null then _clean_name(c.assigned_by) end, 'assigned_at', c.assigned_at,
          'taken_by', c.taken_by, 'taken_name', case when c.taken_by is not null then _clean_name(c.taken_by) end, 'taken_at', c.taken_at,
          'done_by', c.done_by, 'done_name', case when c.done_by is not null then _clean_name(c.done_by) end, 'done_at', c.done_at) as j
        from table_cleanings c left join dining_tables t on t.id = c.table_id
        where c.restaurant_id = rid and (c.status in ('pending', 'in_progress') or c.done_at >= since)
          and _work_board_sees('table', null, c.assigned_to, null, c.taken_by, c.done_by, c.status)
        union all
        select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'place', coalesce(h.place, r.number::text), 'zone', 'Floor ' || r.floor,
          'what', h.kind, 'status', h.status::text, 'note', h.notes, 'created_at', h.created_at,
          'assigned_to', h.assigned_to, 'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end,
          'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
          'taken_by', h.taken_by, 'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_at', h.taken_at,
          'done_by', h.done_by, 'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_at', h.done_at,
          'arrival', exists (select 1 from bookings b where b.room_id = h.room_id and b.status = 'reserved' and b.check_in = today),
          'vip', exists (select 1 from bookings b join guests g on g.id = b.guest_id where b.room_id = h.room_id and b.status in ('reserved', 'checked_in')
                           and b.check_in <= today and b.check_out >= today and g.vip),
          'inspection', h.inspection, 'inspected_name', case when h.inspected_by is not null then _clean_name(h.inspected_by) end, 'inspected_at', h.inspected_at)
        from housekeeping_tasks h join rooms r on r.id = h.room_id
        where h.restaurant_id = rid and h.kind <> 'maintenance' and (h.status <> 'done' or h.done_at >= since)
          and _work_board_sees('room', null, h.assigned_to, null, h.taken_by, h.done_by, h.status::text)
      ) x), '[]'::jsonb),
    'inspect', case when boss and req and _work_dept_ok('room', null, null, null, null, null) then coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'place', r.number::text, 'zone', 'Floor ' || r.floor,
        'since', r.condition_at, 'cleaned_name', case when d.done_by is not null then _clean_name(d.done_by) end, 'cleaned_at', d.done_at,
        'arrival', exists (select 1 from bookings b where b.room_id = r.id and b.status = 'reserved' and b.check_in = today))
        order by r.condition_at)
      from rooms r left join lateral (select h.done_by, h.done_at from housekeeping_tasks h where h.room_id = r.id and h.status = 'done' and h.kind <> 'maintenance'
                                       order by h.done_at desc nulls last limit 1) d on true
      where r.restaurant_id = rid and r.condition = 'clean' and r.status <> 'maintenance'), '[]'::jsonb) else '[]'::jsonb end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'title', p.position_title, 'dept', p.department,
        'position', p.position,
        'on_duty', exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
        order by p.full_name) from profiles p where p.restaurant_id = rid and p.is_active), '[]'::jsonb)
  );
end $$;

-- ── 3 · nobody took it: a free cleaner gets it ──────────────────────────────────────────────────────────────────────────
alter table public.restaurants add column if not exists clean_auto_minutes integer not null default 5;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_clean_auto_minutes_check') then
    alter table public.restaurants add constraint restaurants_clean_auto_minutes_check check (clean_auto_minutes between 0 and 240);
  end if;
end $$;

create or replace function public.clean_auto_save(p_minutes integer)
returns integer language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager changes this' using errcode = '42501'; end if;
  update restaurants set clean_auto_minutes = greatest(0, least(240, coalesce(p_minutes, 5))) where id = rid;
  return 1;
end $$;

-- the 0156 guard and _hk_who, each with the automatic hand-out let past / left unnamed
create or replace function public._hk_assign_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                                       -- service role, cron, migrations
  if current_setting('dineflow.auto_assign', true) = 'on' then return new; end if;     -- clean_auto_assign (0158)
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if tg_op = 'INSERT' and new.assigned_to is null then return new; end if;
  if _clean_may_assign() then return new; end if;
  raise exception 'Only an owner, manager or supervisor gives out jobs' using errcode = '42501';
end $$;
revoke all on function public._hk_assign_guard() from public, anon, authenticated;

create or replace function public._hk_who()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := _clean_me(); auto boolean := coalesce(current_setting('dineflow.auto_assign', true) = 'on', false);
begin
  if tg_op = 'INSERT' then
    if new.place is null then select number::text into new.place from rooms where id = new.room_id; end if;
    if new.assigned_to is not null then new.assigned_at := coalesce(new.assigned_at, now()); new.assigned_by := coalesce(new.assigned_by, me); end if;
    return new;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    new.assigned_by := case when new.assigned_to is null or auto then null else coalesce(me, new.assigned_by) end;
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress' then
    new.taken_by := coalesce(new.taken_by, me); new.taken_at := coalesce(new.taken_at, now());
  elsif new.status = 'pending' and old.status = 'in_progress' then
    new.taken_by := null; new.taken_at := null;
  end if;
  if new.status = 'done' and old.status <> 'done' then new.done_by := coalesce(new.done_by, me); end if;
  return new;
end $$;

create or replace function public.clean_auto_assign()
returns integer language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); mins integer; today date := (now() at time zone 'Asia/Kolkata')::date;
        tracked boolean; j record; who uuid; n integer := 0;
begin
  if rid is null or _clean_me() is null then return 0; end if;
  select coalesce(clean_auto_minutes, 5) into mins from restaurants where id = rid;
  if coalesce(mins, 0) <= 0 then return 0; end if;
  -- on duty counts only where the property keeps attendance: someone has clocked in today
  select exists (select 1 from staff_attendance a where a.restaurant_id = rid and a.work_date = today and a.in_at is not null) into tracked;
  perform set_config('dineflow.auto_assign', 'on', true);
  for j in
    select 'table'::text as kind, c.id, c.created_at from table_cleanings c
     where c.restaurant_id = rid and c.status = 'pending' and c.assigned_to is null
       and c.created_at < now() - make_interval(mins => mins) and c.created_at > now() - interval '12 hours'
    union all
    select 'room', h.id, h.created_at from housekeeping_tasks h
     where h.restaurant_id = rid and h.status = 'pending' and h.kind <> 'maintenance' and h.assigned_to is null
       and h.created_at < now() - make_interval(mins => mins) and h.created_at > now() - interval '24 hours'
    order by 3
  loop
    -- another device may be handing out the same job this second: whoever locks it first does
    if j.kind = 'table' then perform 1 from table_cleanings where id = j.id and status = 'pending' and assigned_to is null for update skip locked;
    else perform 1 from housekeeping_tasks where id = j.id and status = 'pending' and assigned_to is null for update skip locked; end if;
    if not found then continue; end if;
    select p.id into who from profiles p
     where p.restaurant_id = rid and p.is_active and _clean_fits(j.kind, null, p.id)
       and not exists (select 1 from table_cleanings c where c.restaurant_id = rid and c.status in ('pending', 'in_progress')
                         and c.created_at > now() - interval '12 hours' and (c.assigned_to = p.id or c.taken_by = p.id))
       and not exists (select 1 from housekeeping_tasks h where h.restaurant_id = rid and h.status in ('pending', 'in_progress')
                         and h.created_at > now() - interval '24 hours' and (h.assigned_to = p.id or h.taken_by = p.id))
       and not exists (select 1 from jobs x where x.restaurant_id = rid and x.status = 'in_progress' and x.taken_by = p.id)
       and (not tracked or exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
     order by random() limit 1;
    if who is null then continue; end if;                                                -- nobody free: the next minute tries again
    if j.kind = 'table' then update table_cleanings set assigned_to = who, assigned_by = null, assigned_at = now() where id = j.id;
    else update housekeeping_tasks set assigned_to = who where id = j.id; end if;      -- _hk_who stamps assigned_at, no assigned_by
    n := n + 1; who := null;
  end loop;
  perform set_config('dineflow.auto_assign', 'off', true);
  return n;
end $$;

revoke all on function public._clean_fits(text, text, uuid) from public, anon;
revoke all on function public.clean_auto_assign() from public, anon;
revoke all on function public.clean_auto_save(integer) from public, anon;
grant execute on function public._clean_fits(text, text, uuid) to authenticated;
grant execute on function public.clean_auto_assign() to authenticated;
grant execute on function public.clean_auto_save(integer) to authenticated;

notify pgrst, 'reload schema';
