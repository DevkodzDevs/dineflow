-- 0111 · Cleaning after every guest (2026-10-18)
--
--  1. A table paid and left is a cleaning job. When a table goes from occupied to free — the bill settled, or the order
--     moved, merged, cancelled or posted to a room — table_cleanings gets a job for it (unless the property switched
--     that off: restaurants.table_cleaning). Seated again before anyone marked it clean, the job closes as skipped and
--     says so; one left open more than 12 hours is closed when the next opens. settle_bill and the table statuses are
--     not touched: the live site's older code sees nothing new.
--  2. A room's housekeeping task says who and when: assigned_by / assigned_at, taken_by / taken_at, done_by, and place
--     (the room number, for the notification). A trigger stamps them from the signed-in person on every path — the
--     old screens' direct status updates included — so no task is finished by nobody.
--  3. clean_board / clean_take / clean_done / clean_release / clean_assign / clean_skip / clean_settings_save. Each
--     checks its caller. Anyone signed in at the property takes a job that is not someone else's; an owner, manager or
--     supervisor assigns one to a person, and then it is that person's (or a supervisor's) to take.
-- Every new table has RLS on; the browser reads, the functions write.

-- ── 1 · tables ────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.restaurants add column if not exists table_cleaning boolean not null default true;

create table if not exists public.table_cleanings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  place text not null default '',                       -- the table's name when the job opened (the notification says it)
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  note text,
  created_at timestamptz not null default now(),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  taken_by uuid references public.profiles(id) on delete set null,
  taken_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz
);
create unique index if not exists table_cleanings_open_uq on public.table_cleanings (table_id) where status in ('pending', 'in_progress');
create index if not exists table_cleanings_day_idx on public.table_cleanings (restaurant_id, created_at desc);
alter table public.table_cleanings enable row level security;
drop policy if exists table_cleanings_read on public.table_cleanings;
create policy table_cleanings_read on public.table_cleanings for select to authenticated using (restaurant_id = auth_restaurant_id());
revoke all on public.table_cleanings from anon;
revoke insert, update, delete, truncate on public.table_cleanings from authenticated;
grant select on public.table_cleanings to authenticated;
do $$ begin alter publication supabase_realtime add table public.table_cleanings; exception when others then null; end $$;

create or replace function public._table_cleaning_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'occupied' and new.status = 'free' then
    if coalesce((select table_cleaning from restaurants where id = new.restaurant_id), true) then
      -- a job nobody closed by the next service is not a table waiting now (and the live site, until it has these
      -- screens, collects them unseen): close it, saying so
      update table_cleanings set status = 'skipped', done_at = now(), note = 'Left open from an earlier service'
       where restaurant_id = new.restaurant_id and status in ('pending', 'in_progress') and created_at < now() - interval '12 hours';
      insert into table_cleanings (restaurant_id, table_id, place) values (new.restaurant_id, new.id, coalesce(new.name, ''))
      on conflict do nothing;                                   -- one open job a table
    end if;
  elsif new.status = 'occupied' then
    update table_cleanings set status = 'skipped', done_at = now(), note = 'Seated again before it was marked clean'
     where table_id = new.id and status in ('pending', 'in_progress');
  end if;
  return null;
end $$;
revoke all on function public._table_cleaning_open() from public, anon, authenticated;
drop trigger if exists trg_table_cleaning on public.dining_tables;
create trigger trg_table_cleaning after update of status on public.dining_tables
  for each row when (old.status is distinct from new.status) execute function public._table_cleaning_open();

-- ── 2 · rooms: who and when ───────────────────────────────────────────────────────────────────────────────────────
alter table public.housekeeping_tasks
  add column if not exists place text,
  add column if not exists assigned_by uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists taken_by uuid,
  add column if not exists taken_at timestamptz,
  add column if not exists done_by uuid;

/** The signed-in person, if they have a profile (a platform admin acting as a property may not). */
create or replace function public._clean_me() returns uuid
language sql stable security definer set search_path = public as $$ select id from profiles where id = auth.uid() $$;
revoke all on function public._clean_me() from public, anon;
grant execute on function public._clean_me() to authenticated;

create or replace function public._hk_who() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := _clean_me();
begin
  if tg_op = 'INSERT' then
    if new.place is null then select number::text into new.place from rooms where id = new.room_id; end if;
    if new.assigned_to is not null then new.assigned_at := coalesce(new.assigned_at, now()); new.assigned_by := coalesce(new.assigned_by, me); end if;
    return new;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    new.assigned_by := case when new.assigned_to is null then null else coalesce(me, new.assigned_by) end;
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
revoke all on function public._hk_who() from public, anon, authenticated;
drop trigger if exists trg_hk_who on public.housekeeping_tasks;
create trigger trg_hk_who before insert or update on public.housekeeping_tasks for each row execute function public._hk_who();

-- the room number on the tasks there already (only `place` is set, so no status trigger fires)
update public.housekeeping_tasks h set place = r.number::text from public.rooms r where r.id = h.room_id and h.place is null;

-- ── 3 · the functions ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._clean_may_assign() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role()::text in ('owner', 'manager', 'supervisor', 'supervisor_2'), false) $$;
revoke all on function public._clean_may_assign() from public, anon;
grant execute on function public._clean_may_assign() to authenticated;

/** One job, locked, as the functions below need it: kind 'table' or 'room'. */
create or replace function public._clean_job(p_kind text, p_id uuid, out status text, out assigned_to uuid, out taken_by uuid)
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_kind = 'table' then
    select c.status, c.assigned_to, c.taken_by into status, assigned_to, taken_by from table_cleanings c where c.id = p_id and c.restaurant_id = rid for update;
  elsif p_kind = 'room' then
    select h.status::text, h.assigned_to, h.taken_by into status, assigned_to, taken_by from housekeeping_tasks h where h.id = p_id and h.restaurant_id = rid for update;
  else
    raise exception 'unknown job';
  end if;
  if not found then raise exception 'that job is not on this property'; end if;
  if status in ('done', 'skipped') then raise exception 'That one is already done'; end if;
end $$;
revoke all on function public._clean_job(text, uuid) from public, anon, authenticated;

create or replace function public._clean_name(p uuid) returns text
language sql stable security definer set search_path = public as $$ select coalesce((select full_name from profiles where id = p), 'someone') $$;
revoke all on function public._clean_name(uuid) from public, anon, authenticated;

/** I'll take it: the job is mine and the clock starts. A job given to someone else is theirs (or a supervisor's). */
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
  else update housekeeping_tasks set status = 'in_progress', taken_by = me, taken_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

/** Done: by the person on it, the person it was given to, or a supervisor. Nobody on it yet: whoever did it says so. */
create or replace function public.clean_done(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me(); boss boolean := _clean_may_assign();
begin
  select * into j from _clean_job(p_kind, p_id);
  if not boss then
    if j.status = 'in_progress' and j.taken_by <> me and j.assigned_to is distinct from me then raise exception '% is on it', _clean_name(j.taken_by); end if;
    if j.status = 'pending' and j.assigned_to is not null and j.assigned_to <> me then raise exception 'This one is given to %', _clean_name(j.assigned_to); end if;
  end if;
  if p_kind = 'table' then
    update table_cleanings set status = 'done', done_by = me, done_at = now(), taken_by = coalesce(taken_by, me) where id = p_id;
  else
    update housekeeping_tasks set status = 'done', done_by = me, taken_by = coalesce(taken_by, me) where id = p_id;   -- hk_done marks the room clean
  end if;
  return jsonb_build_object('ok', true);
end $$;

/** Give it back: the person on it (or a supervisor) puts it back in the queue. */
create or replace function public.clean_release(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me();
begin
  select * into j from _clean_job(p_kind, p_id);
  if j.status <> 'in_progress' then return jsonb_build_object('ok', true); end if;
  if j.taken_by <> me and not _clean_may_assign() then raise exception '% is on it', _clean_name(j.taken_by); end if;
  if p_kind = 'table' then update table_cleanings set status = 'pending', taken_by = null, taken_at = null where id = p_id;
  else update housekeeping_tasks set status = 'pending' where id = p_id; end if;      -- _hk_who clears who took it
  return jsonb_build_object('ok', true);
end $$;

/** A supervisor gives the job to one person (or to nobody: p_profile null). Someone else already on it: it starts again. */
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
  else
    update housekeeping_tasks set assigned_to = p_profile,
           status = case when status = 'in_progress' and taken_by is distinct from p_profile then 'pending'::hk_status else status end
     where id = p_id;                                                                  -- _hk_who stamps by whom and when
  end if;
  return jsonb_build_object('ok', true, 'to', case when p_profile is null then null else _clean_name(p_profile) end);
end $$;

/** A table that did not need it (a mis-tap, a party that never sat): closed as not needed, by name. */
create or replace function public.clean_skip(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j record; me uuid := _clean_me();
begin
  select * into j from _clean_job('table', p_id);
  if j.taken_by is not null and j.taken_by <> me and not _clean_may_assign() then raise exception '% is on it', _clean_name(j.taken_by); end if;
  update table_cleanings set status = 'skipped', done_by = me, done_at = now(), note = coalesce(nullif(left(trim(p_note), 120), ''), 'Not needed') where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

/** Owner or manager: open a job for every table that is paid and left, or not. */
create or replace function public.clean_settings_save(p_tables boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager changes this' using errcode = '42501'; end if;
  update restaurants set table_cleaning = coalesce(p_tables, true) where id = rid;
  return 1;
end $$;

/** Everything the Cleaning board shows: open jobs and today's finished ones, rooms and tables, with every name; the
 *  people a supervisor can give a job to (on duty first); whether this person may assign. */
create or replace function public.clean_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'can_assign', _clean_may_assign(),
    'tables_on', coalesce((select table_cleaning from restaurants where id = rid), true),
    'jobs', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select c.created_at as ts, jsonb_build_object('kind', 'table', 'id', c.id, 'place', coalesce(nullif(c.place, ''), t.name, 'Table'), 'zone', t.zone,
          'what', 'After guests', 'status', c.status, 'note', c.note, 'created_at', c.created_at,
          'assigned_to', c.assigned_to, 'assigned_name', case when c.assigned_to is not null then _clean_name(c.assigned_to) end,
          'assigned_by_name', case when c.assigned_by is not null then _clean_name(c.assigned_by) end, 'assigned_at', c.assigned_at,
          'taken_by', c.taken_by, 'taken_name', case when c.taken_by is not null then _clean_name(c.taken_by) end, 'taken_at', c.taken_at,
          'done_by', c.done_by, 'done_name', case when c.done_by is not null then _clean_name(c.done_by) end, 'done_at', c.done_at) as j
        from table_cleanings c left join dining_tables t on t.id = c.table_id
        where c.restaurant_id = rid and (c.status in ('pending', 'in_progress') or c.done_at >= since)
        union all
        select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'place', coalesce(h.place, r.number::text), 'zone', 'Floor ' || r.floor,
          'what', h.kind, 'status', h.status::text, 'note', h.notes, 'created_at', h.created_at,
          'assigned_to', h.assigned_to, 'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end,
          'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
          'taken_by', h.taken_by, 'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_at', h.taken_at,
          'done_by', h.done_by, 'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_at', h.done_at)
        from housekeeping_tasks h join rooms r on r.id = h.room_id
        where h.restaurant_id = rid and h.kind <> 'maintenance' and (h.status <> 'done' or h.done_at >= since)
      ) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'title', p.position_title, 'dept', p.department,
        'on_duty', exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
        order by p.full_name) from profiles p where p.restaurant_id = rid and p.is_active), '[]'::jsonb)
  );
end $$;

do $$ declare f text; begin
  foreach f in array array['clean_take(text, uuid)', 'clean_done(text, uuid)', 'clean_release(text, uuid)', 'clean_assign(text, uuid, uuid)',
                           'clean_skip(uuid, text)', 'clean_settings_save(boolean)', 'clean_board()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
