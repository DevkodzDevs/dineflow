-- 0106 · Batch 3 of the Petpooja gap list (2026-10-17): a chain of outlets, and payroll.
--
-- OUTLETS. An owner may run more than one property. Each outlet is still its own `restaurants` row with its own staff,
-- menu, tables, bills and membership — every screen, policy and function keeps working on one property at a time.
-- What is new:
--   * restaurants.chain_id     — outlets of one business share it (the first outlet's id).
--   * outlet_access            — the outlets a person may stand in besides their own (the owner who opened them, and
--                                managers the owner allows).
--   * outlet_session           — which outlet THIS sign-in is standing in, one row per sign-in (the JWT session id),
--                                so a phone and a laptop can each be in a different outlet — the lesson of 0095.
--   * auth_restaurant_id()     — answers the sign-in's chosen outlet when there is one and the person may still stand
--                                there (access is checked on every call, so taking it away works at once), else their
--                                own. Nothing else in the database reads profiles.restaurant_id for the caller
--                                (checked 2026-10-17: 1 of 314 functions, 0 of 145 policies), so every screen follows.
--   * session_bundle()         — the shell's one call: the chosen outlet, the person's home outlet, and the list of
--                                outlets for the switcher.
--   * my_outlets / outlet_switch / outlet_create / outlet_grant / chain_overview / chain_push_menu.
--
-- PAYROLL. Staff (people who sign in) are paid by the month or by the day from staff_attendance:
--   * staff_pay                — each person's rate (monthly or daily) and whether PF / ESI apply to them.
--   * staff_advances           — money given ahead of pay; recovered from the next run.
--   * payroll_runs / payroll_lines — a month's sheet: days present, gross, PF, ESI, advances, bonus, other deductions,
--                                net, the employer's PF and ESI. Draft until finalised; lines are paid one by one.
--   * restaurants.payroll_pf / payroll_esi / payroll_paid_offs — the switches. Off: days × rate − advances. On: PF 12%
--                                + 12% on wages up to ₹15,000; ESI 0.75% + 3.25% for wages up to ₹21,000.
--   Paying a line records it as an expense ("Salaries"), so Reports, the cash drawer and Tally see it.
--
-- Every write is a security definer RPC with search_path pinned that checks the caller itself; RLS on every new table.

-- ═════════════════════════════════════ OUTLETS ═════════════════════════════════════
alter table public.restaurants add column if not exists chain_id uuid;
create index if not exists restaurants_chain_idx on public.restaurants (chain_id) where chain_id is not null;

create table if not exists public.outlet_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
create index if not exists outlet_access_rid_idx on public.outlet_access (restaurant_id);
alter table public.outlet_access enable row level security;
drop policy if exists outlet_access_own on public.outlet_access;
create policy outlet_access_own on public.outlet_access for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.outlet_access from public, anon, authenticated;

create table if not exists public.outlet_session (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists outlet_session_user_idx on public.outlet_session (user_id);
alter table public.outlet_session enable row level security;
drop policy if exists outlet_session_own on public.outlet_session;
create policy outlet_session_own on public.outlet_session for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.outlet_session from public, anon, authenticated;

/** The outlet this sign-in chose, if the person may still stand there; null otherwise (then: their own). */
create or replace function public._outlet_current() returns uuid
language sql stable security definer set search_path = public as $$
  select os.restaurant_id
    from outlet_session os
    join outlet_access oa on oa.user_id = os.user_id and oa.restaurant_id = os.restaurant_id
   where os.session_id = auth_session_id() and os.user_id = auth.uid()
$$;
revoke all on function public._outlet_current() from public, anon, authenticated;

-- who the caller stands in for: the outlet this sign-in chose, their own property, or (a master) the one they opened
CREATE OR REPLACE FUNCTION public.auth_restaurant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select coalesce(_outlet_current(), p.restaurant_id) from profiles p where p.id = auth.uid() and p.is_active),
    (select c.restaurant_id from admin_session_context c
       join platform_admins p on p.user_id = c.user_id
      where c.session_id = auth_session_id() and c.user_id = auth.uid()),
    (select c.restaurant_id from admin_context c
       join platform_admins p on p.user_id = c.user_id
      where c.user_id = auth.uid() and auth_session_id() is null)
  )
$function$;

/** Every outlet the caller may stand in: their own first, then the ones they were given, with which is current. */
create or replace function public.my_outlets() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.restaurant_id home, p.role from profiles p where p.id = auth.uid() and p.is_active),
  ids as (
    select home as rid, 0 as k from me
    union select oa.restaurant_id, 1 from outlet_access oa, me where oa.user_id = me.id and oa.restaurant_id <> me.home
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'type', r.property_type, 'home', ids.k = 0,
           'current', r.id = auth_restaurant_id(), 'membership', membership_state_for(r.id), 'city', r.district) order by ids.k, r.name), '[]'::jsonb)
    from ids join restaurants r on r.id = ids.rid
$$;
revoke all on function public.my_outlets() from public, anon;
grant execute on function public.my_outlets() to authenticated, service_role;

/** Stand this sign-in in another outlet (one the caller may open), or back in their own. */
create or replace function public.outlet_switch(p_restaurant uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := auth_session_id(); home uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select restaurant_id into home from profiles where id = auth.uid() and is_active;
  if home is null then raise exception 'no outlet to switch from' using errcode = '42501'; end if;
  if sid is null then raise exception 'this sign-in cannot switch outlets — sign in again'; end if;
  if p_restaurant is null or p_restaurant = home then
    delete from outlet_session where session_id = sid and user_id = auth.uid();
    return home;
  end if;
  if not exists (select 1 from outlet_access where user_id = auth.uid() and restaurant_id = p_restaurant) then
    raise exception 'you cannot open that outlet' using errcode = '42501';
  end if;
  insert into outlet_session (session_id, user_id, restaurant_id) values (sid, auth.uid(), p_restaurant)
    on conflict (session_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  -- this person's rows for sign-ins that have ended go with them
  delete from outlet_session o where o.user_id = auth.uid() and o.session_id <> sid
     and not exists (select 1 from auth.sessions s where s.id = o.session_id);
  return p_restaurant;
end $$;
revoke all on function public.outlet_switch(uuid) from public, anon;
grant execute on function public.outlet_switch(uuid) to authenticated, service_role;

/** The outlets of the caller's chain they may open, ids only — the set chain_* functions work on. */
create or replace function public._my_outlet_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct rid), '{}') from (
    select restaurant_id rid from profiles where id = auth.uid() and is_active
    union select restaurant_id from outlet_access where user_id = auth.uid()
  ) x
$$;
revoke all on function public._my_outlet_ids() from public, anon, authenticated;

/** A copy of the menu (categories, dishes, sizes) from one outlet into another. Matching is by name, case-insensitive:
 *  a dish already there is updated (and its price, when p_prices), a missing one is added, nothing is deleted.
 *  Internal — callers check who may do it. Returns {categories, added, updated, sizes}. */
create or replace function public._copy_menu(p_from uuid, p_to uuid, p_prices boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; m record; v record; tc uuid; tm uuid; nc int := 0; na int := 0; nu int := 0; nv int := 0;
begin
  for c in select * from categories where restaurant_id = p_from order by sort_order loop
    select id into tc from categories where restaurant_id = p_to and lower(name) = lower(c.name) limit 1;
    if tc is null then
      insert into categories (restaurant_id, name, sort_order, is_active, station) values (p_to, c.name, c.sort_order, c.is_active, c.station) returning id into tc;
      nc := nc + 1;
    end if;
    for m in select * from menu_items where restaurant_id = p_from and category_id = c.id and coalesce(is_active, true) loop
      select id into tm from menu_items where restaurant_id = p_to and lower(name) = lower(m.name) limit 1;
      if tm is null then
        insert into menu_items (restaurant_id, category_id, name, description, price, is_veg, is_available, prep_minutes, image_url, is_active, station, is_combo, image_credit, image_source)
        values (p_to, tc, m.name, m.description, m.price, m.is_veg, m.is_available, m.prep_minutes, m.image_url, true, m.station, m.is_combo, m.image_credit, m.image_source)
        returning id into tm;
        na := na + 1;
      else
        update menu_items set category_id = tc, description = m.description, is_veg = m.is_veg, image_url = coalesce(m.image_url, image_url),
               image_credit = coalesce(m.image_credit, image_credit), image_source = coalesce(m.image_source, image_source),
               prep_minutes = m.prep_minutes, station = m.station, is_active = true,
               price = case when p_prices then m.price else price end
         where id = tm;
        nu := nu + 1;
      end if;
      for v in select * from menu_variants where menu_item_id = m.id and coalesce(is_active, true) loop
        if exists (select 1 from menu_variants where menu_item_id = tm and lower(name) = lower(v.name)) then
          if p_prices then update menu_variants set price = v.price, is_default = v.is_default, sort_order = v.sort_order, is_active = true where menu_item_id = tm and lower(name) = lower(v.name); end if;
        else
          insert into menu_variants (restaurant_id, menu_item_id, name, price, is_default, sort_order, is_active) values (p_to, tm, v.name, v.price, v.is_default, v.sort_order, true);
          nv := nv + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('categories', nc, 'added', na, 'updated', nu, 'sizes', nv);
end $$;
revoke all on function public._copy_menu(uuid, uuid, boolean) from public, anon, authenticated;

/** Open a new outlet (owner only), from the outlet the owner is standing in: same kind of property, same modules,
 *  brand, tax rates and legal name; its own tables (eight), a trial membership, and — when asked — the menu. The owner
 *  gets access to it at once. Staff, stock and money stay separate. Returns the new outlet's id. */
create or replace function public.outlet_create(p_name text, p_copy_menu boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare src restaurants; rid uuid; chain uuid; base text; v_slug text; n int := 0;
begin
  if auth.uid() is null or auth_role()::text <> 'owner' or not exists (select 1 from profiles where id = auth.uid() and is_active) then
    raise exception 'only the owner can open a new outlet' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'give the outlet a name'; end if;
  select * into src from restaurants where id = auth_restaurant_id();
  if src.id is null then raise exception 'no outlet to start from'; end if;
  if src.demo_expires_at is not null then raise exception 'a demo cannot open outlets'; end if;
  if (select count(*) from restaurants where chain_id = coalesce(src.chain_id, src.id)) >= 50 then raise exception 'at most 50 outlets in one chain — ask DineFlow'; end if;
  chain := coalesce(src.chain_id, src.id);
  if src.chain_id is null then update restaurants set chain_id = chain where id = src.id; end if;
  base := left(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 40); base := trim(both '-' from base);
  if base = '' then base := 'outlet'; end if;
  v_slug := base;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop n := n + 1; v_slug := base || '-' || n; end loop;
  insert into restaurants (name, slug, property_type, chain_id, enabled_modules, logo_url, brand_colour, gst_rate, service_charge_pct, room_gst_rate,
                           legal_name, pan, gst_scheme, cuisines, price_for_two, kds_target_minutes, kds_warn_minutes, loyalty_enabled, loyalty_earn_pct,
                           loyalty_point_value, loyalty_min_redeem, payroll_pf, payroll_esi, payroll_paid_offs)
  values (left(trim(p_name), 80), v_slug, src.property_type, chain, src.enabled_modules, src.logo_url, src.brand_colour, src.gst_rate, src.service_charge_pct, src.room_gst_rate,
          src.legal_name, src.pan, src.gst_scheme, src.cuisines, src.price_for_two, src.kds_target_minutes, src.kds_warn_minutes, src.loyalty_enabled, src.loyalty_earn_pct,
          src.loyalty_point_value, src.loyalty_min_redeem, src.payroll_pf, src.payroll_esi, src.payroll_paid_offs)
  returning id into rid;
  insert into dining_tables (restaurant_id, name, capacity, zone, sort_order) select rid, 'T' || g, 4, 'Main', g from generate_series(1, 8) g;
  if p_copy_menu then perform _copy_menu(src.id, rid, true);
  else insert into categories (restaurant_id, name, sort_order) values (rid, 'Starters', 1), (rid, 'Mains', 2), (rid, 'Breads & Rice', 3), (rid, 'Drinks', 4), (rid, 'Desserts', 5);
  end if;
  insert into outlet_access (user_id, restaurant_id, granted_by) values (auth.uid(), rid, auth.uid()) on conflict do nothing;
  -- the owner's home outlet is always theirs; when they opened this one from another outlet, that one too
  return rid;
end $$;

/** Let a manager of the chain open another outlet (owner only), or stop them. */
create or replace function public.outlet_grant(p_user uuid, p_restaurant uuid, p_on boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare mine uuid[] := _my_outlet_ids(); who profiles;
begin
  if auth_role()::text <> 'owner' then raise exception 'only the owner can choose who opens other outlets' using errcode = '42501'; end if;
  if not (p_restaurant = any(mine)) then raise exception 'that outlet is not yours' using errcode = '42501'; end if;
  select * into who from profiles where id = p_user and is_active and restaurant_id = any(mine);
  if who.id is null then raise exception 'that person is not on your staff'; end if;
  if who.role::text not in ('manager', 'supervisor') then raise exception 'only managers and supervisors can be given other outlets'; end if;
  if who.restaurant_id = p_restaurant then return 0; end if;
  if p_on then insert into outlet_access (user_id, restaurant_id, granted_by) values (p_user, p_restaurant, auth.uid()) on conflict do nothing;
  else delete from outlet_access where user_id = p_user and restaurant_id = p_restaurant;
       delete from outlet_session where user_id = p_user and restaurant_id = p_restaurant;
  end if;
  return 1;
end $$;
revoke all on function public.outlet_grant(uuid, uuid, boolean) from public, anon;
grant execute on function public.outlet_grant(uuid, uuid, boolean) to authenticated, service_role;

/** The managers and supervisors across the caller's outlets, and which outlets each may open — for the owner's screen. */
create or replace function public.chain_people() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role()::text <> 'owner' then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'home', p.restaurant_id,
             'outlets', coalesce((select jsonb_agg(oa.restaurant_id) from outlet_access oa where oa.user_id = p.id), '[]'::jsonb)) order by p.full_name)
      from profiles p where p.is_active and p.role::text in ('manager', 'supervisor') and p.restaurant_id = any(_my_outlet_ids())), '[]'::jsonb) end
$$;
revoke all on function public.chain_people() from public, anon;
grant execute on function public.chain_people() to authenticated, service_role;

/** Every outlet the caller may open, live: open orders and tables, late tickets, today's sales and how they were paid,
 *  expenses, new online orders, staff on duty, and the last seven days' sales. Owner, manager or supervisor. */
create or replace function public.chain_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[] := _my_outlet_ids(); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot see the chain' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(o order by o->>'name') from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'type', r.property_type, 'city', r.district, 'membership', membership_state_for(r.id),
      'current', r.id = auth_restaurant_id(),
      'open_orders', (select count(*) from orders o where o.restaurant_id = r.id and o.status = 'open'),
      'busy_tables', (select count(distinct o.table_id) from orders o where o.restaurant_id = r.id and o.status = 'open' and o.table_id is not null),
      'tables', (select count(*) from dining_tables t where t.restaurant_id = r.id),
      'late', (select count(*) from kots k where k.restaurant_id = r.id and k.status in ('pending', 'preparing') and k.created_at < now() - make_interval(mins => coalesce(r.kds_target_minutes, 15))),
      'sales', (select coalesce(sum(b.total), 0) from bills b where b.restaurant_id = r.id and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = today),
      'bills', (select count(*) from bills b where b.restaurant_id = r.id and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = today),
      'paid', (select coalesce(jsonb_object_agg(m, a), '{}'::jsonb) from (select p.method::text m, sum(p.amount) a from payments p join bills b on b.id = p.bill_id
                 where b.restaurant_id = r.id and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = today group by 1) x),
      'expenses', (select coalesce(sum(e.amount), 0) from expenses e where e.restaurant_id = r.id and e.voided_at is null and e.spent_on = today),
      'online_new', (select count(*) from online_orders oo where oo.restaurant_id = r.id and oo.status = 'new'),
      'on_duty', (select count(*) from staff_attendance sa where sa.restaurant_id = r.id and sa.work_date = today and sa.in_at is not null and sa.out_at is null),
      'week', (select jsonb_agg(jsonb_build_object('day', today - 6 + i,
                   'sales', (select coalesce(sum(b.total), 0) from bills b where b.restaurant_id = r.id and b.status = 'paid'
                               and (b.paid_at at time zone 'Asia/Kolkata')::date = today - 6 + i)) order by i)
                 from generate_series(0, 6) i)
    ) o
    from restaurants r where r.id = any(ids)) q), '[]'::jsonb);
end $$;
revoke all on function public.chain_overview() from public, anon;
grant execute on function public.chain_overview() to authenticated, service_role;

/** Send the menu of the outlet the caller stands in to other outlets they may open (owner or manager). */
create or replace function public.chain_push_menu(p_targets uuid[], p_prices boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare src uuid := auth_restaurant_id(); mine uuid[] := _my_outlet_ids(); t uuid; out jsonb := '{}'::jsonb;
begin
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can send the menu to other outlets' using errcode = '42501'; end if;
  if p_targets is null or array_length(p_targets, 1) is null then raise exception 'choose the outlets to send it to'; end if;
  foreach t in array p_targets loop
    if t = src then continue; end if;
    if not (t = any(mine)) then raise exception 'you cannot change the menu of one of those outlets' using errcode = '42501'; end if;
    out := out || jsonb_build_object(t::text, _copy_menu(src, t, coalesce(p_prices, true)));
  end loop;
  return out;
end $$;
revoke all on function public.chain_push_menu(uuid[], boolean) from public, anon;
grant execute on function public.chain_push_menu(uuid[], boolean) to authenticated, service_role;

-- the shell's one call, now with the outlet this sign-in chose and the list for the switcher. The `profile` keeps its
-- shape; its restaurant_id is the outlet being worked in (screens that list "this property's staff" follow the switch),
-- and home_restaurant_id is the person's own.
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
  cur as (select case when (select is_active from prof) then _outlet_current() end as rid),
  target as (
    select coalesce((select rid from cur), (select restaurant_id from prof), (select rid from acting)) as id
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
    'profile',    (select to_jsonb(p) || jsonb_build_object('restaurant_id', (select id from target), 'home_restaurant_id', p.restaurant_id) from prof p),
    'restaurant', (select to_jsonb(r) - 'box_token' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid),
    'outlets',    case when exists (select 1 from outlet_access oa, me where oa.user_id = me.uid) then my_outlets() else '[]'::jsonb end
  ) end;
$function$;

-- ═════════════════════════════════════ PAYROLL ═════════════════════════════════════
alter table public.restaurants add column if not exists payroll_pf boolean not null default false;
alter table public.restaurants add column if not exists payroll_esi boolean not null default false;
alter table public.restaurants add column if not exists payroll_paid_offs int not null default 4 check (payroll_paid_offs between 0 and 8);

-- outlet_create copies the payroll switches, so it is created after them
revoke all on function public.outlet_create(text, boolean) from public, anon;
grant execute on function public.outlet_create(text, boolean) to authenticated, service_role;

create table if not exists public.staff_pay (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  basis text not null default 'monthly' check (basis in ('monthly', 'daily')),
  amount numeric(12,2) not null check (amount >= 0),
  pf_on boolean not null default true,
  esi_on boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, profile_id)
);
create table if not exists public.staff_advances (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  given_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  method text not null default 'cash' check (method in ('cash', 'upi', 'bank')),
  note text,
  recovered_in uuid,                         -- the payroll line it came off
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists staff_advances_rid_idx on public.staff_advances (restaurant_id, profile_id) where recovered_in is null;
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month date not null,                       -- the 1st of the month
  status text not null default 'draft' check (status in ('draft', 'final')),
  pf boolean not null default false, esi boolean not null default false, paid_offs int not null default 4,
  created_by uuid, created_at timestamptz not null default now(), finalised_at timestamptz, finalised_by uuid,
  unique (restaurant_id, month)
);
create table if not exists public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, role text,
  basis text not null, rate numeric(12,2) not null,
  days_in_month int not null, days_present int not null, paid_days numeric(6,2) not null,
  gross numeric(12,2) not null, bonus numeric(12,2) not null default 0,
  pf_employee numeric(12,2) not null default 0, esi_employee numeric(12,2) not null default 0,
  advances numeric(12,2) not null default 0, other_deduction numeric(12,2) not null default 0,
  net numeric(12,2) not null,
  pf_employer numeric(12,2) not null default 0, esi_employer numeric(12,2) not null default 0,
  note text, paid_at timestamptz, paid_method text, expense_id uuid,
  unique (run_id, profile_id)
);
create index if not exists payroll_lines_run_idx on public.payroll_lines (run_id);
alter table public.staff_pay enable row level security;
alter table public.staff_advances enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;
-- pay is private: the owner and managers read the whole property's; anyone else only their own lines
drop policy if exists staff_pay_read on public.staff_pay;
create policy staff_pay_read on public.staff_pay for select to authenticated using (restaurant_id = auth_restaurant_id() and (auth_role()::text in ('owner', 'manager') or profile_id = (select auth.uid())));
drop policy if exists staff_advances_read on public.staff_advances;
create policy staff_advances_read on public.staff_advances for select to authenticated using (restaurant_id = auth_restaurant_id() and (auth_role()::text in ('owner', 'manager') or profile_id = (select auth.uid())));
drop policy if exists payroll_runs_read on public.payroll_runs;
create policy payroll_runs_read on public.payroll_runs for select to authenticated using (restaurant_id = auth_restaurant_id() and auth_role()::text in ('owner', 'manager'));
-- whether a run is final, for the lines' policy: a member of staff cannot read payroll_runs itself
create or replace function public._payroll_final(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from payroll_runs where id = p_run and status = 'final') $$;
revoke all on function public._payroll_final(uuid) from public, anon;
grant execute on function public._payroll_final(uuid) to authenticated;
drop policy if exists payroll_lines_read on public.payroll_lines;
create policy payroll_lines_read on public.payroll_lines for select to authenticated using (restaurant_id = auth_restaurant_id() and (auth_role()::text in ('owner', 'manager') or (profile_id = (select auth.uid()) and _payroll_final(run_id))));

create or replace function public._payroll_guard() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') and not is_platform_admin() then raise exception 'only the owner or a manager can do payroll' using errcode = '42501'; end if;
  return rid;
end $$;
revoke all on function public._payroll_guard() from public, anon, authenticated;

create or replace function public.payroll_settings_save(p_pf boolean, p_esi boolean, p_paid_offs int) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard();
begin
  if p_paid_offs is null or p_paid_offs < 0 or p_paid_offs > 8 then raise exception 'paid weekly offs: 0 to 8 a month'; end if;
  update restaurants set payroll_pf = coalesce(p_pf, false), payroll_esi = coalesce(p_esi, false), payroll_paid_offs = p_paid_offs where id = rid;
  return 1;
end $$;
revoke all on function public.payroll_settings_save(boolean, boolean, int) from public, anon;
grant execute on function public.payroll_settings_save(boolean, boolean, int) to authenticated, service_role;

create or replace function public.staff_pay_set(p_profile uuid, p_basis text, p_amount numeric, p_pf boolean, p_esi boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard();
begin
  if not exists (select 1 from profiles where id = p_profile and restaurant_id = rid) then raise exception 'that person is not on this outlet''s staff'; end if;
  if coalesce(p_basis, '') not in ('monthly', 'daily') then raise exception 'by the month or by the day'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'enter the pay'; end if;
  insert into staff_pay (restaurant_id, profile_id, basis, amount, pf_on, esi_on) values (rid, p_profile, p_basis, round(p_amount, 2), coalesce(p_pf, true), coalesce(p_esi, true))
    on conflict (restaurant_id, profile_id) do update set basis = excluded.basis, amount = excluded.amount, pf_on = excluded.pf_on, esi_on = excluded.esi_on, updated_at = now();
  return 1;
end $$;
revoke all on function public.staff_pay_set(uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.staff_pay_set(uuid, text, numeric, boolean, boolean) to authenticated, service_role;

/** Money given ahead of pay. Cash comes out of today's drawer as well. Every advance not yet recovered comes off the
 *  next month worked out — one given on the 2nd, before last month's pay, included. */
create or replace function public.advance_add(p_profile uuid, p_amount numeric, p_method text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); aid uuid; who text;
begin
  select full_name into who from profiles where id = p_profile and restaurant_id = rid;
  if who is null then raise exception 'that person is not on this outlet''s staff'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'enter the amount given'; end if;
  if coalesce(p_method, 'cash') not in ('cash', 'upi', 'bank') then raise exception 'cash, UPI or bank'; end if;
  insert into staff_advances (restaurant_id, profile_id, amount, method, note, created_by)
  values (rid, p_profile, round(p_amount, 2), coalesce(p_method, 'cash'), nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid()) returning id into aid;
  if coalesce(p_method, 'cash') = 'cash' then
    insert into cash_movements (restaurant_id, kind, amount, reason, note, created_by) values (rid, 'out', round(p_amount, 2), 'Staff advance · ' || left(who, 40), nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid());
  end if;
  return aid;
end $$;
revoke all on function public.advance_add(uuid, numeric, text, text) from public, anon;
grant execute on function public.advance_add(uuid, numeric, text, text) to authenticated, service_role;

/** One line's figures from its inputs. Shared by build and by an edit of bonus / other deductions.
 *  PF: 12% employee + 12% employer on (gross + bonus) up to ₹15,000. ESI: when the person's full monthly wage is
 *  ₹21,000 or less, 0.75% employee (rounded up, as ESIC does) + 3.25% employer on (gross + bonus). Advances come off
 *  last and never take the net below zero. */
create or replace function public._payroll_figures(l payroll_lines, p_pf boolean, p_esi boolean, p_pf_on boolean, p_esi_on boolean, p_full numeric, p_adv numeric) returns payroll_lines
language plpgsql immutable set search_path = public as $$
declare earn numeric := l.gross + l.bonus; pfw numeric;
begin
  pfw := least(earn, 15000);
  l.pf_employee := case when p_pf and p_pf_on then round(pfw * 0.12) else 0 end;
  l.pf_employer := l.pf_employee;
  l.esi_employee := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0075) else 0 end;
  l.esi_employer := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0325) else 0 end;
  l.advances := least(coalesce(p_adv, 0), greatest(0, earn - l.pf_employee - l.esi_employee - l.other_deduction));
  l.net := round(earn - l.pf_employee - l.esi_employee - l.advances - l.other_deduction, 2);
  return l;
end $$;
revoke all on function public._payroll_figures(payroll_lines, boolean, boolean, boolean, boolean, numeric, numeric) from public, anon, authenticated;

/** Work out a month (or work it out again, while it is a draft): every active member of staff with a pay rate,
 *  their days present from staff_attendance, and their unrecovered advances. Bonus and other deductions typed on a
 *  draft line are kept. */
create or replace function public.payroll_build(p_month date) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); r restaurants; m date := date_trunc('month', p_month)::date; run payroll_runs; dim int; s record;
        present int; paid numeric; gross numeric; full_wage numeric; adv numeric; l payroll_lines; kept jsonb; k jsonb;
begin
  if p_month is null or m > date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date then raise exception 'choose this month or an earlier one'; end if;
  select * into r from restaurants where id = rid;
  dim := extract(day from (m + interval '1 month' - interval '1 day'))::int;
  select * into run from payroll_runs where restaurant_id = rid and month = m for update;
  if run.id is not null and run.status = 'final' then raise exception 'this month is final — it cannot be worked out again'; end if;
  if run.id is null then
    insert into payroll_runs (restaurant_id, month, pf, esi, paid_offs, created_by) values (rid, m, r.payroll_pf, r.payroll_esi, r.payroll_paid_offs, auth.uid()) returning * into run;
  else
    update payroll_runs set pf = r.payroll_pf, esi = r.payroll_esi, paid_offs = r.payroll_paid_offs where id = run.id returning * into run;
  end if;
  -- what was typed on the draft (bonus, other deductions, a note) survives working it out again
  select coalesce(jsonb_object_agg(profile_id::text, jsonb_build_object('bonus', bonus, 'other', other_deduction, 'note', note)), '{}'::jsonb)
    into kept from payroll_lines where run_id = run.id;
  delete from payroll_lines where run_id = run.id;
  for s in select p.id, p.full_name, p.role::text role, sp.basis, sp.amount, sp.pf_on, sp.esi_on
             from staff_pay sp join profiles p on p.id = sp.profile_id
            where sp.restaurant_id = rid and p.restaurant_id = rid and p.is_active order by p.full_name loop
    select count(distinct work_date) into present from staff_attendance
     where restaurant_id = rid and profile_id = s.id and work_date between m and (m + interval '1 month' - interval '1 day')::date and in_at is not null;
    if s.basis = 'monthly' then
      paid := least(dim, present + case when present > 0 then run.paid_offs else 0 end);
      gross := round(s.amount * paid / dim, 2); full_wage := s.amount;
    else
      paid := present; gross := round(s.amount * present, 2); full_wage := s.amount * 26;
    end if;
    select coalesce(sum(amount), 0) into adv from staff_advances where restaurant_id = rid and profile_id = s.id and recovered_in is null;
    k := kept -> s.id::text;
    l := row(gen_random_uuid(), run.id, rid, s.id, s.full_name, s.role, s.basis, s.amount, dim, present, paid, gross,
             coalesce((k->>'bonus')::numeric, 0), 0, 0, 0, coalesce((k->>'other')::numeric, 0), 0, 0, 0, k->>'note', null, null, null)::payroll_lines;
    l := _payroll_figures(l, run.pf, run.esi, s.pf_on, s.esi_on, full_wage, adv);
    insert into payroll_lines select l.*;
  end loop;
  return run.id;
end $$;
revoke all on function public.payroll_build(date) from public, anon;
grant execute on function public.payroll_build(date) to authenticated, service_role;

/** A bonus, another deduction or a note on a draft line; the line's figures are worked out again. */
create or replace function public.payroll_line_set(p_line uuid, p_bonus numeric, p_other numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); l payroll_lines; run payroll_runs; sp staff_pay; adv numeric;
begin
  select * into l from payroll_lines where id = p_line and restaurant_id = rid for update;
  if l.id is null then raise exception 'that line is not here'; end if;
  select * into run from payroll_runs where id = l.run_id;
  if run.status = 'final' then raise exception 'this month is final'; end if;
  if coalesce(p_bonus, 0) < 0 or coalesce(p_other, 0) < 0 then raise exception 'amounts cannot be below zero'; end if;
  select * into sp from staff_pay where restaurant_id = rid and profile_id = l.profile_id;
  select coalesce(sum(amount), 0) into adv from staff_advances where restaurant_id = rid and profile_id = l.profile_id and recovered_in is null;
  l.bonus := round(coalesce(p_bonus, 0), 2); l.other_deduction := round(coalesce(p_other, 0), 2); l.note := nullif(left(trim(coalesce(p_note, '')), 200), '');
  l := _payroll_figures(l, run.pf, run.esi, coalesce(sp.pf_on, true), coalesce(sp.esi_on, true), case when l.basis = 'monthly' then l.rate else l.rate * 26 end, adv);
  update payroll_lines set bonus = l.bonus, other_deduction = l.other_deduction, note = l.note, pf_employee = l.pf_employee, pf_employer = l.pf_employer,
         esi_employee = l.esi_employee, esi_employer = l.esi_employer, advances = l.advances, net = l.net where id = l.id;
  return to_jsonb(l);
end $$;
revoke all on function public.payroll_line_set(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.payroll_line_set(uuid, numeric, numeric, text) to authenticated, service_role;

/** Lock the month: lines stop changing and the advances taken off are marked recovered (oldest first, up to what came
 *  off each line). */
create or replace function public.payroll_finalise(p_run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); run payroll_runs; l record; a record; left_ numeric;
begin
  select * into run from payroll_runs where id = p_run and restaurant_id = rid for update;
  if run.id is null then raise exception 'that month is not here'; end if;
  if run.status = 'final' then return 0; end if;
  if not exists (select 1 from payroll_lines where run_id = run.id) then raise exception 'work the month out first'; end if;
  for l in select * from payroll_lines where run_id = run.id and advances > 0 loop
    left_ := l.advances;
    for a in select * from staff_advances where restaurant_id = rid and profile_id = l.profile_id and recovered_in is null order by given_on, created_at loop
      exit when left_ < a.amount;
      update staff_advances set recovered_in = l.id where id = a.id; left_ := left_ - a.amount;
    end loop;
    if left_ > 0 then   -- part of one advance came off: split it, so the rest is recovered next month
      select * into a from staff_advances where restaurant_id = rid and profile_id = l.profile_id and recovered_in is null order by given_on, created_at limit 1;
      if a.id is not null then
        update staff_advances set amount = a.amount - left_ where id = a.id;
        insert into staff_advances (restaurant_id, profile_id, amount, given_on, method, note, recovered_in, created_by)
        values (rid, l.profile_id, left_, a.given_on, a.method, coalesce(a.note, '') || ' (part recovered)', l.id, auth.uid());
      end if;
    end if;
  end loop;
  update payroll_runs set status = 'final', finalised_at = now(), finalised_by = auth.uid() where id = run.id;
  return 1;
end $$;
revoke all on function public.payroll_finalise(uuid) from public, anon;
grant execute on function public.payroll_finalise(uuid) to authenticated, service_role;

/** Pay one line of a final month: it becomes a "Salaries" expense (cash paid today also leaves the drawer). */
create or replace function public.payroll_pay(p_line uuid, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); l payroll_lines; run payroll_runs; eid uuid;
begin
  select * into l from payroll_lines where id = p_line and restaurant_id = rid for update;
  if l.id is null then raise exception 'that line is not here'; end if;
  select * into run from payroll_runs where id = l.run_id;
  if run.status <> 'final' then raise exception 'finalise the month before paying'; end if;
  if l.paid_at is not null then return l.expense_id; end if;
  if coalesce(p_method, '') not in ('cash', 'upi', 'bank') then raise exception 'cash, UPI or bank'; end if;
  if l.net > 0 then
    eid := expense_add((now() at time zone 'Asia/Kolkata')::date, 'Salaries', l.name, l.net, 0, p_method, to_char(run.month, 'Mon YYYY'), 'Payroll');
  end if;
  update payroll_lines set paid_at = now(), paid_method = p_method, expense_id = eid where id = l.id;
  return eid;
end $$;
revoke all on function public.payroll_pay(uuid, text) from public, anon;
grant execute on function public.payroll_pay(uuid, text) to authenticated, service_role;
