-- 0077 · Two people at once.
--
-- Every one of these functions looked before it leapt — "is there a bill already?", "has this been
-- accepted?", "does the guest hold enough points?" — and then acted on what it saw. Between the
-- looking and the leaping, nothing stopped somebody else doing the same thing, and on a Saturday
-- night somebody else always is. Tested with two connections racing each other:
--
--   · two cashiers billing one table         → two bills for the same food
--   · two people accepting one online order  → the kitchen cooks it twice
--   · one guest's points spent at two tills  → 120 points spent from a balance of 100
--
-- The fix is the same everywhere: take the row for update before deciding, so the second caller
-- waits, then sees what the first one did and stops. Where a guarantee can be written down instead
-- of relied upon — one live bill per order — it is written down as an index, because a lock is only
-- as good as the next person to remember it.
--
-- No property had hit any of these yet: at the time of writing, nought orders with two live bills,
-- nought online orders cooked twice, nought balances adrift from their ledger.

-- ───────── a guarantee that does not depend on anyone remembering ─────────
create unique index if not exists bills_one_live_per_order_idx on bills(order_id) where status <> 'void';
-- (the offline queue's replay key has had the same protection since 0004, as orders_client_idx —
--  unique on (restaurant_id, client_id) where client_id is not null. Nothing to add there.)

-- ───────── the bill ─────────
create or replace function generate_bill(
  p_order_id uuid,
  p_discount_pct numeric default 0,
  p_discount_amount numeric default 0,
  p_promise_kept boolean default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_redeem_points numeric default 0,
  p_coupon text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype; c customers%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; half numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
  fee numeric := 0; waived numeric := 0; kept boolean := null;
  cid uuid := null; cp jsonb := null; pct numeric := coalesce(p_discount_pct, 0); amt numeric := coalesce(p_discount_amount, 0);
  redeem numeric := 0; redeem_amt numeric := 0; other numeric;
begin
  select * into r from restaurants where id = rid;
  -- the order is taken for update first: a second cashier reaching the same table waits here, and
  -- then finds the bill this one is about to raise
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open' for update;
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;

  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';

  if norm_phone(p_customer_phone) is not null then cid := customer_upsert(p_customer_phone, coalesce(p_customer_name, o.customer_name));
  elsif norm_phone(o.customer_phone) is not null then cid := customer_upsert(o.customer_phone, o.customer_name);
  else cid := o.customer_id; end if;
  if cid is not null then
    update orders set customer_id = cid, customer_phone = coalesce(customer_phone, p_customer_phone), customer_name = coalesce(customer_name, p_customer_name) where id = o.id;
  end if;

  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    cp := coupon_check(p_coupon, sub);
    pct := pct + (cp->>'pct')::numeric; amt := amt + (cp->>'amount')::numeric;
  end if;
  other := least(sub, round(sub * pct/100, 2) + amt);

  if coalesce(p_redeem_points, 0) > 0 then
    if not r.loyalty_enabled then raise exception 'loyalty points are not switched on'; end if;
    if cid is null then raise exception 'a phone number is needed to redeem points'; end if;
    -- and the guest's balance for update, so the same points cannot be spent at two tills
    select * into c from customers where id = cid for update;
    if p_redeem_points > c.points then raise exception 'only % points available', c.points; end if;
    if p_redeem_points < r.loyalty_min_redeem then raise exception 'at least % points must be redeemed at a time', r.loyalty_min_redeem; end if;
    redeem_amt := least(sub - other, round(p_redeem_points * r.loyalty_point_value, 2));
    redeem := round(redeem_amt / r.loyalty_point_value, 2);
  end if;

  disc := least(sub, other + redeem_amt);
  taxable := sub - disc;

  if o.promised_at is not null then
    kept := coalesce(p_promise_kept, case when o.served_at is not null then o.served_at <= o.promised_at else true end);
    if kept then fee := round(taxable * coalesce(o.promise_pct, 0) / 100, 2);
    else waived := taxable; taxable := 0; end if;
  end if;

  sc := round(taxable * r.service_charge_pct/100, 2);
  half := case when gst_collectable(r.gst_scheme, r.gstin) then r.gst_rate/2 else 0 end;
  cg := round((taxable + sc + fee) * half/100, 2);
  sg := cg;
  raw := taxable + sc + fee + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount,
                    service_charge, cgst, sgst, round_off, total,
                    promise_fee, promise_waived, promise_kept, created_by,
                    customer_id, points_redeemed, offer_id, coupon_code)
    values (rid, p_order_id, next_number('bill'), sub, pct, disc,
            sc, cg, sg, tot - raw, tot,
            fee, waived, kept, auth.uid(),
            cid, redeem, nullif(cp->>'id', '')::uuid, cp->>'code')
    returning id into bid;
  if redeem > 0 then
    update customers set points = points - redeem where id = cid;
    insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (rid, cid, bid, -redeem, 'redeem', 'Redeemed on bill', auth.uid());
  end if;
  return bid;
exception
  -- the index caught what the lock is there to prevent; say the same thing either way
  when unique_violation then
    if sqlerrm like '%bills_one_live_per_order%' then raise exception 'bill already exists'; else raise; end if;
end $$;
grant execute on function generate_bill(uuid, numeric, numeric, boolean, text, text, numeric, text) to authenticated;

-- ───────── settling it ─────────
create or replace function settle_bill(p_bill_id uuid, p_payments jsonb, p_client_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; r restaurants%rowtype; p jsonb; paid numeric := 0; earned numeric := 0;
begin
  -- for update: two tills taking the same payment must not count the visit twice
  select * into b from bills where id = p_bill_id and restaurant_id = rid for update;
  if not found then raise exception 'bill not found'; end if;
  if b.status = 'paid' then return; end if;                -- replay-safe
  for p in select * from jsonb_array_elements(p_payments) loop
    insert into payments(restaurant_id, bill_id, method, amount, ref, client_id)
      values (rid, b.id, (p->>'method')::payment_method, (p->>'amount')::numeric, p->>'ref', nullif(p->>'client_id','')::uuid)
      on conflict do nothing;
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < b.total then raise exception 'short by %', b.total - paid; end if;
  if b.customer_id is not null then
    select * into r from restaurants where id = rid;
    if r.loyalty_enabled then earned := round(greatest(0, b.subtotal - b.discount_amount) * r.loyalty_earn_pct / 100, 2); end if;
    update customers set visits = visits + 1, total_spend = total_spend + b.total, last_visit_at = now(), points = points + earned where id = b.customer_id;
    if earned > 0 then
      insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (rid, b.customer_id, b.id, earned, 'earn', 'Earned on bill', auth.uid());
    end if;
  end if;
  update bills set status = 'paid', paid_at = now(), points_earned = earned where id = b.id;
  update orders set status = 'billed' where id = b.order_id;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = b.order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $$;
grant execute on function settle_bill(uuid, jsonb, uuid) to authenticated;

-- ───────── points given or taken by hand ─────────
-- It used to clamp a negative balance to zero, which quietly let more points be spent than were
-- held and left the balance disagreeing with its own ledger. It now refuses instead.
create or replace function loyalty_adjust(p_customer_id uuid, p_points numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c customers%rowtype; bal numeric;
begin
  if not has_module('customers') then raise exception 'you do not have the customers section'; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'say how many points'; end if;
  select * into c from customers where id = p_customer_id and restaurant_id = rid for update;
  if not found then raise exception 'customer not found'; end if;
  if c.points + p_points < 0 then raise exception 'only % points available', c.points; end if;
  update customers set points = points + p_points where id = c.id returning points into bal;
  insert into loyalty_ledger(restaurant_id, customer_id, points, kind, note, created_by) values (rid, c.id, p_points, 'adjust', p_note, auth.uid());
  return bal;
end $$;
grant execute on function loyalty_adjust(uuid, numeric, text) to authenticated;

-- ───────── accepting an online order ─────────
create or replace function accept_online_order_for(p_id uuid, p_rid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  -- for update: the second person to press Accept waits, then finds it already accepted
  select * into o from online_orders where id = p_id and restaurant_id = p_rid for update;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by)
    values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type else 'delivery'::order_type end, o.table_id, 'open',
            o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (p_rid, oid, next_number('kot', p_rid), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    select * into mi from menu_items where restaurant_id = p_rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, mi.id, coalesce(nullif(it->>'name', ''), mi.name), coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    end if;
  end loop;
  if o.table_id is not null then update dining_tables set status = 'occupied' where id = o.table_id; end if;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $$;

-- ───────── moving, merging and splitting a table ─────────
create or replace function move_order(p_order_id uuid, p_table_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders%rowtype; t dining_tables%rowtype;
begin
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open' for update;
  if not found then raise exception 'order not open'; end if;
  select * into t from dining_tables where id = p_table_id and restaurant_id = rid;
  if not found then raise exception 'table not found'; end if;
  if o.table_id = t.id then return; end if;
  update orders set table_id = t.id, type = 'dine_in' where id = o.id;
  update dining_tables set status = 'occupied' where id = t.id;
  if o.table_id is not null then
    update dining_tables x set status = 'free' where x.id = o.table_id and x.status = 'occupied'
      and not exists (select 1 from orders where table_id = x.id and status = 'open');
  end if;
end $$;
grant execute on function move_order(uuid, uuid) to authenticated;

create or replace function merge_orders(p_from uuid, p_into uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); f orders%rowtype; t orders%rowtype;
begin
  if p_from = p_into then raise exception 'that is the same order'; end if;
  -- both rows, always in the same order by id: two waiters merging the same pair from opposite
  -- ends would otherwise each hold what the other is waiting for
  perform 1 from orders where id in (p_from, p_into) and restaurant_id = rid order by id for update;
  select * into f from orders where id = p_from and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  select * into t from orders where id = p_into and restaurant_id = rid and status = 'open';
  if not found then raise exception 'the other order is not open'; end if;
  if exists (select 1 from bills where order_id in (p_from, p_into) and status <> 'void') then raise exception 'a bill has already been raised — void it first'; end if;
  update order_items set order_id = t.id where order_id = f.id;
  update kots set order_id = t.id where order_id = f.id;
  update orders set status = 'cancelled', merged_into = t.id, notes = concat_ws(' · ', notes, 'merged into #' || t.order_no) where id = f.id;
  update orders set customer_name = coalesce(customer_name, f.customer_name), customer_phone = coalesce(customer_phone, f.customer_phone) where id = t.id;
  if f.table_id is not null and f.table_id is distinct from t.table_id then
    update dining_tables x set status = 'free' where x.id = f.table_id and x.status = 'occupied'
      and not exists (select 1 from orders where table_id = x.id and status = 'open');
  end if;
  return t.id;
end $$;
grant execute on function merge_orders(uuid, uuid) to authenticated;

create or replace function split_order(p_order_id uuid, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders%rowtype; nid uuid; l jsonb; oi order_items%rowtype; q int; moved int := 0;
begin
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open' for update;
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = o.id and status <> 'void') then raise exception 'a bill has already been raised — void it first'; end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes, created_by, booking_id, channel_id, split_from,
                     promise_minutes, promise_pct, promised_at, served_at)
    values (rid, next_number('order'), o.table_id, o.type, 'open', o.customer_name, o.customer_phone, o.notes, auth.uid(), o.booking_id, o.channel_id, o.id,
            o.promise_minutes, o.promise_pct, o.promised_at, o.served_at)
    returning id into nid;
  perform set_config('dineflow.skip_consume', 'on', true);
  for l in select * from jsonb_array_elements(p_lines) loop
    -- the line too: two people splitting the same ticket must not both move the same one
    select * into oi from order_items where id = nullif(l->>'id', '')::uuid and order_id = o.id and status <> 'cancelled' for update;
    if not found then continue; end if;
    q := coalesce(nullif(l->>'qty', '')::int, oi.qty);
    if q <= 0 then continue; end if;
    if q >= oi.qty then
      update order_items set order_id = nid where id = oi.id;
    else
      update order_items set qty = oi.qty - q where id = oi.id;
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, created_at,
                              variant_id, variant_name, addons, components, course)
        values (rid, nid, oi.kot_id, oi.menu_item_id, oi.name_snapshot, oi.price_snapshot, q, oi.notes, oi.status, oi.created_at,
                oi.variant_id, oi.variant_name, oi.addons, oi.components, oi.course);
    end if;
    moved := moved + 1;
  end loop;
  perform set_config('dineflow.skip_consume', 'off', true);
  if moved = 0 then raise exception 'choose at least one line'; end if;
  if not exists (select 1 from order_items where order_id = o.id and status <> 'cancelled') then raise exception 'that would move everything — leave at least one line on this bill'; end if;
  return nid;
end $$;
grant execute on function split_order(uuid, jsonb) to authenticated;

-- ───────── receiving goods ─────────
create or replace function po_receive(p_id uuid, p_lines jsonb, p_invoice_no text default null, p_purchased_at date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); po purchase_orders%rowtype; sup suppliers%rowtype; l jsonb; it purchase_order_items%rowtype;
        pur uuid; tot numeric := 0; got numeric; cost numeric; n int := 0;
begin
  if not has_module('inventory') then raise exception 'you do not have the pantry section'; end if;
  -- for update: two people at the back door must not land the same delivery twice
  select * into po from purchase_orders where id = p_id and restaurant_id = rid for update;
  if not found then raise exception 'order not found'; end if;
  if po.status = 'received' then raise exception 'that order has already been received'; end if;
  if po.status = 'cancelled' then raise exception 'that order was cancelled'; end if;
  if po.supplier_id is not null then select * into sup from suppliers where id = po.supplier_id; end if;
  insert into purchases(restaurant_id, supplier, supplier_id, invoice_no, total, purchased_at, created_by, po_id)
    values (rid, sup.name, po.supplier_id, nullif(trim(p_invoice_no), ''), 0, coalesce(p_purchased_at, current_date), auth.uid(), po.id)
    returning id into pur;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into it from purchase_order_items where id = nullif(l->>'id', '')::uuid and po_id = po.id;
    if not found then continue; end if;
    got := coalesce((l->>'received_qty')::numeric, it.qty);
    cost := coalesce((l->>'unit_cost')::numeric, it.unit_cost);
    update purchase_order_items set received_qty = greatest(0, got), unit_cost = cost where id = it.id;
    if got > 0 then
      insert into purchase_items(restaurant_id, purchase_id, ingredient_id, qty, unit_cost) values (rid, pur, it.ingredient_id, got, cost);
      tot := tot + got * cost; n := n + 1;
    end if;
  end loop;
  update purchase_order_items set received_qty = 0 where po_id = po.id and received_qty is null;
  if n = 0 then raise exception 'nothing was received — cancel the order instead'; end if;
  update purchases set total = round(tot, 2) where id = pur;
  update purchase_orders set status = 'received', received_at = now(), purchase_id = pur where id = po.id;
  return pur;
end $$;
grant execute on function po_receive(uuid, jsonb, text, date) to authenticated;

create or replace function po_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); st text;
begin
  if not has_module('inventory') then raise exception 'you do not have the pantry section'; end if;
  if p_status not in ('draft', 'sent', 'cancelled') then raise exception 'not a status an order can be set to'; end if;
  select status into st from purchase_orders where id = p_id and restaurant_id = rid for update;
  if st is null then raise exception 'order not found'; end if;
  if st = 'received' then raise exception 'a received order cannot be changed'; end if;
  update purchase_orders set status = p_status, sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end where id = p_id;
end $$;
grant execute on function po_set_status(uuid, text) to authenticated;
