-- 0107 · Job positions for staff, and staff screens that follow the outlet (2026-10-17).
--
-- 1. Positions. A person's ROLE decides which screens they may open; their POSITION says what they are — "Sous Chef"
--    in the Kitchen, "Front Office Manager", "Commis II". The catalogue (departments, titles, the seven levels from
--    Leadership to Trainee) lives in packages/shared/src/positions.ts; the database keeps the key, a title of the
--    owner's own when the catalogue's does not fit, the department, who they report to, and when they joined.
--    staff_set_position() changes them with the same who-may-change-whom rule as owner_set_access().
--
-- 2. acting_profile() reported the person's HOME outlet as restaurant_id. Eight staff functions (create_invite,
--    staff_create_login, owner_set_access, staff_login_details, staff_reset_password, staff_request_contact_otp,
--    staff_verify_contact, effective_modules) compare people by it, so since 0106 an owner working in a second outlet
--    would have invited into, created logins in, or been refused by, the wrong outlet. It now reports the outlet this
--    sign-in is working in (auth_restaurant_id()), which is the property the rest of the database already uses.
--    No table policy changes; the new columns sit on profiles, whose existing policies already cover them.

alter table public.profiles add column if not exists position text;
alter table public.profiles add column if not exists position_title text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists reports_to uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists joined_on date;
create index if not exists profiles_reports_to_idx on public.profiles (reports_to) where reports_to is not null;

CREATE OR REPLACE FUNCTION public.acting_profile()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me profiles; rid uuid;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is not null then
    -- the outlet this sign-in is working in (0106) — their own unless they switched to another they may open
    me.restaurant_id := coalesce(auth_restaurant_id(), me.restaurant_id);
    return me;
  end if;

  -- admin_acting_as() joins platform_admins itself, so this cannot be forged by a member
  rid := admin_acting_as();
  if rid is null then return null; end if;

  me.id             := auth.uid();
  me.restaurant_id  := rid;
  me.full_name      := 'Master control';
  me.role           := 'owner';        -- inside the property it opened, a master acts as its owner
  me.is_active      := true;
  me.allowed_modules := null;
  return me;
end $function$;

/** A person's position, title, department, manager and joining date. The caller must be able to manage people
 *  (supervisor 2nd level and up) and rank above the person — or be the owner, who may also set their own. The
 *  manager they report to must be on the same outlet, and the chain must not loop. Keys are checked for shape here;
 *  the app offers only the catalogue's, and a title of the owner's own is kept beside it. */
create or replace function public.staff_set_position(p_user uuid, p_position text, p_department text, p_title text, p_reports_to uuid, p_joined_on date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; boss profiles; cur uuid; hops int := 0;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property' using errcode = '42501'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people' using errcode = '42501'; end if;
  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.id = me.id and me.role <> 'owner' then raise exception 'ask someone above you to change your position'; end if;
  if target.id <> me.id and me.role <> 'owner' and role_rank(target.role) >= role_rank(me.role) then
    raise exception 'you cannot change someone at or above your own level' using errcode = '42501';
  end if;
  if p_position is not null and p_position !~ '^[a-z0-9_]{2,40}$' then raise exception 'that position is not one we know'; end if;
  if p_department is not null and p_department !~ '^[a-z_]{2,30}$' then raise exception 'that department is not one we know'; end if;
  if p_joined_on is not null and (p_joined_on > (now() at time zone 'Asia/Kolkata')::date or p_joined_on < date '1950-01-01') then raise exception 'the joining date is not right'; end if;
  if p_reports_to is not null then
    if p_reports_to = target.id then raise exception 'someone cannot report to themselves'; end if;
    select * into boss from profiles where id = p_reports_to and restaurant_id = me.restaurant_id;
    if boss.id is null then raise exception 'the person they report to is not on this outlet'; end if;
    -- no loops: walking up from the new manager must never reach this person
    cur := boss.reports_to;
    while cur is not null and hops < 50 loop
      if cur = target.id then raise exception 'that would make a loop — % already reports to them', boss.full_name; end if;
      select reports_to into cur from profiles where id = cur; hops := hops + 1;
    end loop;
  end if;
  update profiles set position = p_position, department = p_department, position_title = nullif(left(trim(coalesce(p_title, '')), 60), ''),
         reports_to = p_reports_to, joined_on = p_joined_on
   where id = target.id;
  return 1;
end $$;
revoke all on function public.staff_set_position(uuid, text, text, text, uuid, date) from public, anon;
grant execute on function public.staff_set_position(uuid, text, text, text, uuid, date) to authenticated, service_role;
