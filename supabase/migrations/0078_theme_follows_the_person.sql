-- 0078 · A person's theme follows them, not the browser.
--
-- The light/dark choice lived only in a cookie, so it was per browser: a phone and a laptop signed in
-- as the same person disagreed, a fresh sign-in started over, and nothing on the server knew what the
-- person had chosen. It now lives here, one row per login — staff and masters alike (a master has no
-- profiles row, which is why this is its own table and not a column on profiles). No row means "not
-- chosen yet", and the app follows the device.
--
-- Reads come back in session_bundle (no extra round trip); writes go through set_my_theme, which only
-- ever touches the caller's own row.

create table if not exists user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  theme      text not null check (theme in ('dark', 'paper', 'system')),
  updated_at timestamptz not null default now()
);
-- user_id is the primary key, so the foreign key is already indexed (see 0075).

alter table user_prefs enable row level security;
drop policy if exists user_prefs_read_own on user_prefs;
create policy user_prefs_read_own on user_prefs for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policy: the browser does not write tables; set_my_theme does.

create or replace function set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_theme is null or p_theme not in ('dark', 'paper', 'system') then raise exception 'unknown theme: %', p_theme; end if;
  insert into user_prefs (user_id, theme, updated_at) values (auth.uid(), p_theme, now())
  on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
end;
$$;
revoke all on function set_my_theme(text) from public, anon;
grant execute on function set_my_theme(text) to authenticated;

-- session_bundle as in 0056, plus 'theme': the caller's saved choice, or null.
create or replace function session_bundle() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
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
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) from prof p),
    'restaurant', (select to_jsonb(r) from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid)
  ) end;
$$;
revoke all on function session_bundle() from public, anon;
grant execute on function session_bundle() to authenticated;
