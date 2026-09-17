-- ═══════════ Sign-in ids: fill in the domain, and never fill it in twice ═══════════
--
-- The operator types a sign-in id when creating a property. Three rules, applied here as well as in
-- the form, because a value can arrive from somewhere other than the form:
--
--   blank                  → the numbered DineFlow code,  dine-htl-zeph-00007@dineflow.local
--   mano-hotel             → the house domain is added,   mano-hotel@dineflow.local
--   owner@gmail.com        → left exactly as it is
--
-- The third rule is the point. Appending the house domain to something that already carries an @
-- would produce owner@gmail.com@dineflow.local — an address nobody can sign in with, discovered
-- only when the owner first tries.

/** Tidy a local part: letters, digits, dot, underscore and hyphen; nothing doubled or trailing. */
create or replace function sanitise_local_part(p_raw text) returns text
language sql immutable set search_path = public as $$
  select trim(both '-._' from
           regexp_replace(
             regexp_replace(lower(trim(coalesce(p_raw, ''))), '[^a-z0-9._-]+', '-', 'g'),
             '-{2,}', '-', 'g'))
$$;

/**
 * What a typed sign-in id becomes. Mirrors toLoginAddress() in packages/shared/src/login.ts.
 * Returns null for blank input, which the caller reads as "assign the numbered code".
 */
create or replace function to_login_address(p_raw text) returns text
language plpgsql immutable set search_path = public as $$
declare v text; local_part text; domain_part text;
begin
  v := lower(trim(coalesce(p_raw, '')));
  if v = '' then return null; end if;
  if position('@' in v) > 0 then
    local_part  := sanitise_local_part(split_part(v, '@', 1));
    domain_part := trim(both '@' from substring(v from position('@' in v) + 1));
    if domain_part = '' then domain_part := 'dineflow.local'; end if;
    return local_part || '@' || domain_part;
  end if;
  return sanitise_local_part(v) || '@dineflow.local';
end $$;

/** Is this sign-in id free, and does it look usable? For the form to check before submitting. */
create or replace function admin_login_id_available(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare address text; local_part text; domain_part text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  address := to_login_address(p_id);
  if address is null then
    return jsonb_build_object('ok', true, 'address', null,
      'note', 'A numbered DineFlow code will be assigned.');
  end if;
  local_part := split_part(address, '@', 1);
  domain_part := split_part(address, '@', 2);
  if length(local_part) < 3 then
    return jsonb_build_object('ok', false, 'address', address, 'note', 'Use at least three characters before the @.');
  end if;
  if domain_part !~ '^[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'address', address, 'note', 'That domain does not look right.');
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = address) then
    return jsonb_build_object('ok', false, 'address', address, 'note', 'That id is already taken.');
  end if;
  return jsonb_build_object('ok', true, 'address', address, 'note', 'Available.');
end $$;
revoke all on function admin_login_id_available(text) from public, anon;
grant execute on function admin_login_id_available(text) to authenticated;

-- ── creation applies the same rule to whatever it is handed ──────────────────────────────────
drop function if exists admin_create_property(text, property_type, boolean, text, text, text);

create or replace function admin_create_property(
  p_name          text,
  p_type          property_type default 'resort',
  p_demo          boolean       default false,
  p_owner_email   text          default null,   -- sign-in id; blank means use the numbered code
  p_owner_name    text          default null,
  p_contact_email text          default null    -- the owner's real mailbox, for password codes
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- blank → the code; a bare word → the house domain; a full address → untouched
  login_email := to_login_address(p_owner_email);
  if login_email is null then login_email := v_code || '@dineflow.local'; end if;
  if length(split_part(login_email, '@', 1)) < 3 then
    raise exception 'Use at least three characters before the @ in the sign-in id.';
  end if;
  if split_part(login_email, '@', 2) !~ '^[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That sign-in id does not look right: %', login_email;
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email) then
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
end $$;
