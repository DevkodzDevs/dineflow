-- 0065 · The on-time promise: "on your table in 30 minutes, or the food is free."
--
-- A guest can be offered a deadline when the order is taken. They pay a small percentage extra for
-- it. If the food reaches them inside the window the percentage is charged; if it does not, the food
-- is free and the percentage is not charged either — a promise that still bills a fee for failing is
-- not a promise.
--
-- Three numbers belong to the owner and live on the property: whether the offer exists at all, how
-- long the window is, and what the percentage is. Every order that takes the offer **snapshots** both
-- the window and the percentage onto itself, so raising the rate tomorrow never re-prices a promise
-- made today. The same reason bills carry their own copy: a bill is a record of what happened.
--
-- Nothing here is retrospective. Existing open orders get promised_at = null, which means no promise,
-- which bills exactly as it did before this migration ran.

-- ───────── what the owner sets ─────────
alter table restaurants
  add column if not exists promise_enabled boolean      not null default false,
  add column if not exists promise_minutes integer      not null default 30,
  add column if not exists promise_pct     numeric(5,2) not null default 5;

alter table restaurants
  drop constraint if exists restaurants_promise_sane,
  add  constraint restaurants_promise_sane
    check (promise_minutes between 5 and 240 and promise_pct >= 0 and promise_pct <= 50);

-- ───────── what one order promised, and when the food actually arrived ─────────
alter table orders
  add column if not exists promise_minutes integer,
  add column if not exists promise_pct     numeric(5,2),
  add column if not exists promised_at     timestamptz,   -- the deadline; null means no promise
  add column if not exists served_at       timestamptz;   -- when the food reached the guest

-- the kitchen and the floor both want "what is due soonest, and is it past due"
create index if not exists orders_promise_due_idx
  on orders(restaurant_id, promised_at)
  where promised_at is not null and status = 'open';

-- ───────── what the bill decided, frozen onto the bill ─────────
alter table bills
  add column if not exists promise_fee    numeric(12,2) not null default 0,  -- charged for keeping it
  add column if not exists promise_waived numeric(12,2) not null default 0,  -- food given free for missing it
  add column if not exists promise_kept   boolean;                           -- null = this order made no promise

-- ───────── when the food reached the guest ─────────
-- Stamped the moment the last live item on the order reaches 'served'. That is the same tap the floor
-- already makes: "Picked up" on the kitchen display, or serving the ticket from the order screen. It
-- is written once and never moved, so a later status change cannot rewrite history.
create or replace function stamp_served_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'served' then return new; end if;
  update orders o
     set served_at = now()
   where o.id = new.order_id
     and o.served_at is null
     and not exists (
       select 1 from order_items i
        where i.order_id = new.order_id and i.status not in ('served', 'cancelled'));
  return new;
end $$;

drop trigger if exists trg_stamp_served_at on order_items;
create trigger trg_stamp_served_at
  after update of status on order_items
  for each row when (new.status is distinct from old.status)
  execute function stamp_served_at();

-- ───────── taking the order ─────────
-- The 7-argument version is dropped rather than left beside a new 8-argument one: PostgREST resolves
-- by argument name, and two functions that both accept the original seven names — one of them with a
-- defaulted eighth — is an ambiguous call it refuses to make. Dropping first is what keeps every
-- existing caller, including an order replayed later from the offline outbox, resolving to one
-- function. Such a replay simply omits p_promise and gets false.
drop function if exists place_order(uuid, order_type, jsonb, jsonb, text, uuid, timestamptz);

create or replace function place_order(
  p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb default '{}',
  p_note text default null, p_client_id uuid default null, p_placed_at timestamptz default null,
  p_promise boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
  placed timestamptz; pm integer := null; pp numeric := null; due timestamptz := null;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  placed := coalesce(p_placed_at, now());
  -- the promise is only real if the property is offering one; the rate and window are copied here and
  -- never read from the property again for this order
  if coalesce(p_promise, false) then
    select * into r from restaurants where id = rid;
    if r.promise_enabled then
      pm := r.promise_minutes; pp := r.promise_pct;
      due := placed + make_interval(mins => pm);
    end if;
  end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes,
                     created_by, client_id, created_at, synced_at, promise_minutes, promise_pct, promised_at)
    values (rid, next_number('order'), p_table_id, p_type, 'open', p_customer->>'name', p_customer->>'phone', p_note,
            auth.uid(), p_client_id, placed, now(), pm, pp, due)
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it->>'menu_item_id')::uuid and restaurant_id = rid;
    if not found then raise exception 'dish not found'; end if;
    insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status)
      values (rid, oid, kid, mi.id, mi.name, mi.price,
              greatest(1, round((it->>'qty')::numeric)::int),
              nullif(coalesce(it->>'notes', it->>'note'), ''),
              'pending');
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;

grant execute on function place_order(uuid, order_type, jsonb, jsonb, text, uuid, timestamptz, boolean) to authenticated;

-- ───────── billing the promise ─────────
-- Kept:  the percentage is charged on the food after any discount, and is taxed like the rest of the
--        supply, because it is part of what was sold.
-- Missed: the food is free. Taxable falls to zero, which takes the service charge and the GST with it,
--        and the promise fee is not charged — so the bill comes to ₹0. What the guest would have paid
--        is recorded on the bill as promise_waived, so the day's takings show what it cost.
--
-- p_promise_kept is the cashier's word, and it wins. Left null, the bill decides for itself: if the
-- floor recorded a delivery, that time against the deadline settles it. **If no delivery was ever
-- recorded, the promise is treated as kept** — a bill raised an hour after a quiet lunch must not
-- hand back the food because nobody tapped a button, and the guest standing at the till has a cashier
-- who can say otherwise in one tap. The bill screen shows which of these three answers it used.
drop function if exists generate_bill(uuid, numeric, numeric);

create or replace function generate_bill(
  p_order_id uuid,
  p_discount_pct numeric default 0,
  p_discount_amount numeric default 0,
  p_promise_kept boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; half numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
  fee numeric := 0; waived numeric := 0; kept boolean := null;
begin
  select * into r from restaurants where id = rid;
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;

  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';
  disc := least(sub, round(sub * coalesce(p_discount_pct,0)/100, 2) + coalesce(p_discount_amount,0));
  taxable := sub - disc;

  if o.promised_at is not null then
    kept := coalesce(
      p_promise_kept,
      case when o.served_at is not null then o.served_at <= o.promised_at else true end);
    if kept then
      fee := round(taxable * coalesce(o.promise_pct, 0) / 100, 2);
    else
      waived := taxable;
      taxable := 0;
    end if;
  end if;

  sc := round(taxable * r.service_charge_pct/100, 2);
  half := r.gst_rate/2;
  cg := round((taxable + sc + fee) * half/100, 2);
  sg := cg;
  raw := taxable + sc + fee + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount,
                    service_charge, cgst, sgst, round_off, total,
                    promise_fee, promise_waived, promise_kept, created_by)
    values (rid, p_order_id, next_number('bill'), sub, coalesce(p_discount_pct,0), disc,
            sc, cg, sg, tot - raw, tot,
            fee, waived, kept, auth.uid())
    returning id into bid;
  return bid;
end $$;

grant execute on function generate_bill(uuid, numeric, numeric, boolean) to authenticated;

analyze orders;
