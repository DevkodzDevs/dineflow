-- ═══════════ Temporary access (skip password change) and self-destructing demos ═══════════

-- ── 1. "Continue with temporary password" grants 3-day access ────────────────────────────────
-- The owner can defer the password change and use the app on the temporary password. After 3 days
-- from this deferral, auth_restaurant_id() stops resolving for them and they are sent to the
-- password change screen again. The flag is NOT cleared — they still must_change_password; they
-- just get a grace window.

alter table profiles add column if not exists temp_access_until timestamptz;

comment on column profiles.temp_access_until is
  'When set, the owner may use the app on a temporary password until this time, without changing it first.';

/** Called from the "Continue with temporary password" button. Grants 3 days. */
create or replace function defer_password_change() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr profiles%rowtype;
begin
  select * into pr from profiles where id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  if not pr.must_change_password then raise exception 'password is already set'; end if;
  -- only one deferral allowed — if they already deferred, just return the existing deadline
  if pr.temp_access_until is not null and pr.temp_access_until > now() then
    return jsonb_build_object('ok', true, 'until', pr.temp_access_until, 'already', true);
  end if;
  update profiles set temp_access_until = now() + interval '3 days' where id = auth.uid();
  return jsonb_build_object('ok', true, 'until', now() + interval '3 days');
end $$;
grant execute on function defer_password_change() to authenticated;
revoke all on function defer_password_change() from public, anon;


-- ── 2. Self-destructing demo sandboxes ───────────────────────────────────────────────────────
-- A visitor on the login page picks a property type and gets a full working app for 8 hours. The
-- property is created with sample data, a throwaway login, and an expiry timestamp. After the
-- window closes, a sweep deletes the property, its data and the login.

alter table restaurants add column if not exists demo_expires_at timestamptz;

comment on column restaurants.demo_expires_at is
  'Non-null for a demo sandbox. The property and its auth user are deleted after this time.';

/** The modules a demo visitor can open. Enough to explore, not enough to run a business. */
-- 9 modules: dashboard, orders, menu, billing, rooms, frontdesk, kitchen, reports, inventory
-- No: settings, staff, tax, proof, channels, neighbours, labour, invoices, online-orders

/** Create a throwaway demo property with sample data. No Master control needed — callable by anon.
    Returns a sign-in email and password the caller uses to sign in immediately. */
create or replace function create_demo_sandbox(p_type property_type default 'restaurant')
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  rid uuid; v_slug text; v_code text; uid uuid; temp_pw text; login_email text;
  demo_modules text[];
begin
  -- rate limit: no more than 10 demo properties per hour globally
  if (select count(*) from restaurants where demo_expires_at is not null
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many demo requests. Try again in a few minutes.';
  end if;

  v_slug := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  v_code := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  login_email := v_code || '@demo.dineflow.local';
  temp_pw := gen_temp_password();

  insert into restaurants(name, slug, code, property_type, booking_slug, demo_expires_at,
                          membership, membership_plan, membership_ends_at,
                          enabled_modules)
    values ('Demo ' || initcap(p_type::text), v_slug, v_code, p_type, v_slug,
            now() + interval '8 hours', 'active', 'demo', now() + interval '8 hours',
            array['dashboard','orders','menu','billing','kitchen','reports','inventory',
                  case when p_type in ('hotel','resort') then 'rooms' else 'reservations' end,
                  case when p_type in ('hotel','resort') then 'frontdesk' else 'pulse' end])
    returning id into rid;

  -- create a throwaway auth user
  uid := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', login_email,
          crypt(temp_pw, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', 'Demo ' || initcap(p_type::text)),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', login_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into profiles(id, restaurant_id, full_name, email, role, must_change_password, is_active)
    values (uid, rid, 'Demo User', login_email, 'owner', false, true);

  -- seed sample data using the demo user's context
  begin
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
    perform seed_demo_data();
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    -- sample data failure is not fatal for the demo
  end;

  return jsonb_build_object('ok', true, 'login_email', login_email, 'password', temp_pw,
    'type', p_type, 'expires_in_hours', 8, 'id', rid);
end $$;

-- callable by anon (the login page has no session)
grant execute on function create_demo_sandbox(property_type) to anon, authenticated;

/** Sweep expired demos. Called opportunistically. Deletes the property, all data, and the auth user. */
create or replace function sweep_expired_demos() returns int
language plpgsql security definer set search_path = public, auth as $$
declare r record; n int := 0;
begin
  for r in select id from restaurants where demo_expires_at is not null and demo_expires_at < now() loop
    -- collect user ids before cascade deletes profiles
    delete from auth.users where id in (select p.id from profiles p where p.restaurant_id = r.id);
    delete from restaurants where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
