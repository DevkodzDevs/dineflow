-- 0098 · Security hardening, 2026-10-13 — a full audit of the live database and the app.
--
-- What was open. Each case is in dry98.cjs, run against the live database before and after, every
-- case inside a transaction that is always rolled back.
--
--   A stranger (the public anon key)
--   · accept_online_order_for(order, property) turned ANY property's online order into a kitchen
--     ticket; next_number(kind, property) bumped any property's bill and invoice counters (gaps in GST
--     numbering). 158 security-definer functions in all were executable with the anon key.
--   · dine_review took unlimited reviews for any listed place (and moved its public rating). Nothing
--     in the app calls it.
--   · dine_track answered "reference + phone" without limit, and reservation numbers count up from 1.
--   · /book/<slug> could not take a booking at all: public_book called next_number('booking') with no
--     property in context and raised "no restaurant context for next_number".
--   · The public writes (orders, table bookings, the queue, room bookings) had no rate limit and no
--     length limits; public_book ignored stop-sell and the online allotment the page itself shows.
--
--   Another property (any signed-in login — and a demo sandbox hands anyone an owner login)
--   · post_order_to_room marked another property's order lines and tickets served and freed its
--     table; place_order and reservation_set set another property's table occupied; create_booking took
--     another property's room (and set it reserved) and attached another property's guest.
--   · set_rate_inventory took another property's room type: a rival's booking page could be shown sold
--     out or priced at ₹1 (public_availability and public_book join rate rows on the room type alone).
--   · quote_wait and staff_login_domain answered for any property id they were given.
--   · A row of one property could point at a row of another through any of 68 foreign keys — and one
--     housekeeping task already did (left by the shared master context that 0095 fixed).
--
--   Inside a property
--   · A wrong password-reset, password-change or contact code was counted — and the raise that
--     followed rolled the count back with it. Unlimited guesses at a six-digit code.
--   · The session payload (session_bundle → session.restaurant) carried the Box token to every
--     signed-in browser, and any staff login could select it; a Box token rewrites the menu.
--   · Any staff login could write the menu, the channels, the printers and the offers directly.
--   · One-time codes and temporary passwords came from random(); a temporary password had about
--     500,000 possibilities. Invite codes were 32 bits.
--   · Every sign-in attempt bcrypt-checked every stale temporary password, every time.
--
-- Re-created functions are the live pg_get_functiondef bodies of 2026-10-13; the lines that changed
-- are marked "0098".

-- ═══ 1 · helpers ════════════════════════════════════════════════════════════════════════════════

-- A hit counter for rate limits. No policy: nothing reaches it through the API.
create table if not exists public.rate_hits (
  bucket text not null,
  at     timestamptz not null default clock_timestamp()
);
create index if not exists rate_hits_bucket_at on public.rate_hits (bucket, at desc);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;

-- One more hit in a bucket, if the bucket has room: true when allowed (and counted), false when full.
-- A hit made by a call that later raises is rolled back with it, so only calls that succeed count.
create or replace function public._hit(p_bucket text, p_max integer, p_window interval) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('rate:' || p_bucket, 0));
  select count(*) into n from rate_hits where bucket = p_bucket and at > clock_timestamp() - p_window;
  if n >= p_max then return false; end if;
  insert into rate_hits(bucket) values (p_bucket);
  if random() < 0.02 then delete from rate_hits where at < clock_timestamp() - interval '2 days'; end if;
  return true;
end $$;

-- n decimal digits from the cryptographic generator (56 random bits, so the modulo bias is nil)
create or replace function public._random_digits(p_len integer) returns text
language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(gen_random_bytes(7), 'hex'))::bit(56)::bigint) % power(10, p_len)::bigint)::text, p_len, '0')
$$;

revoke execute on function public._hit(text, integer, interval) from public, anon, authenticated;
revoke execute on function public._random_digits(integer) from public, anon, authenticated;

-- ═══ 2 · codes and temporary passwords from the cryptographic generator ═════════════════════════

-- 0098: gen_random_bytes, 32 words, six digits — about 160 million possibilities (was ~500,000)
create or replace function public.gen_temp_password() returns text
language sql volatile set search_path = public, extensions as $$
  select 'Dine'
      || (array['Fox','Sky','Bay','Palm','Reef','Dune','Kite','Sail','Moon','Fern','Lake','Pine','Rose','Star','Wave','Hill',
                'Leaf','Rain','Snow','Sand','Mint','Jade','Ruby','Gold','Iris','Lily','Sage','Teal','Wren','Hawk','Lime','Opal'])[1 + get_byte(b, 0) % 32]
      || lpad(((('x' || encode(substring(b from 2 for 6), 'hex'))::bit(48)::bigint) % 1000000)::text, 6, '0')
      || (array['!','#','@','$','%'])[1 + get_byte(b, 7) % 5]
  from (select gen_random_bytes(8) as b) x
$$;
revoke execute on function public.gen_temp_password() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_password_otp()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  code := _random_digits(6);                                                     -- 0098
  insert into password_otps(user_id, code_hash, sent_to, expires_at)
    values (uid, crypt(code, gen_salt('bf')), target, now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'code', code, 'sent_to', target, 'expires_in_minutes', 10);
end $function$;

-- 0098: the same, for the server to call with the service role on behalf of the signed-in user, so
-- the plain code never has to be handed to a browser session (0099 then closes request_password_otp)
CREATE OR REPLACE FUNCTION public.request_password_otp_for(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare pr profiles%rowtype; code text; target text; recent int;
begin
  if p_user is null then raise exception 'not signed in'; end if;
  select * into pr from profiles where id = p_user;
  if not found then raise exception 'this account has no property'; end if;
  target := nullif(trim(coalesce(pr.contact_email, '')), '');
  if target is null then
    raise exception 'No contact address on this account. Ask Master control to add one, then try again.';
  end if;
  select count(*) into recent from password_otps
   where user_id = p_user and created_at > now() - interval '1 minute';
  if recent > 0 then raise exception 'A code was just sent. Wait a minute before asking for another.'; end if;
  select count(*) into recent from password_otps
   where user_id = p_user and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many codes requested. Try again in an hour.'; end if;
  code := _random_digits(6);
  insert into password_otps(user_id, code_hash, sent_to, expires_at)
    values (p_user, crypt(code, gen_salt('bf')), target, now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'code', code, 'sent_to', target, 'expires_in_minutes', 10);
end $function$;
revoke execute on function public.request_password_otp_for(uuid) from public, anon, authenticated;
grant execute on function public.request_password_otp_for(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.request_password_reset(p_login_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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
  v_code := _random_digits(6);                                                   -- 0098
  insert into password_otps(user_id, code_hash, sent_to, expires_at)
    values (pr.id, crypt(v_code, gen_salt('bf')), target, now() + interval '10 minutes');
  select name into prop from restaurants where id = pr.restaurant_id;
  return jsonb_build_object('found', true, 'throttled', false,
    'code', v_code, 'sent_to', target, 'property', coalesce(prop, 'your property'));
end $function$;

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

CREATE OR REPLACE FUNCTION public.staff_request_contact_otp(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  v_code := _random_digits(6);                                                   -- 0098
  insert into contact_otps(user_id, code_hash, sent_to) values (p_user, crypt(v_code, gen_salt('bf')), target);
  select name into prop from restaurants where id = t.restaurant_id;
  return jsonb_build_object('throttled', false, 'code', v_code, 'sent_to', target,
                            'name', t.full_name, 'property', coalesce(prop, 'your property'));
end $function$;

-- 0098: invite codes are 48 bits (twelve hex characters), not 32
CREATE OR REPLACE FUNCTION public.create_invite(p_role user_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  c := upper(encode(gen_random_bytes(6), 'hex'));                               -- 0098
  insert into invites(restaurant_id, code, role, allowed_modules, expires_at)
    values (me.restaurant_id, c, p_role, grant_set, now() + interval '7 days');
  return c;
end $function$;

-- ═══ 3 · a wrong code is counted, and the count stays ════════════════════════════════════════════
-- The wrong-code branches used to update the try counter and then raise — and the raise rolled the
-- update back, so the five-tries limit never counted. They now answer {ok:false, error} instead.

CREATE OR REPLACE FUNCTION public.verify_password_otp(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare uid uuid := auth.uid(); o password_otps%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into o from password_otps
   where user_id = uid and consumed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then raise exception 'That code has expired. Ask for a new one.'; end if;

  if o.attempts >= 5 then
    update password_otps set consumed_at = now() where id = o.id;
    return jsonb_build_object('ok', false, 'error', 'Too many wrong tries. Ask for a new code.');      -- 0098
  end if;

  if o.code_hash <> crypt(trim(coalesce(p_code, '')), o.code_hash) then
    update password_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'error', format('That code is not right. %s tries left.', 4 - o.attempts));   -- 0098
  end if;

  update password_otps
     set consumed_at = now(), verified_until = now() + interval '15 minutes'
   where id = o.id;
  return jsonb_build_object('ok', true, 'verified_until', now() + interval '15 minutes');
end $function$;

CREATE OR REPLACE FUNCTION public.reset_password_with_code(p_login_id text, p_code text, p_new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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
    return jsonb_build_object('ok', false, 'error', 'Too many wrong tries. Ask for a new code.');      -- 0098
  end if;
  if o.code_hash <> crypt(trim(coalesce(p_code, '')), o.code_hash) then
    update password_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'error', format('That code is not right. %s tries left.', 4 - o.attempts));   -- 0098
  end if;
  update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now() where id = pr.id;
  update profiles set must_change_password = false where id = pr.id;
  update temp_passwords set password = null, consumed_at = now()
   where user_id = pr.id and password is not null;
  update password_otps set consumed_at = now(), verified_until = null where id = o.id;
  return jsonb_build_object('ok', true, 'login_id', pr.email);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_verify_contact(p_user uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  if o.attempts >= 5 then
    return jsonb_build_object('ok', false, 'verified', false, 'error', 'Too many wrong tries. Send a new code.');   -- 0098
  end if;

  if o.code_hash <> crypt(trim(coalesce(p_code, '')), o.code_hash) then
    update contact_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'verified', false, 'error', 'That code is not right.');      -- 0098
  end if;

  update contact_otps set consumed_at = now() where id = o.id;
  update profiles set contact_verified_at = now() where id = p_user;
  return jsonb_build_object('ok', true, 'verified', true, 'sent_to', o.sent_to);
end $function$;

-- ═══ 4 · one property cannot reach another's rows through an RPC ═══════════════════════════════

CREATE OR REPLACE FUNCTION public.post_order_to_room(p_order_id uuid, p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); amt numeric; ono int;
begin
  if not exists (select 1 from bookings where id = p_booking_id and restaurant_id = rid and status = 'checked_in') then raise exception 'guest not checked in'; end if;
  -- 0098: the order must be this property's and still open (a billed order posted again is charged twice)
  if not exists (select 1 from orders where id = p_order_id and restaurant_id = rid and status = 'open') then raise exception 'order not found or already settled'; end if;
  select coalesce(sum(price_snapshot*qty),0), max(o.order_no) into amt, ono from order_items i join orders o on o.id = i.order_id where i.order_id = p_order_id and i.status <> 'cancelled';
  update orders set booking_id = p_booking_id, status = 'billed' where id = p_order_id and restaurant_id = rid;
  update order_items set status = 'served' where order_id = p_order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = p_order_id;
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    values (rid, p_booking_id, 'restaurant', 'Restaurant order #'||ono, amt, 'order', p_order_id, auth.uid());
  -- restaurant GST on the posted amount
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    select rid, p_booking_id, 'tax', 'GST on order #'||ono, round(amt * r.gst_rate/100, 2), 'order', p_order_id, auth.uid() from restaurants r where r.id = rid;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = p_order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $function$;

CREATE OR REPLACE FUNCTION public.place_order(p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_placed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_promise boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; pl jsonb; c record;
  placed timestamptz; pm integer := null; pp numeric := null; due timestamptz := null;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  -- 0098: the table must be this property's (it is set occupied below)
  if p_table_id is not null and not exists (select 1 from dining_tables where id = p_table_id and restaurant_id = rid) then
    raise exception 'table not found';
  end if;
  placed := coalesce(p_placed_at, now());
  if coalesce(p_promise, false) then
    select * into r from restaurants where id = rid;
    if r.promise_enabled then
      pm := r.promise_minutes; pp := r.promise_pct;
      due := placed + make_interval(mins => pm);
    end if;
  end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes,
                     created_by, client_id, created_at, synced_at, promise_minutes, promise_pct, promised_at)
    values (rid, next_number('order'), p_table_id, p_type, 'open', p_customer->>'name', p_customer->>'phone', p_note,
            auth.uid(), p_client_id, placed, now(), pm, pp, due)
    returning id into oid;
  for c in select distinct greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) as course from jsonb_array_elements(p_items) x order by 1 loop
    insert into kots(restaurant_id, order_id, kot_no, status, held) values (rid, oid, next_number('kot'), 'pending', c.course > 1) returning id into kid;
    for it in select x from jsonb_array_elements(p_items) x where greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) = c.course loop
      pl := price_line(rid, it);
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status,
                              variant_id, variant_name, addons, components, course)
        values (rid, oid, kid, (pl->>'menu_item_id')::uuid, pl->>'name', (pl->>'price')::numeric,
                greatest(1, round((it->>'qty')::numeric)::int),
                nullif(coalesce(it->>'notes', it->>'note'), ''),
                'pending',
                nullif(pl->>'variant_id', '')::uuid, pl->>'variant_name', coalesce(pl->'addons', '[]'::jsonb), coalesce(pl->'components', '[]'::jsonb), c.course);
    end loop;
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_guest jsonb, p_room_id uuid, p_check_in date, p_check_out date, p_adults integer, p_children integer, p_rate numeric, p_advance numeric, p_source text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); gid uuid; bid uuid;
begin
  if rid is null then raise exception 'not signed in'; end if;
  -- 0098: the room, and a guest chosen from the list, must be this property's
  if not exists (select 1 from rooms where id = p_room_id and restaurant_id = rid) then raise exception 'room not found'; end if;
  if exists (select 1 from bookings where room_id = p_room_id and status in ('reserved','checked_in') and check_in < p_check_out and check_out > p_check_in)
    then raise exception 'room is not free for those dates'; end if;
  if p_guest ? 'id' and (p_guest->>'id') <> '' then gid := (p_guest->>'id')::uuid;
    if not exists (select 1 from guests where id = gid and restaurant_id = rid) then raise exception 'guest not found'; end if;   -- 0098
  else insert into guests(restaurant_id, full_name, phone, email, id_type, id_last4, address)
       values (rid, p_guest->>'full_name', p_guest->>'phone', p_guest->>'email', p_guest->>'id_type', p_guest->>'id_last4', p_guest->>'address') returning id into gid; end if;
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, advance, source, notes, created_by)
    values (rid, next_number('booking'), gid, p_room_id, p_check_in, p_check_out, p_adults, p_children, p_rate, coalesce(p_advance,0), p_source, p_notes, auth.uid()) returning id into bid;
  if p_advance > 0 then insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by) values (rid, bid, 'discount', 'Advance received', -p_advance, auth.uid()); end if;
  if p_check_in = current_date then update rooms set status = 'reserved' where id = p_room_id and status = 'available'; end if;
  return bid;
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_set(p_id uuid, p_status reservation_status, p_table uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v reservations%rowtype;
begin
  select * into v from reservations where id = p_id and restaurant_id = auth_restaurant_id();
  if not found then raise exception 'reservation not found'; end if;
  -- 0098: a table given here must be the reservation's own property's
  if p_table is not null and not exists (select 1 from dining_tables where id = p_table and restaurant_id = v.restaurant_id) then
    raise exception 'table not found';
  end if;
  update reservations set status = p_status, table_id = coalesce(p_table, table_id),
    seated_at = case when p_status = 'seated' then now() else seated_at end where id = p_id;
  if p_status = 'seated' and coalesce(p_table, v.table_id) is not null then
    update dining_tables set status = 'occupied' where id = coalesce(p_table, v.table_id);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.set_rate_inventory(p_room_type_id uuid, p_from date, p_to date, p_rate numeric, p_open integer, p_stop boolean, p_min integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); n int := 0;
begin
  -- 0098: the room type must be this property's — rate rows are read by room type on the booking page
  if rid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from room_types where id = p_room_type_id and restaurant_id = rid) then raise exception 'room type not found'; end if;
  insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
  select rid, p_room_type_id, d::date, p_rate, p_open, coalesce(p_stop,false), coalesce(p_min,1), now()
  from generate_series(p_from, p_to, interval '1 day') d
  on conflict (restaurant_id, room_type_id, stay_date) do update
    set rate = coalesce(excluded.rate, rate_inventory.rate),
        open_rooms = coalesce(excluded.open_rooms, rate_inventory.open_rooms),
        stop_sell = excluded.stop_sell, min_nights = excluded.min_nights, updated_at = now();
  get diagnostics n = row_count; return n;
end $function$;

-- 0098: the public page's rate rows are the property's own (defence in depth with section 8's triggers)
CREATE OR REPLACE FUNCTION public.public_availability(p_slug text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (select id from restaurants where booking_slug = p_slug and booking_engine),
  d as (select generate_series(p_from, p_to - 1, interval '1 day')::date sd),
  t as (select rt.id, rt.base_rate, count(rm.id)::int total from room_types rt join r on r.id = rt.restaurant_id
        left join rooms rm on rm.room_type_id = rt.id and rm.status <> 'maintenance' where rt.is_active group by rt.id, rt.base_rate)
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object('free', mf, 'rate', mr, 'stop', ms)), '{}') from (
    select t.id, min(greatest(0, coalesce(ri.open_rooms, t.total) - coalesce((select count(*) from bookings b join rooms r2 on r2.id = b.room_id
        where r2.room_type_id = t.id and b.status in ('reserved','checked_in') and b.check_in <= d.sd and b.check_out > d.sd), 0)))::int mf,
      max(coalesce(ri.rate, t.base_rate)) mr, bool_or(coalesce(ri.stop_sell,false)) ms
    from t cross join d left join rate_inventory ri on ri.room_type_id = t.id and ri.stay_date = d.sd and ri.restaurant_id = (select id from r) group by t.id) t
$function$;

-- quote_wait(party, property) is the worker the queue functions call; the screens get
-- quote_wait(party), which always answers for the caller's own property.
DROP FUNCTION IF EXISTS public.quote_wait(integer, uuid);
CREATE FUNCTION public.quote_wait(p_party integer, p_rid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := coalesce(p_rid, auth_restaurant_id()); ahead int; pulse jsonb; slot jsonb; n int := 0;
begin
  select count(*) into ahead from walkins w where w.restaurant_id = rid and w.status in ('waiting','called')
    and (case when p_party >= 5 then w.party >= 5 when p_party >= 3 then w.party between 3 and 4 else w.party <= 2 end);
  pulse := table_pulse_for(rid);
  for slot in select * from jsonb_array_elements(pulse->'tables') where (value->>'capacity')::int >= p_party order by (value->>'mins_left')::int loop
    if n = ahead then return (slot->>'mins_left')::int; end if;
    n := n + 1;
  end loop;
  return null;   -- nothing big enough at all
end $function$;
revoke execute on function public.quote_wait(integer, uuid) from public, anon, authenticated;

CREATE FUNCTION public.quote_wait(p_party integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select quote_wait(p_party, auth_restaurant_id()) $function$;
revoke execute on function public.quote_wait(integer) from public, anon;
grant execute on function public.quote_wait(integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_login_domain(p_rid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0098: a signed-in caller asks about its own property (Master control: any). staff_create_login
  -- and suggest_staff_login pass the caller's own property.
  if auth.uid() is not null and p_rid is distinct from auth_restaurant_id() and not is_platform_admin() then
    raise exception 'not your property' using errcode = '42501';
  end if;
  return assign_login_domain(p_rid);
end $function$;

-- ═══ 5 · the public writes: real limits, a working room booking ══════════════════════════════════

CREATE OR REPLACE FUNCTION public.public_book(p_slug text, p_room_type_id uuid, p_check_in date, p_check_out date, p_guest jsonb, p_adults integer DEFAULT 2, p_children integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; rm uuid; gid uuid; bid uuid; rt numeric; n int; bno int; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and booking_engine and membership in ('trial','active');
  if rid is null then raise exception 'bookings are closed'; end if;
  if p_check_out <= p_check_in or p_check_in < current_date then raise exception 'choose valid dates'; end if;
  n := p_check_out - p_check_in;
  -- 0098: online, a stay is up to 30 nights and starts within two years; longer, the property takes it
  if n > 30 or p_check_in > current_date + 730 then raise exception 'for a stay this long or this far ahead, please call the property'; end if;
  -- 0098: a name and a phone number the property can call; three bookings a day per number, twenty
  -- an hour per property
  if coalesce(trim(p_guest->>'full_name'), '') = '' then raise exception 'name and phone are needed'; end if;
  ph := right(regexp_replace(coalesce(p_guest->>'phone', ''), '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the property can call'; end if;
  if not _hit('book:' || rid || ':' || ph, 3, interval '1 day') then raise exception 'this number has booked a few times today already — please call the property'; end if;
  if not _hit('book:' || rid, 20, interval '1 hour') then raise exception 'the booking page is very busy — please try again in a few minutes'; end if;
  -- 0098: what the page shows as stop-sell, or with no rooms left to sell online, cannot be booked here either
  if exists (select 1 from rate_inventory ri where ri.restaurant_id = rid and ri.room_type_id = p_room_type_id
               and ri.stay_date >= p_check_in and ri.stay_date < p_check_out
               and (ri.stop_sell or (ri.open_rooms is not null and ri.open_rooms <= (
                     select count(*) from bookings b join rooms r2 on r2.id = b.room_id
                      where r2.room_type_id = p_room_type_id and b.status in ('reserved','checked_in')
                        and b.check_in <= ri.stay_date and b.check_out > ri.stay_date))))
    then raise exception 'those dates just filled up'; end if;
  select r.id into rm from rooms r where r.restaurant_id = rid and r.room_type_id = p_room_type_id and r.status <> 'maintenance'
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status in ('reserved','checked_in') and b.check_in < p_check_out and b.check_out > p_check_in)
    order by r.sort_order limit 1;
  if rm is null then raise exception 'those dates just filled up'; end if;
  select coalesce(max(coalesce(ri.rate, rt2.base_rate)), 0) into rt from room_types rt2
    left join rate_inventory ri on ri.room_type_id = rt2.id and ri.restaurant_id = rid and ri.stay_date between p_check_in and p_check_out - 1
    where rt2.id = p_room_type_id and rt2.restaurant_id = rid;
  insert into guests(restaurant_id, full_name, phone, email)
    values (rid, left(trim(p_guest->>'full_name'), 80), left(p_guest->>'phone', 20), left(p_guest->>'email', 120)) returning id into gid;
  -- 0098: the property's own counter. next_number('booking') looked for a property in the caller's
  -- session — a guest has none — and raised, so no booking from this page ever went through.
  bno := next_number('booking', rid);
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, notes)
    values (rid, bno, gid, rm, p_check_in, p_check_out,
            least(greatest(coalesce(p_adults, 2), 1), 20), least(greatest(coalesce(p_children, 0), 0), 20),
            rt, 'reserved', 'direct', left(p_guest->>'note', 500))
    returning id into bid;
  return jsonb_build_object('booking_id', bid, 'nights', n, 'rate', rt, 'total', rt * n);
end $function$;

CREATE OR REPLACE FUNCTION public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text DEFAULT 'delivery'::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  ph text;
begin
  select * into r from restaurants where booking_slug = p_slug and membership in ('trial','active');
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  if p_mode = 'dine_in' then
    select * into t from dining_tables where restaurant_id = rid and qr_token = p_table and p_table is not null;
    if not found then raise exception 'scan the code on your table to order'; end if;
    if not r.dining_enabled then raise exception 'ordering at the table is not switched on here'; end if;
  else
    if not r.is_listed then raise exception 'this place is not taking orders'; end if;
    if p_mode = 'delivery' and not r.delivery_enabled then raise exception 'delivery is not available here'; end if;
    if p_mode = 'takeaway' and not r.takeaway_enabled then raise exception 'takeaway is not available here'; end if;
    -- the kitchen asked for a breather: online orders wait; a guest at a table is never turned away
    if r.online_paused_until > now() then
      raise exception 'not taking online orders right now — back at %', to_char(r.online_paused_until at time zone 'Asia/Kolkata', 'HH12:MI am');
    end if;
  end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;
  -- 0098: at most 100 lines, a phone number the restaurant can call, ten orders an hour per number
  -- and three hundred an hour per place
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 100 then raise exception 'that basket is too large — please call the restaurant'; end if;
  ph := right(regexp_replace(p_guest->>'phone', '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the restaurant can call'; end if;
  if not _hit('order:' || rid || ':' || ph, 10, interval '1 hour') then raise exception 'this number has ordered a lot in the last hour — please call the restaurant'; end if;
  if not _hit('order:' || rid, 300, interval '1 hour') then raise exception 'the kitchen is very busy — please try again in a few minutes'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select m.is_active and m.is_available into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := least(99, greatest(1, (it->>'qty')::numeric));                                     -- 0098: at most 99 of a dish
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', left(it->>'note', 200),
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if p_mode <> 'dine_in' and sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active
      and scope in (case when p_mode = 'dine_in' then 'dining' else 'delivery' end, 'both') and sub >= min_order;
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  -- at the table there is nothing to pack and nothing to deliver
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + case when p_mode = 'dine_in' then 0 else r.packing_charge end;
  tot := round(sub - disc + fee + round((sub - disc) * r.gst_rate / 100, 2));

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := case when p_mode = 'dine_in' then 'TBL-' else 'WEB-' end || to_char(now(), 'YYMMDDHH24MISS') || '-' || encode(extensions.gen_random_bytes(2), 'hex');   -- 0098
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at, table_id)
    values (rid, ch.id, ext, right(ext, 6), left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20),
            case when p_mode = 'dine_in' then 'Table ' || t.name else left(p_guest->>'address', 300) end,
            items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name), now(), t.id)
    returning id into oid;
  -- a table order goes straight to the kitchen when the website channel accepts on its own
  if p_mode = 'dine_in' and ch.auto_accept then
    accepted := accept_online_order_for(oid, rid);
    select order_no into ono from orders where id = accepted;
  end if;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'table', t.name, 'accepted', accepted is not null, 'order_no', ono,
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end
           + case when r.rush_until > now() then coalesce(r.rush_extra_min, 0) else 0 end);
end $function$;

CREATE OR REPLACE FUNCTION public.dine_reserve(p_slug text, p_guest jsonb, p_date date, p_time time without time zone, p_party integer, p_occasion text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; no int; cap int; taken int; off offers%rowtype; res_id uuid; ph text;
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and dining_enabled and membership in ('trial','active');
  if not found then raise exception 'this place is not taking bookings'; end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;
  if p_date < current_date then raise exception 'choose a future time'; end if;
  rid := r.id;
  -- 0098: a phone number the restaurant can call; five bookings a day per number, sixty an hour per place
  ph := right(regexp_replace(p_guest->>'phone', '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the restaurant can call'; end if;
  if not _hit('reserve:' || rid || ':' || ph, 5, interval '1 day') then raise exception 'this number has booked a few tables today already — please call the restaurant'; end if;
  if not _hit('reserve:' || rid, 60, interval '1 hour') then raise exception 'bookings are very busy right now — please try again in a few minutes'; end if;
  cap := coalesce(r.seats_per_slot, greatest(8, (select coalesce(sum(capacity), 0) from dining_tables where restaurant_id = rid)));
  select coalesce(sum(party_size), 0) into taken from reservations
    where restaurant_id = rid and on_date = p_date and status in ('requested','confirmed','seated')
      and at_time >= p_time - make_interval(mins => r.slot_minutes) and at_time < p_time + make_interval(mins => r.slot_minutes);
  if cap - taken < p_party then raise exception 'that time just filled up — please pick another'; end if;
  if p_offer is not null then select * into off from offers where id = p_offer and restaurant_id = rid and is_active; end if;
  select coalesce(max(reservation_no), 0) + 1 into no from reservations where restaurant_id = rid;
  insert into reservations(restaurant_id, reservation_no, guest_name, guest_phone, guest_email, on_date, at_time, party_size, occasion, note, status, offer_id, offer_label, discount_pct)
    values (rid, no, left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20), left(p_guest->>'email', 120), p_date, p_time, greatest(1, p_party), left(p_occasion, 60), left(p_note, 500),
            'confirmed', off.id, off.title, case when off.kind = 'flat_pct' then off.value else 0 end)
    returning id into res_id;
  return jsonb_build_object('ok', true, 'id', res_id, 'no', no, 'name', r.name, 'date', p_date, 'time', to_char(p_time, 'HH24:MI'),
    'party', p_party, 'offer', off.title, 'discount_pct', case when off.kind = 'flat_pct' then off.value else 0 end, 'phone', r.phone, 'address', r.address);
end $function$;

CREATE OR REPLACE FUNCTION public.queue_join(p_slug text, p_name text, p_phone text, p_party integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; q int; w walkins; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed and membership in ('trial','active');
  if rid is null then raise exception 'this place is not taking a queue right now'; end if;
  if p_party < 1 or p_party > 20 then raise exception 'party size must be between 1 and 20'; end if;
  if (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting') >= 60 then raise exception 'the queue is full — please ask at the counter'; end if;
  -- 0098: three joins an hour per phone number, a hundred and fifty an hour per place
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if ph <> '' and not _hit('queue:' || rid || ':' || ph, 3, interval '1 hour') then raise exception 'this number has joined a few times already — please ask at the counter'; end if;
  if not _hit('queue:' || rid, 150, interval '1 hour') then raise exception 'the queue is very busy — please ask at the counter'; end if;
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, left(p_name, 60), nullif(left(p_phone, 20), ''), p_party, q, 'qr') returning * into w;
  return queue_status(w.token);
end $function$;

-- 0098: ten misses an hour for a phone number and it stops answering, so a known number cannot be
-- walked through every reference (reservation numbers count up from 1)
CREATE OR REPLACE FUNCTION public.dine_track(p_ref text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ph text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); res jsonb;
begin
  if length(ph) < 6 or coalesce(trim(p_ref), '') = '' then return null; end if;
  if (select count(*) from rate_hits where bucket = 'track:' || ph and at > clock_timestamp() - interval '1 hour') >= 10 then
    raise exception 'too many tries for this number — please wait an hour or call the restaurant';
  end if;
  res := coalesce(
    (select jsonb_build_object('kind','order','status', o.status, 'ref', o.display_id, 'name', r.name, 'items', o.items, 'total', o.gross, 'placed_at', o.placed_at, 'phone', r.phone)
     from online_orders o join restaurants r on r.id = o.restaurant_id where o.display_id = p_ref and o.customer_phone = p_phone limit 1),
    (select jsonb_build_object('kind','reservation','status', v.status, 'ref', v.reservation_no::text, 'name', r.name, 'date', v.on_date, 'time', to_char(v.at_time,'HH24:MI'), 'party', v.party_size, 'offer', v.offer_label, 'phone', r.phone)
     from reservations v join restaurants r on r.id = v.restaurant_id where v.reservation_no::text = p_ref and v.guest_phone = p_phone limit 1));
  if res is null then insert into rate_hits(bucket) values ('track:' || ph); end if;
  return res;
end $function$;

-- ═══ 6 · demo sandboxes ═════════════════════════════════════════════════════════════════════════
-- The sweep deletes sign-in accounts. It ran for anyone with the anon key; now "Try a demo" sweeps
-- inside create_demo_sandbox, and the API sweep is Master control's.

CREATE OR REPLACE FUNCTION public._sweep_expired_demos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare r record; n int := 0;
begin
  for r in select id from restaurants where demo_expires_at is not null and demo_expires_at < now() loop
    -- collect user ids before cascade deletes profiles
    delete from auth.users where id in (select p.id from profiles p where p.restaurant_id = r.id);
    delete from restaurants where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public._sweep_expired_demos() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sweep_expired_demos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;   -- 0098
  return _sweep_expired_demos();
end $function$;

CREATE OR REPLACE FUNCTION public.create_demo_sandbox(p_type property_type DEFAULT 'restaurant'::property_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  rid uuid; v_slug text; v_code text; uid uuid; temp_pw text; login_email text;
  demo_modules text[];
begin
  perform _sweep_expired_demos();                                                -- 0098: was the caller's job
  -- rate limit: no more than 10 demo properties per hour globally
  if (select count(*) from restaurants where demo_expires_at is not null
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many demo requests. Try again in a few minutes.';
  end if;

  v_slug := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  v_code := 'demo-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  login_email := v_code || '@demo.dineflow.local';
  temp_pw := gen_temp_password();

  insert into restaurants(name, slug, code, property_type, booking_slug, demo_expires_at,
                          membership, membership_plan, membership_ends_at,
                          enabled_modules)
    values ('Demo ' || initcap(p_type::text), v_slug, v_code, p_type, v_slug,
            now() + interval '8 hours', 'active', 'demo', now() + interval '8 hours',
            array['dashboard','orders','menu','billing','kitchen','reports','inventory',
                  case when p_type in ('hotel','resort') then 'rooms' else 'reservations' end,
                  case when p_type in ('hotel','resort') then 'frontdesk' else 'pulse' end])
    returning id into rid;

  -- create a throwaway auth user
  uid := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', login_email,
          crypt(temp_pw, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', 'Demo ' || initcap(p_type::text)),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', login_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into profiles(id, restaurant_id, full_name, email, role, must_change_password, is_active)
    values (uid, rid, 'Demo User', login_email, 'owner', false, true);

  -- seed sample data using the demo user's context
  begin
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
    perform seed_demo_data();
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    -- sample data failure is not fatal for the demo
  end;

  return jsonb_build_object('ok', true, 'login_email', login_email, 'password', temp_pw,
    'type', p_type, 'expires_in_hours', 8, 'id', rid);
end $function$;

-- ═══ 7 · who may call what ══════════════════════════════════════════════════════════════════════

-- Internal: every caller is itself SECURITY DEFINER and runs them as their owner.
revoke execute on function public.next_number(text, uuid) from public, anon, authenticated;
revoke execute on function public.accept_online_order_for(uuid, uuid) from public, anon, authenticated;
-- Nothing in the app calls it, and it took unlimited reviews for any listed place.
revoke execute on function public.dine_review(text, text, integer, text, text) from public, anon, authenticated;

-- The anon key may execute a SECURITY DEFINER function only if strangers are meant to call it (a
-- slug or a token is its key) or an RLS policy calls it on the caller's behalf. Signed-in screens
-- and the service role keep exactly the access they had.
do $$
declare
  f record; pol text; had_auth boolean; had_svc boolean;
  keep text[] := array[
    -- the public pages
    'dine_busy','dine_discover','dine_order','dine_reserve','dine_slots','dine_storefront','dine_track',
    'public_availability','public_book','public_property',
    'queue_join','queue_leave','queue_status',
    'checkin_view','checkin_submit',
    'pay_link','pay_link_claim','pay_link_review',
    'proof_open','ical_feed','ingest_online_order',
    -- the Box (its token is the key)
    'box_pull','box_push','box_sync',
    -- "Try a demo" on the sign-in page
    'create_demo_sandbox'];
begin
  select string_agg(coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' ') into pol from pg_policies;
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')
       and not (p.proname = any(keep))
       and not (coalesce(pol, '') ~ ('\m' || p.proname || '\s*\('))
  loop
    had_auth := has_function_privilege('authenticated', f.oid, 'execute');
    had_svc  := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if had_auth then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if had_svc  then execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;
end $$;

-- A function created from now on is not executable by anon until a migration grants it on purpose.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ═══ 8 · a row of one property never points at a row of another ════════════════════════════════
-- Every single-column foreign key between two tables that both carry restaurant_id (68 today) gets a
-- BEFORE INSERT / UPDATE OF <column> check. It runs as the owner, so RLS cannot hide the row it looks
-- up; a missing row is left to the foreign key itself.

create or replace function public._same_property() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me  jsonb := to_jsonb(new);
  was jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  rid uuid  := (me ->> 'restaurant_id')::uuid;
  i int := 0; col text; ref text; refcol text; v text; owner uuid;
begin
  if rid is null then return new; end if;
  while i < tg_nargs loop
    col := tg_argv[i]; ref := tg_argv[i + 1]; refcol := tg_argv[i + 2]; i := i + 3;
    v := me ->> col;
    continue when v is null;
    continue when tg_op = 'UPDATE' and v is not distinct from (was ->> col)
                  and (me ->> 'restaurant_id') is not distinct from (was ->> 'restaurant_id');
    execute format('select restaurant_id from public.%I where %I = $1::uuid', ref, refcol) into owner using v;
    if owner is not null and owner <> rid then
      raise exception '% belongs to another property (%)', col, ref using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public._same_property() from public, anon, authenticated;

-- the one row that already crossed: a housekeeping task of one property on another property's room
delete from public.housekeeping_tasks h using public.rooms r
 where r.id = h.room_id and r.restaurant_id is distinct from h.restaurant_id;

do $$
declare t record;
begin
  for t in
    select c.conrelid::regclass as tbl,
           string_agg(format('%L, %L, %L', a.attname, ft.relname, fa.attname), ', ' order by a.attname) as args,
           string_agg(quote_ident(a.attname), ', ' order by a.attname) as cols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ft on ft.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
     where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and a.attname <> 'restaurant_id' and a.atttypid = 'uuid'::regtype
       and exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'restaurant_id' and not x.attisdropped)
       and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'restaurant_id' and not x.attisdropped)
     group by c.conrelid
  loop
    execute format('drop trigger if exists zz_same_property on %s', t.tbl);
    execute format('create trigger zz_same_property before insert or update of %s, restaurant_id on %s for each row execute function public._same_property(%s)',
                   t.cols, t.tbl, t.args);
  end loop;
end $$;

-- ═══ 9 · role walls: the menu, the channels, the printers, the offers ══════════════════════════
-- A direct write needs the section that writes it on screen: Menu for the menu's tables, Channels for
-- the OTA and aggregator channels, Settings for printers and offers. RPCs run as their owner and are
-- not affected. (A screen that is not yours redirects you away; these keep the API to the same rule.)
do $$
declare w record;
begin
  for w in select * from (values
      ('categories', 'menu'), ('menu_variants', 'menu'), ('addon_groups', 'menu'), ('addons', 'menu'),
      ('menu_item_addon_groups', 'menu'), ('combo_items', 'menu'), ('recipe_items', 'menu'),
      ('ota_channels', 'channels'), ('order_channels', 'channels'),
      ('printers', 'settings'), ('offers', 'settings')) as v(tbl, module)
  loop
    execute format('drop policy if exists module_wall_insert on public.%I', w.tbl);
    execute format('create policy module_wall_insert on public.%I as restrictive for insert to authenticated with check ((select has_module(%L)))', w.tbl, w.module);
    execute format('drop policy if exists module_wall_update on public.%I', w.tbl);
    execute format('create policy module_wall_update on public.%I as restrictive for update to authenticated using ((select has_module(%L))) with check ((select has_module(%L)))', w.tbl, w.module, w.module);
    execute format('drop policy if exists module_wall_delete on public.%I', w.tbl);
    execute format('create policy module_wall_delete on public.%I as restrictive for delete to authenticated using ((select has_module(%L)))', w.tbl, w.module);
  end loop;
end $$;

-- A dish is written from three screens: Menu (anything), Scan ("add as a dish" — a new dish only) and
-- Online orders (mapping a dish to an aggregator's id — external_refs only).
create or replace function public.guard_menu_item_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;   -- RPCs, service role
  if has_module('menu') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and has_module('scan') then return new; end if;
  if tg_op = 'UPDATE' and has_module('online-orders')
     and (to_jsonb(new) - 'external_refs') = (to_jsonb(old) - 'external_refs') then return new; end if;
  raise exception 'your role cannot change the menu' using errcode = '42501';
end $$;
drop trigger if exists guard_menu_item_write on public.menu_items;
create trigger guard_menu_item_write before insert or update or delete on public.menu_items
  for each row execute function public.guard_menu_item_write();

-- ═══ 10 · secrets stay where they belong ════════════════════════════════════════════════════════

-- The Box token: not in the session payload, and not selectable through the API by anyone. The Box
-- reaches its own row with the token (box_*), Settings issues one with box_issue_token.
CREATE OR REPLACE FUNCTION public.session_bundle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
  acting as (select admin_acting_as() as rid),
  target as (
    select coalesce((select restaurant_id from prof), (select rid from acting)) as id
  ),
  rest as (select r.* from restaurants r, target t where r.id = t.id),
  late as (
    select count(*)::int as c
    from kots k, target t
    where k.restaurant_id = t.id and k.status in ('pending', 'preparing')
      and k.created_at < now() - interval '15 minutes'
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'user_id',    (select uid from me),
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) from prof p),
    'restaurant', (select to_jsonb(r) - 'box_token' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid)
  ) end;
$function$;

do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute where attrelid = 'public.restaurants'::regclass and attnum > 0 and not attisdropped and attname <> 'box_token';
  revoke select on public.restaurants from anon, authenticated;
  execute format('grant select (%s) on public.restaurants to anon, authenticated', cols);
end $$;

-- Whether a channel has a partner API key, for the Channels screen to show without reading the key.
-- (0099 then takes the key itself out of the API's reach, once the screen no longer selects it.)
alter table public.ota_channels   add column if not exists has_api_key boolean generated always as (coalesce(api_key, '') <> '') stored;
alter table public.order_channels add column if not exists has_api_key boolean generated always as (coalesce(api_key, '') <> '') stored;

-- ═══ 11 · sign-in ═══════════════════════════════════════════════════════════════════════════════

-- The four-day lockout checks each stale temporary password once. It used to bcrypt-check every one
-- of them on every sign-in attempt by anyone — after the scramble the row still qualified.
CREATE OR REPLACE FUNCTION public.enforce_temp_password_lockout()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select tp.id, tp.user_id, tp.password
      from temp_passwords tp
      join profiles p on p.id = tp.user_id
     where tp.password is not null                        -- still in the vault (not yet expired/consumed)
       and p.must_change_password = true                  -- owner has not set their own
       and tp.issued_at + interval '4 days' < now()       -- past the 4-day mark
  loop
    -- only lock once: check the hash still matches the temp password
    if (select u.encrypted_password = crypt(r.password, u.encrypted_password) from auth.users u where u.id = r.user_id) then
      -- scramble to a random value nobody holds
      update auth.users set encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
                            updated_at = now()
       where id = r.user_id;
      n := n + 1;
    end if;
    update temp_passwords set password = null where id = r.id;   -- 0098: checked once; past its use either way
  end loop;
  return n;
end $function$;

-- Failed sign-ins through the app: ten an account and thirty an address in fifteen minutes. The
-- sign-in action asks before it tries and reports a failure after; service role only.
create or replace function public.login_gate(p_login text, p_ip text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from rate_hits where bucket = 'login:' || lower(coalesce(p_login, '')) and at > clock_timestamp() - interval '15 minutes') < 10
     and (coalesce(p_ip, '') = ''
          or (select count(*) from rate_hits where bucket = 'login-ip:' || p_ip and at > clock_timestamp() - interval '15 minutes') < 30)
$$;
create or replace function public.login_failed(p_login text, p_ip text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into rate_hits(bucket) values ('login:' || lower(coalesce(p_login, '')));
  if coalesce(p_ip, '') <> '' then insert into rate_hits(bucket) values ('login-ip:' || p_ip); end if;
  if random() < 0.02 then delete from rate_hits where at < clock_timestamp() - interval '2 days'; end if;
end $$;
revoke execute on function public.login_gate(text, text) from public, anon, authenticated;
revoke execute on function public.login_failed(text, text) from public, anon, authenticated;
grant execute on function public.login_gate(text, text) to service_role;
grant execute on function public.login_failed(text, text) to service_role;

-- Master control asks whether its own sign-in still uses the password migration 0011 shipped with
-- (it is printed in this repository); the overview shows a red notice until it is changed.
create or replace function public.master_password_is_default() returns boolean
language sql stable security definer set search_path = public, auth, extensions as $$
  select coalesce((
    select u.encrypted_password = crypt('DineFlow@Master2026', u.encrypted_password)
      from auth.users u join platform_admins p on p.user_id = u.id
     where u.id = auth.uid()), false)
$$;
revoke execute on function public.master_password_is_default() from public, anon;
grant execute on function public.master_password_is_default() to authenticated;

-- ═══ 12 · what anon may read and write directly ═════════════════════════════════════════════════

-- The Box's sync state and the neighbours cache were readable with the anon key.
alter policy read_all on public.sync_state to authenticated;
alter policy read_all on public.neighbours_cache to authenticated;

-- No table is written directly with the anon key — every public write is an RPC. RLS already
-- refused these; now the grant does too, for every table that exists and every table to come.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
