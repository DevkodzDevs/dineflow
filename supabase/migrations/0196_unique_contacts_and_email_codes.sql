-- 0196 — One email and one phone per person across DineFlow; an emailed code before ANY new login (2026-11-25).
--
-- The owner: "apply the email OTP everywhere it is needed; a property owner's phone, email and user id must never repeat
-- — if they are already in the database, do not allow creating it; the same for everything: the owner creating a
-- property, the owner creating staff inside the property".
--
-- 1. The database itself refuses a repeat: unique indexes on profiles' contact email, login email and phone (the last 10
--    digits, so "+91 98400 00001" and "9840000001" are the same number). Checked on 2026-11-25: 23 logins, 0 repeats.
--    _contact_taken() also looks across columns (a contact email that is someone else's sign-in email) and at auth.users.
-- 2. Every way a login is made asks for an emailed code first:
--      Master control → New property   admin_owner_email_code / _verify / admin_create_property_verified (0195), now with
--                                      the owner's phone (8 arguments) and the repeat checks
--      Staff → Add staff               staff_email_code → email_code_reveal (server) → staff_email_verify →
--                                      staff_create_login_verified
--      /signup and /join (no account)  public_email_code (server) → email_code_reveal (server) → public_email_verify
--                                      (server) → public_account_create (server: a confirmed login) → sign in →
--                                      create_restaurant / join_restaurant → account_finish (phone + verified contact)
--    The code is never handed to whoever asked for it (0098/0121's rule): the asking call stores it, and only the
--    service role can read it — once, within 5 minutes — to email it (email_code_reveal). Master control's own call
--    still returns it (0195: the master holds everything already).
-- 3. Editing: my_profile_save, admin_set_contact_email and staff_set_* are held by the indexes; admin_set_contact_email
--    also checks first (a clear message) and un-confirms a changed address.
--
-- Additive: new indexes, columns with defaults, new functions; admin_owner_email_code and admin_set_contact_email are
-- re-made with the same arguments. The old one-call paths the deployed screens still use (staff_create_login,
-- the 7-argument admin_create_property_verified) stay open until supabase/pending/after_deploy_property_otp.sql.

-- ── phone key: the last 10 digits, or null when there are fewer than 10 ───────────────────────────────────────────────
create or replace function public._phone_key(p text) returns text
  language sql immutable parallel safe set search_path to 'public'
as $$
  select case when length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) >= 10
              then right(regexp_replace(p, '[^0-9]', '', 'g'), 10) end
$$;
revoke execute on function public._phone_key(text) from public, anon;

-- ── 1. the database refuses a repeat ─────────────────────────────────────────────────────────────────────────────────
create unique index if not exists profiles_contact_email_uniq on public.profiles (lower(trim(contact_email)))
  where contact_email is not null and trim(contact_email) <> '';
create unique index if not exists profiles_login_email_uniq on public.profiles (lower(email)) where email is not null;
create unique index if not exists profiles_phone_uniq on public.profiles (public._phone_key(phone))
  where public._phone_key(phone) is not null;

/** Which of an email and a phone already belongs to someone else: 'email', 'phone' or null. */
create or replace function public._contact_taken(p_email text, p_phone text, p_except uuid default null) returns text
  language plpgsql stable security definer set search_path to 'public', 'auth'
as $function$
declare e text := lower(nullif(trim(coalesce(p_email, '')), '')); k text := _phone_key(p_phone);
begin
  if e is not null and (
       exists (select 1 from profiles p where p.id is distinct from p_except and (lower(trim(p.contact_email)) = e or lower(p.email) = e))
    or exists (select 1 from auth.users u where u.id is distinct from p_except and lower(u.email) = e)) then
    return 'email';
  end if;
  if k is not null and exists (select 1 from profiles p where p.id is distinct from p_except and _phone_key(p.phone) = k) then
    return 'phone';
  end if;
  return null;
end $function$;
revoke execute on function public._contact_taken(text, text, uuid) from public, anon, authenticated;

/** The one sentence for a repeat, so every screen says it the same way. */
create or replace function public._contact_taken_msg(p_what text, p_email text, p_phone text) returns text
  language sql immutable set search_path to 'public'
as $$
  select case p_what
    when 'email' then format('%s is already used by another DineFlow account. Use a different email.', lower(trim(p_email)))
    when 'phone' then format('The phone number %s is already used by another DineFlow account. Use a different number.', trim(p_phone))
  end
$$;
revoke execute on function public._contact_taken_msg(text, text, text) from public, anon, authenticated;

-- ── 2. the codes table grows: what it is for, the phone, the code until the server has read it ───────────────────────
alter table public.property_email_otps
  add column if not exists purpose     text not null default 'owner',
  add column if not exists phone       text,
  add column if not exists code_plain  text,          -- only until email_code_reveal reads it (≤ 5 minutes), then null
  add column if not exists revealed_at timestamptz,
  add column if not exists used_by     uuid;          -- the login a sign-up / join code made
do $$ begin
  alter table public.property_email_otps add constraint property_email_otps_purpose_chk
    check (purpose in ('owner', 'staff', 'signup', 'join'));
exception when duplicate_object then null; end $$;
create index if not exists property_email_otps_purpose_idx on public.property_email_otps (purpose, created_at desc);

-- a master reads the table, but never a code: column grants instead of the table grant 0195 gave
revoke select on public.property_email_otps from authenticated;
grant select (id, email, requested_by, created_at, expires_at, attempts, verified_at, used_at, restaurant_id,
              purpose, phone, revealed_at, used_by) on public.property_email_otps to authenticated;
-- (RLS from 0195 stays: property_email_otps_master_read — is_platform_admin() only)

/** Mint a code row (internal). Validates the address, refuses a repeat, keeps to the limits. Returns the row id. */
create or replace function public._email_code_new(p_email text, p_phone text, p_purpose text, p_restaurant uuid, p_by uuid)
  returns uuid language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_code text; v_id uuid; recent int; taken text;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', v_email;
  end if;
  if v_email ~ '@dineflow\.(local|cloud)$' then
    raise exception 'Use a real email address (Gmail, Outlook, a business address) — not a DineFlow sign-in id.';
  end if;
  taken := _contact_taken(v_email, p_phone, null);
  if taken is not null then raise exception '%', _contact_taken_msg(taken, v_email, p_phone); end if;

  select count(*) into recent from property_email_otps where email = v_email and created_at > now() - interval '1 minute';
  if recent > 0 then raise exception 'A code was just sent to %. Wait a minute before asking for another.', v_email; end if;
  select count(*) into recent from property_email_otps where email = v_email and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many codes sent to %. Try again in an hour.', v_email; end if;
  if p_by is not null then
    select count(*) into recent from property_email_otps where requested_by = p_by and created_at > now() - interval '1 hour';
    if recent >= 30 then raise exception 'Too many codes sent this hour. Try again later.'; end if;
  end if;
  if p_purpose in ('signup', 'join') then
    select count(*) into recent from property_email_otps where purpose in ('signup', 'join') and created_at > now() - interval '1 hour';
    if recent >= 300 then raise exception 'Sign-ups are busy right now. Try again in a few minutes.'; end if;
  end if;

  v_code := _random_digits(6);
  insert into property_email_otps(email, code_hash, code_plain, requested_by, expires_at, purpose, phone, restaurant_id)
    values (v_email, crypt(v_code, gen_salt('bf')), v_code, coalesce(p_by, '00000000-0000-0000-0000-000000000000'::uuid),
            now() + interval '10 minutes', p_purpose, nullif(trim(coalesce(p_phone, '')), ''), p_restaurant)
    returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public._email_code_new(text, text, text, uuid, uuid) from public, anon, authenticated;

/** The server reads a code ONCE, within 5 minutes, to email it. Service role only. */
create or replace function public.email_code_reveal(p_id uuid) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare r record; prop text;
begin
  with old as (
    select id, code_plain from property_email_otps
     where id = p_id and code_plain is not null and created_at > now() - interval '5 minutes' for update
  ), upd as (
    update property_email_otps t set code_plain = null, revealed_at = now() from old where t.id = old.id
    returning t.id, t.email, t.purpose, t.restaurant_id, old.code_plain as code
  )
  select * into r from upd;
  if not found then raise exception 'That code can no longer be sent. Ask for a new one.'; end if;
  select name into prop from restaurants where id = r.restaurant_id;
  return jsonb_build_object('id', r.id, 'email', r.email, 'code', r.code, 'purpose', r.purpose, 'property', prop);
end $function$;
revoke execute on function public.email_code_reveal(uuid) from public, anon, authenticated;
grant execute on function public.email_code_reveal(uuid) to service_role;

/** Check a code row (internal): 10 minutes, 5 tries; a wrong code is an answer, not a raise (0098). */
create or replace function public._email_code_check(p_id uuid, p_code text, p_purposes text[], p_by uuid) returns jsonb
  language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare o property_email_otps%rowtype;
begin
  select * into o from property_email_otps where id = p_id and purpose = any(p_purposes)
     and (p_by is null or requested_by = p_by) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Send a code first.'); end if;
  if o.used_at is not null then return jsonb_build_object('ok', false, 'error', 'That code was already used. Send a new one.'); end if;
  if o.verified_at is not null then return jsonb_build_object('ok', true, 'email', o.email); end if;
  if o.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'That code has expired. Send a new one.'); end if;
  if o.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Too many wrong tries. Send a new code.'); end if;
  if o.code_hash <> crypt(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'), o.code_hash) then
    update property_email_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'error',
      case when o.attempts + 1 >= 5 then 'That code is not right. No tries left — send a new code.'
           else format('That code is not right. %s tries left.', 4 - o.attempts) end);
  end if;
  update property_email_otps set verified_at = now(), code_plain = null where id = o.id;
  return jsonb_build_object('ok', true, 'email', o.email);
end $function$;
revoke execute on function public._email_code_check(uuid, text, text[], uuid) from public, anon, authenticated;

/** A verified, unused code of these purposes, younger than 30 minutes since verifying, for this address (internal). */
create or replace function public._email_code_take(p_id uuid, p_purposes text[], p_by uuid, p_email text)
  returns property_email_otps language plpgsql security definer set search_path to 'public'
as $function$
declare o property_email_otps%rowtype;
begin
  select * into o from property_email_otps where id = p_id and purpose = any(p_purposes)
     and (p_by is null or requested_by = p_by) for update;
  if not found or o.verified_at is null then
    raise exception 'Verify the email first: send the code, then type the code that arrived.';
  end if;
  if o.used_at is not null then raise exception 'That email code was already used. Send a new one.'; end if;
  if o.verified_at < now() - interval '30 minutes' then raise exception 'The email was verified more than 30 minutes ago. Send a new code.'; end if;
  if p_email is not null and o.email <> lower(trim(p_email)) then
    raise exception 'The email was changed after it was verified. Verify % again.', lower(trim(p_email));
  end if;
  return o;
end $function$;
revoke execute on function public._email_code_take(uuid, text[], uuid, text) from public, anon, authenticated;

-- ── Master control → New property (0195), now refusing a repeat and taking the owner's phone ─────────────────────────
create or replace function public.admin_owner_email_code(p_email text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_id uuid; v_code text; v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not is_platform_admin() then raise exception 'only master control can do this' using errcode = '42501'; end if;
  v_id := _email_code_new(v_email, null, 'owner', null, auth.uid());
  -- the master's own call returns the code (0195): read the kept copy and clear it
  select code_plain, email into v_code, v_email from property_email_otps where id = v_id;
  update property_email_otps set code_plain = null, revealed_at = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'email', v_email, 'expires_in_minutes', 10);
end $function$;

create or replace function public.admin_create_property_verified(
  p_otp uuid, p_name text, p_type property_type, p_demo boolean, p_owner_email text, p_owner_name text,
  p_contact_email text, p_owner_phone text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_phone text; taken text; r jsonb; rid uuid;
begin
  if not is_platform_admin() then raise exception 'only master control can do this' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_owner_phone, '')), '') is null then raise exception 'Enter the owner''s phone number.'; end if;
  v_phone := normalise_phone(p_owner_phone);
  taken := _contact_taken(p_contact_email, v_phone, null);
  if taken is not null then raise exception '%', _contact_taken_msg(taken, p_contact_email, v_phone); end if;
  r := admin_create_property_verified(p_otp, p_name, p_type, p_demo, p_owner_email, p_owner_name, p_contact_email);
  rid := (r->>'id')::uuid;
  update profiles set phone = v_phone where restaurant_id = rid and role = 'owner';
  return r || jsonb_build_object('owner_phone', v_phone);
end $function$;
revoke execute on function public.admin_create_property_verified(uuid, text, property_type, boolean, text, text, text, text) from public, anon;
grant execute on function public.admin_create_property_verified(uuid, text, property_type, boolean, text, text, text, text) to authenticated;

create or replace function public.admin_set_contact_email(p_restaurant_id uuid, p_contact_email text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare contact text; n int; owner_id uuid; taken text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;
  select id into owner_id from profiles where restaurant_id = p_restaurant_id and role = 'owner' limit 1;
  if owner_id is null then raise exception 'that property has no owner login yet'; end if;
  taken := _contact_taken(contact, null, owner_id);
  if taken is not null then raise exception '%', _contact_taken_msg(taken, contact, null); end if;
  -- a changed address is not confirmed any more (0196)
  update profiles set contact_email = contact,
         contact_verified_at = case when lower(coalesce(contact_email, '')) = coalesce(contact, '') then contact_verified_at end
   where restaurant_id = p_restaurant_id and role = 'owner';
  get diagnostics n = row_count;
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'set_contact_email', p_restaurant_id, jsonb_build_object('contact', contact));
  return jsonb_build_object('ok', true, 'contact_email', contact);
end $function$;

-- ── Staff → Add staff ────────────────────────────────────────────────────────────────────────────────────────────────
/** Whoever may add staff asks for a code for the new person's email. Returns the row id only — never the code. */
create or replace function public.staff_email_code(p_email text, p_phone text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare me profiles; v_id uuid; prop text;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot add people'; end if;
  if not _may_issue_passwords(me) then
    raise exception 'Only the owner, or a manager the owner allows, can add staff with a password.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null then perform normalise_phone(p_phone); end if;
  v_id := _email_code_new(p_email, p_phone, 'staff', me.restaurant_id, auth.uid());
  select name into prop from restaurants where id = me.restaurant_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'email', lower(trim(p_email)), 'property', prop, 'expires_in_minutes', 10);
end $function$;
revoke execute on function public.staff_email_code(text, text) from public, anon;
grant execute on function public.staff_email_code(text, text) to authenticated;

create or replace function public.staff_email_verify(p_id uuid, p_code text) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
begin
  if acting_profile() is null then raise exception 'not a member of this property'; end if;
  return _email_code_check(p_id, p_code, array['staff'], auth.uid());
end $function$;
revoke execute on function public.staff_email_verify(uuid, text) from public, anon;
grant execute on function public.staff_email_verify(uuid, text) to authenticated;

/** Add staff only with a verified code for their email; the address is confirmed from the first day. */
create or replace function public.staff_create_login_verified(
  p_otp uuid, p_full_name text, p_role user_role, p_modules text[] default null, p_login_id text default null,
  p_contact_email text default null, p_phone text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare o property_email_otps%rowtype; taken text; r jsonb; uid uuid;
begin
  if acting_profile() is null then raise exception 'not a member of this property'; end if;
  o := _email_code_take(p_otp, array['staff'], auth.uid(), p_contact_email);
  taken := _contact_taken(p_contact_email, p_phone, null);
  if taken is not null then raise exception '%', _contact_taken_msg(taken, p_contact_email, p_phone); end if;
  perform set_config('dineflow.verified_email', 'on', true);
  r := staff_create_login(p_full_name, p_role, p_modules, p_login_id, p_contact_email, p_phone);
  perform set_config('dineflow.verified_email', 'off', true);
  uid := (r->>'user_id')::uuid;
  update property_email_otps set used_at = now(), used_by = uid where id = o.id;
  update profiles set contact_verified_at = now() where id = uid;
  delete from contact_otps where user_id = uid;          -- the after-the-fact code staff_create_login made is not needed
  return (r - 'verify_code') || jsonb_build_object('contact_verified', true);
end $function$;
revoke execute on function public.staff_create_login_verified(uuid, text, user_role, text[], text, text, text) from public, anon;
grant execute on function public.staff_create_login_verified(uuid, text, user_role, text[], text, text, text) to authenticated;

-- ── /signup and /join: a new account only with a verified code (all through the server's service role) ───────────────
create or replace function public.public_email_code(p_email text, p_phone text, p_purpose text) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_purpose not in ('signup', 'join') then raise exception 'unknown purpose'; end if;
  if p_purpose = 'signup' and nullif(trim(coalesce(p_phone, '')), '') is null then raise exception 'Enter your phone number.'; end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null then perform normalise_phone(p_phone); end if;
  v_id := _email_code_new(p_email, p_phone, p_purpose, null, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'email', lower(trim(p_email)), 'expires_in_minutes', 10);
end $function$;
revoke execute on function public.public_email_code(text, text, text) from public, anon, authenticated;
grant execute on function public.public_email_code(text, text, text) to service_role;

create or replace function public.public_email_verify(p_id uuid, p_code text) returns jsonb
  language sql security definer set search_path to 'public'
as $$ select _email_code_check(p_id, p_code, array['signup', 'join'], null) $$;
revoke execute on function public.public_email_verify(uuid, text) from public, anon, authenticated;
grant execute on function public.public_email_verify(uuid, text) to service_role;

/** A confirmed login for the verified address, with the password the person chose. The caller then signs in. */
create or replace function public.public_account_create(p_otp uuid, p_password text, p_full_name text) returns jsonb
  language plpgsql security definer set search_path to 'public', 'auth', 'extensions'
as $function$
declare o property_email_otps%rowtype; uid uuid; taken text; nm text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  o := _email_code_take(p_otp, array['signup', 'join'], null, null);
  if nm is null then raise exception 'Enter your name.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Use a password of at least 8 characters.'; end if;
  taken := _contact_taken(o.email, o.phone, null);
  if taken is not null then raise exception '%', _contact_taken_msg(taken, o.email, o.phone); end if;
  uid := create_auth_login(o.email, p_password, nm);
  update property_email_otps set used_at = now(), used_by = uid where id = o.id;
  return jsonb_build_object('ok', true, 'user_id', uid, 'email', o.email, 'purpose', o.purpose);
end $function$;
revoke execute on function public.public_account_create(uuid, text, text) from public, anon, authenticated;
grant execute on function public.public_account_create(uuid, text, text) to service_role;

/** After create_restaurant / join_restaurant: the verified email becomes the contact (confirmed) and the phone goes on. */
create or replace function public.account_finish(p_otp uuid) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare o property_email_otps%rowtype; taken text; v_phone text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into o from property_email_otps where id = p_otp and used_by = auth.uid() and purpose in ('signup', 'join');
  if not found then raise exception 'That sign-up code does not belong to this account.'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'this account has no property yet'; end if;
  v_phone := case when o.phone is null then null else normalise_phone(o.phone) end;
  taken := _contact_taken(o.email, v_phone, auth.uid());
  if taken is not null then raise exception '%', _contact_taken_msg(taken, o.email, v_phone); end if;
  update profiles set contact_email = o.email, contact_verified_at = now(), phone = coalesce(v_phone, phone) where id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$;
revoke execute on function public.account_finish(uuid) from public, anon;
grant execute on function public.account_finish(uuid) to authenticated;

-- ── join_restaurant was broken on the live database (found by this migration's dry run, 2026-11-25): its variable "code"
--    has the same name as invites.code / restaurants.code, so every call failed with 'column reference "code" is
--    ambiguous' — nobody could join with a code. The live body, with the variable renamed v_code; nothing else changed.
CREATE OR REPLACE FUNCTION public.join_restaurant(p_code text, p_full_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare inv invites%rowtype; r restaurants%rowtype; v_code text; mine profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  v_code := trim(coalesce(p_code, ''));
  if v_code = '' then raise exception 'Enter the code your manager gave you.'; end if;

  select * into mine from profiles where id = auth.uid();
  if found then
    raise exception 'This account already belongs to %.',
      (select name from restaurants where id = mine.restaurant_id);
  end if;

  select * into inv from invites
   where invites.code = upper(v_code) and used_by is null and expires_at > now();
  if found then
    insert into profiles(id, restaurant_id, full_name, email, role, allowed_modules, is_active)
      values (auth.uid(), inv.restaurant_id, p_full_name,
              (select email from auth.users where id = auth.uid()), inv.role, inv.allowed_modules, true);
    update invites set used_by = auth.uid() where id = inv.id;
    return jsonb_build_object('ok', true, 'pending', false, 'role', inv.role,
      'property', (select name from restaurants where id = inv.restaurant_id));
  end if;

  select * into r from restaurants where lower(restaurants.code) = lower(v_code) and not is_shadow;
  if not found then
    raise exception 'That code does not match any property. Check it with your manager.';
  end if;

  -- a DineFlow code gets you in the door only: switched off until someone above approves you
  insert into profiles(id, restaurant_id, full_name, email, role, is_active)
    values (auth.uid(), r.id, p_full_name,
            (select email from auth.users where id = auth.uid()), 'employee', false);
  return jsonb_build_object('ok', true, 'pending', true, 'role', 'employee', 'property', r.name);
end $function$;

-- ── a quick "is it free?" for the forms (whoever may add staff, or a master; the server for /signup) ─────────────────
create or replace function public.contact_available(p_email text, p_phone text) returns jsonb
  language plpgsql stable security definer set search_path to 'public'
as $function$
declare me profiles; k text := _phone_key(p_phone);
begin
  if not is_platform_admin() and coalesce(auth.role(), '') <> 'service_role' then
    me := acting_profile();
    if me.id is null or role_rank(me.role) < role_rank('supervisor_2') then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return jsonb_build_object(
    'email_taken', nullif(trim(coalesce(p_email, '')), '') is not null and _contact_taken(p_email, null, null) = 'email',
    'phone_taken', k is not null and _contact_taken(null, p_phone, null) = 'phone');
end $function$;
revoke execute on function public.contact_available(text, text) from public, anon;
grant execute on function public.contact_available(text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
