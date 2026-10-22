-- 0135 — Leave goes up the ladder (2026-10-23, the owner: "a staff member's leave request goes to their supervisor, a
-- supervisor's to the managers, a manager's to the owner — whichever fits the job position").
--
-- 0127 let any supervisor decide leave for their whole team — another supervisor's (even one above them) included — and a
-- manager decide another manager's. Now one rule, _leave_decides(p_profile), says who may decide (and so who sees the
-- request, and whose bell rings — the bell reads what staff_leave's policy shows):
-- • the owner: anyone's but their own;
-- • a manager: anyone below a manager — not another manager's (the owner decides those);
-- • a supervisor (either rank): staff below both supervisor ranks, in their own team (_my_dept, as before) — not another
--   supervisor's (a manager or the owner decides those);
-- • anyone a person reports to (profiles.reports_to), when the asker ranks below them — a direct line counts.
-- Nobody decides their own. Reads stay: the person their own, and whoever decides. Additive in effect: the owner sees and
-- decides exactly as before; managers and supervisors only lose requests that were never theirs to decide.

create or replace function public._leave_decides(p_profile uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me profiles; them profiles;
begin
  select * into me from profiles where id = auth.uid();
  select * into them from profiles where id = p_profile;
  if me.id is null or them.id is null or me.id = them.id or me.restaurant_id is distinct from them.restaurant_id then return false; end if;
  if role_rank(them.role) >= role_rank(me.role) then return false; end if;              -- only someone above them
  if me.role = 'owner' then return true; end if;
  if them.reports_to = me.id then return true; end if;                                  -- their own line manager
  if me.role = 'manager' then return true; end if;                                      -- anyone below a manager
  if me.role in ('supervisor', 'supervisor_2') then                                    -- staff below every supervisor, in my team
    return role_rank(them.role) < role_rank('supervisor_2') and _my_dept() is not null and _my_dept() = _dept_of(them.id);
  end if;
  return false;
end $$;
revoke all on function public._leave_decides(uuid) from public, anon;
grant execute on function public._leave_decides(uuid) to authenticated;

create or replace function public._leave_mine_to_see(p_profile uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_profile = auth.uid() then return true; end if;
  return _leave_decides(p_profile);
end $$;
revoke all on function public._leave_mine_to_see(uuid) from public, anon;
grant execute on function public._leave_mine_to_see(uuid) to authenticated;

create or replace function public.leave_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l staff_leave;
begin
  select * into l from staff_leave where id = p_id and restaurant_id = auth_restaurant_id() for update;
  if l.id is null then raise exception 'that leave is not here'; end if;
  if l.profile_id = auth.uid() then raise exception 'someone else decides your own leave' using errcode = '42501'; end if;
  if not _leave_decides(l.profile_id) then
    raise exception 'this leave goes to someone above them — their supervisor, a manager or the owner' using errcode = '42501';
  end if;
  if l.status <> 'requested' then raise exception 'this leave has already been decided'; end if;
  update staff_leave set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = l.id;
end $$;
revoke all on function public.leave_decide(uuid, boolean, text) from public, anon;
grant execute on function public.leave_decide(uuid, boolean, text) to authenticated;
