-- ═══════════ Forgotten passwords ═══════════
--
-- The in-app change flow (0038) needs a session: you are signed in, you ask for a code, you set a
-- new password. Someone who has forgotten their password has no session, so none of that applies.
--
-- The danger in an unauthenticated reset is telling the world which accounts exist. These functions
-- are therefore reachable only by the service role — a server action holds that key, a browser never
-- does — and the screen shows the same words whether or not the id was found. The code itself is
-- returned to the server exactly once so it can be posted, and is stored only as a bcrypt hash.
--
-- The whole reset is a single call: the code is checked and the password set together, so there is
-- no half-finished state in between and nothing for the browser to carry or forge.

/**
 * Mint a reset code for a login id. Returns found=false for an unknown id or one with no contact
 * address; the caller must answer identically either way.
 */
create or replace function request_password_reset(p_login_id text) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare pr profiles%rowtype; v_code text; target text; recent int; prop text;
begin
  select * into pr from profiles where lower(email) = lower(trim(coalesce(p_login_id, '')));
  if not found then return jsonb_build_object('found', false); end if;

  target := nullif(trim(coalesce(pr.contact_email, '')), '');
  if target is null then return jsonb_build_object('found', false); end if;

  select count(*) into recent from password_otps
   where user_id = pr.id and created_at > now() - interval '1 minute';
  if recent > 0 then return jsonb_build_object('found', true, 'throttled', true); end if;
  select count(*) into recent from password_otps
   where user_id = pr.id and created_at > now() - interval '1 hour';
  if recent >= 5 then return jsonb_build_object('found', true, 'throttled', true); end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into password_otps(user_id, code_hash, sent_to, expires_at)
    values (pr.id, crypt(v_code, gen_salt('bf')), target, now() + interval '10 minutes');

  select name into prop from restaurants where id = pr.restaurant_id;
  return jsonb_build_object('found', true, 'throttled', false,
    'code', v_code, 'sent_to', target, 'property', coalesce(prop, 'your property'));
end $$;

/**
 * Check the code and set the password in one go.
 *
 * The password is written the same way admin_reset_property_password writes one: a bcrypt hash
 * straight into auth.users, which is what Supabase itself stores. Five wrong codes burn the code,
 * not the account, so the owner can simply ask for another.
 */
create or replace function reset_password_with_code(p_login_id text, p_code text, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare pr profiles%rowtype; o password_otps%rowtype;
begin
  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Use at least 8 characters.';
  end if;

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

  update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now()
   where id = pr.id;
  update profiles set must_change_password = false where id = pr.id;
  update password_otps set consumed_at = now(), verified_until = null where id = o.id;

  return jsonb_build_object('ok', true, 'login_id', pr.email);
end $$;

-- A browser must never be able to call either of these: the first hands back a working code, and
-- between them they would let anyone walk an account list. Only the service role, which lives in a
-- server action, may.
revoke all on function request_password_reset(text)                  from public, anon, authenticated;
revoke all on function reset_password_with_code(text, text, text)    from public, anon, authenticated;
grant execute on function request_password_reset(text)               to service_role;
grant execute on function reset_password_with_code(text, text, text) to service_role;
