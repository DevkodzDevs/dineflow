-- 0127 · Leave, and a person's own payslips (2026-10-20)
--
-- The owner: "when a staff member signs in, straight to their own dashboard — work, assignments, attendance, leave,
-- salary". My day (/home) reads what already exists (jobs, checklists, staff_attendance, staff_pay, staff_advances,
-- payroll_lines — each already readable by the person for their own rows). Two things did not exist:
--
--  1. **Leave.** `staff_leave`: a person asks (`leave_request`), may withdraw (`leave_cancel`), and the owner or a
--     manager — or a supervisor, for their own team only (the team rule is _my_dept()'s, 0116) — decides
--     (`leave_decide`). Reads: a person their own; the owner and managers the whole property's; a supervisor their
--     team's. Writes only through the functions.
--  2. **A person's own payslips.** `payroll_lines` is readable to the person once its run is final (0106), but the
--     month lives on `payroll_runs`, which staff cannot read. `my_payslips()` returns the caller's own final lines with
--     their month — nobody else's.

create table if not exists public.staff_leave (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  days numeric(5,1) not null,
  kind text not null default 'casual' check (kind in ('casual', 'sick', 'earned', 'unpaid', 'other')),
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index if not exists staff_leave_person_idx on public.staff_leave(profile_id, from_date desc);
create index if not exists staff_leave_property_idx on public.staff_leave(restaurant_id, status, from_date);
alter table public.staff_leave enable row level security;
revoke insert, update, delete on public.staff_leave from authenticated, anon;

/** A profile's team: the one set on them, else their role's — the rule _my_dept() applies to the caller (0116). */
create or replace function public._dept_of(p_profile uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(p.department, case p.role::text when 'housekeeping' then 'housekeeping' when 'waiter' then 'service' when 'cashier' then 'service'
    when 'chef' then 'kitchen' when 'frontdesk' then 'front_office' when 'store' then 'stores' end)
  from profiles p where p.id = p_profile $$;
revoke all on function public._dept_of(uuid) from public, anon, authenticated;

/** May the caller see / decide this person's leave? The person, the owner and managers, or a supervisor of their team. */
create or replace function public._leave_mine_to_see(p_profile uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := auth_role()::text; d text;
begin
  if p_profile = auth.uid() then return true; end if;
  if r in ('owner', 'manager') then return true; end if;
  if r in ('supervisor', 'supervisor_2') then d := _my_dept(); return d is not null and d = _dept_of(p_profile); end if;
  return false;
end $$;
revoke all on function public._leave_mine_to_see(uuid) from public, anon;
grant execute on function public._leave_mine_to_see(uuid) to authenticated;

drop policy if exists staff_leave_read on public.staff_leave;
create policy staff_leave_read on public.staff_leave for select to authenticated
  using (restaurant_id = auth_restaurant_id() and _leave_mine_to_see(profile_id));

/** Ask for leave (any active member of staff, for themselves). */
create or replace function public.leave_request(p_from date, p_to date, p_kind text, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); me profiles; today date := (now() at time zone 'Asia/Kolkata')::date; lid uuid;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into me from profiles where id = auth.uid() and restaurant_id = rid;
  if me.id is null or not coalesce(me.is_active, true) then raise exception 'only the staff of this property can ask for leave' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'pick a first and a last day — the last on or after the first'; end if;
  if p_from < today - 7 then raise exception 'leave can start at most a week back'; end if;
  if p_from > today + 365 then raise exception 'leave can be asked at most a year ahead'; end if;
  if p_to - p_from + 1 > 60 then raise exception 'at most 60 days at a time'; end if;
  if coalesce(p_kind, '') not in ('casual', 'sick', 'earned', 'unpaid', 'other') then raise exception 'that is not a kind of leave'; end if;
  if exists (select 1 from staff_leave where profile_id = me.id and status in ('requested', 'approved') and from_date <= p_to and to_date >= p_from) then
    raise exception 'you already have leave asked or given for some of those days';
  end if;
  if (select count(*) from staff_leave where profile_id = me.id and created_at > now() - interval '1 day') >= 10 then raise exception 'too many requests today — try tomorrow'; end if;
  insert into staff_leave (restaurant_id, profile_id, from_date, to_date, days, kind, reason)
  values (rid, me.id, p_from, p_to, p_to - p_from + 1, p_kind, nullif(left(trim(coalesce(p_reason, '')), 500), ''))
  returning id into lid;
  return lid;
end $$;
revoke all on function public.leave_request(date, date, text, text) from public, anon;
grant execute on function public.leave_request(date, date, text, text) to authenticated;

/** Withdraw one's own request — while it waits, or an approved leave that has not started. */
create or replace function public.leave_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l staff_leave; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into l from staff_leave where id = p_id and profile_id = auth.uid() and restaurant_id = auth_restaurant_id() for update;
  if l.id is null then raise exception 'that leave is not yours' using errcode = '42501'; end if;
  if not (l.status = 'requested' or (l.status = 'approved' and l.from_date > today)) then raise exception 'this leave can no longer be withdrawn — ask your manager'; end if;
  update staff_leave set status = 'cancelled' where id = l.id;
end $$;
revoke all on function public.leave_cancel(uuid) from public, anon;
grant execute on function public.leave_cancel(uuid) to authenticated;

/** Approve or refuse (the owner, a manager, or a supervisor of the person's team — never one's own). */
create or replace function public.leave_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l staff_leave; r text := auth_role()::text;
begin
  select * into l from staff_leave where id = p_id and restaurant_id = auth_restaurant_id() for update;
  if l.id is null then raise exception 'that leave is not here'; end if;
  if l.profile_id = auth.uid() then raise exception 'someone else decides your own leave' using errcode = '42501'; end if;
  if not (r in ('owner', 'manager') or (r in ('supervisor', 'supervisor_2') and _my_dept() is not null and _my_dept() = _dept_of(l.profile_id))) then
    raise exception 'only the owner, a manager or their team''s supervisor can decide leave' using errcode = '42501';
  end if;
  if l.status <> 'requested' then raise exception 'this leave has already been decided'; end if;
  update staff_leave set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = l.id;
end $$;
revoke all on function public.leave_decide(uuid, boolean, text) from public, anon;
grant execute on function public.leave_decide(uuid, boolean, text) to authenticated;

/** The caller's own finalised payslips, newest first, with their month (payroll_runs is not readable to staff). */
create or replace function public.my_payslips(p_limit int default 12) returns table (
  id uuid, month date, basis text, rate numeric, days_in_month int, days_present int, paid_days numeric, gross numeric, bonus numeric,
  pf_employee numeric, esi_employee numeric, advances numeric, other_deduction numeric, net numeric, pf_employer numeric, esi_employer numeric,
  pf_wage numeric, paid_at timestamptz, paid_method text, wage_rule boolean)
language sql stable security definer set search_path = public as $$
  select l.id, r.month, l.basis, l.rate, l.days_in_month, l.days_present, l.paid_days, l.gross, l.bonus, l.pf_employee, l.esi_employee,
         l.advances, l.other_deduction, l.net, l.pf_employer, l.esi_employer, l.pf_wage, l.paid_at, l.paid_method, r.wage_rule
    from payroll_lines l join payroll_runs r on r.id = l.run_id
   where l.profile_id = auth.uid() and l.restaurant_id = auth_restaurant_id() and r.status = 'final'
   order by r.month desc limit least(greatest(coalesce(p_limit, 12), 1), 36) $$;
revoke all on function public.my_payslips(int) from public, anon;
grant execute on function public.my_payslips(int) to authenticated;

do $$ begin alter publication supabase_realtime add table public.staff_leave; exception when others then null; end $$;
