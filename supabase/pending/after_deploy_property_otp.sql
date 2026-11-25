-- AFTER the release with the email-code steps (0195, 0196) is live — not before.
--
-- 1. Takes the old one-call admin_create_property away from signed-in callers, so a property can only be made through
--    admin_create_property_verified (a verified owner-email code). The verified function still calls it inside the
--    database (it runs as the definer).
-- 2. The same for 0195's 7-argument admin_create_property_verified: the 8-argument one (0196, with the owner's phone) is
--    the only door; it calls the 7-argument one inside the database.
-- 3. staff_create_login (the live body, re-made) refuses a new login unless it comes through
--    staff_create_login_verified (a verified email code), or the property is a demo (Flow tests), or the caller is
--    Master control.
-- Before the deploy the live screens still call all three directly, and this would break them.
--
-- Apply: move this file to supabase/migrations/ under the next free number, dry-run it, apply it alone.

revoke execute on function public.admin_create_property(text, property_type, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_create_property_verified(uuid, text, property_type, boolean, text, text, text) from public, anon, authenticated;

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
  -- after the deploy (0196): a new login only through staff_create_login_verified (a verified email code), or inside a
  -- demo property (Master control → Flow tests adds staff there with made-up addresses), or by Master control itself
  if coalesce(current_setting('dineflow.verified_email', true), '') <> 'on' and not is_platform_admin()
     and not exists (select 1 from restaurants where id = me.restaurant_id and demo_expires_at is not null) then
    raise exception 'Verify their email first: send the code, then type the code that arrived.' using errcode = '42501';
  end if;
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

notify pgrst, 'reload schema';
