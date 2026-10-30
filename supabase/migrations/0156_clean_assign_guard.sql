-- 0156 — Only an owner, manager or supervisor gives a room's cleaning task to someone, on every path (2026-10-30, the
-- owner: "don't show Give to… to all staff — only owner, managers and supervisors").
--
-- The screens already offer Give to… only to owner / manager / supervisor / supervisor 2 (clean_board.can_assign, the
-- Housekeeping page's canInspect, Work's BOSS), and clean_assign, job_add and job_assign_labour already refuse anyone
-- else (_clean_may_assign, 0111 / 0113). table_cleanings and jobs have no write policy for staff at all. But
-- housekeeping_tasks still carries its first policy, `tenant_all` (0002): anyone signed in at the property could
-- `update housekeeping_tasks set assigned_to = …` straight through the API and give a room to anyone — or to themselves.
--
-- Now a BEFORE trigger refuses a change of assigned_to (an UPDATE that moves it, or an INSERT born given to someone)
-- unless the caller may assign. Untouched: Start / Done / Give back (clean_take / clean_done / clean_release change
-- status, not assigned_to), the offline queue's status write, check-out's and the sheet's new tasks (no assignee),
-- inspect_room's re-clean given back to the cleaner (it already requires a supervisor), and anything without a signed-in
-- person (the service role, cron, migrations: auth.uid() is null).
-- No table and no policy are added, so no RLS change; the policy stays as it is — the trigger is the narrower fix.

create or replace function public._hk_assign_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                                       -- service role, cron, migrations
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if tg_op = 'INSERT' and new.assigned_to is null then return new; end if;
  if _clean_may_assign() then return new; end if;
  raise exception 'Only an owner, manager or supervisor gives out jobs' using errcode = '42501';
end $$;
revoke all on function public._hk_assign_guard() from public, anon, authenticated;

drop trigger if exists trg_hk_assign_guard on public.housekeeping_tasks;
create trigger trg_hk_assign_guard before insert or update of assigned_to on public.housekeeping_tasks
  for each row execute function public._hk_assign_guard();

notify pgrst, 'reload schema';
