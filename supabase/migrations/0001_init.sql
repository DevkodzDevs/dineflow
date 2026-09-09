-- DineFlow v1.0 — run once in Supabase SQL editor (or `supabase db push`).
-- Creates all tables, tenant isolation (RLS), numbering, stock auto-deduction, realtime.

create extension if not exists "pgcrypto";

-- ───────── enums ─────────
do $$ begin
  create type user_role as enum ('owner','manager','cashier','waiter','chef','store');
  create type order_type as enum ('dine_in','takeaway','delivery');
  create type order_status as enum ('open','billed','cancelled');
  create type item_status as enum ('pending','preparing','ready','served','cancelled');
  create type kot_status as enum ('pending','preparing','ready','served');
  create type table_status as enum ('free','occupied','reserved');
  create type stock_unit as enum ('kg','g','l','ml','pcs');
  create type ledger_reason as enum ('opening','purchase','sale','wastage','adjustment');
  create type payment_method as enum ('cash','upi','card','other');
  create type bill_status as enum ('unpaid','paid','void');
exception when duplicate_object then null; end $$;

-- ───────── tables ─────────
create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  gstin text, address text, phone text,
  gst_rate numeric(5,2) not null default 5,
  service_charge_pct numeric(5,2) not null default 0,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  full_name text not null,
  email text,
  role user_role not null default 'waiter',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists profiles_restaurant_idx on profiles(restaurant_id);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  code text not null unique,
  role user_role not null,
  used_by uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists counters (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null,
  value integer not null default 0,
  primary key (restaurant_id, kind)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  unit stock_unit not null default 'kg',
  current_stock numeric(12,3) not null default 0,
  reorder_level numeric(12,3) not null default 0,
  cost_per_unit numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ingredients_restaurant_idx on ingredients(restaurant_id);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  is_veg boolean not null default true,
  is_available boolean not null default true,      -- sold out for today
  is_active boolean not null default true,         -- on the menu at all
  prep_minutes integer not null default 15,
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on menu_items(restaurant_id);

create table if not exists recipe_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty numeric(12,3) not null default 0,
  unique (menu_item_id, ingredient_id)
);

create table if not exists stock_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty numeric(12,3) not null,
  reason ledger_reason not null,
  ref_type text, ref_id uuid, note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ledger_ing_idx on stock_ledger(ingredient_id, created_at);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  supplier text, invoice_no text,
  total numeric(12,2) not null default 0,
  purchased_at date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  purchase_id uuid not null references purchases(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  qty numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null default 0
);

create table if not exists dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  capacity integer not null default 4,
  zone text not null default 'Main',
  status table_status not null default 'free',
  sort_order integer not null default 0
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_no integer not null,
  type order_type not null default 'dine_in',
  table_id uuid references dining_tables(id) on delete set null,
  customer_name text, customer_phone text,
  status order_status not null default 'open',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists orders_restaurant_status_idx on orders(restaurant_id, status, created_at);

create table if not exists kots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  kot_no integer not null,
  status kot_status not null default 'pending',
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index if not exists kots_restaurant_status_idx on kots(restaurant_id, status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  kot_id uuid references kots(id) on delete set null,
  menu_item_id uuid references menu_items(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(12,2) not null default 0,
  qty integer not null default 1,
  status item_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items(order_id);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id),
  bill_no integer not null,
  subtotal numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  service_charge numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  round_off numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status bill_status not null default 'unpaid',
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists bills_restaurant_created_idx on bills(restaurant_id, created_at);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  method payment_method not null,
  amount numeric(12,2) not null default 0,
  ref text,
  created_at timestamptz not null default now()
);

create table if not exists day_closes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  business_date date not null,
  orders_count integer not null default 0,
  total_sales numeric(12,2) not null default 0,
  cash numeric(12,2) not null default 0,
  upi numeric(12,2) not null default 0,
  card numeric(12,2) not null default 0,
  other numeric(12,2) not null default 0,
  notes text,
  closed_by uuid,
  closed_at timestamptz not null default now(),
  unique (restaurant_id, business_date)
);

-- ───────── tenant helpers ─────────
create or replace function auth_restaurant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from profiles where id = auth.uid() and is_active
$$;

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

-- Per-tenant sequential numbers (order_no, kot_no, bill_no)
create or replace function next_number(p_kind text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into counters(restaurant_id, kind, value) values (auth_restaurant_id(), p_kind, 1)
  on conflict (restaurant_id, kind) do update set value = counters.value + 1
  returning value into v;
  return v;
end $$;

-- Sign-up: create a restaurant and make the caller its owner
create or replace function create_restaurant(p_name text, p_slug text, p_full_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'already belongs to a restaurant'; end if;
  insert into restaurants(name, slug) values (p_name, p_slug) returning id into rid;
  insert into profiles(id, restaurant_id, full_name, email, role)
    values (auth.uid(), rid, p_full_name, (select email from auth.users where id = auth.uid()), 'owner');
  -- starter data so the first screen is not empty
  insert into categories(restaurant_id, name, sort_order) values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
    select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
  return rid;
end $$;

-- Staff joins with an invite code
create or replace function join_restaurant(p_code text, p_full_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from invites where code = upper(p_code) and used_by is null and expires_at > now();
  if not found then raise exception 'invite code is invalid or expired'; end if;
  insert into profiles(id, restaurant_id, full_name, email, role)
    values (auth.uid(), inv.restaurant_id, p_full_name, (select email from auth.users where id = auth.uid()), inv.role);
  update invites set used_by = auth.uid() where id = inv.id;
  return inv.restaurant_id;
end $$;

-- Owner/manager creates an invite code
create or replace function create_invite(p_role user_role) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth_role() not in ('owner','manager') then raise exception 'not allowed'; end if;
  c := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into invites(restaurant_id, code, role, expires_at) values (auth_restaurant_id(), c, p_role, now() + interval '7 days');
  return c;
end $$;

-- ───────── ordering: one call places an order + KOT + items ─────────
create or replace function place_order(
  p_type order_type, p_table_id uuid, p_customer_name text, p_customer_phone text,
  p_items jsonb  -- [{menu_item_id, qty, notes}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_type = 'dine_in' and p_table_id is not null then
    select id into oid from orders where restaurant_id = rid and table_id = p_table_id and status = 'open' limit 1;
  end if;
  if oid is null then
    insert into orders(restaurant_id, order_no, type, table_id, customer_name, customer_phone, created_by)
      values (rid, next_number('order'), p_type, p_table_id, p_customer_name, p_customer_phone, auth.uid()) returning id into oid;
  end if;
  insert into kots(restaurant_id, order_id, kot_no) values (rid, oid, next_number('kot')) returning id into kid;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it->>'menu_item_id')::uuid and restaurant_id = rid;
    if not found then raise exception 'menu item not found'; end if;
    insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes)
      values (rid, oid, kid, mi.id, mi.name, mi.price, greatest(1,(it->>'qty')::int), it->>'notes');
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;

-- ───────── billing ─────────
create or replace function generate_bill(p_order_id uuid, p_discount_pct numeric default 0, p_discount_amount numeric default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; sub numeric; disc numeric; taxable numeric; sc numeric; half numeric; cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
begin
  select * into r from restaurants where id = rid;
  if not exists (select 1 from orders where id = p_order_id and restaurant_id = rid and status = 'open') then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;
  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';
  disc := least(sub, round(sub * coalesce(p_discount_pct,0)/100, 2) + coalesce(p_discount_amount,0));
  taxable := sub - disc;
  sc := round(taxable * r.service_charge_pct/100, 2);
  half := r.gst_rate/2;
  cg := round((taxable + sc) * half/100, 2);
  sg := cg;
  raw := taxable + sc + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount, service_charge, cgst, sgst, round_off, total, created_by)
    values (rid, p_order_id, next_number('bill'), sub, coalesce(p_discount_pct,0), disc, sc, cg, sg, tot - raw, tot, auth.uid()) returning id into bid;
  return bid;
end $$;

create or replace function settle_bill(p_bill_id uuid, p_payments jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; p jsonb; paid numeric := 0; tid uuid;
begin
  select * into b from bills where id = p_bill_id and restaurant_id = rid and status = 'unpaid';
  if not found then raise exception 'bill not found or already paid'; end if;
  for p in select * from jsonb_array_elements(p_payments) loop
    insert into payments(restaurant_id, bill_id, method, amount, ref)
      values (rid, b.id, (p->>'method')::payment_method, (p->>'amount')::numeric, p->>'ref');
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < b.total then raise exception 'paid % is less than total %', paid, b.total; end if;
  update bills set status = 'paid', paid_at = now() where id = b.id;
  update orders set status = 'billed' where id = b.order_id;
  update order_items set status = 'served' where order_id = b.order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = b.order_id;
  select table_id into tid from orders where id = b.order_id;
  if tid is not null and not exists (select 1 from orders where table_id = tid and status = 'open') then
    update dining_tables set status = 'free' where id = tid;
  end if;
end $$;

create or replace function close_day(p_date date, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); did uuid;
begin
  if auth_role() not in ('owner','manager','cashier') then raise exception 'not allowed'; end if;
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

-- ───────── stock: ledger keeps ingredients.current_stock in sync ─────────
create or replace function apply_ledger() returns trigger language plpgsql as $$
begin
  update ingredients set current_stock = current_stock + new.qty where id = new.ingredient_id;
  return new;
end $$;
drop trigger if exists trg_apply_ledger on stock_ledger;
create trigger trg_apply_ledger after insert on stock_ledger for each row execute function apply_ledger();

-- Selling a dish consumes its recipe; cancelling it gives the stock back
create or replace function consume_recipe() returns trigger language plpgsql security definer as $$
declare sign numeric;
begin
  if tg_op = 'INSERT' then sign := -1;
  elsif tg_op = 'UPDATE' and old.status <> 'cancelled' and new.status = 'cancelled' then sign := 1;
  else return new; end if;
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, sign * r.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from recipe_items r where r.menu_item_id = new.menu_item_id;
  return new;
end $$;
drop trigger if exists trg_consume_recipe on order_items;
create trigger trg_consume_recipe after insert or update of status on order_items for each row execute function consume_recipe();

-- Purchases add stock
create or replace function purchase_to_ledger() returns trigger language plpgsql security definer as $$
begin
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
    values (new.restaurant_id, new.ingredient_id, new.qty, 'purchase', 'purchase', new.purchase_id, auth.uid());
  update ingredients set cost_per_unit = new.unit_cost where id = new.ingredient_id and new.unit_cost > 0;
  return new;
end $$;
drop trigger if exists trg_purchase_to_ledger on purchase_items;
create trigger trg_purchase_to_ledger after insert on purchase_items for each row execute function purchase_to_ledger();

-- KOT status follows its items (all ready → ready, any preparing → preparing)
create or replace function sync_kot_status() returns trigger language plpgsql security definer as $$
declare k kot_status;
begin
  if new.kot_id is null then return new; end if;
  select case
    when bool_and(status in ('ready','served','cancelled')) and bool_or(status = 'served') then 'served'
    when bool_and(status in ('ready','cancelled')) then 'ready'
    when bool_or(status = 'preparing') then 'preparing'
    else 'pending' end::kot_status
  into k from order_items where kot_id = new.kot_id;
  update kots set status = k, ready_at = case when k = 'ready' then coalesce(ready_at, now()) else ready_at end where id = new.kot_id;
  return new;
end $$;
drop trigger if exists trg_sync_kot on order_items;
create trigger trg_sync_kot after update of status on order_items for each row execute function sync_kot_status();

-- Live-only views for dashboards
create or replace view v_low_stock as
  select * from ingredients where is_active and current_stock <= reorder_level;

-- ───────── RLS: every row is scoped to the caller's restaurant ─────────
do $$ declare t text; begin
  foreach t in array array['restaurants','profiles','invites','counters','categories','ingredients','menu_items','recipe_items','stock_ledger','purchases','purchase_items','dining_tables','orders','kots','order_items','bills','payments','day_closes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
  end loop;
end $$;

create policy tenant_all on restaurants for all using (id = auth_restaurant_id()) with check (id = auth_restaurant_id());
create policy tenant_all on profiles for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on invites for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on counters for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on categories for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on ingredients for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on menu_items for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on recipe_items for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on stock_ledger for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on purchases for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on purchase_items for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on dining_tables for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on orders for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on kots for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on order_items for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on bills for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on payments for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on day_closes for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());

-- Default restaurant_id on inserts so clients never send it
create or replace function set_restaurant_id() returns trigger language plpgsql as $$
begin
  if new.restaurant_id is null then new.restaurant_id := auth_restaurant_id(); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['categories','ingredients','menu_items','recipe_items','stock_ledger','purchases','purchase_items','dining_tables','orders','kots','order_items','bills','payments','day_closes'] loop
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;

-- ───────── realtime ─────────
do $$ begin
  alter publication supabase_realtime add table orders, order_items, kots, dining_tables, ingredients, bills;
exception when others then null; end $$;

alter table orders replica identity full;
alter table order_items replica identity full;
alter table kots replica identity full;
