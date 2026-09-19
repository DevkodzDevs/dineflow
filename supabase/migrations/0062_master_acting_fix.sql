-- 0062 · "not a member of this property" when adding staff from Master control.
--
-- A master has no profiles row. It signs in as itself and steps into a property through
-- admin_context, and the app has always known this: requireSession() builds a stand-in owner profile
-- so the screens work, and auth_restaurant_id() answers with the property being inspected. Every
-- function added in 0058-0061 instead looked the caller up directly —
--
--     select * into me from profiles where id = auth.uid() and is_active;
--     if me.id is null then raise exception 'not a member of this property'; end if;
--
-- — which finds nothing for a master and refuses the very screens it was just shown. Same for
-- owner_set_access, which has carried the fault since 0019.
--
-- acting_profile() answers the question those functions were really asking: who is doing this, as
-- the app understands it? A member gets their own row. A platform admin standing inside a property
-- gets a stand-in owner of that property. Everyone else gets nothing, exactly as before.

create or replace function acting_profile() returns profiles
language plpgsql stable security definer set search_path = public as $$
declare me profiles; rid uuid;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is not null then return me; end if;

  -- admin_acting_as() joins platform_admins itself, so this cannot be forged by a member
  rid := admin_acting_as();
  if rid is null then return null; end if;

  me.id             := auth.uid();
  me.restaurant_id  := rid;
  me.full_name      := 'Master control';
  me.role           := 'owner';        -- inside the property it opened, a master acts as its owner
  me.is_active      := true;
  me.allowed_modules := null;
  return me;
end $$;

-- A master holds every section the property has, the same as its owner would. Without this,
-- effective_modules() returns an empty set for them and every grant they make is trimmed to nothing.
create or replace function effective_modules(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select m from unnest(
      case when p.role = 'owner' then rm.ceiling else coalesce(p.allowed_modules, rm.default_set) end
    ) m
    where m = any(rm.ceiling)
      and (r.enabled_modules is null or m = any(r.enabled_modules) or m in ('dashboard', 'settings'))
  ), '{}'::text[])
  from acting_profile() p
  join role_modules rm on rm.role = p.role
  join restaurants r on r.id = p.restaurant_id
  where p.id = p_user;
$$;

-- ───────── the seven functions that asked the question the wrong way ─────────

create or replace function owner_set_access(p_user uuid, p_role user_role, p_modules text[], p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; owners int; mine text[]; clamped text[]; new_code text;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people'; end if;

  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.id = me.id then raise exception 'you cannot change your own access — ask someone above you'; end if;

  if me.role <> 'owner' then
    if role_rank(target.role) >= role_rank(me.role) then raise exception 'you cannot change someone at or above your own level'; end if;
    if role_rank(p_role)     >= role_rank(me.role) then raise exception 'you cannot give someone your own level or higher'; end if;
  end if;

  -- an owner — real or a master standing in for one — passes their tick list through; everyone else
  -- is trimmed to the sections they hold. The old shape clamped the owner too, which quietly emptied
  -- every grant a master made, because a master owns no profile to hold sections on.
  if p_role = 'owner' then
    clamped := null;
  elsif me.role = 'owner' then
    clamped := p_modules;
  else
    mine := effective_modules(me.id);
    clamped := array(
      select m from unnest(coalesce(p_modules, (select default_set from role_modules where role = p_role))) m
      where m = any(mine));
  end if;

  if target.role = 'owner' and (p_role <> 'owner' or not p_active) then
    select count(*) into owners from profiles
      where restaurant_id = me.restaurant_id and role = 'owner' and is_active and id <> target.id;
    if owners = 0 then raise exception 'this is the last owner — make someone else an owner first'; end if;
  end if;

  new_code := target.staff_code;
  if target.staff_code is null or role_code_prefix(p_role) <> role_code_prefix(target.role) then
    new_code := next_staff_code(me.restaurant_id, p_role);
  end if;

  update profiles set role = p_role, allowed_modules = clamped, is_active = p_active, staff_code = new_code
   where id = target.id;
end $$;

create or replace function create_invite(p_role user_role) returns text
language plpgsql security definer set search_path = public as $$
declare me profiles; c text; mine text[]; grant_set text[];
begin
  me := acting_profile();
  if me.id is null then raise exception 'not allowed'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot invite people'; end if;
  if p_role = 'owner' then raise exception 'an owner is appointed in Staff, not by invite code'; end if;
  if me.role <> 'owner' and role_rank(p_role) >= role_rank(me.role) then
    raise exception 'you cannot invite someone at your own level or higher';
  end if;

  if me.role = 'owner' then
    grant_set := null;
  else
    mine := effective_modules(me.id);
    grant_set := array(
      select m from unnest((select default_set from role_modules where role = p_role)) m
      where m = any(mine));
  end if;

  c := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into invites(restaurant_id, code, role, allowed_modules, expires_at)
    values (me.restaurant_id, c, p_role, grant_set, now() + interval '7 days');
  return c;
end $$;

create or replace function staff_create_login(
  p_full_name     text,
  p_role          user_role,
  p_modules       text[] default null,
  p_login_id      text   default null,
  p_contact_email text   default null,
  p_phone         text   default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me profiles; addr text; dom text; temp_pw text; uid uuid; mine text[]; clamped text[];
        nm text; contact text; ph text; v_code text; prop text; code text;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot add people'; end if;

  nm := nullif(trim(coalesce(p_full_name, '')), '');
  if nm is null then raise exception 'Enter the person''s name.'; end if;

  if p_role = 'owner' then raise exception 'an owner is appointed in Staff from an existing member, not created here'; end if;
  if me.role <> 'owner' and role_rank(p_role) >= role_rank(me.role) then
    raise exception 'you cannot add someone at your own level or higher';
  end if;

  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is null then raise exception 'An email address is required — it is where their password reset code goes.'; end if;
  if contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;
  if exists (select 1 from profiles where restaurant_id = me.restaurant_id and lower(contact_email) = contact) then
    raise exception 'Someone at this property already uses %.', contact;
  end if;

  ph := normalise_phone(p_phone);

  if me.role = 'owner' then
    clamped := p_modules;
  else
    mine := effective_modules(me.id);
    clamped := array(
      select m from unnest(coalesce(p_modules, (select default_set from role_modules where role = p_role))) m
      where m = any(mine));
  end if;

  dom  := staff_login_domain(me.restaurant_id);
  addr := nullif(trim(coalesce(p_login_id, '')), '');
  if addr is null then
    addr := suggest_staff_login(me.restaurant_id, nm);
  else
    addr := sanitise_local_part(split_part(addr, '@', 1)) || '@' || dom;
  end if;
  if length(split_part(addr, '@', 1)) < 3 then
    raise exception 'Use at least three characters before the @ in the sign-in id.';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then
    raise exception 'The sign-in id % is already taken. Enter a different one.', addr;
  end if;

  temp_pw := gen_temp_password();
  uid  := create_auth_login(addr, temp_pw, nm);
  code := next_staff_code(me.restaurant_id, p_role);

  insert into profiles(id, restaurant_id, full_name, email, contact_email, phone, role,
                       allowed_modules, is_active, must_change_password, staff_code)
    values (uid, me.restaurant_id, nm, addr, contact, ph, p_role, clamped, true, true, code);

  insert into temp_passwords(user_id, password, issued_by) values (uid, temp_pw, auth.uid());

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into contact_otps(user_id, code_hash, sent_to) values (uid, crypt(v_code, gen_salt('bf')), contact);
  select name into prop from restaurants where id = me.restaurant_id;

  return jsonb_build_object('user_id', uid, 'full_name', nm, 'role', p_role, 'staff_code', code,
                            'login_id', addr, 'temp_password', temp_pw,
                            'contact_email', contact, 'phone', ph,
                            'verify_code', v_code, 'property', coalesce(prop, 'your property'));
end $$;

create or replace function staff_login_details(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles; t profiles; tp temp_passwords;
begin
  me := acting_profile();
  select * into t from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if me.id is null or t.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2')
     or (me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role)) then
    raise exception 'you cannot see this person''s sign-in';
  end if;
  select * into tp from temp_passwords
    where user_id = p_user and consumed_at is null and expires_at > now()
    order by issued_at desc limit 1;
  return jsonb_build_object('login_id', t.email, 'must_change_password', t.must_change_password,
                            'temp_password', tp.password, 'expires_at', tp.expires_at);
end $$;

create or replace function staff_reset_password(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare me profiles; t profiles; temp_pw text;
begin
  me := acting_profile();
  select * into t from profiles where id = p_user and restaurant_id = me.restaurant_id;
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

create or replace function staff_request_contact_otp(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me profiles; t profiles; v_code text; target text; recent int; prop text;
begin
  me := acting_profile();
  select * into t from profiles where id = p_user;
  if t.id is null then raise exception 'no such person'; end if;
  if me.id is null or (me.id <> t.id and (
       me.restaurant_id <> t.restaurant_id
       or role_rank(me.role) < role_rank('supervisor_2')
       or (me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role)))) then
    raise exception 'you cannot send a code for this person';
  end if;

  target := nullif(trim(coalesce(t.contact_email, '')), '');
  if target is null then raise exception 'They have no email address on file to send a code to.'; end if;

  select count(*) into recent from contact_otps where user_id = p_user and created_at > now() - interval '1 minute';
  if recent > 0 then return jsonb_build_object('throttled', true, 'sent_to', target); end if;
  select count(*) into recent from contact_otps where user_id = p_user and created_at > now() - interval '1 hour';
  if recent >= 5 then return jsonb_build_object('throttled', true, 'sent_to', target); end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into contact_otps(user_id, code_hash, sent_to) values (p_user, crypt(v_code, gen_salt('bf')), target);
  select name into prop from restaurants where id = t.restaurant_id;
  return jsonb_build_object('throttled', false, 'code', v_code, 'sent_to', target,
                            'name', t.full_name, 'property', coalesce(prop, 'your property'));
end $$;

create or replace function staff_verify_contact(p_user uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me profiles; t profiles; o contact_otps;
begin
  me := acting_profile();
  select * into t from profiles where id = p_user;
  if t.id is null then raise exception 'no such person'; end if;
  if me.id is null or (me.id <> t.id and (
       me.restaurant_id <> t.restaurant_id
       or role_rank(me.role) < role_rank('supervisor_2')
       or (me.role <> 'owner' and role_rank(t.role) >= role_rank(me.role)))) then
    raise exception 'you cannot verify this person';
  end if;

  select * into o from contact_otps
   where user_id = p_user and consumed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if o.id is null then raise exception 'That code has expired. Send a new one.'; end if;
  if o.attempts >= 5 then raise exception 'Too many wrong tries. Send a new code.'; end if;

  if o.code_hash <> crypt(trim(coalesce(p_code, '')), o.code_hash) then
    update contact_otps set attempts = attempts + 1 where id = o.id;
    raise exception 'That code is not right.';
  end if;

  update contact_otps set consumed_at = now() where id = o.id;
  update profiles set contact_verified_at = now() where id = p_user;
  return jsonb_build_object('verified', true, 'sent_to', o.sent_to);
end $$;
