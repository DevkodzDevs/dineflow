-- 0113 · Work: every job on the property, routed to its department, with a name on it (2026-10-18)
--
--  1. jobs — what anyone raises: a leaking tap (repair → Engineering), the lawn (grounds → Engineering), a spill
--     (cleaning → Housekeeping), extra towels for 104 (guest request → Housekeeping), the fryer's deep clean (kitchen →
--     Kitchen), a banquet setup (event → Banquets), a restock (stock → Stores), a patrol (security), anything (other).
--     The category picks the department; the priority picks the response target — the tiers hotel maintenance desks
--     use: P1 urgent 30 min, P2 high 2 h, P3 normal 8 h, P4 low / planned 3 days. A job can carry guest impact, a due
--     time, a repeat (every n days: the next one opens when this one is done), a person or a day labourer it is given
--     to, and a note of what was done. clean_take / clean_done / clean_release / clean_assign work on kind 'job';
--     clean_done takes an optional note (the 2-argument version is replaced — one signature, a default).
--  2. kots.started_by / ready_by / served_by — who cooked each ticket, stamped by a trigger on the status the kitchen's
--     own updates already set (sync_kot_status): no kitchen screen changes.
--  3. work_board() = clean_board() + jobs (+ each room out of order, as Engineering's repair), the labourers, the
--     kitchen's cooks today, and the rooms and tables a job can name; job_add, job_assign_labour, job_cancel.
-- RLS on jobs: the browser reads its property's rows, the functions write; the table is in the realtime publication.

-- ── 1 · jobs ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  details text,
  category text not null default 'other' check (category in ('repair', 'grounds', 'cleaning', 'guest_request', 'kitchen', 'service', 'stock', 'security', 'event', 'admin', 'other')),
  department text check (department in ('management', 'front_office', 'housekeeping', 'service', 'kitchen', 'banquets', 'spa', 'recreation', 'engineering', 'security', 'sales', 'finance', 'hr', 'stores', 'delivery')),
  place text not null default '',                     -- Room 104 · T4 · Lawn · Kitchen store
  room_id uuid references public.rooms(id) on delete set null,
  table_id uuid references public.dining_tables(id) on delete set null,
  priority smallint not null default 3 check (priority between 1 and 4),
  guest_impact boolean not null default false,
  due_at timestamptz,
  repeat_days integer not null default 0 check (repeat_days between 0 and 365),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  note text,                                          -- what was done, or why it was dropped
  source text not null default 'manual' check (source in ('manual', 'repeat')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_to uuid references public.profiles(id) on delete set null,
  labourer_id uuid references public.labourers(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  taken_by uuid references public.profiles(id) on delete set null,
  taken_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz
);
create index if not exists jobs_open_idx on public.jobs (restaurant_id, status, due_at);
create index if not exists jobs_day_idx on public.jobs (restaurant_id, created_at desc);
alter table public.jobs enable row level security;
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (restaurant_id = auth_restaurant_id());
revoke all on public.jobs from anon;
revoke insert, update, delete, truncate on public.jobs from authenticated;
grant select on public.jobs to authenticated;
do $$ begin alter publication supabase_realtime add table public.jobs; exception when others then null; end $$;

/** The response target a priority carries: P1 30 min, P2 2 h, P3 8 h, P4 3 days. */
create or replace function public._job_target(p integer) returns interval
language sql immutable as $$
  select case p when 1 then interval '30 minutes' when 2 then interval '2 hours' when 4 then interval '3 days' else interval '8 hours' end $$;
/** The department a category goes to when none is named. */
create or replace function public._job_department(p_category text) returns text
language sql immutable as $$
  select case p_category when 'repair' then 'engineering' when 'grounds' then 'engineering' when 'cleaning' then 'housekeeping'
    when 'guest_request' then 'housekeeping' when 'kitchen' then 'kitchen' when 'service' then 'service' when 'stock' then 'stores'
    when 'security' then 'security' when 'event' then 'banquets' when 'admin' then 'management' else null end $$;

create or replace function public._job_who() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := _clean_me();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, me);
    if new.due_at is null then new.due_at := now() + _job_target(new.priority); end if;
    if new.assigned_to is not null or new.labourer_id is not null then new.assigned_at := coalesce(new.assigned_at, now()); new.assigned_by := coalesce(new.assigned_by, me); end if;
    return new;
  end if;
  if new.assigned_to is distinct from old.assigned_to or new.labourer_id is distinct from old.labourer_id then
    if new.assigned_to is null and new.labourer_id is null then new.assigned_by := null; new.assigned_at := null;
    else new.assigned_by := coalesce(me, new.assigned_by); new.assigned_at := now(); end if;
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress' then
    new.taken_by := coalesce(new.taken_by, me); new.taken_at := coalesce(new.taken_at, now());
  elsif new.status = 'pending' and old.status = 'in_progress' then
    new.taken_by := null; new.taken_at := null;
  end if;
  if new.status in ('done', 'skipped') and old.status not in ('done', 'skipped') then
    new.done_by := coalesce(new.done_by, me); new.done_at := coalesce(new.done_at, now());
  end if;
  return new;
end $$;
revoke all on function public._job_who() from public, anon, authenticated;
drop trigger if exists trg_job_who on public.jobs;
create trigger trg_job_who before insert or update on public.jobs for each row execute function public._job_who();

/** A job that repeats: the next one opens when this one is done, due repeat_days later, given to the same person. */
create or replace function public._job_repeat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' and new.repeat_days > 0 then
    insert into jobs (restaurant_id, title, details, category, department, place, room_id, table_id, priority, guest_impact, due_at, repeat_days,
                      created_by, assigned_to, labourer_id, assigned_by, assigned_at, source)
    values (new.restaurant_id, new.title, new.details, new.category, new.department, new.place, new.room_id, new.table_id, new.priority, false,
            coalesce(new.done_at, now()) + make_interval(days => new.repeat_days), new.repeat_days,
            new.created_by, new.assigned_to, new.labourer_id, new.assigned_by, case when new.assigned_to is not null or new.labourer_id is not null then now() end, 'repeat');
  end if;
  return null;
end $$;
revoke all on function public._job_repeat() from public, anon, authenticated;
drop trigger if exists trg_job_repeat on public.jobs;
create trigger trg_job_repeat after update of status on public.jobs for each row execute function public._job_repeat();

/** Anyone signed in raises a job. Giving it to a person or a labourer is a supervisor's move. */
create or replace function public.job_add(p_title text, p_details text, p_category text, p_department text, p_place text, p_room uuid, p_table uuid,
                                          p_priority integer, p_guest boolean, p_due timestamptz, p_assigned uuid, p_labourer uuid, p_repeat integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); me uuid := _clean_me(); cat text := coalesce(nullif(trim(p_category), ''), 'other'); dept text; place text; j jobs;
begin
  if rid is null or me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'say what the job is'; end if;
  if length(trim(p_title)) > 120 then raise exception 'a job''s name is 120 characters at most'; end if;
  dept := coalesce(nullif(trim(p_department), ''), _job_department(cat));
  place := nullif(left(trim(coalesce(p_place, '')), 60), '');
  if p_room is not null then
    if not exists (select 1 from rooms where id = p_room and restaurant_id = rid) then raise exception 'that room is not here'; end if;
    place := coalesce(place, 'Room ' || (select number from rooms where id = p_room));
  end if;
  if p_table is not null then
    if not exists (select 1 from dining_tables where id = p_table and restaurant_id = rid) then raise exception 'that table is not here'; end if;
    place := coalesce(place, (select name from dining_tables where id = p_table));
  end if;
  if (p_assigned is not null or p_labourer is not null) and not _clean_may_assign() then raise exception 'Only an owner, manager or supervisor gives out jobs' using errcode = '42501'; end if;
  if p_assigned is not null and not exists (select 1 from profiles where id = p_assigned and restaurant_id = rid and is_active) then raise exception 'that person does not work here'; end if;
  if p_labourer is not null and not exists (select 1 from labourers where id = p_labourer and restaurant_id = rid and status = 'active') then raise exception 'that labourer is not on the books here'; end if;
  insert into jobs (restaurant_id, title, details, category, department, place, room_id, table_id, priority, guest_impact, due_at, repeat_days, assigned_to, labourer_id)
  values (rid, trim(p_title), nullif(left(trim(coalesce(p_details, '')), 600), ''), cat, dept, coalesce(place, ''), p_room, p_table,
          least(4, greatest(1, coalesce(p_priority, 3))), coalesce(p_guest, false), p_due, least(365, greatest(0, coalesce(p_repeat, 0))),
          p_assigned, case when p_assigned is null then p_labourer end)
  returning * into j;
  return jsonb_build_object('id', j.id, 'department', j.department, 'due_at', j.due_at);
end $$;

/** A supervisor gives a job to a day labourer (who has no sign-in): the supervisor, or anyone, takes and finishes it for them. */
create or replace function public.job_assign_labour(p_id uuid, p_labourer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); j record;
begin
  if not _clean_may_assign() then raise exception 'Only an owner, manager or supervisor gives out jobs' using errcode = '42501'; end if;
  select * into j from _clean_job('job', p_id);
  if p_labourer is not null and not exists (select 1 from labourers where id = p_labourer and restaurant_id = rid and status = 'active') then raise exception 'that labourer is not on the books here'; end if;
  update jobs set labourer_id = p_labourer, assigned_to = case when p_labourer is null then assigned_to else null end where id = p_id;
  return jsonb_build_object('ok', true, 'to', (select full_name from labourers where id = p_labourer));
end $$;

/** Dropped: by whoever raised it, is on it, or a supervisor. */
create or replace function public.job_cancel(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me(); raised uuid;
begin
  select * into j from _clean_job('job', p_id);
  select created_by into raised from jobs where id = p_id;
  -- coalesce: a null taken_by or assigned_to must read as "not me", not as unknown (which `not` would let through)
  if not (_clean_may_assign() or coalesce(raised = me, false) or coalesce(j.taken_by = me, false) or coalesce(j.assigned_to = me, false)) then raise exception 'Only whoever raised it, is on it, or a supervisor can drop a job' using errcode = '42501'; end if;
  update jobs set status = 'skipped', note = coalesce(nullif(left(trim(p_note), 300), ''), 'Dropped') where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── the shared functions learn kind 'job' ────────────────────────────────────────────────────────────────────────
create or replace function public._clean_job(p_kind text, p_id uuid, out status text, out assigned_to uuid, out taken_by uuid)
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_kind = 'table' then
    select c.status, c.assigned_to, c.taken_by into status, assigned_to, taken_by from table_cleanings c where c.id = p_id and c.restaurant_id = rid for update;
  elsif p_kind = 'room' then
    select h.status::text, h.assigned_to, h.taken_by into status, assigned_to, taken_by from housekeeping_tasks h where h.id = p_id and h.restaurant_id = rid for update;
  elsif p_kind = 'job' then
    select j.status, j.assigned_to, j.taken_by into status, assigned_to, taken_by from jobs j where j.id = p_id and j.restaurant_id = rid for update;
  else
    raise exception 'unknown job';
  end if;
  if not found then raise exception 'that job is not on this property'; end if;
  if status in ('done', 'skipped') then raise exception 'That one is already done'; end if;
end $$;

create or replace function public.clean_take(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me();
begin
  select * into j from _clean_job(p_kind, p_id);
  if j.status = 'in_progress' then
    if j.taken_by = me then return jsonb_build_object('ok', true); end if;
    raise exception '% is already on it', _clean_name(j.taken_by);
  end if;
  if j.assigned_to is not null and j.assigned_to <> me and not _clean_may_assign() then
    raise exception 'This one is given to % — ask a supervisor to give it to you', _clean_name(j.assigned_to);
  end if;
  if p_kind = 'table' then update table_cleanings set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id;
  elsif p_kind = 'job' then update jobs set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id;
  else update housekeeping_tasks set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.clean_done(text, uuid);
create or replace function public.clean_done(p_kind text, p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me(); boss boolean := _clean_may_assign(); n text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  select * into j from _clean_job(p_kind, p_id);
  if not boss then
    if j.status = 'in_progress' and j.taken_by <> me and j.assigned_to is distinct from me then raise exception '% is on it', _clean_name(j.taken_by); end if;
    if j.status = 'pending' and j.assigned_to is not null and j.assigned_to <> me then raise exception 'This one is given to %', _clean_name(j.assigned_to); end if;
  end if;
  if p_kind = 'table' then
    update table_cleanings set status = 'done', done_by = me, done_at = now(), taken_by = coalesce(taken_by, me), note = coalesce(n, note) where id = p_id;
  elsif p_kind = 'job' then
    update jobs set status = 'done', done_by = me, done_at = now(), taken_by = coalesce(taken_by, me), note = coalesce(n, note) where id = p_id;
  else
    update housekeeping_tasks set status = 'done', done_by = me, taken_by = coalesce(taken_by, me),
           notes = case when n is null then notes else concat_ws(' — ', nullif(notes, ''), n) end where id = p_id;   -- hk_done marks the room clean
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.clean_release(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me();
begin
  select * into j from _clean_job(p_kind, p_id);
  if j.status <> 'in_progress' then return jsonb_build_object('ok', true); end if;
  if j.taken_by <> me and not _clean_may_assign() then raise exception '% is on it', _clean_name(j.taken_by); end if;
  if p_kind = 'table' then update table_cleanings set status = 'pending', taken_by = null, taken_at = null where id = p_id;
  elsif p_kind = 'job' then update jobs set status = 'pending', taken_by = null, taken_at = null where id = p_id;
  else update housekeeping_tasks set status = 'pending' where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.clean_assign(p_kind text, p_id uuid, p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me(); rid uuid := auth_restaurant_id();
begin
  if not _clean_may_assign() then raise exception 'Only an owner, manager or supervisor gives out jobs' using errcode = '42501'; end if;
  select * into j from _clean_job(p_kind, p_id);
  if p_profile is not null and not exists (select 1 from profiles where id = p_profile and restaurant_id = rid and is_active) then
    raise exception 'that person does not work here';
  end if;
  if p_kind = 'table' then
    update table_cleanings set assigned_to = p_profile, assigned_by = case when p_profile is null then null else me end,
           assigned_at = case when p_profile is null then null else now() end,
           status = case when status = 'in_progress' and taken_by is distinct from p_profile then 'pending' else status end,
           taken_by = case when status = 'in_progress' and taken_by is distinct from p_profile then null else taken_by end,
           taken_at = case when status = 'in_progress' and taken_by is distinct from p_profile then null else taken_at end
     where id = p_id;
  elsif p_kind = 'job' then
    update jobs set assigned_to = p_profile, labourer_id = case when p_profile is null then labourer_id else null end,
           status = case when status = 'in_progress' and taken_by is distinct from p_profile then 'pending' else status end
     where id = p_id;                                                                  -- _job_who stamps by whom and when
  else
    update housekeeping_tasks set assigned_to = p_profile,
           status = case when status = 'in_progress' and taken_by is distinct from p_profile then 'pending'::hk_status else status end
     where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'to', case when p_profile is null then null else _clean_name(p_profile) end);
end $$;

-- ── 2 · who cooked each ticket ───────────────────────────────────────────────────────────────────────────────────
alter table public.kots
  add column if not exists started_by uuid,
  add column if not exists ready_by uuid,
  add column if not exists served_by uuid;
create or replace function public._kot_who() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := _clean_me();
begin
  if new.status in ('preparing', 'ready', 'served') and old.status = 'pending' then new.started_by := coalesce(new.started_by, me); end if;
  if new.status in ('ready', 'served') and old.status in ('pending', 'preparing') then new.ready_by := coalesce(new.ready_by, me); end if;
  if new.status = 'served' and old.status <> 'served' then new.served_by := coalesce(new.served_by, me); end if;
  return new;
end $$;
revoke all on function public._kot_who() from public, anon, authenticated;
drop trigger if exists trg_kot_who on public.kots;
create trigger trg_kot_who before update of status on public.kots for each row execute function public._kot_who();

-- ── 3 · the board ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.work_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  return clean_board() || jsonb_build_object(                       -- clean_board checks the caller
    'me_dept', (select department from profiles where id = auth.uid()),
    'jobs', coalesce((select jsonb_agg(x.j order by x.ts) from (
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

do $$ declare f text; begin
  foreach f in array array['job_add(text, text, text, text, text, uuid, uuid, integer, boolean, timestamptz, uuid, uuid, integer)', 'job_assign_labour(uuid, uuid)',
                           'job_cancel(uuid, text)', 'clean_take(text, uuid)', 'clean_done(text, uuid, text)', 'clean_release(text, uuid)', 'clean_assign(text, uuid, uuid)', 'work_board()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public._clean_job(text, uuid) from public, anon, authenticated;
revoke all on function public._job_target(integer) from public, anon;
revoke all on function public._job_department(text) from public, anon;
