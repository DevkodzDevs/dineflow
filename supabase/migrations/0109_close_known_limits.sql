-- 0109 · Closing the known limits left after 0103–0108 (2026-10-18).
--
--  1. Feedback per visitor. A guest's address still never reaches the database: the app sends a keyed hash of it
--     (HMAC with a server secret and the IST date, so it changes every day and cannot be turned back into an address),
--     and feedback_submit allows five notes an hour from one hash per place. Rows older than two days are dropped as
--     new ones arrive. Without a hash (the API called directly) the place-wide allowances of 0108 still hold.
--  2. PF on the right wage. staff_pay.pf_basic_pct — the share of pay that is basic + DA (default 100, the old
--     behaviour); restaurants.payroll_wage_rule — the labour codes' 50% rule (in force from 21 Nov 2025: when allowances
--     are more than half of pay, the excess counts as wages), on by default: the PF wage is then never under half the
--     earnings. PF = 12% of that wage up to ₹15,000. Each line keeps pf_wage, for the payslip.
--  3. Tally for stays. tally_days also returns the period's stay and facility invoices (dining invoices are their bills,
--     already in the day's sales): lines with their SAC, tax, what was paid and how, and any balance still owed.
--  4. Sending a menu copies add-on groups (with their add-ons and which dishes use them) and combo parts, matched by name.
--  5. Outlet memberships: chain_overview returns each outlet's trial / membership end dates; admin_match_chain_membership
--     gives an outlet the same membership and end date as the outlet its chain started from (Master control only).
-- Every function checks its caller; RLS on the new table; no other table policy changes.

-- ── 1 · one visitor, five notes an hour ─────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback_ip_hits (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists feedback_ip_hits_idx on public.feedback_ip_hits (restaurant_id, ip_hash, at desc);
alter table public.feedback_ip_hits enable row level security;   -- no policy: nobody reads it but the functions
revoke all on public.feedback_ip_hits from public, anon, authenticated;

create or replace function public.feedback_submit(p_slug text, p_table text, p_rating integer, p_tags text[], p_comment text, p_name text, p_phone text, p_ip_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; n int; h text := nullif(left(regexp_replace(coalesce(p_ip_hash, ''), '[^a-f0-9]', '', 'g'), 64), ''); out jsonb;
begin
  if h is not null then
    select id into rid from restaurants where booking_slug = p_slug;
    if rid is not null then
      delete from feedback_ip_hits where restaurant_id = rid and at < now() - interval '2 days';
      select count(*) into n from feedback_ip_hits where restaurant_id = rid and ip_hash = h and at > now() - interval '1 hour';
      if n >= 5 then raise exception 'Thank you — we already have your feedback. Please try again later.'; end if;
    end if;
  end if;
  -- every other rule is the 7-argument version's (0108); a note it refuses is not counted here either
  out := feedback_submit(p_slug, p_table, p_rating, p_tags, p_comment, p_name, p_phone);
  if h is not null and rid is not null then insert into feedback_ip_hits (restaurant_id, ip_hash) values (rid, h); end if;
  return out;
end $$;
revoke execute on function public.feedback_submit(text, text, integer, text[], text, text, text, text) from public;
grant execute on function public.feedback_submit(text, text, integer, text[], text, text, text, text) to anon, authenticated, service_role;

-- ── 2 · PF on basic + DA, with the 50% rule ─────────────────────────────────────────────────────────────────────
alter table public.staff_pay add column if not exists pf_basic_pct numeric(5,2) not null default 100 check (pf_basic_pct between 1 and 100);
alter table public.restaurants add column if not exists payroll_wage_rule boolean not null default true;
alter table public.payroll_runs add column if not exists wage_rule boolean not null default true;
alter table public.payroll_lines add column if not exists pf_wage numeric(12,2) not null default 0;

/** The PF wage: (gross + bonus) × the basic + DA share — never under half when the 50% rule is on — capped at ₹15,000. */
create or replace function public._payroll_pf_wage(p_earn numeric, p_basic_pct numeric, p_rule boolean) returns numeric
language sql immutable set search_path = public as $$
  select round(least(15000, p_earn * greatest(coalesce(p_basic_pct, 100) / 100.0, case when p_rule then 0.5 else 0 end)), 2)
$$;
revoke all on function public._payroll_pf_wage(numeric, numeric, boolean) from public, anon, authenticated;

/** A line's figures (as 0108's _payroll_figures, with PF on the PF wage). Other deductions stop at zero net; advances
 *  come off last, never below zero. */
create or replace function public._payroll_figures_v2(l payroll_lines, p_pf boolean, p_esi boolean, p_pf_on boolean, p_esi_on boolean, p_full numeric, p_adv numeric, p_basic_pct numeric, p_rule boolean) returns payroll_lines
language plpgsql immutable set search_path = public as $$
declare earn numeric := l.gross + l.bonus;
begin
  l.pf_wage := case when p_pf and p_pf_on then _payroll_pf_wage(earn, p_basic_pct, p_rule) else 0 end;
  l.pf_employee := round(l.pf_wage * 0.12);
  l.pf_employer := l.pf_employee;
  l.esi_employee := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0075) else 0 end;
  l.esi_employer := case when p_esi and p_esi_on and p_full <= 21000 then ceil(earn * 0.0325) else 0 end;
  l.other_deduction := least(greatest(coalesce(l.other_deduction, 0), 0), greatest(0, earn - l.pf_employee - l.esi_employee));
  l.advances := least(coalesce(p_adv, 0), greatest(0, earn - l.pf_employee - l.esi_employee - l.other_deduction));
  l.net := round(earn - l.pf_employee - l.esi_employee - l.advances - l.other_deduction, 2);
  return l;
end $$;
revoke all on function public._payroll_figures_v2(payroll_lines, boolean, boolean, boolean, boolean, numeric, numeric, numeric, boolean) from public, anon, authenticated;

create or replace function public.payroll_settings_save(p_pf boolean, p_esi boolean, p_paid_offs int, p_wage_rule boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard();
begin
  if p_paid_offs is null or p_paid_offs < 0 or p_paid_offs > 8 then raise exception 'paid weekly offs: 0 to 8 a month'; end if;
  update restaurants set payroll_pf = coalesce(p_pf, false), payroll_esi = coalesce(p_esi, false), payroll_paid_offs = p_paid_offs,
         payroll_wage_rule = coalesce(p_wage_rule, true) where id = rid;
  return 1;
end $$;
revoke all on function public.payroll_settings_save(boolean, boolean, int, boolean) from public, anon;
grant execute on function public.payroll_settings_save(boolean, boolean, int, boolean) to authenticated, service_role;

create or replace function public.staff_pay_set(p_profile uuid, p_basis text, p_amount numeric, p_pf boolean, p_esi boolean, p_basic_pct numeric) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := _payroll_guard();
begin
  perform _payroll_may(rid, p_profile);
  if coalesce(p_basis, '') not in ('monthly', 'daily') then raise exception 'by the month or by the day'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'enter the pay'; end if;
  if p_basic_pct is not null and (p_basic_pct < 1 or p_basic_pct > 100) then raise exception 'basic + DA is a share of pay, 1 to 100%%'; end if;
  insert into staff_pay (restaurant_id, profile_id, basis, amount, pf_on, esi_on, pf_basic_pct)
  values (rid, p_profile, p_basis, round(p_amount, 2), coalesce(p_pf, true), coalesce(p_esi, true), coalesce(p_basic_pct, 100))
    on conflict (restaurant_id, profile_id) do update set basis = excluded.basis, amount = excluded.amount, pf_on = excluded.pf_on, esi_on = excluded.esi_on,
       pf_basic_pct = excluded.pf_basic_pct, updated_at = now();
  return 1;
end $$;
revoke all on function public.staff_pay_set(uuid, text, numeric, boolean, boolean, numeric) from public, anon;
grant execute on function public.staff_pay_set(uuid, text, numeric, boolean, boolean, numeric) to authenticated, service_role;

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
    insert into payroll_runs (restaurant_id, month, pf, esi, paid_offs, wage_rule, created_by) values (rid, m, r.payroll_pf, r.payroll_esi, r.payroll_paid_offs, r.payroll_wage_rule, auth.uid()) returning * into run;
  else
    update payroll_runs set pf = r.payroll_pf, esi = r.payroll_esi, paid_offs = r.payroll_paid_offs, wage_rule = r.payroll_wage_rule where id = run.id returning * into run;
  end if;
  select coalesce(jsonb_object_agg(profile_id::text, jsonb_build_object('bonus', bonus, 'other', other_deduction, 'note', note)), '{}'::jsonb)
    into kept from payroll_lines where run_id = run.id;
  delete from payroll_lines where run_id = run.id;
  for s in select p.id, p.full_name, p.role::text role, sp.basis, sp.amount, sp.pf_on, sp.esi_on, sp.pf_basic_pct
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
             coalesce((k->>'bonus')::numeric, 0), 0, 0, 0, coalesce((k->>'other')::numeric, 0), 0, 0, 0, k->>'note', null, null, null, 0)::payroll_lines;
    l := _payroll_figures_v2(l, run.pf, run.esi, s.pf_on, s.esi_on, full_wage, adv, s.pf_basic_pct, run.wage_rule);
    insert into payroll_lines select l.*;
  end loop;
  return run.id;
end $$;
revoke all on function public.payroll_build(date) from public, anon;
grant execute on function public.payroll_build(date) to authenticated, service_role;

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
  l := _payroll_figures_v2(l, run.pf, run.esi, coalesce(sp.pf_on, true), coalesce(sp.esi_on, true), case when l.basis = 'monthly' then l.rate else l.rate * 26 end, adv, coalesce(sp.pf_basic_pct, 100), run.wage_rule);
  update payroll_lines set bonus = l.bonus, other_deduction = l.other_deduction, note = l.note, pf_wage = l.pf_wage, pf_employee = l.pf_employee, pf_employer = l.pf_employer,
         esi_employee = l.esi_employee, esi_employer = l.esi_employer, advances = l.advances, net = l.net where id = l.id;
  return to_jsonb(l);
end $$;
revoke all on function public.payroll_line_set(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.payroll_line_set(uuid, numeric, numeric, text) to authenticated, service_role;

-- ── 3 · Tally: stays and facilities as well as dining ───────────────────────────────────────────────────────────
create or replace function public.tally_days(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') and not is_platform_admin() then raise exception 'only the owner or a manager can export to Tally' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'choose up to three months'; end if;
  return jsonb_build_object(
    'sales', coalesce((select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', day, 'bills', count(*), 'first', min(bill_no), 'last', max(bill_no),
                 'taxable', round(sum(subtotal - discount_amount), 2), 'service', round(sum(service_charge), 2),
                 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'round_off', round(sum(round_off), 2), 'total', round(sum(total), 2),
                 'paid', (select coalesce(jsonb_object_agg(m, a), '{}'::jsonb) from (
                           select p.method::text m, round(sum(p.amount), 2) a from payments p join bills b2 on b2.id = p.bill_id
                            where b2.restaurant_id = rid and b2.status = 'paid' and (b2.paid_at at time zone 'Asia/Kolkata')::date = x.day group by 1) pm)) d
          from (select (paid_at at time zone 'Asia/Kolkata')::date as day, * from bills where restaurant_id = rid and status = 'paid'
                   and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to) x
         group by day) s), '[]'::jsonb),
    -- a stay or a facility invoice is its own voucher, on the day it was issued; dining invoices are their bills (above)
    'stays', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'no', i.invoice_no, 'kind', i.kind, 'day', (i.issued_at at time zone 'Asia/Kolkata')::date,
                 'guest', i.guest_name, 'gstin', i.guest_gstin, 'lines', i.lines, 'subtotal', i.subtotal, 'discount', coalesce(i.discount, 0),
                 'cgst', i.cgst, 'sgst', i.sgst, 'round_off', coalesce(i.round_off, 0), 'total', i.total, 'paid', coalesce(i.paid, 0),
                 'payments', coalesce(i.payments, '[]'::jsonb)) order by i.issued_at)
          from invoices i where i.restaurant_id = rid and i.kind::text in ('stay', 'facility') and coalesce(i.status, '') <> 'void'
           and (i.issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', spent_on, 'category', category, 'payee', payee, 'amount', amount,
                                  'gst', gst_amount, 'method', method, 'ref', ref) order by spent_on, created_at)
                  from expenses where restaurant_id = rid and voided_at is null and spent_on between p_from and p_to), '[]'::jsonb));
end $$;
revoke all on function public.tally_days(date, date) from public, anon;
grant execute on function public.tally_days(date, date) to authenticated, service_role;

-- ── 4 · sending a menu: add-ons and combos too ──────────────────────────────────────────────────────────────────
create or replace function public._copy_menu(p_from uuid, p_to uuid, p_prices boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; m record; v record; g record; a record; tc uuid; tm uuid; tg uuid; nc int := 0; na int := 0; nu int := 0; nv int := 0; ng int := 0; nad int := 0;
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
               prep_minutes = m.prep_minutes, station = m.station, is_combo = m.is_combo, is_active = true,
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
  -- add-on groups and their add-ons, by name; the target's stock links (ingredients) are its own and are not copied
  for g in select * from addon_groups where restaurant_id = p_from and coalesce(is_active, true) loop
    select id into tg from addon_groups where restaurant_id = p_to and lower(name) = lower(g.name) limit 1;
    if tg is null then
      insert into addon_groups (restaurant_id, name, min_select, max_select, sort_order, is_active) values (p_to, g.name, g.min_select, g.max_select, g.sort_order, true) returning id into tg;
      ng := ng + 1;
    else
      update addon_groups set min_select = g.min_select, max_select = g.max_select, sort_order = g.sort_order, is_active = true where id = tg;
    end if;
    for a in select * from addons where group_id = g.id and coalesce(is_active, true) loop
      if exists (select 1 from addons where group_id = tg and lower(name) = lower(a.name)) then
        update addons set is_veg = a.is_veg, sort_order = a.sort_order, is_active = true, price = case when p_prices then a.price else price end where group_id = tg and lower(name) = lower(a.name);
      else
        insert into addons (restaurant_id, group_id, name, price, is_veg, is_available, sort_order, is_active) values (p_to, tg, a.name, a.price, a.is_veg, a.is_available, a.sort_order, true);
        nad := nad + 1;
      end if;
    end loop;
    -- which dishes use the group, matched by the dish's name
    insert into menu_item_addon_groups (restaurant_id, menu_item_id, group_id)
    select p_to, tmi.id, tg from menu_item_addon_groups l join menu_items smi on smi.id = l.menu_item_id
      join menu_items tmi on tmi.restaurant_id = p_to and lower(tmi.name) = lower(smi.name)
     where l.group_id = g.id
       and not exists (select 1 from menu_item_addon_groups x where x.menu_item_id = tmi.id and x.group_id = tg);
  end loop;
  -- combo parts, by the combo's and the part's names
  insert into combo_items (restaurant_id, combo_id, menu_item_id, qty)
  select p_to, tc2.id, tp.id, ci.qty
    from combo_items ci join menu_items sc on sc.id = ci.combo_id join menu_items sp on sp.id = ci.menu_item_id
    join menu_items tc2 on tc2.restaurant_id = p_to and lower(tc2.name) = lower(sc.name)
    join menu_items tp on tp.restaurant_id = p_to and lower(tp.name) = lower(sp.name)
   where ci.restaurant_id = p_from
     and not exists (select 1 from combo_items x where x.combo_id = tc2.id and x.menu_item_id = tp.id);
  return jsonb_build_object('categories', nc, 'added', na, 'updated', nu, 'sizes', nv, 'addon_groups', ng, 'addons', nad);
end $$;
revoke all on function public._copy_menu(uuid, uuid, boolean) from public, anon, authenticated;

-- ── 5 · outlet memberships ──────────────────────────────────────────────────────────────────────────────────────
/** Master control: give an outlet the membership of the outlet its chain started from — status, plan and end date. */
create or replace function public.admin_match_chain_membership(p_restaurant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o restaurants; head restaurants;
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  select * into o from restaurants where id = p_restaurant;
  if o.id is null or o.chain_id is null or o.chain_id = o.id then raise exception 'this property is not an outlet of a chain'; end if;
  select * into head from restaurants where id = o.chain_id;
  if head.id is null then raise exception 'its chain''s first outlet is gone'; end if;
  update restaurants set membership = head.membership, membership_plan = head.membership_plan, membership_ends_at = head.membership_ends_at,
         trial_ends_at = head.trial_ends_at where id = o.id;
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'match_chain_membership', o.id, jsonb_build_object('from', head.id, 'membership', head.membership, 'ends', coalesce(head.membership_ends_at, head.trial_ends_at)));
  return jsonb_build_object('membership', head.membership, 'ends', coalesce(head.membership_ends_at, head.trial_ends_at));
end $$;
revoke all on function public.admin_match_chain_membership(uuid) from public, anon;
grant execute on function public.admin_match_chain_membership(uuid) to authenticated, service_role;

/** chain_overview (0106) with each outlet's trial and membership end dates, so the owner sees what needs switching on. */
create or replace function public.chain_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[] := _my_outlet_ids(); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot see the chain' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(o order by o->>'name') from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'type', r.property_type, 'city', r.district, 'membership', membership_state_for(r.id),
      'trial_ends_at', r.trial_ends_at, 'membership_ends_at', r.membership_ends_at,
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
