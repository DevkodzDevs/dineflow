-- 0105 · Batch 2 of the Petpooja gap list (2026-10-17).
--
--   1. expenses            — what the business spends: category, payee, amount, GST paid, how it was paid. A cash
--                            expense also takes the cash out of the drawer (cash_movements), so the cash-up agrees;
--                            voiding one puts it back.
--   2. checklists          — opening / closing / any-time duty lists the owner writes once; each day's ticks are
--                            a checklist_runs row (who, when), so a missed duty shows.
--   3. channel_settlements — what Swiggy / Zomato actually paid into the bank for a period against what the orders
--                            said they would pay (the payout we already store per order), with TDS / TCS and other
--                            deductions written down, so a short payment is found.
--   4. phone orders        — orders.delivery_address, customers.address; phone_order_card(phone) for the call
--                            screen (the guest, their address, their last orders); order_delivery() saves both.
--   5. report_extra        — payments by method, every dish sold, sales by staff, cancellations and voids,
--                            expenses by category, sales less expenses — for Reports and its Excel / PDF.
--   6. tally               — restaurants.tally_company / tally_ledgers, tally_days(from, to): one line a business
--                            day (IST) of paid dining bills and their payments, and the day's expenses, for the
--                            Tally XML the Tax section writes.
--
-- Every write is a security definer RPC with search_path pinned that checks the caller's role itself. RLS on every
-- new table in this file. None of the new functions are anon's.

-- ─────────────────────────── 1 · expenses ───────────────────────────
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  spent_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  category text not null,
  payee text,
  amount numeric(12,2) not null check (amount > 0),
  gst_amount numeric(12,2) not null default 0 check (gst_amount >= 0),
  method text not null default 'cash' check (method in ('cash', 'upi', 'card', 'bank')),
  ref text,
  note text,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
create index if not exists expenses_rid_day_idx on public.expenses (restaurant_id, spent_on desc);
alter table public.expenses enable row level security;
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (restaurant_id = auth_restaurant_id() and auth_role()::text in ('owner', 'manager', 'supervisor', 'cashier'));

/** One expense. Cash comes out of the drawer as well, so the shift's expected cash already knows. */
create or replace function public.expense_add(p_spent_on date, p_category text, p_payee text, p_amount numeric, p_gst numeric,
                                              p_method text, p_ref text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); eid uuid; cm uuid; d date := coalesce(p_spent_on, (now() at time zone 'Asia/Kolkata')::date);
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor', 'cashier') then raise exception 'your role cannot record expenses' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter an amount above zero'; end if;
  if p_amount > 10000000 then raise exception 'that amount is too large for one expense'; end if;
  if coalesce(p_gst, 0) < 0 or coalesce(p_gst, 0) > p_amount then raise exception 'the GST cannot be more than the amount'; end if;
  if length(trim(coalesce(p_category, ''))) < 2 then raise exception 'choose what it was for'; end if;
  if coalesce(p_method, 'cash') not in ('cash', 'upi', 'card', 'bank') then raise exception 'paid by cash, UPI, card or bank'; end if;
  if d > (now() at time zone 'Asia/Kolkata')::date + 1 or d < (now() at time zone 'Asia/Kolkata')::date - 400 then raise exception 'the date must be within the last year'; end if;
  if coalesce(p_method, 'cash') = 'cash' and d = (now() at time zone 'Asia/Kolkata')::date then
    insert into cash_movements (restaurant_id, kind, amount, reason, note, created_by)
    values (rid, 'out', round(p_amount, 2), 'Expense · ' || left(trim(p_category), 40), nullif(left(trim(coalesce(p_payee, '')), 80), ''), auth.uid())
    returning id into cm;
  end if;
  insert into expenses (restaurant_id, spent_on, category, payee, amount, gst_amount, method, ref, note, cash_movement_id, created_by)
  values (rid, d, left(trim(p_category), 40), nullif(left(trim(coalesce(p_payee, '')), 80), ''), round(p_amount, 2), round(coalesce(p_gst, 0), 2),
          coalesce(p_method, 'cash'), nullif(left(trim(coalesce(p_ref, '')), 60), ''), nullif(left(trim(coalesce(p_note, '')), 300), ''), cm, auth.uid())
  returning id into eid;
  return eid;
end $$;
revoke all on function public.expense_add(date, text, text, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.expense_add(date, text, text, numeric, numeric, text, text, text) to authenticated, service_role;

/** Strike an expense out (owner or manager), with a reason. Cash taken from today's drawer goes back in. */
create or replace function public.expense_void(p_id uuid, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); e expenses;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can strike out an expense' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'say why it is being struck out'; end if;
  select * into e from expenses where id = p_id and restaurant_id = rid and voided_at is null for update;
  if e.id is null then return 0; end if;
  update expenses set voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 200) where id = e.id;
  if e.cash_movement_id is not null then
    insert into cash_movements (restaurant_id, kind, amount, reason, note, created_by)
    values (rid, 'in', e.amount, 'Expense struck out · ' || e.category, left(trim(p_reason), 200), auth.uid());
  end if;
  return 1;
end $$;
revoke all on function public.expense_void(uuid, text) from public, anon;
grant execute on function public.expense_void(uuid, text) to authenticated, service_role;

-- ─────────────────────────── 2 · checklists ───────────────────────────
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  shift text not null default 'opening' check (shift in ('opening', 'closing', 'anytime')),
  items text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists checklists_rid_idx on public.checklists (restaurant_id, sort_order);
alter table public.checklists enable row level security;
drop policy if exists checklists_read on public.checklists;
create policy checklists_read on public.checklists for select to authenticated using (restaurant_id = auth_restaurant_id());

create table if not exists public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  run_date date not null,
  done jsonb not null default '{}'::jsonb,       -- {"0": {"by": uuid, "name": "Ravi", "at": ts}, …} keyed by item position
  completed_at timestamptz,
  unique (checklist_id, run_date)
);
create index if not exists checklist_runs_rid_day_idx on public.checklist_runs (restaurant_id, run_date desc);
alter table public.checklist_runs enable row level security;
drop policy if exists checklist_runs_read on public.checklist_runs;
create policy checklist_runs_read on public.checklist_runs for select to authenticated using (restaurant_id = auth_restaurant_id());

/** Write a list (owner, manager or supervisor): a name, when it is done, up to 40 short duties. A null id is a new one. */
create or replace function public.checklist_save(p_id uuid, p_name text, p_shift text, p_items text[], p_active boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); cid uuid; its text[];
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor') then raise exception 'only the owner, a manager or a supervisor can change the lists' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'give the list a name'; end if;
  if coalesce(p_shift, '') not in ('opening', 'closing', 'anytime') then raise exception 'opening, closing or any time'; end if;
  select coalesce(array_agg(left(trim(x), 120) order by o), '{}') into its
    from unnest(coalesce(p_items, '{}'::text[])) with ordinality u(x, o) where length(trim(x)) > 0;
  if array_length(its, 1) is null then raise exception 'add at least one duty'; end if;
  if array_length(its, 1) > 40 then raise exception 'at most 40 duties in one list'; end if;
  if p_id is null then
    insert into checklists (restaurant_id, name, shift, items, is_active, sort_order)
    values (rid, left(trim(p_name), 60), p_shift, its, coalesce(p_active, true), (select coalesce(max(sort_order), 0) + 1 from checklists where restaurant_id = rid))
    returning id into cid;
  else
    update checklists set name = left(trim(p_name), 60), shift = p_shift, items = its, is_active = coalesce(p_active, true)
     where id = p_id and restaurant_id = rid returning id into cid;
    if cid is null then raise exception 'that list is not here'; end if;
  end if;
  return cid;
end $$;
revoke all on function public.checklist_save(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.checklist_save(uuid, text, text, text[], boolean) to authenticated, service_role;

/** Anyone on the staff ticks (or unticks) one duty on today's run (IST). The run completes when every duty is ticked. */
create or replace function public.checklist_tick(p_checklist uuid, p_item int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c checklists; today date := (now() at time zone 'Asia/Kolkata')::date; r checklist_runs; who text;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from checklists where id = p_checklist and restaurant_id = rid and is_active;
  if c.id is null then raise exception 'that list is not here'; end if;
  if p_item is null or p_item < 0 or p_item >= coalesce(array_length(c.items, 1), 0) then raise exception 'no such duty'; end if;
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
         completed_at = case when (select count(*) from jsonb_object_keys(r.done)) >= array_length(c.items, 1) then coalesce(completed_at, now()) else null end
   where id = r.id returning * into r;
  return jsonb_build_object('done', r.done, 'completed_at', r.completed_at);
end $$;
revoke all on function public.checklist_tick(uuid, int, boolean) from public, anon;
grant execute on function public.checklist_tick(uuid, int, boolean) to authenticated, service_role;

-- ─────────────────────────── 3 · aggregator payouts ───────────────────────────
create table if not exists public.channel_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel_id uuid not null references public.order_channels(id) on delete cascade,
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  orders_count int not null default 0,
  gross numeric(12,2) not null default 0,
  commission numeric(12,2) not null default 0,
  expected numeric(12,2) not null default 0,     -- the orders' own payouts for the period, when it was written down
  received numeric(12,2) not null check (received >= 0),
  tds numeric(12,2) not null default 0 check (tds >= 0),
  other_deductions numeric(12,2) not null default 0 check (other_deductions >= 0),
  utr text,
  received_on date,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists channel_settlements_rid_idx on public.channel_settlements (restaurant_id, period_to desc);
alter table public.channel_settlements enable row level security;
drop policy if exists channel_settlements_read on public.channel_settlements;
create policy channel_settlements_read on public.channel_settlements for select to authenticated
  using (restaurant_id = auth_restaurant_id() and auth_role()::text in ('owner', 'manager'));

/** What a channel's orders in [from, to] (IST dates) say it owes: count, gross, commission, payout. Rejected and
 *  cancelled orders are left out. */
create or replace function public.settlement_expected(p_channel uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can see payouts' using errcode = '42501'; end if;
  select jsonb_build_object('orders', count(*), 'gross', coalesce(sum(gross), 0), 'commission', coalesce(sum(commission), 0), 'payout', coalesce(sum(payout), 0))
    into out
    from online_orders
   where restaurant_id = rid and channel_id = p_channel and status not in ('rejected', 'cancelled')
     and (placed_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  return out;
end $$;
revoke all on function public.settlement_expected(uuid, date, date) from public, anon;
grant execute on function public.settlement_expected(uuid, date, date) to authenticated, service_role;

/** Write down a payout that landed. The expected figures are taken now, so a later edit to an order does not move
 *  an old settlement's difference. */
create or replace function public.settlement_add(p_channel uuid, p_from date, p_to date, p_received numeric, p_tds numeric,
                                                 p_other numeric, p_utr text, p_received_on date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); e jsonb; sid uuid;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can record payouts' using errcode = '42501'; end if;
  if not exists (select 1 from order_channels where id = p_channel and restaurant_id = rid) then raise exception 'that channel is not here'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'choose the period the payout covers'; end if;
  if p_to - p_from > 62 then raise exception 'a payout covers at most two months'; end if;
  if p_received is null or p_received < 0 then raise exception 'enter what reached the bank'; end if;
  e := settlement_expected(p_channel, p_from, p_to);
  insert into channel_settlements (restaurant_id, channel_id, period_from, period_to, orders_count, gross, commission, expected, received, tds,
                                   other_deductions, utr, received_on, note, created_by)
  values (rid, p_channel, p_from, p_to, (e->>'orders')::int, (e->>'gross')::numeric, (e->>'commission')::numeric, (e->>'payout')::numeric,
          round(p_received, 2), round(coalesce(p_tds, 0), 2), round(coalesce(p_other, 0), 2), nullif(left(trim(coalesce(p_utr, '')), 40), ''),
          p_received_on, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning id into sid;
  return sid;
end $$;
revoke all on function public.settlement_add(uuid, date, date, numeric, numeric, numeric, text, date, text) from public, anon;
grant execute on function public.settlement_add(uuid, date, date, numeric, numeric, numeric, text, date, text) to authenticated, service_role;

create or replace function public.settlement_delete(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n int;
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can remove a payout' using errcode = '42501'; end if;
  delete from channel_settlements where id = p_id and restaurant_id = rid; get diagnostics n = row_count; return n;
end $$;
revoke all on function public.settlement_delete(uuid) from public, anon;
grant execute on function public.settlement_delete(uuid) to authenticated, service_role;

-- ─────────────────────────── 4 · phone orders ───────────────────────────
alter table public.orders add column if not exists delivery_address text;
alter table public.customers add column if not exists address text;

/** The call screen's card for a number: the customer (name, address, visits, spend, notes) and their last five
 *  orders with the dishes, for "same again". Staff with the till only. */
create or replace function public.phone_order_card(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); ph text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); c customers; out jsonb;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if length(ph) < 10 then return null; end if;
  select * into c from customers where restaurant_id = rid and phone = ph;
  select jsonb_build_object(
    'customer', case when c.id is null then null else jsonb_build_object('name', c.name, 'address', c.address, 'visits', c.visits, 'spend', c.total_spend, 'notes', c.notes, 'last', c.last_visit_at) end,
    'last_address', (select o.delivery_address from orders o where o.restaurant_id = rid and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 10) = ph and o.delivery_address is not null order by o.created_at desc limit 1),
    'orders', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', o.id, 'no', o.order_no, 'type', o.type, 'at', o.created_at,
                 'items', (select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', i.menu_item_id, 'variant_id', i.variant_id, 'name', i.name_snapshot, 'variant', i.variant_name, 'qty', i.qty, 'price', i.price_snapshot) order by i.created_at), '[]'::jsonb)
                             from order_items i where i.order_id = o.id and i.status <> 'cancelled')) x
          from orders o
         where o.restaurant_id = rid and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 10) = ph and o.status <> 'cancelled'
         order by o.created_at desc limit 5) s), '[]'::jsonb))
    into out;
  return out;
end $$;
revoke all on function public.phone_order_card(text) from public, anon;
grant execute on function public.phone_order_card(text) to authenticated, service_role;

/** Where a delivery goes: on the order, and remembered on the customer for next time. */
create or replace function public.order_delivery(p_order uuid, p_address text) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders; a text := nullif(left(trim(coalesce(p_address, '')), 300), ''); ph text;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into o from orders where id = p_order and restaurant_id = rid;
  if o.id is null then raise exception 'that order is not here'; end if;
  update orders set delivery_address = a where id = o.id;
  ph := right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 10);
  if a is not null and length(ph) = 10 then update customers set address = a where restaurant_id = rid and phone = ph; end if;
  return 1;
end $$;
revoke all on function public.order_delivery(uuid, text) from public, anon;
grant execute on function public.order_delivery(uuid, text) to authenticated, service_role;

-- ─────────────────────────── 5 · more reports ───────────────────────────
/** The reports Reports did not have, for IST dates [from, to] (at most a year): payments by method, every dish
 *  sold, sales by the person who took the order, cancellations and voids, expenses by category, and sales less
 *  expenses. Owner, manager or supervisor. Paid bills only; a bill's day is the day it was paid. */
create or replace function public.report_extra(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text not in ('owner', 'manager', 'supervisor') and not is_platform_admin() then raise exception 'your role cannot see these reports' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'choose up to a year'; end if;
  with b as (
    select b.* from bills b
     where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ), sold as (
    select i.name_snapshot as name, coalesce(i.variant_name, '') as variant, sum(i.qty)::int as qty, round(sum(i.qty * i.price_snapshot), 2) as amount
      from b join order_items i on i.order_id = b.order_id and i.status <> 'cancelled'
     group by 1, 2
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object('bills', count(*), 'gross', coalesce(sum(subtotal), 0), 'discount', coalesce(sum(discount_amount), 0),
                 'service', coalesce(sum(service_charge), 0), 'cgst', coalesce(sum(cgst), 0), 'sgst', coalesce(sum(sgst), 0),
                 'round_off', coalesce(sum(round_off), 0), 'total', coalesce(sum(total), 0)) from b),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', m, 'count', n, 'amount', a) order by a desc)
                  from (select p.method::text m, count(*) n, sum(p.amount) a from payments p join b on b.id = p.bill_id group by 1) x), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'variant', nullif(variant, ''), 'qty', qty, 'amount', amount) order by amount desc, name) from sold), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, 'Online / self-order'), 'bills', x.n, 'amount', x.a) order by x.a desc)
                  from (select o.created_by, count(*) n, sum(b.total) a from b join orders o on o.id = b.order_id group by 1) x
                  left join profiles pr on pr.id = x.created_by), '[]'::jsonb),
    'cancelled', (select jsonb_build_object('lines', count(*), 'amount', coalesce(sum(i.qty * i.price_snapshot), 0))
                    from order_items i where i.restaurant_id = rid and i.status = 'cancelled'
                     and (coalesce(i.cancelled_at, i.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'voids', (select jsonb_build_object('bills', count(*), 'amount', coalesce(sum(total), 0)) from bills
                where restaurant_id = rid and status = 'void' and (coalesce(voided_at, created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', n, 'amount', a, 'gst', g) order by a desc)
                  from (select category, count(*) n, sum(amount) a, sum(gst_amount) g from expenses
                         where restaurant_id = rid and voided_at is null and spent_on between p_from and p_to group by 1) x), '[]'::jsonb))
    into out;
  -- sales less expenses: what the bills brought in before tax, against what was spent (GST paid on expenses is
  -- shown apart; it may come back as input credit)
  out := out || jsonb_build_object('net', jsonb_build_object(
    'sales', round(((out->'totals'->>'total')::numeric - (out->'totals'->>'cgst')::numeric - (out->'totals'->>'sgst')::numeric), 2),
    'expenses', coalesce((select sum((e->>'amount')::numeric - (e->>'gst')::numeric) from jsonb_array_elements(out->'expenses') e), 0),
    'expense_gst', coalesce((select sum((e->>'gst')::numeric) from jsonb_array_elements(out->'expenses') e), 0)));
  return out;
end $$;
revoke all on function public.report_extra(date, date) from public, anon;
grant execute on function public.report_extra(date, date) to authenticated, service_role;

-- ─────────────────────────── 6 · Tally ───────────────────────────
alter table public.restaurants add column if not exists tally_company text;
alter table public.restaurants add column if not exists tally_ledgers jsonb not null default '{}'::jsonb;

/** The company name and ledger names the Tally file uses (owner or manager). Keys outside the known set are dropped. */
create or replace function public.tally_settings_save(p_company text, p_ledgers jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); clean jsonb;
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can change the Tally names' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(key, left(trim(value), 60)), '{}'::jsonb) into clean
    from jsonb_each_text(coalesce(p_ledgers, '{}'::jsonb))
   where key in ('sales', 'service', 'cgst', 'sgst', 'round_off', 'other_income', 'cash', 'upi', 'card', 'other', 'bank', 'expense_prefix', 'input_gst')
     and length(trim(value)) > 0;
  update restaurants set tally_company = nullif(left(trim(coalesce(p_company, '')), 80), ''), tally_ledgers = clean where id = rid;
  return 1;
end $$;
revoke all on function public.tally_settings_save(text, jsonb) from public, anon;
grant execute on function public.tally_settings_save(text, jsonb) to authenticated, service_role;

/** One row a day (IST) for [from, to] (at most 92 days): the paid dining bills' totals and how they were paid, and the
 *  day's expenses by category and method. Owner or manager. */
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
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', spent_on, 'category', category, 'payee', payee, 'amount', amount,
                                  'gst', gst_amount, 'method', method, 'ref', ref) order by spent_on, created_at)
                  from expenses where restaurant_id = rid and voided_at is null and spent_on between p_from and p_to), '[]'::jsonb));
end $$;
revoke all on function public.tally_days(date, date) from public, anon;
grant execute on function public.tally_days(date, date) to authenticated, service_role;
