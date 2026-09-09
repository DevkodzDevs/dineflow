-- DineFlow v11.0 — one built-in Master login that goes everywhere.
-- Created automatically; no sign-up, no invite code. Normal sign-up and login are untouched.
-- Run AFTER 0010 (works on the cloud and on a Box).
--
--   email     master@dineflow.in
--   password  DineFlow@Master2026        ← change it before going live (Master control → Change master password)

create extension if not exists pgcrypto;

-- ═══════════ 1. the account itself ═══════════
do $$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'master@dineflow.in';
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'master@dineflow.in',
            crypt('DineFlow@Master2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"DineFlow Master"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'master@dineflow.in', 'email_verified', true), 'email', now(), now(), now());
  end if;
  insert into platform_admins(user_id, label) values (uid, 'master') on conflict (user_id) do nothing;
end $$;

-- ═══════════ 2. "act as" any property ═══════════
create table if not exists admin_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table admin_context enable row level security;
drop policy if exists self on admin_context; create policy self on admin_context for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every policy, trigger and RPC keys off these two. A platform admin with no profile of their own
-- resolves to the property they chose in Master control, as its owner.
create or replace function auth_restaurant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select restaurant_id from profiles where id = auth.uid()),
    (select c.restaurant_id from admin_context c join platform_admins p on p.user_id = c.user_id where c.user_id = auth.uid())
  )
$$;
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()),
    (select 'owner'::user_role from platform_admins where user_id = auth.uid())
  )
$$;

create or replace function admin_act_as(p_restaurant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), p_restaurant)
  on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  insert into admin_log(actor, action, target) values (auth.uid(), 'act_as', p_restaurant);
end $$;
create or replace function admin_stop_acting() returns void
language sql security definer set search_path = public as $$
  delete from admin_context where user_id = auth.uid()
$$;
create or replace function admin_acting_as() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from admin_context where user_id = auth.uid()
$$;

-- ═══════════ 3. change the master password from inside the app ═══════════
create or replace function master_set_password(p_new text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  if length(p_new) < 10 then raise exception 'use at least 10 characters'; end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now() where id = auth.uid();
  insert into admin_log(actor, action) values (auth.uid(), 'password_changed');
end $$;

-- Master should be able to write anywhere while acting: every tenant policy's WITH CHECK
-- already compares to auth_restaurant_id(), which now resolves for the master. Nothing else to do.
