-- ═══════════ Change the temporary password only after a code sent to the real address ═══════════
--
-- A property signs in with a DineFlow id (tan-resort@dineflow.local) which is not a real mailbox.
-- The owner's actual address is captured separately when Master control creates the account, and it
-- is where the one-time code goes. So the login id proves who you say you are, and the code proves
-- you hold the address the operator recorded — the temporary password alone is no longer enough,
-- which matters because it is read down a phone line.
--
-- The code is never stored. Only a bcrypt hash of it is, next to an expiry and an attempt count, so
-- a copy of this table does not hand anyone a working code. Verifying marks the row consumed and
-- opens a short window in which the password may be set; the window closes on use or on timeout.

alter table profiles add column if not exists contact_email text;   -- the owner's real mailbox

comment on column profiles.contact_email is
  'Where password codes are sent. Distinct from email, which is the DineFlow sign-in id.';

create table if not exists password_otps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  sent_to     text not null,               -- recorded so the screen can say where it went
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,                 -- set when the right code is given
  verified_until timestamptz,              -- the window in which the password may then be changed
  created_at  timestamptz not null default now()
);
create index if not exists password_otps_user_idx on password_otps(user_id, created_at desc);

alter table password_otps enable row level security;
-- No policy at all: every route in goes through the SECURITY DEFINER functions below. A client that
-- could select this table would learn when codes were issued and to which address.
drop policy if exists own_rows on password_otps;

/**
 * Start a password change: mint a code for the signed-in user and hand it back to the server so it
 * can be posted. The caller is trusted with the plaintext exactly once and never stores it.
 * Rate limited to one code a minute and five an hour, counted per user.
 */
create or replace function request_password_otp()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); pr profiles%rowtype; code text; target text; recent int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into pr from profiles where id = uid;
  if not found then raise exception 'this account has no property'; end if;

  target := nullif(trim(coalesce(pr.contact_email, '')), '');
  if target is null then
    raise exception 'No contact address on this account. Ask Master control to add one, then try again.';
  end if;

  select count(*) into recent from password_otps
   where user_id = uid and created_at > now() - interval '1 minute';
  if recent > 0 then raise exception 'A code was just sent. Wait a minute before asking for another.'; end if;
  select count(*) into recent from password_otps
   where user_id = uid and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many codes requested. Try again in an hour.'; end if;

  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into password_otps(user_id, code_hash, sent_to, expires_at)
    values (uid, crypt(code, gen_salt('bf')), target, now() + interval '10 minutes');

  return jsonb_build_object('ok', true, 'code', code, 'sent_to', target, 'expires_in_minutes', 10);
end $$;

/**
 * Check a code. Five wrong guesses burn the code rather than the account, so a locked-out owner can
 * simply ask for another instead of being shut out. Success opens a fifteen minute window.
 */
create or replace function verify_password_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); o password_otps%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into o from password_otps
   where user_id = uid and consumed_at is null and expires_at > now()
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

  update password_otps
     set consumed_at = now(), verified_until = now() + interval '15 minutes'
   where id = o.id;
  return jsonb_build_object('ok', true, 'verified_until', now() + interval '15 minutes');
end $$;

/** True while a code checked out in the last fifteen minutes still stands. */
create or replace function password_otp_verified()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from password_otps
                  where user_id = auth.uid() and verified_until > now())
$$;

/**
 * Clear the "must change" flag, but only if a code was actually verified. The app calls this after
 * Supabase has accepted the new password; putting the check here means the flag cannot be cleared by
 * calling the endpoint directly without ever holding the code.
 */
create or replace function clear_password_change_flag() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not password_otp_verified() then
    raise exception 'Verify the code sent to your email first.';
  end if;
  update profiles set must_change_password = false where id = auth.uid();
  -- the window is spent; a second change needs a second code
  update password_otps set verified_until = null where user_id = auth.uid() and verified_until > now();
end $$;

revoke all on function request_password_otp()       from public, anon;
revoke all on function verify_password_otp(text)    from public, anon;
revoke all on function password_otp_verified()      from public, anon;
grant execute on function request_password_otp()    to authenticated;
grant execute on function verify_password_otp(text) to authenticated;
grant execute on function password_otp_verified()   to authenticated;
