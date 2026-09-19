-- 0059 · Add a member of staff and hand them their sign-in there and then.
--
-- Until now the only way in was an invite code: you generated one, the person found /join, signed
-- themselves up and chose their own password. That works for someone with a phone and an email, and
-- badly for a kitchen porter on their first morning. This adds the other half — the owner or a
-- supervisor fills in who the person is, and the app answers with a login ID and a temporary
-- password to write on a slip and hand over. The invite flow stays exactly as it was.
--
-- Everything goes through the ladder from 0058: you may only create someone below your own rank, and
-- the sections you give them are clamped to the sections you hold. A login is not a way around that.

alter table profiles add column if not exists phone text;

-- ───────── the auth row, shared by master and staff creation ─────────
-- admin_new_login() does this already but refuses anyone who is not platform admin, which is right
-- for it and wrong here. The insert itself is the same, so it moves into one place. This function
-- asks no questions, so nobody may call it directly: execute is revoked and only the security
-- definer functions below — which do ask — can reach it.
create or replace function create_auth_login(p_email text, p_password text, p_name text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is not null then raise exception 'The sign-in id % is already taken.', p_email; end if;
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
revoke all on function create_auth_login(text, text, text) from public, anon, authenticated;

-- ───────── a free sign-in id for a new member of staff ─────────
-- "ravi" at a property whose code is KBR41 becomes ravi.kbr41@dineflow.local, and ravi2.kbr41 if a
-- Ravi is already there. Nothing here is emailed, so the address only has to be unique and typeable.
create or replace function suggest_staff_login(p_rid uuid, p_full_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text; code text; try text; n int := 1;
begin
  select lower(r.code) into code from restaurants r where r.id = p_rid;
  base := sanitise_local_part(split_part(trim(coalesce(p_full_name, '')), ' ', 1));
  if length(base) < 2 then base := 'staff'; end if;
  try := base || '.' || coalesce(code, 'dineflow');
  while exists (select 1 from auth.users u where lower(u.email) = try || '@dineflow.local') loop
    n := n + 1;
    try := base || n::text || '.' || coalesce(code, 'dineflow');
  end loop;
  return try || '@dineflow.local';
end $$;

-- ───────── add a member of staff ─────────
create or replace function staff_create_login(
  p_full_name     text,
  p_role          user_role,
  p_modules       text[] default null,
  p_login_id      text   default null,
  p_contact_email text   default null,
  p_phone         text   default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me profiles; addr text; temp_pw text; uid uuid; mine text[]; clamped text[]; nm text; contact text;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot add people'; end if;

  nm := nullif(trim(coalesce(p_full_name, '')), '');
  if nm is null then raise exception 'Enter the person''s name.'; end if;

  -- the same two rules as owner_set_access, because a new login must not be a way round them
  if p_role = 'owner' then raise exception 'an owner is appointed in Staff from an existing member, not created here'; end if;
  if me.role <> 'owner' and role_rank(p_role) >= role_rank(me.role) then
    raise exception 'you cannot add someone at your own level or higher';
  end if;

  mine := effective_modules(me.id);
  if me.role = 'owner' then
    clamped := p_modules;                                     -- null means the role's own default
  else
    clamped := array(
      select m from unnest(coalesce(p_modules, (select default_set from role_modules where role = p_role))) m
      where m = any(mine)
    );
  end if;

  addr := to_login_address(nullif(trim(coalesce(p_login_id, '')), ''));
  if addr is null then addr := suggest_staff_login(me.restaurant_id, nm); end if;
  if length(split_part(addr, '@', 1)) < 3 then
    raise exception 'Use at least three characters before the @ in the sign-in id.';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then
    raise exception 'The sign-in id % is already taken. Enter a different one.', addr;
  end if;

  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;

  temp_pw := gen_temp_password();
  uid := create_auth_login(addr, temp_pw, nm);

  insert into profiles(id, restaurant_id, full_name, email, contact_email, phone, role,
                       allowed_modules, is_active, must_change_password)
    values (uid, me.restaurant_id, nm, addr, contact, nullif(trim(coalesce(p_phone, '')), ''), p_role,
            clamped, true, true);

  -- readable back for seven days, so a slip that goes missing before the first shift is not a rebuild
  insert into temp_passwords(user_id, password, issued_by) values (uid, temp_pw, auth.uid());

  return jsonb_build_object('user_id', uid, 'full_name', nm, 'role', p_role,
                            'login_id', addr, 'temp_password', temp_pw);
end $$;

-- ───────── read the slip back, or issue a new one ─────────
-- Both answer only for someone you are allowed to manage, so a supervisor cannot read the owner's
-- password or reset a peer's. A password that has been used is gone: consumed_at is set the moment
-- they choose their own, and after that there is nothing to show.
create or replace function staff_login_details(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles; t profiles; tp temp_passwords;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  select * into t  from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if me.id is null or t.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2')
     or (me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role)) then
    raise exception 'you cannot see this person''s sign-in';
  end if;
  select * into tp from temp_passwords
    where user_id = p_user and consumed_at is null and expires_at > now()
    order by issued_at desc limit 1;
  return jsonb_build_object(
    'login_id', t.email,
    'must_change_password', t.must_change_password,
    'temp_password', tp.password,                      -- null once used, expired or never issued
    'expires_at', tp.expires_at);
end $$;

create or replace function staff_reset_password(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare me profiles; t profiles; temp_pw text;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  select * into t  from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if me.id is null or t.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2')
     or (me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role)) then
    raise exception 'you cannot reset this person''s password';
  end if;
  if t.id = me.id then raise exception 'change your own password in Settings'; end if;

  temp_pw := gen_temp_password();
  update auth.users set encrypted_password = crypt(temp_pw, gen_salt('bf')), updated_at = now() where id = p_user;
  update profiles set must_change_password = true, temp_access_until = null where id = p_user;
  update temp_passwords set consumed_at = now() where user_id = p_user and consumed_at is null;
  insert into temp_passwords(user_id, password, issued_by) values (p_user, temp_pw, auth.uid());
  return jsonb_build_object('login_id', t.email, 'temp_password', temp_pw);
end $$;

-- Nothing to add for "the slip stops being readable once they set their own password":
-- clear_password_change_flag() (0048, behind the emailed code) and clear_password_change_flag_forced()
-- (0051, the first-time change) both already blank temp_passwords.password and stamp consumed_at.
-- staff_login_details() reads neither once that has happened, so a used slip simply stops existing.
