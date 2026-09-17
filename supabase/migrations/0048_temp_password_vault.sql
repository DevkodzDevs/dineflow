-- ═══════════ Temporary passwords: stored, shown to Master, and expired after 7 days ═══════════
--
-- Until now a temporary password was returned once when the property was created or reset, then lost
-- forever. If the operator did not write it down, the only path was to issue another one, and the
-- owner who was already told the first one could not be warned that it had changed.
--
-- This table stores the plaintext so Master control can read it back from the Details dialog at any
-- time within the seven-day window. After that the row is still there but the password column is
-- blanked — the row then serves only to say "a temporary password was issued on this date and has
-- since expired". The auth.users hash is left intact: an expired temp password still works for
-- signing in, it just cannot be looked up any more.
--
-- Only Master control can read or write this table. No policy exists on it; every path goes through
-- a SECURITY DEFINER function that checks is_platform_admin(). The password is never returned to an
-- authenticated role's own query.

create table if not exists temp_passwords (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  password    text,                           -- plaintext; blanked after expiry
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,                    -- set when the owner changes their password
  issued_by   uuid                            -- the platform admin who pressed the button
);
create index if not exists temp_passwords_user_idx on temp_passwords(user_id, issued_at desc);

alter table temp_passwords enable row level security;
-- No policy: every access goes through security definer functions. A SELECT policy for
-- is_platform_admin() would work but leaks the table's existence to the PostgREST schema cache,
-- which is one step closer to someone poking at it.

comment on table temp_passwords is
  'Temporary passwords readable by Master control for 7 days. Blanked on expiry or when the owner sets their own.';

/** Blank expired passwords. Called opportunistically, not on a schedule. */
create or replace function sweep_expired_temp_passwords() returns int
language sql security definer set search_path = public as $$
  with blanked as (
    update temp_passwords set password = null
     where password is not null and expires_at < now()
     returning id)
  select count(*)::int from blanked
$$;

-- ── rewire creation to store the temp password ──────────────────────────────────────────────
drop function if exists admin_create_property(text, property_type, boolean, text, text, text);

create or replace function admin_create_property(
  p_name          text,
  p_type          property_type default 'resort',
  p_demo          boolean       default false,
  p_owner_email   text          default null,
  p_owner_name    text          default null,
  p_contact_email text          default null
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

  -- store the temporary password so Master control can read it back for 7 days
  insert into temp_passwords(user_id, password, issued_by)
    values (uid, temp_pw, auth.uid());

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

-- ── rewire reset to store the new temp password ─────────────────────────────────────────────
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

  -- expire old ones, store the new one
  update temp_passwords set password = null, consumed_at = now() where user_id = pr.id and password is not null;
  insert into temp_passwords(user_id, password, issued_by)
    values (pr.id, temp_pw, auth.uid());

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'reset_password', p_restaurant_id, jsonb_build_object('login', pr.email));
  return jsonb_build_object('ok', true, 'login_email', pr.email, 'temp_password', temp_pw);
end $$;

-- ── when the owner changes their password, blank the stored temp ─────────────────────────────
create or replace function clear_password_change_flag() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not password_otp_verified() then
    raise exception 'Verify the code sent to your email first.';
  end if;
  update profiles set must_change_password = false where id = auth.uid();
  update temp_passwords set password = null, consumed_at = now()
   where user_id = auth.uid() and password is not null;
  update password_otps set verified_until = null where user_id = auth.uid() and verified_until > now();
end $$;

-- also blank it when the password is reset through the forgotten-password path
create or replace function reset_password_with_code(p_login_id text, p_code text, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare pr profiles%rowtype; o password_otps%rowtype;
begin
  if length(coalesce(p_new_password, '')) < 8 then raise exception 'Use at least 8 characters.'; end if;
  select * into pr from profiles where lower(email) = lower(trim(coalesce(p_login_id, '')));
  if not found then raise exception 'That code has expired. Ask for a new one.'; end if;
  select * into o from password_otps
   where user_id = pr.id and consumed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then raise exception 'That code has expired. Ask for a new one.'; end if;
  if o.attempts >= 5 then
    update password_otps set consumed_at = now() where id = o.id;
    raise exception 'Too many wrong tries. Ask for a new code.';
  end if;
  if o.code_hash <> crypt(trim(coalesce(p_code, '')), o.code_hash) then
    update password_otps set attempts = attempts + 1 where id = o.id;
    raise exception 'That code is not right. % tries left.', 4 - o.attempts;
  end if;
  update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now() where id = pr.id;
  update profiles set must_change_password = false where id = pr.id;
  update temp_passwords set password = null, consumed_at = now()
   where user_id = pr.id and password is not null;
  update password_otps set consumed_at = now(), verified_until = null where id = o.id;
  return jsonb_build_object('ok', true, 'login_id', pr.email);
end $$;

-- ── the detail dialog now includes the temp password when it exists ──────────────────────────
create or replace function admin_property_detail(p_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  -- opportunistic sweep: blank anything past its 7-day window
  perform sweep_expired_temp_passwords();

  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;

  return jsonb_build_object(
    'property', jsonb_build_object(
      'dineflow_code', r.code,
      'id', r.id, 'name', r.name, 'slug', r.slug, 'type', r.property_type,
      'legal_name', r.legal_name, 'address', r.address, 'phone', r.phone,
      'district', r.district, 'pincode', r.pincode, 'created_at', r.created_at,
      'membership', r.membership, 'plan', r.membership_plan, 'ends_at', r.membership_ends_at,
      'trial_ends_at', r.trial_ends_at, 'booking_slug', r.booking_slug),
    'tax', jsonb_build_object(
      'gstin', r.gstin, 'pan', r.pan, 'scheme', r.gst_scheme, 'state_code', r.gst_state_code,
      'monthly', r.gst_monthly, 'fssai', r.fssai_no, 'gst_rate', r.gst_rate,
      'room_gst_rate', r.room_gst_rate, 'service_charge_pct', r.service_charge_pct,
      'ca_name', r.ca_name, 'ca_firm', r.ca_firm, 'ca_phone', r.ca_phone, 'ca_email', r.ca_email),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.full_name, 'login_id', p.email, 'contact_email', p.contact_email,
        'role', p.role, 'is_active', p.is_active,
        'must_change_password', p.must_change_password,
        'temp_password', tp.password,
        'temp_password_issued', tp.issued_at,
        'temp_password_expires', tp.expires_at,
        'temp_password_expired', case when tp.password is null and tp.id is not null then true
                                      when tp.expires_at < now() then true else false end,
        'last_sign_in_at', u.last_sign_in_at, 'created_at', p.created_at)
        order by case p.role when 'owner' then 0 else 1 end, p.full_name)
      from profiles p
      left join auth.users u on u.id = p.id
      left join lateral (
        select tp2.id, tp2.password, tp2.issued_at, tp2.expires_at
          from temp_passwords tp2
         where tp2.user_id = p.id
         order by tp2.issued_at desc limit 1
      ) tp on true
      where p.restaurant_id = r.id), '[]'::jsonb),
    'contents', jsonb_build_object(
      'menu_items', (select count(*) from menu_items where restaurant_id = r.id),
      'orders',     (select count(*) from orders where restaurant_id = r.id),
      'bills',      (select count(*) from bills where restaurant_id = r.id),
      'invoices',   (select count(*) from invoices where restaurant_id = r.id),
      'rooms',      (select count(*) from rooms where restaurant_id = r.id),
      'bookings',   (select count(*) from bookings where restaurant_id = r.id),
      'guests',     (select count(*) from guests where restaurant_id = r.id),
      'staff',      (select count(*) from labourers where restaurant_id = r.id),
      'tax_docs',   (select count(*) from compliance_docs where restaurant_id = r.id),
      'tax_filings',(select count(*) from compliance_filings where restaurant_id = r.id),
      'sealed_months', (select count(*) from business_periods where restaurant_id = r.id)));
end $$;
