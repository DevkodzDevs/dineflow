-- 0130 · New sign-in ids end in @dineflow.cloud, not @dineflow.local (2026-10-20)
--
-- The owner: "when a new user is created, don't add @dineflow.local — use @dineflow.cloud". The six functions that
-- hand out a DineFlow id are re-created from their LIVE bodies (pg_get_functiondef, 2026-10-20) with the house
-- domain changed for anything new:
--   to_login_address            a bare id → id@dineflow.cloud
--   admin_create_property       the numbered code → code@dineflow.cloud; an id is also refused when the same
--                               name already exists on the old domain (so a bare id never means two accounts)
--   admin_realign_login_to_code / admin_backfill_*   treat both domains as a DineFlow id
--   create_demo_sandbox         demo logins → @demo.dineflow.cloud
-- Logins already issued on @dineflow.local keep working exactly as they are: nothing here changes an existing
-- auth.users row, and the sign-in screen tries a bare id on .cloud first and then on .local (packages/shared
-- login.ts loginCandidates). dineflow.cloud has no mail server, and none is needed: like .local, the id is never
-- mailed — password codes go to the person's verified contact email.

-- admin_backfill_dineflow_codes
CREATE OR REPLACE FUNCTION public.admin_backfill_dineflow_codes()
 RETURNS TABLE(property text, code text, old_login text, new_login text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare r record; c text; new_email text; old_email text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'only master control can do this';
  end if;
  for r in select rr.id, rr.name, rr.property_type
             from restaurants rr
            where rr.code is null and not rr.is_shadow
            order by rr.created_at
  loop
    c := next_dineflow_code(r.name, r.property_type);
    update restaurants set code = c where id = r.id;

    select p.email into old_email from profiles p
     where p.restaurant_id = r.id and p.role = 'owner' order by p.created_at limit 1;

    -- only move a generated .local id across; a real address the operator chose is left alone
    if old_email is not null and (old_email like '%@dineflow.local' or old_email like '%@dineflow.cloud') then
      new_email := c || '@dineflow.cloud';
      update auth.users u set email = new_email, updated_at = now() where u.email = old_email;
      update auth.identities i
         set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
       where i.identity_data->>'email' = old_email;
      update profiles p set email = new_email where p.email = old_email;
    else
      new_email := old_email;
    end if;

    property := r.name; code := c; old_login := old_email; new_login := new_email;
    return next;
  end loop;
end $function$
;

-- admin_backfill_property_logins
CREATE OR REPLACE FUNCTION public.admin_backfill_property_logins()
 RETURNS TABLE(property text, login_email text, temp_password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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
    em := r.slug || '@dineflow.cloud';
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
end $function$
;

-- admin_create_property
CREATE OR REPLACE FUNCTION public.admin_create_property(p_name text, p_type property_type DEFAULT 'resort'::property_type, p_demo boolean DEFAULT false, p_owner_email text DEFAULT NULL::text, p_owner_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid; v_slug text; v_code text; n int := 0; seeded boolean := false; seed_error text := null;
  login_email text; contact text; temp_pw text; uid uuid; owner_name text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'property'; end if;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop
    n := n + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || n;
  end loop;

  v_code := next_dineflow_code(p_name, p_type);

  login_email := to_login_address(p_owner_email);
  if login_email is null then login_email := v_code || '@dineflow.cloud'; end if;
  if length(split_part(login_email, '@', 1)) < 3 then
    raise exception 'Use at least three characters before the @ in the sign-in id.';
  end if;
  if split_part(login_email, '@', 2) !~ '^[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That sign-in id does not look right: %', login_email;
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email
               or (login_email like '%@dineflow.cloud' and lower(u.email) = replace(login_email, '@dineflow.cloud', '@dineflow.local'))) then
    raise exception 'The sign-in id % is already taken. Enter a different one.', login_email;
  end if;

  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;

  owner_name := coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), p_name || ' owner');

  insert into restaurants(name, slug, code, property_type, booking_slug)
    values (p_name, v_slug, v_code, p_type, v_slug) returning id into rid;

  temp_pw := gen_temp_password();
  uid := admin_new_login(login_email, temp_pw, owner_name);
  insert into profiles(id, restaurant_id, full_name, email, contact_email, role, must_change_password)
    values (uid, rid, owner_name, login_email, contact, 'owner', true);

  -- store the temporary password so Master control can read it back for 7 days
  insert into temp_passwords(user_id, password, issued_by)
    values (uid, temp_pw, auth.uid());

  perform _acting_set(rid);

  if p_demo then
    begin
      insert into categories(restaurant_id, name, sort_order)
        values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
      insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
        select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
      perform seed_demo_data();
      seeded := true;
    exception when others then seed_error := sqlerrm;
    end;
  end if;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'create_property', rid,
            jsonb_build_object('type', p_type, 'code', v_code, 'demo_requested', p_demo,
                               'demo_seeded', seeded, 'login', login_email, 'contact', contact)
            || case when seed_error is null then '{}'::jsonb else jsonb_build_object('demo_error', seed_error) end);

  return jsonb_build_object('ok', true, 'id', rid, 'slug', v_slug, 'code', v_code,
                            'demo_seeded', seeded, 'login_email', login_email,
                            'temp_password', temp_pw, 'owner_name', owner_name, 'contact_email', contact);
end $function$
;

-- admin_realign_login_to_code
CREATE OR REPLACE FUNCTION public.admin_realign_login_to_code(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare r restaurants%rowtype; old_email text; new_email text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;
  if r.code is null then raise exception 'that property has no DineFlow code yet'; end if;

  select p.email into old_email from profiles p
   where p.restaurant_id = r.id and p.role = 'owner' order by p.created_at limit 1;
  if old_email is null then raise exception 'that property has no owner login yet'; end if;

  if not (old_email like '%@dineflow.local' or old_email like '%@dineflow.cloud') then
    raise exception 'That login (%) is on a real domain. Change it deliberately, not with this.', old_email;
  end if;

  new_email := r.code || '@dineflow.cloud';
  if new_email = old_email then
    return jsonb_build_object('ok', true, 'unchanged', true, 'login_email', old_email);
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = new_email) then
    raise exception 'The id % is already taken.', new_email;
  end if;

  update auth.users u set email = new_email, updated_at = now() where u.email = old_email;
  update auth.identities i
     set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
   where i.identity_data->>'email' = old_email;
  update profiles p set email = new_email where p.email = old_email;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'realign_login', r.id,
            jsonb_build_object('from', old_email, 'to', new_email, 'code', r.code));

  return jsonb_build_object('ok', true, 'from', old_email, 'login_email', new_email, 'code', r.code);
end $function$
;

-- create_demo_sandbox
CREATE OR REPLACE FUNCTION public.create_demo_sandbox(p_type property_type DEFAULT 'restaurant'::property_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  rid uuid; v_slug text; v_code text; uid uuid; temp_pw text; login_email text;
  demo_modules text[];
begin
  perform _sweep_expired_demos();                                                -- 0098: was the caller's job
  -- rate limit: no more than 10 demo properties per hour globally
  if (select count(*) from restaurants where demo_expires_at is not null
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many demo requests. Try again in a few minutes.';
  end if;

  v_slug := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  v_code := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  login_email := v_code || '@demo.dineflow.cloud';
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
end $function$
;

-- to_login_address
CREATE OR REPLACE FUNCTION public.to_login_address(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v text; local_part text; domain_part text;
begin
  v := lower(trim(coalesce(p_raw, '')));
  if v = '' then return null; end if;
  if position('@' in v) > 0 then
    local_part  := sanitise_local_part(split_part(v, '@', 1));
    domain_part := trim(both '@' from substring(v from position('@' in v) + 1));
    if domain_part = '' then domain_part := 'dineflow.cloud'; end if;
    return local_part || '@' || domain_part;
  end if;
  return sanitise_local_part(v) || '@dineflow.cloud';
end $function$
;
