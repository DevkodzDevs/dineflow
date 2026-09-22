-- 0073 · Purchasing: suppliers, purchase orders and goods received. Wastage by reason.
--
-- The pantry could record a supplier bill after the fact; it could not ask for anything. Now:
--
--   suppliers · a name, a phone, a GSTIN — the people the property buys from, so a purchase says
--               who it came from and a price history can say what each of them charged.
--   orders    · a purchase order: what to bring, at what price, by when. Drafted (from a low-stock
--               list in one press), sent (on WhatsApp, with the lines typed out), and received.
--   received  · receiving an order is the goods-received note: what actually arrived, at the price
--               on the invoice. It becomes the purchase the pantry already understands, so stock
--               lands and costs update exactly as they did before — nothing about a purchase changes.
--   wastage   · a reason on every wastage line — spoilage, expiry, prep, spillage — and a summary
--               by reason and by ingredient, priced at what it cost.

-- ───────── suppliers ─────────
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  phone text, email text, gstin text, address text, notes text,
  lead_days integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_idx on suppliers(restaurant_id, lower(name));
alter table suppliers enable row level security;
drop policy if exists tenant_all on suppliers;
create policy tenant_all on suppliers for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on suppliers;
create trigger trg_set_rid before insert on suppliers for each row execute function set_restaurant_id();

alter table purchases add column if not exists supplier_id uuid references suppliers(id) on delete set null;
alter table purchases add column if not exists po_id uuid;

-- ───────── purchase orders ─────────
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  po_no integer not null,
  supplier_id uuid references suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  expected_on date,
  notes text,
  total numeric(12,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz, received_at timestamptz,
  purchase_id uuid references purchases(id) on delete set null,   -- the goods-received note, once received
  unique (restaurant_id, po_no)
);
alter table purchase_orders enable row level security;
drop policy if exists tenant_all on purchase_orders;
create policy tenant_all on purchase_orders for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on purchase_orders;
create trigger trg_set_rid before insert on purchase_orders for each row execute function set_restaurant_id();
do $$ begin
  alter table purchases add constraint purchases_po_id_fkey foreign key (po_id) references purchase_orders(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  po_id uuid not null references purchase_orders(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  received_qty numeric(12,3)
);
create index if not exists purchase_order_items_po_idx on purchase_order_items(restaurant_id, po_id);
alter table purchase_order_items enable row level security;
drop policy if exists tenant_all on purchase_order_items;
create policy tenant_all on purchase_order_items for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on purchase_order_items;
create trigger trg_set_rid before insert on purchase_order_items for each row execute function set_restaurant_id();

-- ───────── wastage by reason ─────────
alter table stock_ledger add column if not exists sub_reason text;   -- spoilage · expiry · prep waste · spillage · breakage · returned by guest · theft · other
create index if not exists ledger_wastage_idx on stock_ledger(restaurant_id, created_at desc) where reason = 'wastage';

-- ───────── the order ─────────
/** Create a draft, or rewrite one that has not been received. p_lines: [{ingredient_id, qty, unit_cost}]. */
create or replace function po_save(p_id uuid, p_supplier_id uuid, p_expected_on date, p_notes text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); pid uuid := p_id; l jsonb; tot numeric := 0; st text;
begin
  if not has_module('inventory') then raise exception 'you do not have the pantry section'; end if;
  if p_supplier_id is not null and not exists (select 1 from suppliers where id = p_supplier_id and restaurant_id = rid) then raise exception 'supplier not found'; end if;
  if pid is null then
    insert into purchase_orders(restaurant_id, po_no, supplier_id, expected_on, notes, created_by)
      values (rid, next_number('po'), p_supplier_id, p_expected_on, nullif(trim(p_notes), ''), auth.uid()) returning id into pid;
  else
    select status into st from purchase_orders where id = pid and restaurant_id = rid;
    if st is null then raise exception 'order not found'; end if;
    if st not in ('draft', 'sent') then raise exception 'an order that is % can no longer be edited', st; end if;
    update purchase_orders set supplier_id = p_supplier_id, expected_on = p_expected_on, notes = nullif(trim(p_notes), '') where id = pid;
    delete from purchase_order_items where po_id = pid;
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if nullif(l->>'ingredient_id', '') is null or coalesce((l->>'qty')::numeric, 0) <= 0 then continue; end if;
    if not exists (select 1 from ingredients where id = (l->>'ingredient_id')::uuid and restaurant_id = rid) then raise exception 'ingredient not found'; end if;
    insert into purchase_order_items(restaurant_id, po_id, ingredient_id, qty, unit_cost)
      values (rid, pid, (l->>'ingredient_id')::uuid, (l->>'qty')::numeric, coalesce((l->>'unit_cost')::numeric, 0));
    tot := tot + (l->>'qty')::numeric * coalesce((l->>'unit_cost')::numeric, 0);
  end loop;
  update purchase_orders set total = round(tot, 2) where id = pid;
  return pid;
end $$;
grant execute on function po_save(uuid, uuid, date, text, jsonb) to authenticated;

/** draft → sent, sent → draft, or cancelled. Receiving is its own function. */
create or replace function po_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); st text;
begin
  if not has_module('inventory') then raise exception 'you do not have the pantry section'; end if;
  if p_status not in ('draft', 'sent', 'cancelled') then raise exception 'not a status an order can be set to'; end if;
  select status into st from purchase_orders where id = p_id and restaurant_id = rid;
  if st is null then raise exception 'order not found'; end if;
  if st = 'received' then raise exception 'a received order cannot be changed'; end if;
  update purchase_orders set status = p_status, sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end where id = p_id;
end $$;
grant execute on function po_set_status(uuid, text) to authenticated;

/**
 * Goods received. p_lines: [{id, received_qty, unit_cost}] — one per order line; a line left out or
 * at 0 did not arrive. What arrived becomes a purchase with its items, so the pantry trigger lands
 * the stock and updates the cost as it always has. Returns the purchase.
 */
create or replace function po_receive(p_id uuid, p_lines jsonb, p_invoice_no text default null, p_purchased_at date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); po purchase_orders%rowtype; sup suppliers%rowtype; l jsonb; it purchase_order_items%rowtype;
        pur uuid; tot numeric := 0; got numeric; cost numeric; n int := 0;
begin
  if not has_module('inventory') then raise exception 'you do not have the pantry section'; end if;
  select * into po from purchase_orders where id = p_id and restaurant_id = rid;
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
  -- lines the note did not mention did not arrive
  update purchase_order_items set received_qty = 0 where po_id = po.id and received_qty is null;
  if n = 0 then raise exception 'nothing was received — cancel the order instead'; end if;
  update purchases set total = round(tot, 2) where id = pur;
  update purchase_orders set status = 'received', received_at = now(), purchase_id = pur where id = po.id;
  return pur;
end $$;
grant execute on function po_receive(uuid, jsonb, text, date) to authenticated;

/** What is below its reorder level, with the last supplier and price for each: a draft order in one press. */
create or replace function po_suggest() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', i.id, 'name', i.name, 'unit', i.unit, 'stock', i.current_stock, 'reorder_level', i.reorder_level,
    -- bring it up to twice the reorder level, and never ask for a sliver
    'qty', greatest(round(i.reorder_level * 2 - i.current_stock, 3), case when i.unit = 'pcs' then 1 else 0.5 end),
    'unit_cost', coalesce(lp.unit_cost, i.cost_per_unit),
    'supplier_id', lp.supplier_id, 'supplier', coalesce(s.name, lp.supplier)
  ) order by i.name), '[]'::jsonb)
  from ingredients i
  left join lateral (
    select pi.unit_cost, p.supplier_id, p.supplier from purchase_items pi join purchases p on p.id = pi.purchase_id
    where pi.ingredient_id = i.id order by p.purchased_at desc, p.created_at desc limit 1
  ) lp on true
  left join suppliers s on s.id = lp.supplier_id
  where i.restaurant_id = auth_restaurant_id() and i.is_active and i.current_stock <= i.reorder_level
$$;
grant execute on function po_suggest() to authenticated;

/** What an ingredient has cost, purchase by purchase, newest first — and the latest price from each supplier. */
create or replace function ingredient_prices(p_ingredient_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with h as (
    select p.purchased_at, coalesce(s.name, p.supplier) as supplier, p.supplier_id, pi.qty, pi.unit_cost, p.invoice_no
    from purchase_items pi join purchases p on p.id = pi.purchase_id left join suppliers s on s.id = p.supplier_id
    where pi.ingredient_id = p_ingredient_id and pi.restaurant_id = auth_restaurant_id() and pi.unit_cost > 0
    order by p.purchased_at desc, p.created_at desc limit 12
  )
  select jsonb_build_object(
    'history', coalesce((select jsonb_agg(jsonb_build_object('on', purchased_at, 'supplier', supplier, 'qty', qty, 'unit_cost', unit_cost, 'invoice', invoice_no)) from h), '[]'::jsonb),
    'by_supplier', coalesce((select jsonb_agg(jsonb_build_object('supplier', supplier, 'unit_cost', unit_cost, 'on', purchased_at))
                             from (select distinct on (coalesce(supplier, '')) supplier, unit_cost, purchased_at from h order by coalesce(supplier, ''), purchased_at desc) x), '[]'::jsonb),
    'low', (select min(unit_cost) from h), 'high', (select max(unit_cost) from h), 'last', (select unit_cost from h limit 1)
  )
$$;
grant execute on function ingredient_prices(uuid) to authenticated;

/** Wastage in a window, by reason and by ingredient, at what it cost. */
create or replace function wastage_summary(p_days integer default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with w as (
    select l.sub_reason, l.qty, i.name, i.unit, abs(l.qty) * coalesce(nullif(l.unit_cost, 0), i.cost_per_unit) as cost, l.created_at, l.note
    from stock_ledger l join ingredients i on i.id = l.ingredient_id
    where l.restaurant_id = auth_restaurant_id() and l.reason = 'wastage' and l.created_at >= now() - make_interval(days => greatest(1, p_days))
  )
  select jsonb_build_object(
    'days', greatest(1, p_days),
    'total_cost', coalesce((select sum(cost) from w), 0),
    'lines', (select count(*) from w),
    'by_reason', coalesce((select jsonb_agg(jsonb_build_object('reason', reason, 'cost', cost, 'lines', n) order by cost desc)
                           from (select coalesce(sub_reason, 'unspecified') as reason, sum(cost) as cost, count(*) as n from w group by 1) r), '[]'::jsonb),
    'by_ingredient', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'qty', qty, 'cost', cost) order by cost desc)
                               from (select name, unit, sum(abs(qty)) as qty, sum(cost) as cost from w group by name, unit order by sum(cost) desc limit 10) g), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'qty', abs(qty), 'reason', coalesce(sub_reason, 'unspecified'), 'note', note, 'cost', cost, 'at', created_at) order by created_at desc)
                        from (select * from w order by created_at desc limit 20) r), '[]'::jsonb)
  )
$$;
grant execute on function wastage_summary(integer) to authenticated;
