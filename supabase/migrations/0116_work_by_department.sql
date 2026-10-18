-- 0116 · Work goes to the people whose work it is (2026-10-18)
--
--  1. A job is seen by its department only: a room clean by Housekeeping, a table by Service and Housekeeping (the
--     cleaners), a repair by Engineering, a job for another department by that department — plus whoever raised it, was
--     given it, took it or finished it, and the owner and managers. A supervisor without a department (as every live
--     property's are today) still sees everything; a person without one falls back on their role (waiter → Service,
--     housekeeping → Housekeeping, chef → Kitchen, frontdesk → Front office, store → Stores).
--  2. Once a job is taken, the rest of the department's staff stop seeing it — on the board and, since the bell hears
--     the change, in their notifications; the department's supervisor keeps seeing who took it, from when to when.
--  3. Enforced in the database: jobs and table_cleanings read through RLS by department (the bell's realtime feed
--     follows RLS); _clean_job refuses a job of another department; the boards filter the same way.
--  4. work_log(from, to): every job of a period with every name and time, and each cook's tickets — owner and manager.

/** The caller's department: their position's, else their role's. */
create or replace function public._my_dept() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(p.department, case p.role::text when 'housekeeping' then 'housekeeping' when 'waiter' then 'service' when 'cashier' then 'service'
    when 'chef' then 'kitchen' when 'frontdesk' then 'front_office' when 'store' then 'stores' end)
  from profiles p where p.id = auth.uid() $$;

/** May the caller see this job at all? (RLS and the realtime feed.) Its department's people, whoever it is about, the
 *  owner and managers; a supervisor with no department sees everything. */
create or replace function public._work_dept_ok(p_kind text, p_dept text, p_assigned uuid, p_created uuid, p_taken uuid, p_done uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := auth_role()::text; d text := _my_dept();
begin
  if r in ('owner', 'manager') then return true; end if;
  if me is not null and me in (p_assigned, p_created, p_taken, p_done) then return true; end if;
  if r in ('supervisor', 'supervisor_2') and d is null then return true; end if;
  if p_kind = 'table' then return d in ('service', 'housekeeping'); end if;
  if p_kind = 'room' then return d = 'housekeeping'; end if;
  return p_dept is null or d = p_dept;
end $$;

/** What the boards show: the above, and for staff (not supervisors) only what is still waiting for anyone — a job
 *  someone else has taken, finished, or been given leaves their board. */
create or replace function public._work_board_sees(p_kind text, p_dept text, p_assigned uuid, p_created uuid, p_taken uuid, p_done uuid, p_status text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := auth_role()::text;
begin
  if not _work_dept_ok(p_kind, p_dept, p_assigned, p_created, p_taken, p_done) then return false; end if;
  if r in ('owner', 'manager', 'supervisor', 'supervisor_2') then return true; end if;
  if me in (p_assigned, p_created, p_taken, p_done) then return true; end if;
  return p_status = 'pending' and p_assigned is null;
end $$;
revoke all on function public._my_dept() from public, anon;
revoke all on function public._work_dept_ok(text, text, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public._work_board_sees(text, text, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public._my_dept() to authenticated;
grant execute on function public._work_dept_ok(text, text, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public._work_board_sees(text, text, uuid, uuid, uuid, uuid, text) to authenticated;

-- RLS by department (the bell's realtime events follow it)
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _work_dept_ok('job', department, assigned_to, created_by, taken_by, done_by));
drop policy if exists table_cleanings_read on public.table_cleanings;
create policy table_cleanings_read on public.table_cleanings for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _work_dept_ok('table', null, assigned_to, null, taken_by, done_by));

/** One job, locked — and refused when it is another department's. */
create or replace function public._clean_job(p_kind text, p_id uuid, out status text, out assigned_to uuid, out taken_by uuid)
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); dept text; created uuid; k text := p_kind; hk text;
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_kind = 'table' then
    select c.status, c.assigned_to, c.taken_by into status, assigned_to, taken_by from table_cleanings c where c.id = p_id and c.restaurant_id = rid for update;
  elsif p_kind = 'room' then
    select h.status::text, h.assigned_to, h.taken_by, h.kind into status, assigned_to, taken_by, hk from housekeeping_tasks h where h.id = p_id and h.restaurant_id = rid for update;
    if hk = 'maintenance' then k := 'job'; dept := 'engineering'; end if;
  elsif p_kind = 'job' then
    select j.status, j.assigned_to, j.taken_by, j.department, j.created_by into status, assigned_to, taken_by, dept, created from jobs j where j.id = p_id and j.restaurant_id = rid for update;
  else
    raise exception 'unknown job';
  end if;
  if not found then raise exception 'that job is not on this property'; end if;
  if not _work_dept_ok(k, dept, assigned_to, created, taken_by, null) then raise exception 'That job is for another department' using errcode = '42501'; end if;
  if status in ('done', 'skipped') then raise exception 'That one is already done'; end if;
end $$;
revoke all on function public._clean_job(text, uuid) from public, anon, authenticated;

create or replace function public.clean_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    -- cleaned, not yet signed off: only for whoever may sign off, and only where the property inspects
    'inspect', case when boss and req and _work_dept_ok('room', null, null, null, null, null) then coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'place', r.number::text, 'zone', 'Floor ' || r.floor,
        'since', r.condition_at, 'cleaned_name', case when d.done_by is not null then _clean_name(d.done_by) end, 'cleaned_at', d.done_at,
        'arrival', exists (select 1 from bookings b where b.room_id = r.id and b.status = 'reserved' and b.check_in = today))
        order by r.condition_at)
      from rooms r left join lateral (select h.done_by, h.done_at from housekeeping_tasks h where h.room_id = r.id and h.status = 'done' and h.kind <> 'maintenance'
                                       order by h.done_at desc nulls last limit 1) d on true
      where r.restaurant_id = rid and r.condition = 'clean' and r.status <> 'maintenance'), '[]'::jsonb) else '[]'::jsonb end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'title', p.position_title, 'dept', p.department,
        'on_duty', exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
        order by p.full_name) from profiles p where p.restaurant_id = rid and p.is_active), '[]'::jsonb)
  );
end $$;

create or replace function public.work_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  return clean_board() || jsonb_build_object(                       -- clean_board checks the caller
    'me_dept', (select department from profiles where id = auth.uid()),
    'work', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select j.created_at as ts, jsonb_build_object('kind', 'job', 'id', j.id, 'place', j.place, 'zone', null, 'what', j.category, 'title', j.title, 'details', j.details,
          'category', j.category, 'department', j.department, 'priority', j.priority, 'guest', j.guest_impact, 'due_at', j.due_at, 'repeat_days', j.repeat_days, 'source', j.source,
          'status', j.status, 'note', j.note, 'created_at', j.created_at,
          'created_by', j.created_by, 'created_name', case when j.created_by is not null then _clean_name(j.created_by) end,
          'assigned_to', j.assigned_to, 'assigned_name', case when j.assigned_to is not null then _clean_name(j.assigned_to) end,
          'labourer_id', j.labourer_id, 'labourer_name', l.full_name,
          'assigned_by_name', case when j.assigned_by is not null then _clean_name(j.assigned_by) end, 'assigned_at', j.assigned_at,
          'taken_by', j.taken_by, 'taken_name', case when j.taken_by is not null then _clean_name(j.taken_by) end, 'taken_at', j.taken_at,
          'done_by', j.done_by, 'done_name', case when j.done_by is not null then _clean_name(j.done_by) end, 'done_at', j.done_at) as j
        from jobs j left join labourers l on l.id = j.labourer_id
        where j.restaurant_id = rid and (j.status in ('pending', 'in_progress') or j.done_at >= since)
          and _work_board_sees('job', j.department, j.assigned_to, j.created_by, j.taken_by, j.done_by, j.status)
        union all
        -- a room out of order: its repair task is Engineering's job
        select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'place', 'Room ' || coalesce(h.place, r.number::text), 'zone', 'Floor ' || r.floor, 'what', 'maintenance',
          'title', 'Repair · Room ' || r.number, 'details', h.notes, 'category', 'repair', 'department', 'engineering', 'priority', 2, 'guest', r.status = 'occupied',
          'due_at', h.created_at + interval '2 hours', 'repeat_days', 0, 'source', 'room', 'status', h.status::text, 'note', null, 'created_at', h.created_at,
          'created_by', null, 'created_name', null,
          'assigned_to', h.assigned_to, 'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end, 'labourer_id', null, 'labourer_name', null,
          'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
          'taken_by', h.taken_by, 'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_at', h.taken_at,
          'done_by', h.done_by, 'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_at', h.done_at)
        from housekeeping_tasks h join rooms r on r.id = h.room_id
        where h.restaurant_id = rid and h.kind = 'maintenance' and (h.status <> 'done' or h.done_at >= since)
          and _work_board_sees('job', 'engineering', h.assigned_to, null, h.taken_by, h.done_by, h.status::text)
      ) x), '[]'::jsonb),
    'labourers', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.full_name, 'skill', l.skill,
        'on_duty', exists (select 1 from labour_attendance a where a.labourer_id = l.id and a.work_date = today and a.in_at is not null and a.out_at is null)) order by l.full_name)
        from labourers l where l.restaurant_id = rid and l.status = 'active'), '[]'::jsonb),
    'cooks', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'cooked', c.n, 'ready', c.r)) from (
        select k.started_by, count(*)::int n, (count(*) filter (where k.status in ('ready', 'served')))::int r
        from kots k where k.restaurant_id = rid and k.started_at >= since and k.started_by is not null group by k.started_by) c
        join profiles p on p.id = c.started_by), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number::text) order by sort_order) from rooms where restaurant_id = rid), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order) from dining_tables where restaurant_id = rid), '[]'::jsonb)
  );
end $$;

/** Every job of a period — tables, rooms, repairs and everything raised — with every name and time; and each cook's
 *  tickets. Owner and manager only. At most 93 days. */
create or replace function public.work_log(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
        a timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata'); b timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager reads the work records' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'choose a period'; end if;
  if p_to - p_from > 93 then raise exception 'at most three months at a time'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(x.j order by x.ts desc) from (
      select c.created_at ts, jsonb_build_object('kind', 'table', 'id', c.id, 'title', 'Clean ' || coalesce(nullif(c.place, ''), 'table'), 'place', c.place, 'department', 'service', 'priority', null,
        'status', c.status, 'note', c.note, 'created_at', c.created_at, 'due_at', null, 'created_name', null,
        'assigned_name', case when c.assigned_to is not null then _clean_name(c.assigned_to) end, 'assigned_by_name', case when c.assigned_by is not null then _clean_name(c.assigned_by) end, 'assigned_at', c.assigned_at,
        'taken_name', case when c.taken_by is not null then _clean_name(c.taken_by) end, 'taken_by', c.taken_by, 'taken_at', c.taken_at,
        'done_name', case when c.done_by is not null then _clean_name(c.done_by) end, 'done_by', c.done_by, 'done_at', c.done_at, 'labourer_name', null, 'inspection', null, 'inspected_name', null) j
      from table_cleanings c where c.restaurant_id = rid and c.created_at >= a and c.created_at < b
      union all
      select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'title', case when h.kind = 'maintenance' then 'Repair · Room ' else initcap(h.kind) || ' · Room ' end || coalesce(h.place, r.number::text),
        'place', 'Room ' || coalesce(h.place, r.number::text), 'department', case when h.kind = 'maintenance' then 'engineering' else 'housekeeping' end, 'priority', null,
        'status', h.status::text, 'note', h.notes, 'created_at', h.created_at, 'due_at', null, 'created_name', null,
        'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end, 'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
        'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_by', h.taken_by, 'taken_at', h.taken_at,
        'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_by', h.done_by, 'done_at', h.done_at, 'labourer_name', null,
        'inspection', h.inspection, 'inspected_name', case when h.inspected_by is not null then _clean_name(h.inspected_by) end)
      from housekeeping_tasks h join rooms r on r.id = h.room_id where h.restaurant_id = rid and h.created_at >= a and h.created_at < b
      union all
      select j.created_at, jsonb_build_object('kind', 'job', 'id', j.id, 'title', j.title, 'place', j.place, 'department', j.department, 'priority', j.priority,
        'status', j.status, 'note', j.note, 'created_at', j.created_at, 'due_at', j.due_at, 'created_name', case when j.created_by is not null then _clean_name(j.created_by) end,
        'assigned_name', case when j.assigned_to is not null then _clean_name(j.assigned_to) end, 'assigned_by_name', case when j.assigned_by is not null then _clean_name(j.assigned_by) end, 'assigned_at', j.assigned_at,
        'taken_name', case when j.taken_by is not null then _clean_name(j.taken_by) end, 'taken_by', j.taken_by, 'taken_at', j.taken_at,
        'done_name', case when j.done_by is not null then _clean_name(j.done_by) end, 'done_by', j.done_by, 'done_at', j.done_at, 'labourer_name', l.full_name, 'inspection', null, 'inspected_name', null)
      from jobs j left join labourers l on l.id = j.labourer_id where j.restaurant_id = rid and j.created_at >= a and j.created_at < b
    ) x), '[]'::jsonb),
    'cooks', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'cooked', c.n, 'avg_min', c.m) order by c.n desc) from (
        select k.started_by, count(*)::int n, round(avg(extract(epoch from (k.ready_at - k.started_at)) / 60) filter (where k.ready_at is not null and k.started_at is not null)::numeric, 1) m
        from kots k where k.restaurant_id = rid and k.started_at >= a and k.started_at < b and k.started_by is not null group by k.started_by) c
        join profiles p on p.id = c.started_by), '[]'::jsonb)
  );
end $$;
revoke all on function public.work_log(date, date) from public, anon;
grant execute on function public.work_log(date, date) to authenticated, service_role;

revoke all on function public.clean_board() from public, anon;
grant execute on function public.clean_board() to authenticated, service_role;
revoke all on function public.work_board() from public, anon;
grant execute on function public.work_board() to authenticated, service_role;
