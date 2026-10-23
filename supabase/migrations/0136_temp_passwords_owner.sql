-- 0136 — Temporary passwords are the owner's (2026-10-23, the owner: "the staff temporary password generator is only for
-- the owner, always; the owner can enable it for a manager; otherwise no one can").
--
-- Until now a supervisor or above could make someone's sign-in (staff_create_login), reset a password (staff_reset_password)
-- and read back an unused temporary password (staff_login_details) for anyone below them. A temporary password is a key to
-- another person's account, so it is now the owner's to give:
-- • profiles.can_issue_passwords (default false) — the owner's switch on a manager. It counts only while that person is a
--   manager; demoted, it does nothing (and the switch is not offered).
-- • _may_issue_passwords(me) — the owner, or a manager with the switch on.
-- • staff_create_login and staff_reset_password refuse anyone else (a supervisor or a plain manager invites with a code,
--   which carries no password). staff_login_details still shows the sign-in ID to whoever may see the person, but the
--   temporary password and its expiry only to someone who may issue one, and says which (can_issue).
-- • staff_set_password_right(p_user, p_on) — the owner (or Master control acting as the owner) turns it on or off for a
--   manager at this property. The change is audited by audit_profiles like every profiles update.
-- Additive: one column, two new functions, three functions given one more check. Nothing is dropped.

alter table public.profiles add column if not exists can_issue_passwords boolean not null default false;

create or replace function public._may_issue_passwords(me profiles)
returns boolean
language sql stable set search_path = public as $$
  select me.id is not null and (me.role = 'owner' or (me.role = 'manager' and coalesce(me.can_issue_passwords, false)));
$$;
revoke all on function public._may_issue_passwords(profiles) from public, anon;
grant execute on function public._may_issue_passwords(profiles) to authenticated;

create or replace function public.staff_set_password_right(p_user uuid, p_on boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles;
begin
  me := acting_profile();
  if me.id is null or me.role <> 'owner' then
    raise exception 'Only the owner can decide who gives temporary passwords.' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.role <> 'manager' then raise exception 'Only a manager can be given this.'; end if;
  update profiles set can_issue_passwords = coalesce(p_on, false) where id = target.id;
  return coalesce(p_on, false);
end $$;
revoke all on function public.staff_set_password_right(uuid, boolean) from public, anon;
grant execute on function public.staff_set_password_right(uuid, boolean) to authenticated;

-- the three that hand out a password, rebuilt from the live definitions with the one check added
CREATE OR REPLACE FUNCTION public.staff_create_login(p_full_name text, p_role user_role, p_modules text[] DEFAULT NULL::text[], p_login_id text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare me profiles; addr text; dom text; temp_pw text; uid uuid; mine text[]; clamped text[];
        nm text; contact text; ph text; v_code text; prop text; code text;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot add people'; end if;
  if not _may_issue_passwords(me) then
    raise exception 'Only the owner, or a manager the owner allows, can give a temporary password. Invite them with a code instead.' using errcode = '42501';
  end if;

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

  v_code := _random_digits(6);                                                   -- 0098
  insert into contact_otps(user_id, code_hash, sent_to) values (uid, crypt(v_code, gen_salt('bf')), contact);
  select name into prop from restaurants where id = me.restaurant_id;

  return jsonb_build_object('user_id', uid, 'full_name', nm, 'role', p_role, 'staff_code', code,
                            'login_id', addr, 'temp_password', temp_pw,
                            'contact_email', contact, 'phone', ph,
                            'verify_code', v_code, 'property', coalesce(prop, 'your property'));
end $function$;

CREATE OR REPLACE FUNCTION public.staff_reset_password(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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
  if not _may_issue_passwords(me) then
    raise exception 'Only the owner, or a manager the owner allows, can give a temporary password. Invite them with a code instead.' using errcode = '42501';
  end if;

  temp_pw := gen_temp_password();
  update auth.users set encrypted_password = crypt(temp_pw, gen_salt('bf')), updated_at = now() where id = p_user;
  update profiles set must_change_password = true, temp_access_until = null where id = p_user;
  update temp_passwords set consumed_at = now() where user_id = p_user and consumed_at is null;
  insert into temp_passwords(user_id, password, issued_by) values (p_user, temp_pw, auth.uid());
  return jsonb_build_object('login_id', t.email, 'temp_password', temp_pw);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_login_details(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                            'temp_password', case when _may_issue_passwords(me) then tp.password end,
                            'expires_at', case when _may_issue_passwords(me) then tp.expires_at end,
                            'can_issue', _may_issue_passwords(me));
end $function$;
