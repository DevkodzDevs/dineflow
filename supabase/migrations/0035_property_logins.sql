-- ═══════════ Every property gets its own login ═══════════
--
-- Until now no property had a user of its own. auth_restaurant_id() falls back to admin_context for
-- a platform admin, so every sign-in was Master control and every sign-in showed whichever property
-- Master control happened to be standing in. That is why the same data appeared for everyone: not a
-- leak between tenants, but the absence of tenants. A user who is not a platform admin and has no
-- profile cannot get in at all — requireSession sends them to /join.
--
-- This adds the missing piece. Master control creates a property together with an owner login: a
-- unique user id (the email typed at the sign-in screen) and a temporary password shown once. The
-- owner signs in with it and is made to choose a real password before anything else opens. From
-- then on that account sees only its own property, because it has a profile and profiles win over
-- admin_context in auth_restaurant_id().
--
-- Demo data is untouched by any of this and stays where it is, on Tan Resort and manoooo.

alter table profiles add column if not exists must_change_password boolean not null default false;

-- ── pgcrypto lives in the extensions schema on Supabase ──────────────────────────────────────
-- demo_user() hashes with crypt() but declares `set search_path = public, auth`, so crypt() is
-- invisible to it and creating a sample login fails the same way period_hash did. Same fix.
alter function demo_user(text, text, text) set search_path = public, auth, extensions;

-- ── a temporary password a human can read down a phone line ──────────────────────────────────
create or replace function gen_temp_password() returns text
language sql volatile set search_path = public, extensions as $$
  select 'Dine'
      || (array['Fox','Sky','Bay','Palm','Reef','Dune','Kite','Sail','Moon','Fern'])[1 + floor(random() * 10)]
      || lpad(floor(random() * 10000)::int::text, 4, '0')
      || (array['!','#','@','$','%'])[1 + floor(random() * 5)]
$$;
revoke all on function gen_temp_password() from public, anon, authenticated, service_role;

-- ── create a Supabase auth user directly, already confirmed ──────────────────────────────────
-- Going through GoTrue would need a service-role key in the browser. The rows below are the ones
-- GoTrue itself writes for an email/password signup; email_confirmed_at is set so there is no
-- confirmation mail to chase for an account the operator is handing over in person.
create or replace function admin_new_login(p_email text, p_password text, p_name text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is not null then raise exception 'a user with the id % already exists', p_email; end if;
  uid := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower(p_email),
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true),
          'email', now(), now(), now());
  return uid;
end $$;
revoke all on function admin_new_login(text, text, text) from public, anon, authenticated, service_role;

-- ── Master control: create the property AND the login that owns it ───────────────────────────
-- The three-argument form is dropped rather than left beside this one: keeping both would make
-- admin_create_property('name','resort',false) ambiguous.
drop function if exists admin_create_property(text, property_type, boolean);

create or replace function admin_create_property(
  p_name        text,
  p_type        property_type default 'resort',
  p_demo        boolean       default false,   -- sample content; a new property is empty without it
  p_owner_email text          default null,    -- the id the owner signs in with; generated if blank
  p_owner_name  text          default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rid uuid; v_slug text; n int := 0; seeded boolean := false; seed_error text := null;
  login_email text; temp_pw text; uid uuid; owner_name text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'property'; end if;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop
    n := n + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || n;
  end loop;

  -- the sign-in id: whatever the operator typed, or one built from the property name
  login_email := lower(nullif(trim(coalesce(p_owner_email, '')), ''));
  if login_email is null then login_email := v_slug || '@dineflow.local'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email) then
    raise exception 'The user id % is already taken. Enter a different email for the owner.', login_email;
  end if;
  owner_name := coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), p_name || ' owner');

  insert into restaurants(name, slug, property_type, booking_slug)
    values (p_name, v_slug, p_type, v_slug) returning id into rid;

  temp_pw := gen_temp_password();
  uid := admin_new_login(login_email, temp_pw, owner_name);
  insert into profiles(id, restaurant_id, full_name, email, role, must_change_password)
    values (uid, rid, owner_name, login_email, 'owner', true);

  -- act as it straight away, so "Create" lands you inside the property
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();

  if p_demo then
    begin
      insert into categories(restaurant_id, name, sort_order)
        values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
      insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
        select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
      perform seed_demo_data();
      seeded := true;
    exception when others then
      seed_error := sqlerrm;                    -- property stands; only the sample content is missing
    end;
  end if;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'create_property', rid,
            jsonb_build_object('type', p_type, 'demo_requested', p_demo, 'demo_seeded', seeded, 'login', login_email)
            || case when seed_error is null then '{}'::jsonb else jsonb_build_object('demo_error', seed_error) end);

  -- the password is returned once, here. It is stored only as a bcrypt hash.
  return jsonb_build_object('ok', true, 'id', rid, 'slug', v_slug, 'demo_seeded', seeded,
                            'login_email', login_email, 'temp_password', temp_pw, 'owner_name', owner_name);
end $$;

-- ── issue a fresh temporary password when an owner is locked out ─────────────────────────────
create or replace function admin_reset_property_password(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare pr profiles%rowtype; temp_pw text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into pr from profiles where restaurant_id = p_restaurant_id and role = 'owner' order by created_at limit 1;
  if not found then raise exception 'that property has no owner login yet'; end if;
  temp_pw := gen_temp_password();
  update auth.users set encrypted_password = crypt(temp_pw, gen_salt('bf')), updated_at = now() where id = pr.id;
  update profiles set must_change_password = true where id = pr.id;
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'reset_password', p_restaurant_id, jsonb_build_object('login', pr.email));
  return jsonb_build_object('ok', true, 'login_email', pr.email, 'temp_password', temp_pw);
end $$;

-- ── the owner has chosen their own password; stop forcing the change screen ───────────────────
create or replace function clear_password_change_flag() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set must_change_password = false where id = auth.uid();
end $$;

-- ── give the properties that already exist an owner login too ────────────────────────────────
-- A function rather than a DO block, because it has to hand the passwords back: a NOTICE would be
-- swallowed by the migration runner and the credentials would be lost with no way to recover them,
-- only to reset them. Only properties with no profile at all are touched. No property's data is
-- altered — this creates accounts and nothing else. Running it twice is harmless: the second run
-- finds nothing to do and returns no rows.
create or replace function admin_backfill_property_logins()
returns table (property text, login_email text, temp_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare r record; pw text; uid uuid; em text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'only master control can do this';
  end if;
  for r in select id, name, slug from restaurants
            where not is_shadow
              and not exists (select 1 from profiles p where p.restaurant_id = restaurants.id)
            order by created_at
  loop
    em := r.slug || '@dineflow.local';
    if exists (select 1 from auth.users u where lower(u.email) = em) then continue; end if;
    pw := gen_temp_password();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            em, crypt(pw, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name || ' owner'),
            now(), now(), '', '', '', '')
    returning id into uid;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true),
            'email', now(), now(), now());
    insert into profiles(id, restaurant_id, full_name, email, role, must_change_password)
      values (uid, r.id, r.name || ' owner', em, 'owner', true);
    property := r.name; login_email := em; temp_password := pw;
    return next;
  end loop;
end $$;
revoke all on function admin_backfill_property_logins() from public, anon, authenticated, service_role;
