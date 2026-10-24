-- 0138 — Assist (the AI) is for the top three ranks, and whoever the owner or a manager gives it to (2026-10-24, the owner: "don't
-- show the AI for every login — the top three, and others only when the owner or a manager gives access").
--
-- • profiles.assist_access (default false) — the switch on one person.
-- • _assist_allowed(me) — owner, manager and supervisor (role_rank 60 and up) always; anyone else with the switch on.
-- • staff_set_assist(p_user, p_on) — the owner for anyone at the property; a manager for someone below a manager.
-- • session_bundle carries assist_access, so the layout can leave the button out and /api/assist can refuse.
-- Additive: one column, two functions, session_bundle rebuilt from its live definition with the one column added.

alter table public.profiles add column if not exists assist_access boolean not null default false;

create or replace function public._assist_allowed(me profiles)
returns boolean language sql stable set search_path = public as $$
  select me.id is not null and (role_rank(me.role) >= 60 or coalesce(me.assist_access, false));
$$;
revoke all on function public._assist_allowed(profiles) from public, anon;
grant execute on function public._assist_allowed(profiles) to authenticated;

create or replace function public.staff_set_assist(p_user uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare me profiles; t profiles;
begin
  me := acting_profile();
  if me.id is null or me.role not in ('owner', 'manager') then raise exception 'Only the owner or a manager can give Assist.' using errcode = '42501'; end if;
  select * into t from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if t.id is null then raise exception 'not a member of this property'; end if;
  if me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role) then raise exception 'You cannot change Assist for someone at your level or above.' using errcode = '42501'; end if;
  update profiles set assist_access = coalesce(p_on, false) where id = t.id;
  return coalesce(p_on, false);
end $$;
revoke all on function public.staff_set_assist(uuid, boolean) from public, anon;
grant execute on function public.staff_set_assist(uuid, boolean) to authenticated;

-- session_bundle, rebuilt from the live definition with assist_access in the profile
CREATE OR REPLACE FUNCTION public.session_bundle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until, p.department, p.position, p.assist_access
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
  acting as (select admin_acting_as() as rid),
  cur as (select case when (select is_active from prof) then _outlet_current() end as rid),
  target as (
    select coalesce((select rid from cur), (select restaurant_id from prof), (select rid from acting)) as id
  ),
  rest as (select r.* from restaurants r, target t where r.id = t.id),
  late as (
    select count(*)::int as c
    from kots k, target t
    where k.restaurant_id = t.id and k.status in ('pending', 'preparing')
      and k.created_at < now() - interval '15 minutes'
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'user_id',    (select uid from me),
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) || jsonb_build_object('restaurant_id', (select id from target), 'home_restaurant_id', p.restaurant_id) from prof p),
    'restaurant', (select to_jsonb(r) - 'box_token' - 'screen_key' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid),
    'outlets',    case when exists (select 1 from outlet_access oa, me where oa.user_id = me.uid) then my_outlets() else '[]'::jsonb end
  ) end;
$function$;
