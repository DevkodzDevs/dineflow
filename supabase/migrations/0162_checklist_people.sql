-- 0162 · Checklists per person, set from the Staff screen (2026-11-02)
--
-- The owner: "when the owner or a manager adds or updates a staff member, set the checklists that person handles — by
-- default from their job position, and the manager can change it." A list's audience (0122 teams, 0123 jobs and
-- positions) stays the default. On top of it each list now keeps two short lists of people:
--
--  1. people uuid[]     — given this list although their team, job and position are not in its audience;
--  2. people_off uuid[] — taken off this list although their team, job or position is (an "Everyone" list too).
--
-- staff_checklists_set(profile, lists) writes them for one person from the set of active lists the screen ticked: a list
-- the position already gives them is stored as nothing, a difference as one entry. A null set puts the person back on
-- their position's lists (both entries cleared). The owner and managers only. The owner, managers and supervisors still
-- see every list (they write them), so nothing is stored for them. RLS (and, through it, checklist_runs) and
-- checklist_tick read the new rule; checklist_save never touches the two columns, so editing a list keeps them.

alter table public.checklists add column if not exists people uuid[] not null default '{}';
alter table public.checklists add column if not exists people_off uuid[] not null default '{}';

/** Is a list with this audience one of this person's by default — their team, job or position, or everyone? The same
 *  rule as 0123's _checklist_for_me, for any person of the property (not only the caller). */
create or replace function public._checklist_default(p_profile uuid, p_departments text[], p_jobs text[], p_positions text[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text; d text; pos text;
begin
  if coalesce(array_length(p_departments, 1), 0) = 0 and coalesce(array_length(p_jobs, 1), 0) = 0
     and coalesce(array_length(p_positions, 1), 0) = 0 then return true; end if;
  select p.role::text, coalesce(p.department, case p.role::text when 'housekeeping' then 'housekeeping' when 'waiter' then 'service'
           when 'cashier' then 'service' when 'chef' then 'kitchen' when 'frontdesk' then 'front_office' when 'store' then 'stores' end), p.position
    into r, d, pos from profiles p where p.id = p_profile;
  return (d is not null and d = any(coalesce(p_departments, '{}')))
      or (r is not null and r = any(coalesce(p_jobs, '{}')))
      or (pos is not null and pos = any(coalesce(p_positions, '{}')));
end $$;
revoke all on function public._checklist_default(uuid, text[], text[], text[]) from public, anon;
grant execute on function public._checklist_default(uuid, text[], text[], text[]) to authenticated;

/** Is this list for the caller: the bosses see every list; taken off → no; given it → yes; else 0123's rule. */
create or replace function public._checklist_for_me(p_departments text[], p_jobs text[], p_positions text[], p_people uuid[], p_off uuid[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if auth_role()::text in ('owner', 'manager', 'supervisor') then return true; end if;
  if me is not null and me = any(coalesce(p_off, '{}')) then return false; end if;
  if me is not null and me = any(coalesce(p_people, '{}')) then return true; end if;
  return _checklist_for_me(p_departments, p_jobs, p_positions);
end $$;
revoke all on function public._checklist_for_me(text[], text[], text[], uuid[], uuid[]) from public, anon;
grant execute on function public._checklist_for_me(text[], text[], text[], uuid[], uuid[]) to authenticated;

drop policy if exists checklists_read on public.checklists;
create policy checklists_read on public.checklists for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _checklist_for_me(departments, jobs, positions, people, people_off));

/** 0123's tick, with the per-person rule. */
create or replace function public.checklist_tick(p_checklist uuid, p_item int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c checklists; today date := (now() at time zone 'Asia/Kolkata')::date; r checklist_runs; who text; len int;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from checklists where id = p_checklist and restaurant_id = rid and is_active;
  if c.id is null then raise exception 'that list is not here'; end if;
  if not _checklist_for_me(c.departments, c.jobs, c.positions, c.people, c.people_off) then raise exception 'that list is for someone else' using errcode = '42501'; end if;
  len := coalesce(array_length(c.items, 1), 0);
  if p_item is null or p_item < 0 or p_item >= len then raise exception 'no such duty'; end if;
  select full_name into who from profiles where id = auth.uid();
  insert into checklist_runs (restaurant_id, checklist_id, run_date) values (rid, c.id, today)
    on conflict (checklist_id, run_date) do nothing;
  select * into r from checklist_runs where checklist_id = c.id and run_date = today for update;
  if p_done then
    r.done := r.done || jsonb_build_object(p_item::text, jsonb_build_object('by', auth.uid(), 'name', coalesce(who, 'Staff'), 'at', now()));
  else
    r.done := r.done - p_item::text;
  end if;
  update checklist_runs set done = r.done,
         completed_at = case when _checklist_ticked(r.done, len) >= len then coalesce(completed_at, now()) else null end
   where id = r.id returning * into r;
  return jsonb_build_object('done', r.done, 'completed_at', r.completed_at);
end $$;
revoke all on function public.checklist_tick(uuid, int, boolean) from public, anon;
grant execute on function public.checklist_tick(uuid, int, boolean) to authenticated, service_role;

/** The lists one person handles (owner or manager): `p_on` = the active lists ticked for them; null = their position's
 *  lists again. Returns how many lists now differ from the position. Inactive lists are left as they are. */
create or replace function public.staff_checklists_set(p_profile uuid, p_on uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); prole text; n integer;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager sets someone''s checklists' using errcode = '42501'; end if;
  select role::text into prole from profiles where id = p_profile and restaurant_id = rid;
  if prole is null then raise exception 'that person is not here'; end if;
  if prole in ('owner', 'manager', 'supervisor') then raise exception 'owners, managers and supervisors see every list'; end if;
  if p_on is not null and exists (select 1 from unnest(p_on) x where not exists (select 1 from checklists c where c.id = x and c.restaurant_id = rid))
    then raise exception 'that list is not here'; end if;
  update checklists c
     set people = array_remove(c.people, p_profile)
                  || case when p_on is not null and c.id = any(p_on) and not _checklist_default(p_profile, c.departments, c.jobs, c.positions)
                          then array[p_profile] else '{}'::uuid[] end,
         people_off = array_remove(c.people_off, p_profile)
                  || case when p_on is not null and not (c.id = any(p_on)) and _checklist_default(p_profile, c.departments, c.jobs, c.positions)
                          then array[p_profile] else '{}'::uuid[] end
   where c.restaurant_id = rid and c.is_active;
  select count(*) into n from checklists c where c.restaurant_id = rid and (p_profile = any(c.people) or p_profile = any(c.people_off));
  return n;
end $$;
revoke all on function public.staff_checklists_set(uuid, uuid[]) from public, anon;
grant execute on function public.staff_checklists_set(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
