-- 0061 · A short sign-in domain, and a staff code that reads like a position.
--
--   ravi@kanyakumari-bay-resort.in   →   ravi@kbr.in
--   and every person carries S-000001, W-000014, E-000007 …
--
-- Two things worth saying up front.
--
-- The domain is now STORED on the property rather than derived from its name each time. Deriving it
-- looked tidier until you rename a property: every login already issued keeps the old domain, and a
-- freshly derived one would no longer match, so new staff would land on a domain nobody else is on.
-- Stored once, it survives the rename.
--
-- The codes come from the counters table, which only ever counts up. That is the whole requirement:
-- if S-000003 leaves, the next supervisor is S-000004, never S-000003 again. A retired number stays
-- retired, so an old roster or a printed badge can never point at a second person.

-- ───────── 1 · a short, symbol-free domain ─────────
alter table restaurants add column if not exists login_domain text;
create unique index if not exists restaurants_login_domain_idx on restaurants(login_domain);

-- "Kanyakumari Bay Resort" → kbr · "Sea View" → seaview · "The Madras Kitchen" → tmk
-- Short enough to type, letters and digits only. A name that squashes down to twelve characters or
-- fewer is used whole, because "seaview" reads better than "sv"; anything longer becomes initials.
create or replace function short_property_key(p_name text) returns text
language plpgsql immutable set search_path = public as $$
declare words text[]; flat text; ini text;
begin
  words := array_remove(
    regexp_split_to_array(lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')), '\s+'), '');
  flat := array_to_string(words, '');
  if flat = '' then return 'dineflow'; end if;
  if length(flat) <= 12 then return flat; end if;
  select string_agg(left(w, 1), '' order by ord) into ini from unnest(words) with ordinality as t(w, ord);
  if length(ini) >= 3 then return ini; end if;
  return left(flat, 12);
end $$;

-- Assign once and keep it. Two properties that reduce to the same key get kbr.in and kbr2.in, so the
-- domain alone still tells the two apart — which is what keeps every login unique platform-wide.
create or replace function assign_login_domain(p_rid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare base text; try text; n int := 1; existing text;
begin
  select login_domain into existing from restaurants where id = p_rid;
  if existing is not null then return existing; end if;
  select short_property_key(name) into base from restaurants where id = p_rid;
  try := base || '.in';
  while exists (select 1 from restaurants where login_domain = try) loop
    n := n + 1;
    try := base || n::text || '.in';
  end loop;
  update restaurants set login_domain = try where id = p_rid;
  return try;
end $$;

create or replace function staff_login_domain(p_rid uuid) returns text
language sql volatile security definer set search_path = public as $$
  select assign_login_domain(p_rid);
$$;

do $$
declare r record;
begin
  for r in select id from restaurants where login_domain is null order by created_at loop
    perform assign_login_domain(r.id);
  end loop;
end $$;

-- ───────── 2 · the staff code ─────────
alter table profiles add column if not exists staff_code text;
create unique index if not exists profiles_staff_code_idx on profiles(restaurant_id, staff_code);
comment on column profiles.staff_code is
  'Position letter plus a running number, e.g. S-000001. The number comes from counters, which only ever increases, so a code belonging to someone who has left is never handed to anyone else.';

create or replace function role_code_prefix(r user_role) returns text
language sql immutable as $$
  select case r
    when 'owner'        then 'O'
    when 'manager'      then 'M'
    when 'supervisor'   then 'S'
    when 'supervisor_2' then 'SS'
    when 'employee'     then 'E'
    when 'cashier'      then 'C'
    when 'waiter'       then 'W'
    when 'chef'         then 'K'      -- C is the cashier's
    when 'store'        then 'ST'
    when 'frontdesk'    then 'F'
    when 'housekeeping' then 'H'
    else 'E' end;
$$;

-- next_number() reads auth_restaurant_id(), which is null during a migration backfill, so the
-- property is passed in explicitly here. Same counters table, same one-way count.
create or replace function next_staff_code(p_rid uuid, p_role user_role) returns text
language plpgsql security definer set search_path = public as $$
declare pfx text; v int;
begin
  pfx := role_code_prefix(p_role);
  insert into counters(restaurant_id, kind, value) values (p_rid, 'staff_' || pfx, 1)
    on conflict (restaurant_id, kind) do update set value = counters.value + 1
    returning value into v;
  return pfx || '-' || lpad(v::text, 6, '0');
end $$;

-- everyone already on the books gets a code, oldest first, so the numbering reads like the hiring order
do $$
declare p record;
begin
  for p in select id, restaurant_id, role from profiles where staff_code is null order by restaurant_id, created_at loop
    update profiles set staff_code = next_staff_code(p.restaurant_id, p.role) where id = p.id;
  end loop;
end $$;

-- ───────── 3 · the code follows the position ─────────
-- A waiter promoted to supervisor stops being W-000014 and becomes S-000004: the code says what they
-- do, which is what it is for. W-000014 is retired with them and never reissued. Anything that
-- doesn't change the position letter leaves the code alone.
create or replace function owner_set_access(p_user uuid, p_role user_role, p_modules text[], p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; owners int; mine text[]; clamped text[]; new_code text;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people'; end if;

  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;

  if target.id = me.id then raise exception 'you cannot change your own access — ask someone above you'; end if;

  if me.role <> 'owner' then
    if role_rank(target.role) >= role_rank(me.role) then raise exception 'you cannot change someone at or above your own level'; end if;
    if role_rank(p_role)     >= role_rank(me.role) then raise exception 'you cannot give someone your own level or higher'; end if;
  end if;

  if p_role = 'owner' then
    clamped := null;
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

-- ───────── 4 · a new member of staff gets both ─────────
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
  select * into me from profiles where id = auth.uid() and is_active;
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
