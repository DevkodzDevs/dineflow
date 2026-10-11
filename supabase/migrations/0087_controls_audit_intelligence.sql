-- 0087 · Cash & controls, an audit trail, and the first DineFlow Intelligence figures
--
-- What the 2026-10-11 audit found:
--   · nothing recorded who voided a bill, cancelled an order or a line, changed a price, or gave a discount;
--   · any staff login could void an unpaid bill or cancel a whole order straight through the API, no reason asked;
--   · close_day summed each bill once per payment row, so a bill paid half cash / half UPI counted twice;
--   · there was no petty cash — a float top-up or a supplier paid from the drawer made the shift "short";
--   · no plate cost, margin or menu class existed anywhere, and exceptions were never flagged.
-- Everything here is additive. Writes stay behind security-definer RPCs that check the caller.

-- ── 1 · a reason and a name on every void and cancel ────────────────────────────────────────────
alter table bills       add column if not exists void_reason text, add column if not exists voided_by uuid, add column if not exists voided_at timestamptz;
alter table orders      add column if not exists cancel_reason text, add column if not exists cancelled_by uuid, add column if not exists cancelled_at timestamptz;
alter table order_items add column if not exists cancel_reason text, add column if not exists cancelled_by uuid, add column if not exists cancelled_at timestamptz;

-- ── 2 · the audit trail ───────────────────────────────────────────────────────────────────────
-- One row per thing a person did that money, stock, the menu, access or the property's settings
-- depend on. Written only by triggers (and so by every path: till, RPC, box, service role); read by
-- the owner, managers and supervisors of the property.
create table if not exists audit_events (
  id bigserial primary key,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid,                       -- auth.uid(); null when the server or a sync did it
  action text not null,             -- 'bill.void' · 'order.cancel' · 'line.cancel' · 'discount.give' · 'payment.take' · 'stock.adjust' …
  target_type text not null,
  target_id uuid,
  label text,                       -- the human handle: "Bill 214", "Order #88 · T4", "Paneer tikka"
  reason text,
  before jsonb,
  after jsonb,
  amount numeric(12,2)
);
create index if not exists audit_events_rid_at_idx on audit_events(restaurant_id, at desc);
create index if not exists audit_events_rid_action_idx on audit_events(restaurant_id, action, at desc);
alter table audit_events enable row level security;
drop policy if exists audit_events_read on audit_events;
create policy audit_events_read on audit_events for select to authenticated
  using (restaurant_id = auth_restaurant_id() and auth_role() in ('owner', 'manager', 'supervisor'));
-- no insert / update / delete policy: the API cannot write or erase the trail

create or replace function public.audit_log(p_rid uuid, p_action text, p_target_type text, p_target_id uuid, p_label text, p_reason text, p_before jsonb, p_after jsonb, p_amount numeric default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_events(restaurant_id, actor, action, target_type, target_id, label, reason, before, after, amount)
  values (p_rid, auth.uid(), p_action, p_target_type, p_target_id, left(p_label, 120), nullif(trim(coalesce(p_reason, '')), ''), p_before, p_after, p_amount);
$$;
revoke all on function public.audit_log(uuid, text, text, uuid, text, text, jsonb, jsonb, numeric) from public, anon, authenticated;

-- bills: a discount when the bill is raised; a void when it is voided
create or replace function public.audit_bills() returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  if tg_op = 'INSERT' then
    if new.discount_amount > 0 or new.discount_pct > 0 then
      select order_no into o from orders where id = new.order_id;
      perform audit_log(new.restaurant_id, 'discount.give', 'bill', new.id, format('Bill %s · order #%s', new.bill_no, o.order_no), null, null,
        jsonb_build_object('pct', new.discount_pct, 'amount', new.discount_amount, 'coupon', new.coupon_code, 'points', new.points_redeemed, 'subtotal', new.subtotal, 'total', new.total), new.discount_amount);
    end if;
    return new;
  end if;
  if new.status = 'void' and old.status is distinct from 'void' then
    perform audit_log(new.restaurant_id, 'bill.void', 'bill', new.id, format('Bill %s', new.bill_no), new.void_reason,
      jsonb_build_object('status', old.status, 'total', old.total), jsonb_build_object('status', 'void'), new.total);
  end if;
  return new;
end $$;
drop trigger if exists audit_bills on bills;
create trigger audit_bills after insert or update on bills for each row execute function public.audit_bills();

-- orders: cancelled (or merged away)
create or replace function public.audit_orders() returns trigger language plpgsql security definer set search_path = public as $$
declare v numeric; tname text;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select coalesce(sum(qty * price_snapshot), 0) into v from order_items where order_id = new.id;
    select name into tname from dining_tables where id = new.table_id;
    perform audit_log(new.restaurant_id, case when new.merged_into is not null then 'order.merge' else 'order.cancel' end, 'order', new.id,
      format('Order #%s%s', new.order_no, coalesce(' · ' || tname, '')), new.cancel_reason,
      jsonb_build_object('status', old.status), jsonb_build_object('status', 'cancelled', 'merged_into', new.merged_into), v);
  end if;
  return new;
end $$;
drop trigger if exists audit_orders on orders;
create trigger audit_orders after update on orders for each row execute function public.audit_orders();

-- a line cancelled on its own (a whole-order cancel logs once, for the order)
create or replace function public.audit_order_items() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and coalesce(current_setting('dineflow.audit_skip_lines', true), '') <> 'on' then
    perform audit_log(new.restaurant_id, 'line.cancel', 'order_item', new.id, format('%s × %s', new.qty, new.name_snapshot), new.cancel_reason,
      jsonb_build_object('status', old.status), jsonb_build_object('status', 'cancelled', 'order_id', new.order_id), new.qty * new.price_snapshot);
  end if;
  return new;
end $$;
drop trigger if exists audit_order_items on order_items;
create trigger audit_order_items after update on order_items for each row execute function public.audit_order_items();

-- every payment taken: who, how, how much
create or replace function public.audit_payments() returns trigger language plpgsql security definer set search_path = public as $$
declare bn int;
begin
  select bill_no into bn from bills where id = new.bill_id;
  perform audit_log(new.restaurant_id, 'payment.take', 'payment', new.id, format('Bill %s · %s', bn, new.method), null, null,
    jsonb_build_object('method', new.method, 'ref', new.ref, 'bill_id', new.bill_id), new.amount);
  return new;
end $$;
drop trigger if exists audit_payments on payments;
create trigger audit_payments after insert on payments for each row execute function public.audit_payments();

-- stock moved by hand: an adjustment, a count, a wastage line, an opening balance
create or replace function public.audit_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  if new.reason in ('adjustment', 'wastage', 'opening') then
    select name, unit, cost_per_unit into g from ingredients where id = new.ingredient_id;
    perform audit_log(new.restaurant_id, case new.reason when 'wastage' then 'stock.waste' when 'opening' then 'stock.opening' else 'stock.adjust' end, 'ingredient', new.ingredient_id,
      format('%s %s %s', trim(to_char(new.qty, 'FM9999990.###')), g.unit, g.name), coalesce(new.sub_reason, new.note), null,
      jsonb_build_object('qty', new.qty, 'unit', g.unit, 'ref_type', new.ref_type, 'note', new.note),
      round(abs(new.qty) * coalesce(new.unit_cost, g.cost_per_unit, 0), 2));
  end if;
  return new;
end $$;
drop trigger if exists audit_stock on stock_ledger;
create trigger audit_stock after insert on stock_ledger for each row execute function public.audit_stock();

-- the menu: a price changed, a dish sold out or taken off
create or replace function public.audit_menu() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price then
    perform audit_log(new.restaurant_id, 'menu.price', 'menu_item', new.id, new.name, null, jsonb_build_object('price', old.price), jsonb_build_object('price', new.price), new.price - old.price);
  end if;
  if new.is_available is distinct from old.is_available then
    perform audit_log(new.restaurant_id, 'menu.availability', 'menu_item', new.id, new.name, null, jsonb_build_object('is_available', old.is_available), jsonb_build_object('is_available', new.is_available), null);
  end if;
  if new.is_active is distinct from old.is_active then
    perform audit_log(new.restaurant_id, 'menu.active', 'menu_item', new.id, new.name, null, jsonb_build_object('is_active', old.is_active), jsonb_build_object('is_active', new.is_active), null);
  end if;
  return new;
end $$;
drop trigger if exists audit_menu on menu_items;
create trigger audit_menu after update on menu_items for each row execute function public.audit_menu();

-- staff: a role, a module set or an on/off switch changed
create or replace function public.audit_profiles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.allowed_modules is distinct from old.allowed_modules or new.is_active is distinct from old.is_active then
    perform audit_log(new.restaurant_id, 'staff.access', 'profile', new.id, new.full_name, null,
      jsonb_build_object('role', old.role, 'modules', old.allowed_modules, 'active', old.is_active),
      jsonb_build_object('role', new.role, 'modules', new.allowed_modules, 'active', new.is_active), null);
  end if;
  return new;
end $$;
drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles after update on profiles for each row execute function public.audit_profiles();

-- the property's settings: only the columns that changed, and only the ones that matter
create or replace function public.audit_restaurant() returns trigger language plpgsql security definer set search_path = public as $$
declare
  watched text[] := array['name','gstin','gst_rate','gst_scheme','gst_state_code','service_charge_pct','room_gst_rate','room_gst_rate_high','room_gst_threshold','facility_gst_rate',
    'upi_vpa','upi_payee','loyalty_enabled','loyalty_earn_pct','loyalty_point_value','loyalty_min_redeem','attendance_methods','attend_lat','attend_lng','attend_radius_m',
    'kds_stations','kds_warn_minutes','kds_target_minutes','promise_enabled','promise_minutes','promise_pct','prep_buffer_pct','check_in_time','check_out_time',
    'enabled_modules','membership','membership_plan','membership_ends_at','booking_slug','is_listed','hk_inspect_required'];
  o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); b jsonb := '{}'; a jsonb := '{}'; k text;
begin
  foreach k in array watched loop
    if (o ? k or n ? k) and (o -> k) is distinct from (n -> k) then
      b := b || jsonb_build_object(k, o -> k); a := a || jsonb_build_object(k, n -> k);
    end if;
  end loop;
  if a <> '{}'::jsonb then perform audit_log(new.id, 'settings.change', 'restaurant', new.id, new.name, null, b, a, null); end if;
  return new;
end $$;
drop trigger if exists audit_restaurant on restaurants;
create trigger audit_restaurant after update on restaurants for each row execute function public.audit_restaurant();

-- the money closes
create or replace function public.audit_closes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'shift_closes' then
    perform audit_log(new.restaurant_id, 'shift.close', 'shift_close', new.id, format('Shift · %s', to_char(new.business_date, 'DD Mon')), new.note, null,
      jsonb_build_object('expected_cash', coalesce((new.expected ->> 'cash_drawer')::numeric, (new.expected ->> 'cash')::numeric), 'counted', new.counted_cash, 'float', new.float_cash, 'variance', new.variance), new.variance);
  else
    perform audit_log(new.restaurant_id, 'day.close', 'day_close', new.id, format('Day · %s', to_char(new.business_date, 'DD Mon')), new.notes, null,
      jsonb_build_object('total_sales', new.total_sales, 'cash', new.cash, 'upi', new.upi, 'card', new.card, 'other', new.other, 'bills', new.orders_count), new.total_sales);
  end if;
  return new;
end $$;
drop trigger if exists audit_shift_closes on shift_closes;
create trigger audit_shift_closes after insert on shift_closes for each row execute function public.audit_closes();
drop trigger if exists audit_day_closes on day_closes;
create trigger audit_day_closes after insert or update on day_closes for each row execute function public.audit_closes();

-- purchase orders changing state
create or replace function public.audit_po() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform audit_log(new.restaurant_id, 'po.status', 'purchase_order', new.id, format('PO-%s', new.po_no), null, jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), new.total);
  end if;
  return new;
end $$;
drop trigger if exists audit_po on purchase_orders;
create trigger audit_po after update on purchase_orders for each row execute function public.audit_po();

-- ── 3 · petty cash: money in and out of the drawer that is not a sale ─────────────────────────
create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cash_movements_rid_at_idx on cash_movements(restaurant_id, created_at desc);
alter table cash_movements enable row level security;
drop policy if exists cash_movements_read on cash_movements;
create policy cash_movements_read on cash_movements for select to authenticated using (restaurant_id = auth_restaurant_id());
-- writes only through cash_move

create or replace function public.audit_cash() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform audit_log(new.restaurant_id, 'cash.' || new.kind, 'cash_movement', new.id, new.reason, new.note, null, jsonb_build_object('kind', new.kind, 'amount', new.amount), new.amount);
  return new;
end $$;
drop trigger if exists audit_cash on cash_movements;
create trigger audit_cash after insert on cash_movements for each row execute function public.audit_cash();

create or replace function public.cash_move(p_kind text, p_amount numeric, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); cid uuid;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'cashier') then raise exception 'your role cannot move cash in or out of the drawer' using errcode = '42501'; end if;
  if p_kind not in ('in', 'out') then raise exception 'kind must be in or out'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter an amount above zero'; end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'say what the cash was for'; end if;
  insert into cash_movements(restaurant_id, kind, amount, reason, note, created_by)
    values (rid, p_kind, round(p_amount, 2), trim(p_reason), nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into cid;
  return cid;
end $$;
revoke all on function public.cash_move(text, numeric, text, text) from public, anon;
grant execute on function public.cash_move(text, numeric, text, text) to authenticated;

-- shift_expected now says what the drawer should hold: cash sales + cash in − cash out (the float is added by the counter)
create or replace function shift_expected() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); since timestamptz; out jsonb;
begin
  declare day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '6 hours') at time zone 'Asia/Kolkata';
  begin
    if day_start > now() then day_start := day_start - interval '1 day'; end if;
    select max(closed_at) into since from shift_closes where restaurant_id = rid;
    if since is null or since < day_start then since := day_start; end if;
  end;
  with p as (
    select p.method, p.amount from payments p where p.restaurant_id = rid and p.created_at > since
  ), c as (
    select coalesce(sum(amount) filter (where kind = 'in'), 0) cin, coalesce(sum(amount) filter (where kind = 'out'), 0) cout
    from cash_movements where restaurant_id = rid and created_at > since
  )
  select jsonb_build_object(
    'since', since,
    'cash', coalesce((select sum(amount) from p where method = 'cash'), 0),
    'upi', coalesce((select sum(amount) from p where method = 'upi'), 0),
    'card', coalesce((select sum(amount) from p where method = 'card'), 0),
    'other', coalesce((select sum(amount) from p where method = 'other'), 0),
    'total', coalesce((select sum(amount) from p), 0),
    'cash_in', (select cin from c),
    'cash_out', (select cout from c),
    'cash_drawer', coalesce((select sum(amount) from p where method = 'cash'), 0) + (select cin from c) - (select cout from c),
    'bills', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > since),
    'unpaid', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'unpaid'),
    'open_orders', (select count(*) from orders o where o.restaurant_id = rid and o.status = 'open'),
    'room_charges', coalesce((select sum(bc.amount) from booking_charges bc where bc.restaurant_id = rid and bc.created_at > since), 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'qty', q)) from (select i.name_snapshot n, sum(i.qty) q from order_items i where i.restaurant_id = rid and i.created_at > since and i.status <> 'cancelled' group by 1 order by 2 desc limit 3) t), '[]'))
  into out;
  return out;
end $$;

-- shift_close: the variance is against the drawer figure, and the summary names cash in/out when there was any
create or replace function shift_close(p_counted_cash numeric, p_float numeric default 0, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); e jsonb; v numeric; r restaurants; s text; sc shift_closes; d date; drawer numeric;
begin
  if auth_role() not in ('owner', 'manager', 'supervisor', 'cashier') then raise exception 'your role cannot close a shift' using errcode = '42501'; end if;
  select * into r from restaurants where id = rid;
  e := shift_expected();
  drawer := coalesce((e->>'cash_drawer')::numeric, (e->>'cash')::numeric);
  v := p_counted_cash - p_float - drawer;
  d := (now() at time zone 'Asia/Kolkata')::date;
  s := format('%s · %s%s%s. Sales ₹%s from %s bills. Cash ₹%s, UPI ₹%s, card ₹%s.%s Counted ₹%s against ₹%s expected — %s.%s%s',
    r.name, to_char(now() at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'),
    case when (e->>'open_orders')::int > 0 then format(' · %s orders still open', e->>'open_orders') else '' end,
    case when (e->>'unpaid')::int > 0 then format(' · %s bills unpaid', e->>'unpaid') else '' end,
    to_char((e->>'total')::numeric, 'FM99,99,999'), e->>'bills',
    to_char((e->>'cash')::numeric, 'FM99,99,999'), to_char((e->>'upi')::numeric, 'FM99,99,999'), to_char((e->>'card')::numeric, 'FM99,99,999'),
    case when (e->>'cash_in')::numeric > 0 or (e->>'cash_out')::numeric > 0 then format(' Cash in ₹%s, out ₹%s.', to_char((e->>'cash_in')::numeric, 'FM99,99,999'), to_char((e->>'cash_out')::numeric, 'FM99,99,999')) else '' end,
    to_char(p_counted_cash - p_float, 'FM99,99,999'), to_char(drawer, 'FM99,99,999'),
    case when abs(v) < 1 then 'exact' when v > 0 then format('₹%s over', to_char(v, 'FM99,99,999')) else format('₹%s short', to_char(-v, 'FM99,99,999')) end,
    case when (e->>'room_charges')::numeric > 0 then format(' Room charges posted ₹%s.', to_char((e->>'room_charges')::numeric, 'FM99,99,999')) else '' end,
    case when p_note is not null and p_note <> '' then ' ' || p_note else '' end);
  insert into shift_closes(restaurant_id, business_date, opened_at, expected, counted_cash, float_cash, variance, note, summary, closed_by)
    values (rid, d, (e->>'since')::timestamptz, e, p_counted_cash, p_float, v, p_note, s, auth.uid()) returning * into sc;
  return jsonb_build_object('id', sc.id, 'variance', v, 'summary', s, 'expected', e);
end $$;

-- ── 4 · close_day counted a split-paid bill once per payment; now bills and payments are summed apart
create or replace function close_day(p_date date, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); did uuid;
begin
  if not has_module('billing') then raise exception 'you do not have the billing section'; end if;
  with b as (
    select id, total from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date = p_date
  ), p as (
    select method, sum(amount) amount from payments where bill_id in (select id from b) group by method
  )
  insert into day_closes(restaurant_id, business_date, orders_count, total_sales, cash, upi, card, other, notes, closed_by)
  values (rid, p_date, (select count(*) from b), (select coalesce(sum(total), 0) from b),
    coalesce((select amount from p where method = 'cash'), 0), coalesce((select amount from p where method = 'upi'), 0),
    coalesce((select amount from p where method = 'card'), 0), coalesce((select amount from p where method = 'other'), 0),
    p_notes, auth.uid())
  on conflict (restaurant_id, business_date) do update set
    orders_count = excluded.orders_count, total_sales = excluded.total_sales, cash = excluded.cash,
    upi = excluded.upi, card = excluded.card, other = excluded.other, notes = excluded.notes, closed_at = now()
  returning id into did;
  return did;
end $$;

-- ── 5 · voids and cancels: a role, a reason, a name — and no longer a direct write ─────────────
create or replace function public.void_bill(p_bill_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'cashier') then raise exception 'your role cannot void a bill — ask a manager' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'say why the bill is being voided'; end if;
  select * into b from bills where id = p_bill_id and restaurant_id = rid for update;
  if not found then raise exception 'bill not found'; end if;
  if b.status <> 'unpaid' then raise exception 'only an unpaid bill can be voided'; end if;
  update bills set status = 'void', void_reason = trim(p_reason), voided_by = auth.uid(), voided_at = now() where id = b.id;
  -- the order goes back to the floor, to be edited and billed again
  update orders set status = 'open' where id = b.order_id and status = 'billed';
end $$;
revoke all on function public.void_bill(uuid, text) from public, anon;
grant execute on function public.void_bill(uuid, text) to authenticated;

create or replace function public.cancel_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'supervisor_2', 'cashier') then raise exception 'your role cannot cancel a whole order — ask a manager' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'say why the order is being cancelled'; end if;
  select * into o from orders where id = p_order_id and restaurant_id = rid for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'open' then raise exception 'only an open order can be cancelled'; end if;
  if exists (select 1 from bills where order_id = o.id and status <> 'void') then raise exception 'a bill has been raised — void it first'; end if;
  -- one audit line for the order, not one per dish
  perform set_config('dineflow.audit_skip_lines', 'on', true);
  update order_items set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now()
    where order_id = o.id and status <> 'cancelled';
  update orders set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now() where id = o.id;
  perform set_config('dineflow.audit_skip_lines', 'off', true);
  if o.table_id is not null and not exists (select 1 from orders where table_id = o.table_id and status = 'open' and id <> o.id) then
    update dining_tables set status = 'free' where id = o.table_id;
  end if;
end $$;
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- a single dish: anyone on the floor while it is still pending; a manager even after the kitchen started
create or replace function public.cancel_line(p_item_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); i order_items; o orders;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'say why the dish is being cancelled'; end if;
  select * into i from order_items where id = p_item_id and restaurant_id = rid for update;
  if not found then raise exception 'line not found'; end if;
  if i.status = 'cancelled' then return; end if;
  select * into o from orders where id = i.order_id;
  if o.status <> 'open' then raise exception 'the order is already billed — void the bill first'; end if;
  if i.status = 'served' then raise exception 'a served dish cannot be cancelled'; end if;
  if i.status <> 'pending' and auth_role() not in ('owner', 'manager', 'supervisor', 'supervisor_2') then
    raise exception 'the kitchen has started this dish — a manager must cancel it' using errcode = '42501';
  end if;
  update order_items set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now() where id = i.id;
end $$;
revoke all on function public.cancel_line(uuid, text) from public, anon;
grant execute on function public.cancel_line(uuid, text) to authenticated;

-- the direct paths close: a bill changes only through the till's RPCs; an order or a line is cancelled only with a reason
create or replace function public.guard_bill_update() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  raise exception 'a bill can only be changed from the till' using errcode = '42501';
end $$;

create or replace function public.guard_cancel() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    raise exception 'cancel from the order screen, with a reason' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_order_cancel on orders;
create trigger guard_order_cancel before update on orders for each row execute function public.guard_cancel();
drop trigger if exists guard_line_cancel on order_items;
create trigger guard_line_cancel before update on order_items for each row execute function public.guard_cancel();

-- ── 6 · DineFlow Intelligence: plate cost, margin, menu class, exceptions, the day against the day before
-- Rule-based and traceable: every figure is a sum over rows the owner can open. Plate cost is the
-- recipe at today's ingredient price — the only price the pantry keeps — and says so.
create or replace function public.menu_engineering(p_days int default 28) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); out jsonb;
begin
  if auth_role() not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot see margins' using errcode = '42501'; end if;
  with since as (select now() - (greatest(1, least(365, p_days)) || ' days')::interval t),
  sold as (
    select i.menu_item_id, sum(i.qty)::int qty, sum(i.qty * i.price_snapshot) revenue
    from order_items i join orders o on o.id = i.order_id, since
    where i.restaurant_id = rid and i.status <> 'cancelled' and o.status <> 'cancelled' and i.created_at >= since.t and i.menu_item_id is not null
    group by 1),
  cost as (
    select r.menu_item_id, sum(r.qty * coalesce(g.cost_per_unit, 0)) plate_cost, count(*) filter (where coalesce(g.cost_per_unit, 0) = 0) unpriced
    from recipe_items r join ingredients g on g.id = r.ingredient_id where r.restaurant_id = rid group by 1),
  dish as (
    select m.id, m.name, c.name category, m.price, coalesce(s.qty, 0) qty, coalesce(s.revenue, 0) revenue,
      k.plate_cost, coalesce(k.unpriced, 0) unpriced, (k.menu_item_id is not null) has_recipe,
      case when k.menu_item_id is not null then m.price - k.plate_cost end margin
    from menu_items m left join categories c on c.id = m.category_id left join sold s on s.menu_item_id = m.id left join cost k on k.menu_item_id = m.id
    where m.restaurant_id = rid and m.is_active),
  stats as (
    select avg(qty) filter (where qty > 0) avg_qty, avg(margin) filter (where margin is not null and qty > 0) avg_margin,
      count(*) filter (where qty > 0) sold_items, count(*) filter (where has_recipe) with_recipe, count(*) total,
      coalesce(sum(revenue), 0) revenue, coalesce(sum(qty * plate_cost) filter (where plate_cost is not null), 0) cost_of_sold,
      coalesce(sum(revenue) filter (where plate_cost is not null), 0) revenue_costed
    from dish)
  select jsonb_build_object(
    'days', greatest(1, least(365, p_days)), 'avg_qty', round(coalesce(s.avg_qty, 0), 1), 'avg_margin', round(coalesce(s.avg_margin, 0), 2),
    'sold_items', s.sold_items, 'with_recipe', s.with_recipe, 'total_items', s.total, 'revenue', s.revenue,
    'food_cost_pct', case when s.revenue_costed > 0 then round(100 * s.cost_of_sold / s.revenue_costed, 1) end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'category', d.category, 'price', d.price, 'qty', d.qty, 'revenue', d.revenue,
        'plate_cost', round(d.plate_cost, 2), 'margin', round(d.margin, 2), 'margin_pct', case when d.price > 0 and d.margin is not null then round(100 * d.margin / d.price, 1) end,
        'unpriced', d.unpriced, 'class', case when d.qty = 0 then 'unsold' when d.margin is null then 'uncosted'
          when d.qty >= s.avg_qty and d.margin >= s.avg_margin then 'star' when d.qty >= s.avg_qty then 'plowhorse'
          when d.margin >= s.avg_margin then 'puzzle' else 'dog' end) order by d.revenue desc, d.name) from dish d), '[]'))
  into out from stats s;
  return out;
end $$;
revoke all on function public.menu_engineering(int) from public, anon;
grant execute on function public.menu_engineering(int) to authenticated;

create or replace function public.exceptions_summary(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); days int := greatest(1, least(90, p_days)); since timestamptz; bsince timestamptz; out jsonb;
begin
  if auth_role() not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot see this' using errcode = '42501'; end if;
  since := now() - (days || ' days')::interval;
  bsince := since - interval '28 days';   -- the four weeks before the window: the baseline
  with who as (select id, full_name from profiles where restaurant_id = rid),
  disc as (select b.id, b.bill_no, b.discount_amount, b.discount_pct, b.coupon_code, b.points_redeemed, b.total, b.created_at, b.created_by
           from bills b where b.restaurant_id = rid and b.status <> 'void' and b.created_at >= since and b.discount_amount > 0),
  disc_base as (select count(*) n from bills b where b.restaurant_id = rid and b.status <> 'void' and b.created_at >= bsince and b.created_at < since and b.discount_amount > 0),
  voids as (select b.id, b.bill_no, b.total, b.void_reason, coalesce(b.voided_at, b.created_at) happened, b.voided_by
            from bills b where b.restaurant_id = rid and b.status = 'void' and coalesce(b.voided_at, b.created_at) >= since),
  voids_base as (select count(*) n from bills b where b.restaurant_id = rid and b.status = 'void' and coalesce(b.voided_at, b.created_at) >= bsince and coalesce(b.voided_at, b.created_at) < since),
  lines as (select i.id, i.name_snapshot, i.qty, i.price_snapshot, i.cancel_reason, i.cancelled_by, coalesce(i.cancelled_at, i.created_at) happened, o.order_no, o.status order_status
            from order_items i join orders o on o.id = i.order_id where i.restaurant_id = rid and i.status = 'cancelled' and coalesce(i.cancelled_at, i.created_at) >= since),
  lines_base as (select count(*) n from order_items i where i.restaurant_id = rid and i.status = 'cancelled' and coalesce(i.cancelled_at, i.created_at) >= bsince and coalesce(i.cancelled_at, i.created_at) < since),
  ocancel as (select o.id, o.order_no, o.cancel_reason, o.cancelled_by, coalesce(o.cancelled_at, o.created_at) happened,
                (select coalesce(sum(qty * price_snapshot), 0) from order_items where order_id = o.id) value
              from orders o where o.restaurant_id = rid and o.status = 'cancelled' and o.merged_into is null and coalesce(o.cancelled_at, o.created_at) >= since),
  shifts as (select s.id, s.business_date, s.closed_at, s.variance, s.counted_cash, s.float_cash, s.note, s.closed_by,
                coalesce((s.expected ->> 'cash_drawer')::numeric, (s.expected ->> 'cash')::numeric) expected_cash
             from shift_closes s where s.restaurant_id = rid and s.closed_at >= since),
  cash as (select coalesce(sum(amount) filter (where kind = 'in'), 0) cin, coalesce(sum(amount) filter (where kind = 'out'), 0) cout, count(*) n
           from cash_movements c where c.restaurant_id = rid and c.created_at >= since),
  by_cashier as (select coalesce(p.full_name, 'Unknown') name, count(*) n, sum(d.discount_amount) amt from disc d left join who p on p.id = d.created_by group by 1 order by 3 desc limit 5)
  select jsonb_build_object(
    'days', days,
    'discounts', jsonb_build_object(
      'count', (select count(*) from disc), 'amount', (select coalesce(sum(discount_amount), 0) from disc),
      'per_day', round((select count(*) from disc)::numeric / days, 2), 'base_per_day', round((select n from disc_base)::numeric / 28, 2),
      'by_cashier', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n, 'amount', amt)) from by_cashier), '[]'),
      'top', coalesce((select jsonb_agg(jsonb_build_object('bill_no', d.bill_no, 'amount', d.discount_amount, 'pct', d.discount_pct, 'coupon', d.coupon_code, 'points', d.points_redeemed,
                'total', d.total, 'at', d.created_at, 'by', (select full_name from who where id = d.created_by)) order by d.discount_amount desc)
              from (select * from disc order by discount_amount desc limit 10) d), '[]')),
    'voids', jsonb_build_object(
      'count', (select count(*) from voids), 'amount', (select coalesce(sum(total), 0) from voids), 'base_per_day', round((select n from voids_base)::numeric / 28, 2),
      'list', coalesce((select jsonb_agg(jsonb_build_object('bill_no', v.bill_no, 'total', v.total, 'reason', v.void_reason, 'at', v.happened, 'by', (select full_name from who where id = v.voided_by)) order by v.happened desc)
              from (select * from voids order by happened desc limit 20) v), '[]')),
    'cancellations', jsonb_build_object(
      'lines', (select count(*) from lines), 'value', (select coalesce(sum(qty * price_snapshot), 0) from lines), 'orders', (select count(*) from ocancel),
      'base_lines_per_day', round((select n from lines_base)::numeric / 28, 2),
      'list', coalesce((select jsonb_agg(jsonb_build_object('order_no', l.order_no, 'name', l.name_snapshot, 'qty', l.qty, 'value', l.qty * l.price_snapshot, 'reason', l.cancel_reason, 'at', l.happened,
                'by', (select full_name from who where id = l.cancelled_by), 'whole_order', l.order_status = 'cancelled') order by l.happened desc)
              from (select * from lines order by happened desc limit 30) l), '[]'),
      'orders_list', coalesce((select jsonb_agg(jsonb_build_object('order_no', c.order_no, 'value', c.value, 'reason', c.cancel_reason, 'at', c.happened, 'by', (select full_name from who where id = c.cancelled_by)) order by c.happened desc)
              from (select * from ocancel order by happened desc limit 20) c), '[]')),
    'cash', jsonb_build_object(
      'in', (select cin from cash), 'out', (select cout from cash), 'moves', (select n from cash),
      'variance_total', (select coalesce(sum(variance), 0) from shifts), 'variance_abs', (select coalesce(sum(abs(variance)), 0) from shifts), 'shift_count', (select count(*) from shifts),
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('date', s.business_date, 'at', s.closed_at, 'expected', s.expected_cash, 'counted', s.counted_cash, 'float', s.float_cash,
                'variance', s.variance, 'note', s.note, 'by', (select full_name from who where id = s.closed_by)) order by s.closed_at desc) from shifts s), '[]')))
  into out;
  return out;
end $$;
revoke all on function public.exceptions_summary(int) from public, anon;
grant execute on function public.exceptions_summary(int) to authenticated;

-- today so far, yesterday, and the same weekday a week ago — IST days, from the rows themselves
create or replace function public.day_compare() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date; out jsonb;
begin
  if auth_role() not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot see this' using errcode = '42501'; end if;
  with days as (
    select 'today' k, (today::timestamp at time zone 'Asia/Kolkata') s, ((today + 1)::timestamp at time zone 'Asia/Kolkata') e
    union all select 'yesterday', ((today - 1)::timestamp at time zone 'Asia/Kolkata'), (today::timestamp at time zone 'Asia/Kolkata')
    union all select 'last_week', ((today - 7)::timestamp at time zone 'Asia/Kolkata'), ((today - 6)::timestamp at time zone 'Asia/Kolkata')),
  one as (
    select d.k,
      (select count(*) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at >= d.s and b.paid_at < d.e) bills,
      (select coalesce(sum(total), 0) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at >= d.s and b.paid_at < d.e) sales,
      (select coalesce(sum(discount_amount), 0) from bills b where b.restaurant_id = rid and b.status <> 'void' and b.created_at >= d.s and b.created_at < d.e) discounts,
      (select count(*) from bills b where b.restaurant_id = rid and b.status = 'void' and coalesce(b.voided_at, b.created_at) >= d.s and coalesce(b.voided_at, b.created_at) < d.e) voids,
      (select count(*) from order_items i where i.restaurant_id = rid and i.status = 'cancelled' and coalesce(i.cancelled_at, i.created_at) >= d.s and coalesce(i.cancelled_at, i.created_at) < d.e) cancelled_lines,
      (select coalesce(sum(abs(l.qty) * coalesce(l.unit_cost, g.cost_per_unit, 0)), 0) from stock_ledger l join ingredients g on g.id = l.ingredient_id
         where l.restaurant_id = rid and l.reason = 'wastage' and l.created_at >= d.s and l.created_at < d.e) waste_value,
      (select count(*) from orders o where o.restaurant_id = rid and o.status <> 'cancelled' and o.created_at >= d.s and o.created_at < d.e) orders
    from days d)
  select jsonb_object_agg(k, jsonb_build_object('bills', bills, 'sales', sales, 'avg_bill', case when bills > 0 then round(sales / bills, 0) else 0 end,
      'discounts', discounts, 'voids', voids, 'cancelled_lines', cancelled_lines, 'waste_value', round(waste_value, 2), 'orders', orders))
    || jsonb_build_object(
      'today_date', today,
      'low_stock', (select count(*) from ingredients g where g.restaurant_id = rid and g.is_active and g.current_stock <= g.reorder_level),
      'open_orders', (select count(*) from orders o where o.restaurant_id = rid and o.status = 'open'),
      'unpaid_bills', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'unpaid'),
      'last_shift', (select jsonb_build_object('date', s.business_date, 'variance', s.variance, 'at', s.closed_at) from shift_closes s where s.restaurant_id = rid order by s.closed_at desc limit 1))
  into out from one;
  return out;
end $$;
revoke all on function public.day_compare() from public, anon;
grant execute on function public.day_compare() to authenticated;
