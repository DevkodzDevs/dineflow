-- 0056 · One round trip for everything the shell needs, instead of four.
--
-- Every page render called requireSession(), which asked Supabase for: the user (auth), then the
-- profile and the platform-admin row, then — once the profile named a restaurant — the restaurant and
-- the membership state. Each step waited for the one before it, and the app layout then made a fifth
-- call of its own to count late tickets for the bell badge. Five sequential trips to the database
-- before a single byte of HTML was written, on every navigation, and again on every live refresh.
--
-- session_bundle() answers all of it in one query. It is security definer because it reads
-- platform_admins and admin_context, which a normal member cannot see — but every branch is keyed to
-- auth.uid(), so it can only ever describe the caller: a member gets their own profile and their own
-- property, a master gets the property they opened from Master control, and anyone else gets nulls.

create or replace function session_bundle() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
  -- a master is only ever "acting as" the property it opened; admin_acting_as() joins platform_admins itself
  acting as (select admin_acting_as() as rid),
  target as (
    select coalesce((select restaurant_id from prof), (select rid from acting)) as id
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
    -- a master has no profile row, so its display name comes from the sign-up metadata
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) from prof p),
    'restaurant', (select to_jsonb(r) from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0)
  ) end;
$$;
revoke all on function session_bundle() from public, anon;
grant execute on function session_bundle() to authenticated;

-- ───────── the kitchen's pantry panel, without waiting for the ticket list ─────────
-- kots_needs(uuid[]) had to be handed the ids the page had just fetched, so the two queries ran back
-- to back. With no argument it finds the live tickets itself and both can go at once.
create or replace function kots_needs_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select kots_needs(coalesce(array(
    select k.id from kots k
    where k.restaurant_id = auth_restaurant_id() and k.status in ('pending', 'preparing', 'ready')
  ), '{}'::uuid[]));
$$;
revoke all on function kots_needs_live() from public, anon;
grant execute on function kots_needs_live() to authenticated;
