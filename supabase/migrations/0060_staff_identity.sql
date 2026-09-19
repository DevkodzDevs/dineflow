-- 0060 · Staff identity: a login on the property's own domain, a real email, a checked phone,
--        a three-day slip, and a code that proves the address before anyone relies on it.
--
-- Five changes, all of them leaning on the same fact: the login ID is an identifier, not a mailbox.
-- Nothing is ever delivered to ravi@kanyakumari-bay-resort.in — it exists so a cook can type
-- something short and memorable at the sign-in box. The address that actually receives post is
-- profiles.contact_email, which is why it now has to be present and has to be proved.

-- ───────── 1 · a domain made from the property's name ─────────
-- The slug is already unique per property, so a login built on it is unique across the whole
-- platform without any coordination: two properties can both have a Ravi.
create or replace function staff_login_domain(p_rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
           nullif(trim(both '-' from left(regexp_replace(lower(r.slug), '[^a-z0-9-]+', '', 'g'), 40)), ''),
           'dineflow') || '.in'
  from restaurants r where r.id = p_rid;
$$;

-- "Ravi Kumar" at Kanyakumari Bay Resort → ravi@kanyakumari-bay-resort.in, and ravi2@… if taken.
create or replace function suggest_staff_login(p_rid uuid, p_full_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text; dom text; try text; n int := 1;
begin
  dom := staff_login_domain(p_rid);
  base := sanitise_local_part(split_part(trim(coalesce(p_full_name, '')), ' ', 1));
  if length(base) < 3 then base := sanitise_local_part(trim(coalesce(p_full_name, ''))); end if;
  if length(base) < 3 then base := 'staff'; end if;
  try := base;
  while exists (select 1 from auth.users u where lower(u.email) = try || '@' || dom) loop
    n := n + 1;
    try := base || n::text;
  end loop;
  return try || '@' || dom;
end $$;

-- ───────── 2 · the slip lasts three days, not seven ─────────
alter table temp_passwords alter column expires_at set default (now() + interval '3 days');
comment on column temp_passwords.expires_at is
  'A handed-over password is a live credential lying on a desk. Three days is long enough to cover a day off and short enough that a forgotten slip stops working by itself.';

-- ───────── 3 · a phone is ten digits, or it is not a phone ─────────
create or replace function normalise_phone(p_raw text) returns text
language plpgsql immutable set search_path = public as $$
declare d text;
begin
  d := regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10); end if;   -- pasted with the country code
  if length(d) = 11 and left(d, 1) = '0' then d := right(d, 10); end if;    -- pasted with a trunk 0
  if length(d) <> 10 then
    raise exception 'A phone number must be exactly 10 digits — % has %.', p_raw, length(d);
  end if;
  return d;
end $$;

-- ───────── 4 · proving the address ─────────
-- Its own table rather than password_otps. They look alike, but a code that proves an address must
-- never be spendable as a code that changes a password: reset_password_with_code takes the newest
-- unconsumed row for the user, so one shared table would let a registration code reset the login.
create table if not exists contact_otps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  sent_to     text not null,            -- the email, or one day the phone; recorded so the screen can say where
  channel     text not null default 'email',
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists contact_otps_user_idx on contact_otps(user_id, created_at desc);
alter table contact_otps enable row level security;
-- no policy: every path in and out is a security definer function below

alter table profiles add column if not exists contact_verified_at timestamptz;
comment on column profiles.contact_verified_at is
  'When the person proved their contact address with a code. Until this is set, a password reset would post to an address nobody has shown to be theirs.';

-- issue a code for someone you manage (or for yourself, right after being added)
create or replace function staff_request_contact_otp(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me profiles; t profiles; v_code text; target text; recent int; prop text;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  select * into t  from profiles where id = p_user;
  if t.id is null then raise exception 'no such person'; end if;
  -- either it is your own address, or you are senior enough to be setting them up
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
  select * into me from profiles where id = auth.uid() and is_active;
  select * into t  from profiles where id = p_user;
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

-- ───────── 5 · adding someone, with all of the above applied ─────────
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
        nm text; contact text; ph text; v_code text; prop text;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot add people'; end if;

  nm := nullif(trim(coalesce(p_full_name, '')), '');
  if nm is null then raise exception 'Enter the person''s name.'; end if;

  if p_role = 'owner' then raise exception 'an owner is appointed in Staff from an existing member, not created here'; end if;
  if me.role <> 'owner' and role_rank(p_role) >= role_rank(me.role) then
    raise exception 'you cannot add someone at your own level or higher';
  end if;

  -- an email is not optional any more: it is the only way this person can ever reset their own
  -- password, because nothing is delivered to the login ID
  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is null then raise exception 'An email address is required — it is where their password reset code goes.'; end if;
  if contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;
  if exists (select 1 from profiles where restaurant_id = me.restaurant_id and lower(contact_email) = contact) then
    raise exception 'Someone at this property already uses %.', contact;
  end if;

  ph := normalise_phone(p_phone);   -- raises unless it is exactly ten digits, or blank

  mine := effective_modules(me.id);
  if me.role = 'owner' then
    clamped := p_modules;
  else
    clamped := array(
      select m from unnest(coalesce(p_modules, (select default_set from role_modules where role = p_role))) m
      where m = any(mine));
  end if;

  dom  := staff_login_domain(me.restaurant_id);
  addr := nullif(trim(coalesce(p_login_id, '')), '');
  if addr is null then
    addr := suggest_staff_login(me.restaurant_id, nm);
  else
    -- a typed id is taken as the name part; the property's own domain is always appended
    addr := sanitise_local_part(split_part(addr, '@', 1)) || '@' || dom;
  end if;
  if length(split_part(addr, '@', 1)) < 3 then
    raise exception 'Use at least three characters before the @ in the sign-in id.';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then
    raise exception 'The sign-in id % is already taken. Enter a different one.', addr;
  end if;

  temp_pw := gen_temp_password();
  uid := create_auth_login(addr, temp_pw, nm);

  insert into profiles(id, restaurant_id, full_name, email, contact_email, phone, role,
                       allowed_modules, is_active, must_change_password)
    values (uid, me.restaurant_id, nm, addr, contact, ph, p_role, clamped, true, true);

  insert into temp_passwords(user_id, password, issued_by) values (uid, temp_pw, auth.uid());

  -- and a code to prove the address, so the reset path is known to work before it is needed
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into contact_otps(user_id, code_hash, sent_to) values (uid, crypt(v_code, gen_salt('bf')), contact);
  select name into prop from restaurants where id = me.restaurant_id;

  return jsonb_build_object('user_id', uid, 'full_name', nm, 'role', p_role,
                            'login_id', addr, 'temp_password', temp_pw,
                            'contact_email', contact, 'phone', ph,
                            'verify_code', v_code, 'property', coalesce(prop, 'your property'));
end $$;
