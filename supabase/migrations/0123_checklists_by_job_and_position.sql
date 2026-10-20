-- 0123 · Checklists by job and position, not only by team (2026-10-20)
--
-- The owner, on 0122: "front desk was just an example — the lists should follow each person's job and position".
-- A team (0122's departments) is too coarse on its own: a captain and a steward are both Service, a commis and the
-- chef both Kitchen, a gardener and an electrician both Engineering. So a list can now also be for
--
--  1. jobs text[]      — the job a person is signed in as: their role key (waiter, chef, cashier, frontdesk,
--                        housekeeping, store, employee, supervisor_2 …; packages/shared constants.ts ROLE_LABEL).
--  2. positions text[] — their position on the staff chart: profiles.position (captain, commis_2, gardener …;
--                        packages/shared positions.ts POSITIONS).
--
-- A list is for someone when all three are empty (everyone — every list until today), or their team is in
-- departments, or their job is in jobs, or their position is in positions. The owner, managers and supervisors still
-- see every list, and a second-level supervisor with no team still does (as on Work). RLS on checklists (and through
-- it on checklist_runs) and checklist_tick use the new rule; checklist_save gains an eight-argument form. The five-
-- and six-argument saves the deployed screens call are left as they are: they never touch jobs or positions, so a
-- save from an older screen keeps the audience the list already had.

alter table public.checklists add column if not exists jobs text[] not null default '{}';
alter table public.checklists add column if not exists positions text[] not null default '{}';

/** Is a list with this audience for the caller? (RLS and checklist_tick.) */
create or replace function public._checklist_for_me(p_departments text[], p_jobs text[], p_positions text[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := auth_role()::text; d text; pos text;
begin
  if coalesce(array_length(p_departments, 1), 0) = 0 and coalesce(array_length(p_jobs, 1), 0) = 0
     and coalesce(array_length(p_positions, 1), 0) = 0 then return true; end if;
  if r in ('owner', 'manager', 'supervisor') then return true; end if;
  d := _my_dept();
  if r = 'supervisor_2' and d is null then return true; end if;
  select p.position into pos from profiles p where p.id = auth.uid();
  return (d is not null and d = any(coalesce(p_departments, '{}')))
      or (r is not null and r = any(coalesce(p_jobs, '{}')))
      or (pos is not null and pos = any(coalesce(p_positions, '{}')));
end $$;
revoke all on function public._checklist_for_me(text[], text[], text[]) from public, anon;
grant execute on function public._checklist_for_me(text[], text[], text[]) to authenticated;

drop policy if exists checklists_read on public.checklists;
create policy checklists_read on public.checklists for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _checklist_for_me(departments, jobs, positions));

/** Write a list with who it is for, by team, job and position (owner, manager or supervisor). All three empty or null
 *  = everyone. The duties, the name and the team go through 0122's six-argument save, which checks them. */
create or replace function public.checklist_save(p_id uuid, p_name text, p_shift text, p_items text[], p_active boolean,
  p_departments text[], p_jobs text[], p_positions text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); cid uuid; js text[]; ps text[];
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'only the owner, a manager or a supervisor can change the lists' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into js from unnest(coalesce(p_jobs, '{}'::text[])) x where length(trim(x)) > 0;
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into ps from unnest(coalesce(p_positions, '{}'::text[])) x where length(trim(x)) > 0;
  if exists (select 1 from unnest(js) x where x !~ '^[a-z][a-z0-9_]{1,39}$') then raise exception 'that is not a job'; end if;
  if exists (select 1 from unnest(ps) x where x !~ '^[a-z][a-z0-9_]{1,39}$') then raise exception 'that is not a position'; end if;
  if coalesce(array_length(js, 1), 0) > 20 then raise exception 'at most 20 jobs'; end if;
  if coalesce(array_length(ps, 1), 0) > 60 then raise exception 'at most 60 positions'; end if;
  cid := checklist_save(p_id, p_name, p_shift, p_items, p_active, p_departments);
  update checklists set jobs = js, positions = ps where id = cid and restaurant_id = rid;
  return cid;
end $$;
revoke all on function public.checklist_save(uuid, text, text, text[], boolean, text[], text[], text[]) from public, anon;
grant execute on function public.checklist_save(uuid, text, text, text[], boolean, text[], text[], text[]) to authenticated, service_role;

/** 0122's tick, refusing a list that is not for the caller's team, job or position. */
create or replace function public.checklist_tick(p_checklist uuid, p_item int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c checklists; today date := (now() at time zone 'Asia/Kolkata')::date; r checklist_runs; who text; len int;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from checklists where id = p_checklist and restaurant_id = rid and is_active;
  if c.id is null then raise exception 'that list is not here'; end if;
  if not _checklist_for_me(c.departments, c.jobs, c.positions) then raise exception 'that list is for someone else' using errcode = '42501'; end if;
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
