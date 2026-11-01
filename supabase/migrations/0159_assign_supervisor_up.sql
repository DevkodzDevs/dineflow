-- 0159 — Only a supervisor and above hands out cleaning and work jobs (2026-11-01, the owner, looking at a 2nd-level
-- supervisor's phone: "the assign options are not for housekeeping and cleaning workers — only the supervisor and above").
--
-- _clean_may_assign() was owner / manager / supervisor / supervisor_2. Every place that asks it is a boss's power over other
-- people's jobs: give a job to someone (clean_assign, job_add with an assignee, job_assign_labour, the 0156 guard on
-- housekeeping_tasks.assigned_to), the board's can_assign (Give to…, New job's "Give it to", the person key), and taking,
-- finishing, giving back or skipping a job someone else holds (clean_take / clean_done / clean_release / clean_skip), and
-- dropping a job one did not raise and does not hold (job_cancel). A supervisor_2 now works as their team does: takes,
-- does and gives back their own jobs. Room inspection (Room status Pass / Fail) is not this rule and is unchanged.
--
-- _clean_boss(p_role) (0158) — the ones who give jobs out and never take them (lib/notify.ts CLEAN_BOSSES) — loses
-- supervisor_2 the same way, so _clean_fits, clean_take and clean_auto_assign count a 2nd-level supervisor as their team.

create or replace function public._clean_may_assign() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role()::text in ('owner', 'manager', 'supervisor'), false)
$$;

create or replace function public._clean_boss(p_role text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_role in ('owner', 'manager', 'supervisor'), false) $$;

notify pgrst, 'reload schema';
