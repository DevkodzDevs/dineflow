-- 0122 · Each person sees the checklists for their own job (2026-10-20)
--
-- The owner's "don't show every checklist to every person — a front-desk person sees only the front-desk lists".
--
--  1. checklists.departments text[] — who the list is for, by department key (packages/shared positions.ts:
--     front_office, kitchen, service, housekeeping, …). Empty = everyone, which every list written before today is,
--     so nothing anyone sees changes until the owner says who a list is for.
--  2. A person's department is _my_dept() (0116): their position's, else their role's (frontdesk → front_office,
--     chef → kitchen, waiter/cashier → service, housekeeping, store → stores) — the same rule the Work board uses.
--  3. Who sees a list (RLS on checklists, and through it on checklist_runs): the owner, managers and supervisors
--     (they write the lists) see every one; a second-level supervisor with no department sees every one (as on
--     Work); everyone else sees the lists for everyone and the lists for their department.
--  4. checklist_tick refuses a list that is not for the caller; checklist_save gains a sixth argument, the
--     departments. The five-argument checklist_save the deployed screens call is left as it is — it never touches
--     departments, so saving from an older screen keeps the audience the list already had.

alter table public.checklists add column if not exists departments text[] not null default '{}';

/** Is a list with this audience for the caller? (RLS and checklist_tick.) */
create or replace function public._checklist_for_me(p_departments text[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := auth_role()::text; d text;
begin
  if coalesce(array_length(p_departments, 1), 0) = 0 then return true; end if;
  if r in ('owner', 'manager', 'supervisor') then return true; end if;
  d := _my_dept();
  if r = 'supervisor_2' and d is null then return true; end if;
  return d is not null and d = any(p_departments);
end $$;
revoke all on function public._checklist_for_me(text[]) from public, anon;
grant execute on function public._checklist_for_me(text[]) to authenticated;

drop policy if exists checklists_read on public.checklists;
create policy checklists_read on public.checklists for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _checklist_for_me(departments));

-- a run is read only alongside a list the caller may see (the subquery is itself under checklists_read)
drop policy if exists checklist_runs_read on public.checklist_runs;
create policy checklist_runs_read on public.checklist_runs for select to authenticated
  using (restaurant_id = auth_restaurant_id() and exists (select 1 from checklists c where c.id = checklist_id));

/** Write a list with who it is for (owner, manager or supervisor). `p_departments` empty or null = everyone. */
create or replace function public.checklist_save(p_id uuid, p_name text, p_shift text, p_items text[], p_active boolean, p_departments text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); cid uuid; deps text[];
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'only the owner, a manager or a supervisor can change the lists' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into deps
    from unnest(coalesce(p_departments, '{}'::text[])) x where length(trim(x)) > 0;
  if exists (select 1 from unnest(deps) x where x !~ '^[a-z_]{2,40}$') then raise exception 'that is not a department'; end if;
  if coalesce(array_length(deps, 1), 0) > 20 then raise exception 'at most 20 departments'; end if;
  -- the duties, the name and today's run go through the 0108 function, which checks all of them
  cid := checklist_save(p_id, p_name, p_shift, p_items, p_active);
  update checklists set departments = deps where id = cid and restaurant_id = rid;
  return cid;
end $$;
revoke all on function public.checklist_save(uuid, text, text, text[], boolean, text[]) from public, anon;
grant execute on function public.checklist_save(uuid, text, text, text[], boolean, text[]) to authenticated, service_role;

/** 0108's tick, refusing a list that is for another department. */
create or replace function public.checklist_tick(p_checklist uuid, p_item int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c checklists; today date := (now() at time zone 'Asia/Kolkata')::date; r checklist_runs; who text; len int;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from checklists where id = p_checklist and restaurant_id = rid and is_active;
  if c.id is null then raise exception 'that list is not here'; end if;
  if not _checklist_for_me(c.departments) then raise exception 'that list is for another department' using errcode = '42501'; end if;
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
