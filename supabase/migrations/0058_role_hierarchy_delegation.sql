-- 0058 · Who may manage whom, and who may hand out which sections.
--
-- The property now has a ladder rather than a flat list of jobs:
--
--     owner              — the property is theirs; everything, including Settings
--      └ manager         — runs the place day to day
--         └ supervisor          — runs a shift or a department
--            └ supervisor (2nd) — runs a team inside it
--               └ employee      — and the job roles: waiter, chef, cashier, store, front desk, housekeeping
--
-- Two rules hold the ladder up, and both are enforced here rather than in the app, because the app is
-- only the form in front of them:
--
--   1. You may only manage, and only hand out, a rank strictly BELOW your own. Nobody promotes a peer,
--      nobody edits their own access. (An owner is exempt from the strictly-below part so that one
--      owner can hand the property to another — the last-owner guard below still applies.)
--
--   2. You may only pass on sections you hold YOURSELF. This is the difference between "delegate" and
--      "assign" in the classic RBAC sense, and it is the whole reason a supervisor limited to the
--      kitchen cannot quietly give their team the till. The old owner_set_access stored whatever
--      p_modules it was handed, so a manager could widen their own row by calling it on themselves —
--      the self-check only looked at the role and the active flag, never the sections. Both holes
--      close here.

-- ───────── the ladder ─────────
create or replace function role_rank(r user_role) returns int
language sql immutable as $$
  select case r
    when 'owner' then 100
    when 'manager' then 80
    when 'supervisor' then 60
    when 'supervisor_2' then 40
    else 20                      -- employee and the job roles are all individual contributors
  end;
$$;

-- ───────── what each rank may ever hold, and what it holds until someone says otherwise ─────────
-- "ceiling" is the most this role can ever be granted; "default_set" is what it gets while
-- profiles.allowed_modules is null. The three new ranks have a wide ceiling and a modest default
-- deliberately: the owner decides their sections by ticking, and cannot tick past the ceiling.
create table if not exists role_modules (
  role        user_role primary key,
  ceiling     text[] not null,
  default_set text[] not null
);
comment on table role_modules is 'Mirrors ROLE_ACCESS/ROLE_DEFAULT in packages/shared/src/constants.ts. The app reads its copy for the UI; this one is what actually bounds a grant. Change both together.';

insert into role_modules(role, ceiling, default_set) values
  ('owner',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,channels,reports,tax,staff,settings}',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,channels,reports,tax,staff,settings}'),
  ('manager',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,channels,reports,tax,staff}',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,channels,reports,tax,staff}'),
  ('supervisor',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,channels,reports,tax,staff}',
   '{dashboard,scan,orders,kitchen,billing,pulse,reservations,inventory,staff,reports}'),
  ('supervisor_2',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour,proof,neighbours,reports,staff}',
   '{dashboard,scan,orders,kitchen,pulse,reservations,staff}'),
  ('employee',
   '{dashboard,tomorrow,scan,frontdesk,rooms,housekeeping,guests,facilities,reservations,pulse,orders,online-orders,kitchen,billing,invoices,menu,inventory,labour}',
   '{dashboard,scan,orders,pulse}'),
  ('cashier',      '{scan,reservations,pulse,orders,online-orders,billing,invoices,reports,frontdesk,dashboard}', '{scan,reservations,pulse,orders,online-orders,billing,invoices,reports,frontdesk,dashboard}'),
  ('waiter',       '{scan,orders,reservations,pulse,dashboard}',                                                  '{scan,orders,reservations,pulse,dashboard}'),
  ('chef',         '{scan,kitchen,menu,online-orders,tomorrow,dashboard}',                                        '{scan,kitchen,menu,online-orders,tomorrow,dashboard}'),
  ('store',        '{scan,inventory,labour,tomorrow,neighbours,dashboard}',                                       '{scan,inventory,labour,tomorrow,neighbours,dashboard}'),
  ('frontdesk',    '{scan,frontdesk,rooms,guests,facilities,housekeeping,reservations,invoices,labour,channels,dashboard}', '{scan,frontdesk,rooms,guests,facilities,housekeeping,reservations,invoices,labour,channels,dashboard}'),
  ('housekeeping', '{scan,housekeeping,rooms,dashboard}',                                                         '{scan,housekeeping,rooms,dashboard}')
on conflict (role) do update set ceiling = excluded.ceiling, default_set = excluded.default_set;

alter table role_modules enable row level security;
drop policy if exists read_all on role_modules;
create policy read_all on role_modules for select using (true);   -- a lookup table, the same for everyone

-- ───────── what one person can actually open ─────────
-- their ticks (or the role default) ∩ the role's ceiling ∩ the master's set for the property.
-- Dashboard and Settings are never withheld by the master; Settings is still bounded by the ceiling,
-- so only an owner ends up with it.
create or replace function effective_modules(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select m from unnest(
      case when p.role = 'owner' then rm.ceiling else coalesce(p.allowed_modules, rm.default_set) end
    ) m
    where m = any(rm.ceiling)
      and (r.enabled_modules is null or m = any(r.enabled_modules) or m in ('dashboard', 'settings'))
  ), '{}'::text[])
  from profiles p
  join role_modules rm on rm.role = p.role
  join restaurants r on r.id = p.restaurant_id
  where p.id = p_user and p.is_active;
$$;

-- ───────── setting someone's role, sections and active flag ─────────
create or replace function owner_set_access(p_user uuid, p_role user_role, p_modules text[], p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; owners int; mine text[]; clamped text[];
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'not a member of this property'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people'; end if;

  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;

  -- rule 1 · nobody edits their own access. Sections included: widening your own row was the hole.
  if target.id = me.id then raise exception 'you cannot change your own access — ask someone above you'; end if;

  -- rule 1 · strictly below, both for who you touch and for what you make them.
  -- An owner is exempt so a property can be handed over; the last-owner guard below still holds.
  if me.role <> 'owner' then
    if role_rank(target.role) >= role_rank(me.role) then raise exception 'you cannot change someone at or above your own level'; end if;
    if role_rank(p_role)     >= role_rank(me.role) then raise exception 'you cannot give someone your own level or higher'; end if;
  end if;

  -- rule 2 · delegate, never assign: the grant is clamped to what the grantor holds.
  -- An owner holds everything the master allowed, so their tick list passes through untouched.
  if p_role = 'owner' then
    clamped := null;                                   -- an owner is never section-restricted
  else
    mine := effective_modules(me.id);
    clamped := array(
      select m from unnest(coalesce(p_modules, (select default_set from role_modules where role = p_role))) m
      where m = any(mine)
    );
  end if;

  -- the last active owner cannot be demoted or switched off
  if target.role = 'owner' and (p_role <> 'owner' or not p_active) then
    select count(*) into owners from profiles
      where restaurant_id = me.restaurant_id and role = 'owner' and is_active and id <> target.id;
    if owners = 0 then raise exception 'this is the last owner — make someone else an owner first'; end if;
  end if;

  update profiles set role = p_role, allowed_modules = clamped, is_active = p_active where id = target.id;
end $$;

-- ───────── invites carry the same clamp ─────────
-- Without this a supervisor confined to the kitchen could invite an employee and the employee would
-- land on the role's default set — sections the supervisor does not hold. The invite remembers what
-- the inviter could pass on, and join_restaurant applies it.
alter table invites add column if not exists allowed_modules text[];

create or replace function create_invite(p_role user_role) returns text
language plpgsql security definer set search_path = public as $$
declare me profiles; c text; mine text[]; grant_set text[];
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'not allowed'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot invite people'; end if;
  if p_role = 'owner' then raise exception 'an owner is appointed in Staff, not by invite code'; end if;
  if me.role <> 'owner' and role_rank(p_role) >= role_rank(me.role) then
    raise exception 'you cannot invite someone at your own level or higher';
  end if;

  if me.role = 'owner' then
    grant_set := null;                                 -- the role's own default applies
  else
    mine := effective_modules(me.id);
    grant_set := array(
      select m from unnest((select default_set from role_modules where role = p_role)) m
      where m = any(mine)
    );
  end if;

  c := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into invites(restaurant_id, code, role, allowed_modules, expires_at)
    values (me.restaurant_id, c, p_role, grant_set, now() + interval '7 days');
  return c;
end $$;

-- ───────── gates that follow the sections, not a fixed list of job titles ─────────
-- Most operational RPCs are reached only from a screen, and the screen is already gated by the
-- section the owner granted. close_day was the exception: it named owner/manager/cashier outright,
-- so a supervisor the owner had put on the till would see the Day close button on a Billing screen
-- they were granted, press it, and be told "not allowed". The gate now asks the same question the
-- menu does. Property-level decisions — redeeming a membership, joining the district network,
-- publishing the business record, pairing a Box — keep their owner/manager gates deliberately:
-- those are not "use this section", they are "commit the property to something".
create or replace function has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_module = any(effective_modules(auth.uid()));
$$;

create or replace function close_day(p_date date, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); did uuid;
begin
  if not has_module('billing') then raise exception 'you do not have the billing section'; end if;
  insert into day_closes(restaurant_id, business_date, orders_count, total_sales, cash, upi, card, other, notes, closed_by)
  select rid, p_date, count(distinct b.id), coalesce(sum(b.total),0),
    coalesce(sum(case when p.method='cash' then p.amount end),0),
    coalesce(sum(case when p.method='upi' then p.amount end),0),
    coalesce(sum(case when p.method='card' then p.amount end),0),
    coalesce(sum(case when p.method='other' then p.amount end),0),
    p_notes, auth.uid()
  from bills b left join payments p on p.bill_id = b.id
  where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = p_date
  on conflict (restaurant_id, business_date) do update set
    orders_count = excluded.orders_count, total_sales = excluded.total_sales, cash = excluded.cash,
    upi = excluded.upi, card = excluded.card, other = excluded.other, notes = excluded.notes, closed_at = now()
  returning id into did;
  return did;
end $$;

-- join_restaurant, unchanged except that it now honours the invite's clamp
create or replace function join_restaurant(p_code text, p_full_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; r restaurants%rowtype; code text; mine profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  code := trim(coalesce(p_code, ''));
  if code = '' then raise exception 'Enter the code your manager gave you.'; end if;

  select * into mine from profiles where id = auth.uid();
  if found then
    raise exception 'This account already belongs to %.',
      (select name from restaurants where id = mine.restaurant_id);
  end if;

  select * into inv from invites
   where invites.code = upper(code) and used_by is null and expires_at > now();
  if found then
    insert into profiles(id, restaurant_id, full_name, email, role, allowed_modules, is_active)
      values (auth.uid(), inv.restaurant_id, p_full_name,
              (select email from auth.users where id = auth.uid()), inv.role, inv.allowed_modules, true);
    update invites set used_by = auth.uid() where id = inv.id;
    return jsonb_build_object('ok', true, 'pending', false, 'role', inv.role,
      'property', (select name from restaurants where id = inv.restaurant_id));
  end if;

  select * into r from restaurants where lower(restaurants.code) = lower(code) and not is_shadow;
  if not found then
    raise exception 'That code does not match any property. Check it with your manager.';
  end if;

  -- a DineFlow code gets you in the door only: switched off until someone above approves you
  insert into profiles(id, restaurant_id, full_name, email, role, is_active)
    values (auth.uid(), r.id, p_full_name,
            (select email from auth.users where id = auth.uid()), 'employee', false);
  return jsonb_build_object('ok', true, 'pending', true, 'role', 'employee', 'property', r.name);
end $$;
