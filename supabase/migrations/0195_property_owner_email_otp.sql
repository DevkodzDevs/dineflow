-- 0195 — A new property needs the owner's real email, proved by a code (2026-11-25).
--
-- The owner: "when I create a new property, the owner's real email goes in one field, a code is emailed to that address
-- at once, I type the code in, and only when it verifies is the property created — otherwise no property account."
--
-- Master control → Create property used to make the property and its owner login in one call, with whatever was typed
-- as the owner's email (a typo, or an address nobody reads, became the address every password-reset code goes to).
-- Now:
--   1. admin_owner_email_code(email)        mints a 6-digit code for that address (bcrypt-hashed here; the plain code goes
--                                           back to the server action, which emails it — lib/email.ts — and never to the
--                                           browser). 1 a minute and 5 an hour per address, 30 an hour per master.
--   2. admin_owner_email_verify(id, code)   checks it: 10 minutes to use, 5 tries, then dead.
--   3. admin_create_property_verified(...)  creates the property ONLY with a verified, unused code for the same master and
--                                           the same address (verified in the last 30 minutes), marks the code used, and
--                                           marks the owner's contact address confirmed (profiles.contact_verified_at).
--
-- Additive: the table and three functions are new; admin_create_property is untouched and still callable, because the
-- deployed Master control calls it until this release is live. supabase/pending/0196_after_deploy_property_otp.sql takes
-- it away from signed-in callers after the deploy — then the verified path is the only way a property is made.
--
-- Trust: these are master-only. A master's own session could call admin_owner_email_code directly and read the code it
-- returns; the master already holds every property, so this proves the ADDRESS is real and reachable (no typo, no fake),
-- not that the master is honest. The server action never shows the code on screen (except DINEFLOW_OTP_ECHO on a
-- development server — lib/email.ts).

create table if not exists public.property_email_otps (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  code_hash     text not null,
  requested_by  uuid not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  attempts      int not null default 0,
  verified_at   timestamptz,
  used_at       timestamptz,
  restaurant_id uuid references public.restaurants(id) on delete set null
);
create index if not exists property_email_otps_email_idx on public.property_email_otps (email, created_at desc);
create index if not exists property_email_otps_master_idx on public.property_email_otps (requested_by, created_at desc);

comment on table public.property_email_otps is
  '0195: codes that prove a new property''s owner email before Master control may create the property. Written only by the admin_owner_email_* / admin_create_property_verified definer functions.';

-- RLS: nobody writes it directly; a master may read it (the code is a bcrypt hash).
alter table public.property_email_otps enable row level security;
revoke all on public.property_email_otps from anon, authenticated;
grant select on public.property_email_otps to authenticated;
drop policy if exists property_email_otps_master_read on public.property_email_otps;
create policy property_email_otps_master_read on public.property_email_otps
  for select to authenticated using (is_platform_admin());

-- 1. send: mint a code for an address
create or replace function public.admin_owner_email_code(p_email text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code  text;
  v_id    uuid;
  recent  int;
begin
  if not is_platform_admin() then raise exception 'only master control can do this' using errcode = '42501'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', v_email;
  end if;
  if v_email ~ '@dineflow\.local$' then
    raise exception 'Use the owner''s own email (Gmail, Outlook, their business address) — not a DineFlow sign-in id.';
  end if;

  select count(*) into recent from property_email_otps
   where email = v_email and created_at > now() - interval '1 minute';
  if recent > 0 then raise exception 'A code was just sent to %. Wait a minute before asking for another.', v_email; end if;
  select count(*) into recent from property_email_otps
   where email = v_email and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many codes sent to %. Try again in an hour.', v_email; end if;
  select count(*) into recent from property_email_otps
   where requested_by = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 30 then raise exception 'Too many codes sent this hour. Try again later.'; end if;

  v_code := _random_digits(6);
  insert into property_email_otps(email, code_hash, requested_by, expires_at)
    values (v_email, crypt(v_code, gen_salt('bf')), auth.uid(), now() + interval '10 minutes')
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'email', v_email, 'expires_in_minutes', 10);
end $function$;

-- 2. verify: a wrong code is an answer, not an error (a raise would roll the try counter back — 0098)
create or replace function public.admin_owner_email_verify(p_id uuid, p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare o property_email_otps%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this' using errcode = '42501'; end if;
  select * into o from property_email_otps where id = p_id and requested_by = auth.uid() for update;
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

  update property_email_otps set verified_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'email', o.email);
end $function$;

-- 3. create: only with a verified code for the same address
create or replace function public.admin_create_property_verified(
  p_otp uuid, p_name text, p_type property_type default 'resort'::property_type, p_demo boolean default false,
  p_owner_email text default null, p_owner_name text default null, p_contact_email text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o property_email_otps%rowtype;
  v_contact text := lower(trim(coalesce(p_contact_email, '')));
  r jsonb;
  rid uuid;
begin
  if not is_platform_admin() then raise exception 'only master control can do this' using errcode = '42501'; end if;
  select * into o from property_email_otps where id = p_otp and requested_by = auth.uid() for update;
  if not found or o.verified_at is null then
    raise exception 'Verify the owner''s email first: send the code, then type the code they received.';
  end if;
  if o.used_at is not null then raise exception 'That email code was already used for a property. Send a new one.'; end if;
  if o.verified_at < now() - interval '30 minutes' then
    raise exception 'The email was verified more than 30 minutes ago. Send a new code.';
  end if;
  if o.email <> v_contact then
    raise exception 'The owner''s email was changed after it was verified. Verify % again.', nullif(v_contact, '');
  end if;

  r := admin_create_property(p_name, p_type, p_demo, p_owner_email, p_owner_name, v_contact);
  rid := (r->>'id')::uuid;

  update property_email_otps set used_at = now(), restaurant_id = rid where id = o.id;
  -- the owner's contact address is proved: password-reset codes go to an address someone reads
  update profiles set contact_verified_at = now() where restaurant_id = rid and role = 'owner' and lower(contact_email) = v_contact;
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'owner_email_verified', rid, jsonb_build_object('email', v_contact, 'otp', o.id));

  return r || jsonb_build_object('owner_email_verified', true);
end $function$;

revoke execute on function public.admin_owner_email_code(text) from public, anon;
revoke execute on function public.admin_owner_email_verify(uuid, text) from public, anon;
revoke execute on function public.admin_create_property_verified(uuid, text, property_type, boolean, text, text, text) from public, anon;
grant execute on function public.admin_owner_email_code(text) to authenticated;
grant execute on function public.admin_owner_email_verify(uuid, text) to authenticated;
grant execute on function public.admin_create_property_verified(uuid, text, property_type, boolean, text, text, text) to authenticated;

notify pgrst, 'reload schema';
