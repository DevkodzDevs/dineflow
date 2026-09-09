-- DineFlow v15 — Leak finder and Shift close.
-- Run AFTER 0016.
-- Leak finder: what the recipes say you should have, against what you counted. The gap is where
-- the kitchen is bleeding — over-portioning, spoilage nobody logged, or hands in the store.
-- Shift close: what the tills should hold from the day's bills, against what was counted, in one
-- screen and one message the owner can read on WhatsApp.

-- ───────── stock counts ─────────
-- A count is an 'adjustment' ledger row tagged ref_type = 'count' carrying the counted quantity in note.
-- This keeps the ledger as the single truth: after a count, stock is exactly what was counted.
create or replace function stock_count(p_counts jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c jsonb; ing ingredients; delta numeric; n int := 0; total_gap numeric := 0;
begin
  for c in select * from jsonb_array_elements(p_counts) loop
    select * into ing from ingredients where id = (c->>'ingredient_id')::uuid and restaurant_id = rid;
    if not found then continue; end if;
    delta := (c->>'counted')::numeric - ing.current_stock;
    insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, note, created_by)
      values (rid, ing.id, delta, 'adjustment', 'count', jsonb_build_object('counted', (c->>'counted')::numeric, 'expected', ing.current_stock)::text, auth.uid());
    n := n + 1; total_gap := total_gap + abs(delta) * coalesce(ing.cost_per_unit, 0);
  end loop;
  return jsonb_build_object('counted', n, 'gap_value', round(total_gap, 0));
end $$;

-- ───────── the leak finder ─────────
-- For each ingredient, since its last count (or 30 days): opening + purchases − recipe sales − logged wastage
-- = what you should have. Versus the latest count (or current stock if never counted). Ranked by rupees lost.
create or replace function leak_report(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  with last_count as (
    select l.ingredient_id, max(l.created_at) as at
    from stock_ledger l where l.restaurant_id = rid and l.reason = 'adjustment' and l.ref_type = 'count' group by l.ingredient_id
  ),
  win as (
    select i.id as ingredient_id, coalesce(lc.at, now() - (p_days || ' days')::interval) as since
    from ingredients i left join last_count lc on lc.ingredient_id = i.id where i.restaurant_id = rid and i.is_active
  ),
  moves as (
    select w.ingredient_id,
      sum(l.qty) filter (where l.reason = 'purchase') as bought,
      -sum(l.qty) filter (where l.reason = 'sale') as used_by_recipes,
      -sum(l.qty) filter (where l.reason = 'wastage') as wasted,
      sum(l.qty) filter (where l.reason = 'adjustment' and coalesce(l.ref_type, '') <> 'count') as adjusted,
      sum(l.qty) filter (where l.reason = 'adjustment' and l.ref_type = 'count') as count_gap,
      count(*) filter (where l.reason = 'adjustment' and l.ref_type = 'count') as counts
    from win w join stock_ledger l on l.ingredient_id = w.ingredient_id and l.created_at > w.since - interval '1 second'
    where l.restaurant_id = rid group by w.ingredient_id
  ),
  rows_ as (
    select i.name, i.unit, i.cost_per_unit, i.current_stock, w.since,
      coalesce(m.bought, 0) as bought, coalesce(m.used_by_recipes, 0) as used, coalesce(m.wasted, 0) as wasted, coalesce(m.adjusted, 0) as adjusted,
      -- the unexplained gap: a count told us stock was lower (negative count_gap) than the recipes predicted
      coalesce(m.count_gap, 0) as gap_qty,
      round(coalesce(m.count_gap, 0) * i.cost_per_unit, 0) as gap_value,
      coalesce(m.counts, 0) as counts
    from ingredients i join win w on w.ingredient_id = i.id left join moves m on m.ingredient_id = i.id
    where i.restaurant_id = rid and i.is_active
  )
  select jsonb_build_object(
    'since_days', p_days,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'bought', round(bought, 2), 'used', round(used, 2), 'wasted', round(wasted, 2), 'gap_qty', round(gap_qty, 2), 'gap_value', gap_value, 'gap_pct', case when used > 0 then round(-gap_qty / used * 100, 1) else null end, 'counted', counts > 0, 'since', since) order by gap_value asc, name) from rows_), '[]'),
    'lost_value', coalesce((select -sum(gap_value) from rows_ where gap_value < 0), 0),
    'found_value', coalesce((select sum(gap_value) from rows_ where gap_value > 0), 0),
    'worst', (select name from rows_ order by gap_value asc limit 1),
    'uncounted', (select count(*) from rows_ where counts = 0),
    'logged_wastage_value', coalesce((select round(sum(wasted * cost_per_unit), 0) from rows_), 0))
  into out;
  return out;
end $$;

-- ───────── shift close ─────────
create table if not exists shift_closes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  business_date date not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now(),
  expected jsonb not null,           -- { cash, upi, card, other, total, bills, covers, room_charges }
  counted_cash numeric(12,2),
  float_cash numeric(12,2) not null default 0,
  variance numeric(12,2),
  note text,
  summary text not null,
  closed_by uuid
);
create index if not exists shift_closes_rid_date_idx on shift_closes(restaurant_id, business_date desc);
alter table shift_closes enable row level security;
drop policy if exists shift_closes_tenant on shift_closes;
create policy shift_closes_tenant on shift_closes for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());

/** What the tills should hold right now: every payment since the last close (or since the business day began at 06:00 IST). */
create or replace function shift_expected() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); since timestamptz; out jsonb;
begin
  -- the business day starts at 06:00 IST; between midnight and 06:00 that is *yesterday's* 06:00,
  -- or a restaurant open past midnight would find its night's takings outside the window
  declare day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '6 hours') at time zone 'Asia/Kolkata';
  begin
    if day_start > now() then day_start := day_start - interval '1 day'; end if;
    select max(closed_at) into since from shift_closes where restaurant_id = rid;
    if since is null or since < day_start then since := day_start; end if;
  end;
  with p as (
    select p.method, p.amount from payments p where p.restaurant_id = rid and p.created_at > since
  )
  select jsonb_build_object(
    'since', since,
    'cash', coalesce((select sum(amount) from p where method = 'cash'), 0),
    'upi', coalesce((select sum(amount) from p where method = 'upi'), 0),
    'card', coalesce((select sum(amount) from p where method = 'card'), 0),
    'other', coalesce((select sum(amount) from p where method = 'other'), 0),
    'total', coalesce((select sum(amount) from p), 0),
    'bills', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > since),
    'unpaid', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'unpaid'),
    'open_orders', (select count(*) from orders o where o.restaurant_id = rid and o.status = 'open'),
    'room_charges', coalesce((select sum(bc.amount) from booking_charges bc where bc.restaurant_id = rid and bc.created_at > since), 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'qty', q)) from (select i.name_snapshot n, sum(i.qty) q from order_items i where i.restaurant_id = rid and i.created_at > since and i.status <> 'cancelled' group by 1 order by 2 desc limit 3) t), '[]'))
  into out;
  return out;
end $$;

/** Close the shift: record expected vs counted, write the one-paragraph summary the owner reads on WhatsApp. */
create or replace function shift_close(p_counted_cash numeric, p_float numeric default 0, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); e jsonb; v numeric; r restaurants; s text; sc shift_closes; d date;
begin
  select * into r from restaurants where id = rid;
  e := shift_expected();
  v := p_counted_cash - p_float - (e->>'cash')::numeric;
  d := (now() at time zone 'Asia/Kolkata')::date;
  s := format('%s · %s%s%s. Sales ₹%s from %s bills. Cash ₹%s, UPI ₹%s, card ₹%s. Counted ₹%s against ₹%s expected — %s.%s%s',
    r.name, to_char(now() at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'),
    case when (e->>'open_orders')::int > 0 then format(' · %s orders still open', e->>'open_orders') else '' end,
    case when (e->>'unpaid')::int > 0 then format(' · %s bills unpaid', e->>'unpaid') else '' end,
    to_char((e->>'total')::numeric, 'FM99,99,999'), e->>'bills',
    to_char((e->>'cash')::numeric, 'FM99,99,999'), to_char((e->>'upi')::numeric, 'FM99,99,999'), to_char((e->>'card')::numeric, 'FM99,99,999'),
    to_char(p_counted_cash - p_float, 'FM99,99,999'), to_char((e->>'cash')::numeric, 'FM99,99,999'),
    case when abs(v) < 1 then 'exact' when v > 0 then format('₹%s over', to_char(v, 'FM99,99,999')) else format('₹%s short', to_char(-v, 'FM99,99,999')) end,
    case when (e->>'room_charges')::numeric > 0 then format(' Room charges posted ₹%s.', to_char((e->>'room_charges')::numeric, 'FM99,99,999')) else '' end,
    case when p_note is not null and p_note <> '' then ' ' || p_note else '' end);
  insert into shift_closes(restaurant_id, business_date, opened_at, expected, counted_cash, float_cash, variance, note, summary, closed_by)
    values (rid, d, (e->>'since')::timestamptz, e, p_counted_cash, p_float, v, p_note, s, auth.uid()) returning * into sc;
  return jsonb_build_object('id', sc.id, 'variance', v, 'summary', s, 'expected', e);
end $$;
