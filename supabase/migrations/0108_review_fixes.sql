-- 0108 · Fixes from the review of 0103–0107 (2026-10-17). Same functions, same grants; no table policy changes.
--
--  1. outlet_create gave every new outlet a fresh 7-day trial, so an owner whose trial had ended could open outlet
--     after outlet for more trial days. Now: the outlet it is made from must be live (trial or active); a new outlet
--     made from a trial ends when that trial ends (it never extends it); one made from a paid outlet gets the usual
--     7 days until Master control switches its membership on.
--  2. session_bundle carried restaurants.screen_key to every signed-in role (the TV link is owner / manager only, via
--     my_screen_key). It is taken out like box_token.
--  3. feedback_submit: submissions with neither a table code nor a phone have their own, smaller allowance (15 an
--     hour), so a script cannot use up the place's 60 and turn real guests away — or sound sixty alerts.
--  4. staff_set_position refuses keys that are object-prototype names (constructor, __proto__, prototype).
--  5. checklists: a run counts only ticks that are still duties of the list, and saving a shorter list trims today's
--     ticks beyond its end — a shortened list no longer shows complete with duties undone.
--  6. settlement_expected leaves out orders never accepted (status new) as well as rejected and cancelled ones.
--  7. Payroll: (a) other deductions cannot take net below zero; (b) finalising re-reads the advances still
--     outstanding, so a stale draft cannot take the same advance off twice; (c) paying a line records the whole cost —
--     the net paid now (Salaries, by the way chosen), the advance recovered (Salaries, cash already out), and PF / ESI
--     owed (PF & ESI, by bank) — so Reports and Tally see what the pay cost; (d) nobody but the owner sets their own
--     pay or gives themselves an advance, or does either for someone at or above their own rank.

-- ── 1 · outlets never extend a trial ────────────────────────────────────────────────────────────────────────────
create or replace function public.outlet_create(p_name text, p_copy_menu boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare src restaurants; rid uuid; chain uuid; base text; v_slug text; n int := 0; st text;
begin
  if auth.uid() is null or auth_role()::text <> 'owner' or not exists (select 1 from profiles where id = auth.uid() and is_active) then
    raise exception 'only the owner can open a new outlet' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'give the outlet a name'; end if;
  select * into src from restaurants where id = auth_restaurant_id();
  if src.id is null then raise exception 'no outlet to start from'; end if;
  if src.demo_expires_at is not null then raise exception 'a demo cannot open outlets'; end if;
  st := membership_state_for(src.id);
  if st not in ('trial', 'active') then raise exception 'renew this outlet''s membership before opening another' using errcode = '42501'; end if;
  if (select count(*) from restaurants where chain_id = coalesce(src.chain_id, src.id)) >= 50 then raise exception 'at most 50 outlets in one chain — ask DineFlow'; end if;
  chain := coalesce(src.chain_id, src.id);
  if src.chain_id is null then update restaurants set chain_id = chain where id = src.id; end if;
  base := left(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 40); base := trim(both '-' from base);
  if base = '' then base := 'outlet'; end if;
  v_slug := base;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop n := n + 1; v_slug := base || '-' || n; end loop;
  insert into restaurants (name, slug, property_type, chain_id, enabled_modules, logo_url, brand_colour, gst_rate, service_charge_pct, room_gst_rate,
                           legal_name, pan, gst_scheme, cuisines, price_for_two, kds_target_minutes, kds_warn_minutes, loyalty_enabled, loyalty_earn_pct,
                           loyalty_point_value, loyalty_min_redeem, payroll_pf, payroll_esi, payroll_paid_offs, trial_ends_at)
  values (left(trim(p_name), 80), v_slug, src.property_type, chain, src.enabled_modules, src.logo_url, src.brand_colour, src.gst_rate, src.service_charge_pct, src.room_gst_rate,
          src.legal_name, src.pan, src.gst_scheme, src.cuisines, src.price_for_two, src.kds_target_minutes, src.kds_warn_minutes, src.loyalty_enabled, src.loyalty_earn_pct,
          src.loyalty_point_value, src.loyalty_min_redeem, src.payroll_pf, src.payroll_esi, src.payroll_paid_offs,
          -- made from a trial: it ends with that trial. Made from a paid outlet: the usual 7 days, until its own membership is on
          case when st = 'trial' then least(src.trial_ends_at, now() + interval '7 days') else now() + interval '7 days' end)
  returning id into rid;
  insert into dining_tables (restaurant_id, name, capacity, zone, sort_order) select rid, 'T' || g, 4, 'Main', g from generate_series(1, 8) g;
  if p_copy_menu then perform _copy_menu(src.id, rid, true);
  else insert into categories (restaurant_id, name, sort_order) values (rid, 'Starters', 1), (rid, 'Mains', 2), (rid, 'Breads & Rice', 3), (rid, 'Drinks', 4), (rid, 'Desserts', 5);
  end if;
  insert into outlet_access (user_id, restaurant_id, granted_by) values (auth.uid(), rid, auth.uid()) on conflict do nothing;
  return rid;
end $$;
revoke all on function public.outlet_create(text, boolean) from public, anon;
grant execute on function public.outlet_create(text, boolean) to authenticated, service_role;

-- ── 2 · the TV key stays out of the session ─────────────────────────────────────────────────────────────────────
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
    'restaurant', (select to_jsonb(r) - 'box_token' - 'screen_key' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid),
    'outlets',    case when exists (select 1 from outlet_access oa, me where oa.user_id = me.uid) then my_outlets() else '[]'::jsonb end
  ) end;
$function$;

-- ── 3 · anonymous feedback has its own allowance ────────────────────────────────────────────────────────────────
create or replace function public.feedback_submit(p_slug text, p_table text, p_rating integer, p_tags text[], p_comment text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants; tid uuid; n int; ph text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''); f guest_feedback;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Tap a star from one to five.'; end if;
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial', 'active');
  if r.id is null then raise exception 'This place is not taking feedback here right now.'; end if;
  select id into tid from dining_tables where restaurant_id = r.id and qr_token = p_table and p_table is not null;
  if tid is null and ph is null then
    -- nothing to tie it to: a smaller allowance of its own, so it cannot crowd out guests who said where they sat
    select count(*) into n from guest_feedback where restaurant_id = r.id and table_id is null and guest_phone is null and created_at > now() - interval '1 hour';
    if n >= 15 then raise exception 'Thank you — please try again in a little while, or leave your number.'; end if;
  else
    select count(*) into n from guest_feedback where restaurant_id = r.id and (table_id is not null or guest_phone is not null) and created_at > now() - interval '1 hour';
    if n >= 60 then raise exception 'Thank you — please try again in a little while.'; end if;
  end if;
  if tid is not null then
    select count(*) into n from guest_feedback where table_id = tid and created_at > now() - interval '1 hour';
    if n >= 6 then raise exception 'Thank you — we already have feedback from this table.'; end if;
  end if;
  if ph is not null then
    select count(*) into n from guest_feedback where restaurant_id = r.id and guest_phone = ph and created_at > now() - interval '1 day';
    if n >= 3 then raise exception 'Thank you — we already have your feedback today.'; end if;
  end if;
  insert into guest_feedback (restaurant_id, table_id, rating, tags, comment, guest_name, guest_phone)
  values (r.id, tid, p_rating,
          coalesce((select array_agg(left(x, 30)) from (select x from unnest(coalesce(p_tags, '{}'::text[])) x where length(trim(x)) > 0 limit 8) s), '{}'),
          nullif(left(trim(coalesce(p_comment, '')), 600), ''), nullif(left(trim(coalesce(p_name, '')), 80), ''), left(ph, 20))
  returning * into f;
  return jsonb_build_object('ok', true, 'id', f.id);
end $$;
revoke execute on function public.feedback_submit(text, text, integer, text[], text, text, text) from public;
grant execute on function public.feedback_submit(text, text, integer, text[], text, text, text) to anon, authenticated, service_role;

-- ── 4 · position keys are never prototype names ─────────────────────────────────────────────────────────────────
create or replace function public.staff_set_position(p_user uuid, p_position text, p_department text, p_title text, p_reports_to uuid, p_joined_on date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; boss profiles; cur uuid; hops int := 0;
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property' using errcode = '42501'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people' using errcode = '42501'; end if;
  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.id = me.id and me.role <> 'owner' then raise exception 'ask someone above you to change your position'; end if;
  if target.id <> me.id and me.role <> 'owner' and role_rank(target.role) >= role_rank(me.role) then
    raise exception 'you cannot change someone at or above your own level' using errcode = '42501';
  end if;
  if p_position is not null and (p_position !~ '^[a-z0-9_]{2,40}$' or p_position in ('constructor', 'prototype', '__proto__')) then raise exception 'that position is not one we know'; end if;
  if p_department is not null and (p_department !~ '^[a-z_]{2,30}$' or p_department in ('constructor', 'prototype', '__proto__')) then raise exception 'that department is not one we know'; end if;
  if p_joined_on is not null and (p_joined_on > (now() at time zone 'Asia/Kolkata')::date or p_joined_on < date '1950-01-01') then raise exception 'the joining date is not right'; end if;
  if p_reports_to is not null then
    if p_reports_to = target.id then raise exception 'someone cannot report to themselves'; end if;
    select * into boss from profiles where id = p_reports_to and restaurant_id = me.restaurant_id;
    if boss.id is null then raise exception 'the person they report to is not on this outlet'; end if;
    cur := boss.reports_to;
    while cur is not null and hops < 50 loop
      if cur = target.id then raise exception 'that would make a loop — % already reports to them', boss.full_name; end if;
      select reports_to into cur from profiles where id = cur; hops := hops + 1;
    end loop;
  end if;
  update profiles set position = p_position, department = p_department, position_title = nullif(left(trim(coalesce(p_title, '')), 60), ''),
         reports_to = p_reports_to, joined_on = p_joined_on
   where id = target.id;
  return 1;
end $$;
revoke all on function public.staff_set_position(uuid, text, text, text, uuid, date) from public, anon;
grant execute on function public.staff_set_position(uuid, text, text, text, uuid, date) to authenticated, service_role;

-- ── 5 · a checklist counts only the duties it still has ─────────────────────────────────────────────────────────
/** How many of a run's ticks are duties the list still has (keys are positions 0 … n-1). */
create or replace function public._checklist_ticked(p_done jsonb, p_len int) returns int
language sql immutable set search_path = public as $$
  select count(*)::int from jsonb_object_keys(coalesce(p_done, '{}'::jsonb)) k where k ~ '^\d+$' and k::int < coalesce(p_len, 0)
$$;
revoke all on function public._checklist_ticked(jsonb, int) from public, anon, authenticated;

create or replace function public.checklist_save(p_id uuid, p_name text, p_shift text, p_items text[], p_active boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); cid uuid; its text[]; len int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'only the owner, a manager or a supervisor can change the lists' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'give the list a name'; end if;
  if coalesce(p_shift, '') not in ('opening', 'closing', 'anytime') then raise exception 'opening, closing or any time'; end if;
  select coalesce(array_agg(left(trim(x), 120) order by o), '{}') into its
    from unnest(coalesce(p_items, '{}'::text[])) with ordinality u(x, o) where length(trim(x)) > 0;
  if array_length(its, 1) is null then raise exception 'add at least one duty'; end if;
  if array_length(its, 1) > 40 then raise exception 'at most 40 duties in one list'; end if;
  len := array_length(its, 1);
  if p_id is null then
    insert into checklists (restaurant_id, name, shift, items, is_active, sort_order)
    values (rid, left(trim(p_name), 60), p_shift, its, coalesce(p_active, true), (select coalesce(max(sort_order), 0) + 1 from checklists where restaurant_id = rid))
    returning id into cid;
  else
    update checklists set name = left(trim(p_name), 60), shift = p_shift, items = its, is_active = coalesce(p_active, true)
     where id = p_id and restaurant_id = rid returning id into cid;
    if cid is null then raise exception 'that list is not here'; end if;
    -- today's ticks beyond the new end go, and the run is complete only if every duty that remains is ticked
    update checklist_runs set
        done = coalesce((select jsonb_object_agg(k, v) from jsonb_each(done) e(k, v) where k ~ '^\d+$' and k::int < len), '{}'::jsonb),
        completed_at = case when _checklist_ticked(done, len) >= len then coalesce(completed_at, now()) else null end
     where checklist_id = cid and run_date = today;
  end if;
  return cid;
end $$;
revoke all on function public.checklist_save(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.checklist_save(uuid, text, text, text[], boolean) to authenticated, service_role;

create or replace function public.checklist_tick(p_checklist uuid, p_item int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c checklists; today date := (now() at time zone 'Asia/Kolkata')::date; r checklist_runs; who text; len int;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from checklists where id = p_checklist and restaurant_id = rid and is_active;
  if c.id is null then raise exception 'that list is not here'; end if;
  len := coalesce(array_length(c.items, 1), 0);
  if p_item is null or p_item < 0 or p_item >= len then raise exception 'no such duty'; end if;
  select full_name into who from profiles where id = auth.uid();
  insert into checklist_runs (restaurant_id, checklist_id, run_date) values (rid, c.id, today)
    on conflict (checklist_id, run_date) do nothing;
  select * into r from checklist_runs where checklist_id = c.id and run_date = today for update;
  if p_done then
    r.done := r.done || jsonb_build_object(p_item::text, jsonb_build_object('by', auth.uid(), 'name', coalesce(who, 'Staff'), 'at', now()));
  else
    r.done := r.done - p_item::text;
  end if;
  update checklist_runs set done = r.done,
         completed_at = case when _checklist_ticked(r.done, len) >= len then coalesce(completed_at, now()) else null end
   where id = r.id returning * into r;
  return jsonb_build_object('done', r.done, 'completed_at', r.completed_at);
end $$;
revoke all on function public.checklist_tick(uuid, int, boolean) from public, anon;
grant execute on function public.checklist_tick(uuid, int, boolean) to authenticated, service_role;

-- ── 6 · a payout is owed only for orders that were accepted ─────────────────────────────────────────────────────
create or replace function public.settlement_expected(p_channel uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can see payouts' using errcode = '42501'; end if;
  select jsonb_build_object('orders', count(*), 'gross', coalesce(sum(gross), 0), 'commission', coalesce(sum(commission), 0), 'payout', coalesce(sum(payout), 0))
    into out
    from online_orders
   where restaurant_id = rid and channel_id = p_channel and status not in ('new', 'rejected', 'cancelled')
     and (placed_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  return out;
end $$;
revoke all on function public.settlement_expected(uuid, date, date) from public, anon;
grant execute on function public.settlement_expected(uuid, date, date) to authenticated, service_role;

-- ── 7 · payroll ─────────────────────────────────────────────────────────────────────────────────────────────────
/** (d) Who may set pay or give an advance to whom: the owner anyone; a manager only people below them — never
 *  themselves. */
create or replace function public._payroll_may(p_rid uuid, p_profile uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare who profiles;
begin
  select * into who from profiles where id = p_profile and restaurant_id = p_rid;
  if who.id is null then raise exception 'that person is not on this outlet''s staff'; end if;
  if auth_role()::text <> 'owner' and not is_platform_admin() then
    if who.id = auth.uid() then raise exception 'ask the owner to set your own pay' using errcode = '42501'; end if;
    if role_rank(who.role) >= role_rank(auth_role()) then raise exception 'you cannot set pay for someone at or above your own level' using errcode = '42501'; end if;
  end if;
  return who.full_name;
end $$;
revoke all on function public._payroll_may(uuid, uuid) from public, anon, authenticated;

create or replace function public.staff_pay_set(p_profile uuid, p_basis text, p_amount numeric, p_pf boolean, p_esi boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard();
begin
  perform _payroll_may(rid, p_profile);
  if coalesce(p_basis, '') not in ('monthly', 'daily') then raise exception 'by the month or by the day'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'enter the pay'; end if;
  insert into staff_pay (restaurant_id, profile_id, basis, amount, pf_on, esi_on) values (rid, p_profile, p_basis, round(p_amount, 2), coalesce(p_pf, true), coalesce(p_esi, true))
    on conflict (restaurant_id, profile_id) do update set basis = excluded.basis, amount = excluded.amount, pf_on = excluded.pf_on, esi_on = excluded.esi_on, updated_at = now();
  return 1;
end $$;
revoke all on function public.staff_pay_set(uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.staff_pay_set(uuid, text, numeric, boolean, boolean) to authenticated, service_role;

create or replace function public.advance_add(p_profile uuid, p_amount numeric, p_method text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); aid uuid; who text;
begin
  who := _payroll_may(rid, p_profile);
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

/** (a) Other deductions are capped at what is left after PF and ESI, so net never goes below zero; advances come off
 *  after that, never below zero either. */
create or replace function public._payroll_figures(l payroll_lines, p_pf boolean, p_esi boolean, p_pf_on boolean, p_esi_on boolean, p_full numeric, p_adv numeric) returns payroll_lines
language plpgsql immutable set search_path = public as $$
declare earn numeric := l.gross + l.bonus; pfw numeric;
begin
  pfw := least(earn, 15000);
  l.pf_employee := case when p_pf and p_pf_on then round(pfw * 0.12) else 0 end;
  l.pf_employer := l.pf_employee;
  l.esi_employee := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0075) else 0 end;
  l.esi_employer := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0325) else 0 end;
  l.other_deduction := least(greatest(coalesce(l.other_deduction, 0), 0), greatest(0, earn - l.pf_employee - l.esi_employee));
  l.advances := least(coalesce(p_adv, 0), greatest(0, earn - l.pf_employee - l.esi_employee - l.other_deduction));
  l.net := round(earn - l.pf_employee - l.esi_employee - l.advances - l.other_deduction, 2);
  return l;
end $$;
revoke all on function public._payroll_figures(payroll_lines, boolean, boolean, boolean, boolean, numeric, numeric) from public, anon, authenticated;

/** (b) Lock the month. Each line's advance is checked against what is still outstanding first — another month may
 *  have recovered it since this draft was worked out — and the line is put right before anything is marked. */
create or replace function public.payroll_finalise(p_run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); run payroll_runs; l record; a record; left_ numeric; avail numeric;
begin
  select * into run from payroll_runs where id = p_run and restaurant_id = rid for update;
  if run.id is null then raise exception 'that month is not here'; end if;
  if run.status = 'final' then return 0; end if;
  if not exists (select 1 from payroll_lines where run_id = run.id) then raise exception 'work the month out first'; end if;
  for l in select * from payroll_lines where run_id = run.id and advances > 0 loop
    select coalesce(sum(amount), 0) into avail from staff_advances where restaurant_id = rid and profile_id = l.profile_id and recovered_in is null;
    left_ := least(l.advances, avail);
    if left_ < l.advances then   -- recovered elsewhere since: give the difference back on this line
      update payroll_lines set advances = left_, net = net + (l.advances - left_) where id = l.id;
    end if;
    for a in select * from staff_advances where restaurant_id = rid and profile_id = l.profile_id and recovered_in is null order by given_on, created_at loop
      exit when left_ <= 0 or left_ < a.amount;
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

/** (c) Pay one line of a final month, writing down its whole cost:
 *    · Salaries — the net, paid now the way chosen (cash paid today also leaves the drawer, via expense_add);
 *    · Salaries — the advance recovered, marked cash: that money left the drawer when the advance was given;
 *    · PF & ESI — the employee's and the employer's shares, owed to EPFO / ESIC, by bank.
 *  Together: gross + bonus − other deductions + the employer's PF and ESI. Returns the net's expense. */
create or replace function public.payroll_pay(p_line uuid, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard(); l payroll_lines; run payroll_runs; eid uuid; today date := (now() at time zone 'Asia/Kolkata')::date; mon text; stat numeric;
begin
  select * into l from payroll_lines where id = p_line and restaurant_id = rid for update;
  if l.id is null then raise exception 'that line is not here'; end if;
  select * into run from payroll_runs where id = l.run_id;
  if run.status <> 'final' then raise exception 'finalise the month before paying'; end if;
  if l.paid_at is not null then return l.expense_id; end if;
  if coalesce(p_method, '') not in ('cash', 'upi', 'bank') then raise exception 'cash, UPI or bank'; end if;
  mon := to_char(run.month, 'Mon YYYY');
  if l.net > 0 then
    eid := expense_add(today, 'Salaries', l.name, l.net, 0, p_method, mon, 'Payroll');
  end if;
  if l.advances > 0 then
    insert into expenses (restaurant_id, spent_on, category, payee, amount, method, ref, note, created_by)
    values (rid, today, 'Salaries', l.name, l.advances, 'cash', mon, 'Advance recovered from pay (the cash left when it was given)', auth.uid());
  end if;
  stat := coalesce(l.pf_employee, 0) + coalesce(l.esi_employee, 0) + coalesce(l.pf_employer, 0) + coalesce(l.esi_employer, 0);
  if stat > 0 then
    insert into expenses (restaurant_id, spent_on, category, payee, amount, method, ref, note, created_by)
    values (rid, today, 'PF & ESI', l.name, stat, 'bank', mon, 'Employee and employer shares, to deposit with EPFO / ESIC by the 15th', auth.uid());
  end if;
  update payroll_lines set paid_at = now(), paid_method = p_method, expense_id = eid where id = l.id;
  return eid;
end $$;
revoke all on function public.payroll_pay(uuid, text) from public, anon;
grant execute on function public.payroll_pay(uuid, text) to authenticated, service_role;
