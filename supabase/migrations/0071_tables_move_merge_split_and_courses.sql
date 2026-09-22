-- 0071 · Tables: move, merge and split. Courses: held and fired.
--
-- What a floor does a dozen times a night and the till could not follow:
--
--   move    · a party shifts from T4 to the window table. The order goes with them; T4 is freed
--             unless something else is still running there.
--   merge   · two tables push together and want one bill. The second order's lines and tickets
--             join the first; the second is closed as "merged into #N" and its table freed.
--   split   · one table wants two bills. Chosen lines — whole, or two of the three beers — move to
--             a new order on the same table, which is billed on its own. A line that has already
--             drawn its stock is copied without drawing again.
--   courses · starters now, mains when the table is ready. Each course past the first is its own
--             ticket, held: it does not print and does not sit on the board until somebody fires
--             it, from the kitchen screen or from the table. Its clock starts when it is fired.
--
-- Nothing here changes what a bill is: a bill is still one order, priced by generate_bill.

alter table orders
  add column if not exists merged_into uuid references orders(id) on delete set null,
  add column if not exists split_from uuid references orders(id) on delete set null;
alter table order_items add column if not exists course integer not null default 1;
alter table kots
  add column if not exists held boolean not null default false,
  add column if not exists fired_at timestamptz;
create index if not exists kots_held_idx on kots(restaurant_id) where held;

-- ───────── the pantry can be told to stand aside for one statement ─────────
-- A split copies part of a line whose stock has already left the pantry; the copy must not draw it
-- again. Everything else about consume_recipe is as 0070 left it.
create or replace function consume_recipe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('dineflow.skip_consume', true) = 'on' then return new; end if;
  if new.status not in ('preparing', 'ready', 'served') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('preparing', 'ready', 'served') then return new; end if;
  if new.menu_item_id is null then return new; end if;
  if exists (select 1 from stock_ledger l where l.ref_type = 'order_item' and l.ref_id = new.id and l.reason = 'sale') then return new; end if;
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, -1 * r.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from recipe_items r where r.menu_item_id = new.menu_item_id;
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, -1 * r.qty * c.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from combo_items c join recipe_items r on r.menu_item_id = c.menu_item_id where c.combo_id = new.menu_item_id;
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, a.ingredient_id, -1 * a.ingredient_qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb)) e
  join addons a on a.id = nullif(e->>'id', '')::uuid
  where a.ingredient_id is not null and coalesce(a.ingredient_qty, 0) > 0;
  return new;
end $$;

-- ───────── move ─────────
create or replace function move_order(p_order_id uuid, p_table_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders%rowtype; t dining_tables%rowtype;
begin
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open';
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

-- ───────── merge ─────────
create or replace function merge_orders(p_from uuid, p_into uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); f orders%rowtype; t orders%rowtype;
begin
  if p_from = p_into then raise exception 'that is the same order'; end if;
  select * into f from orders where id = p_from and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  select * into t from orders where id = p_into and restaurant_id = rid and status = 'open';
  if not found then raise exception 'the other order is not open'; end if;
  if exists (select 1 from bills where order_id in (p_from, p_into) and status <> 'void') then raise exception 'a bill has already been raised — void it first'; end if;
  update order_items set order_id = t.id where order_id = f.id;
  update kots set order_id = t.id where order_id = f.id;
  update orders set status = 'cancelled', merged_into = t.id, notes = concat_ws(' · ', notes, 'merged into #' || t.order_no) where id = f.id;
  -- a guest name on the one that went is kept if the other had none
  update orders set customer_name = coalesce(customer_name, f.customer_name), customer_phone = coalesce(customer_phone, f.customer_phone) where id = t.id;
  if f.table_id is not null and f.table_id is distinct from t.table_id then
    update dining_tables x set status = 'free' where x.id = f.table_id and x.status = 'occupied'
      and not exists (select 1 from orders where table_id = x.id and status = 'open');
  end if;
  return t.id;
end $$;
grant execute on function merge_orders(uuid, uuid) to authenticated;

-- ───────── split ─────────
-- p_lines: [{id, qty?}] — the lines to move to a new order on the same table; qty left out moves
-- the whole line, a smaller qty moves that many and leaves the rest.
create or replace function split_order(p_order_id uuid, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o orders%rowtype; nid uuid; l jsonb; oi order_items%rowtype; q int; moved int := 0;
begin
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = o.id and status <> 'void') then raise exception 'a bill has already been raised — void it first'; end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes, created_by, booking_id, channel_id, split_from,
                     promise_minutes, promise_pct, promised_at, served_at)
    values (rid, next_number('order'), o.table_id, o.type, 'open', o.customer_name, o.customer_phone, o.notes, auth.uid(), o.booking_id, o.channel_id, o.id,
            o.promise_minutes, o.promise_pct, o.promised_at, o.served_at)
    returning id into nid;
  perform set_config('dineflow.skip_consume', 'on', true);
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into oi from order_items where id = nullif(l->>'id', '')::uuid and order_id = o.id and status <> 'cancelled';
    if not found then continue; end if;
    q := coalesce(nullif(l->>'qty', '')::int, oi.qty);
    if q <= 0 then continue; end if;
    if q >= oi.qty then
      update order_items set order_id = nid where id = oi.id;
    else
      -- part of a line: the original already drew stock for all of it, so the copy draws none
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

-- ───────── courses ─────────
-- Firing a held ticket sends it to the kitchen now: it prints, joins the board, and its clock
-- starts from this moment rather than from when the order was taken.
create or replace function fire_kot(p_kot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  -- clock_timestamp, not now(): the moment of firing, even when the order was taken in the same transaction
  update kots set held = false, fired_at = clock_timestamp(), created_at = clock_timestamp() where id = p_kot_id and restaurant_id = rid and held;
  if not found then raise exception 'that ticket is not held'; end if;
end $$;
grant execute on function fire_kot(uuid) to authenticated;

-- a held ticket does not print on insert; it prints when it is fired
create or replace function queue_kot_print() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.held then return new; end if;
  insert into print_jobs(restaurant_id, printer_id, kind, ref_type, ref_id, payload)
  select new.restaurant_id, p.id, 'kot', 'kot', new.id, jsonb_build_object('kot_no', new.kot_no, 'order_id', new.order_id)
  from printers p where p.restaurant_id = new.restaurant_id and p.is_active and p.kind in ('kot','both');
  return new;
end $$;
drop trigger if exists trg_kot_print on kots;
create trigger trg_kot_print after insert on kots for each row execute function queue_kot_print();
drop trigger if exists trg_kot_fire_print on kots;
create trigger trg_kot_fire_print after update of held on kots for each row when (old.held and not new.held) execute function queue_kot_print();

-- The till: one ticket per course. Course 1 (or no course) goes to the kitchen now; every course
-- after it is held. Same signature as before, so queued offline orders still replay.
create or replace function place_order(
  p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb default '{}',
  p_note text default null, p_client_id uuid default null, p_placed_at timestamptz default null,
  p_promise boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; pl jsonb; c record;
  placed timestamptz; pm integer := null; pp numeric := null; due timestamptz := null;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  placed := coalesce(p_placed_at, now());
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
  for c in select distinct greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) as course from jsonb_array_elements(p_items) x order by 1 loop
    insert into kots(restaurant_id, order_id, kot_no, status, held) values (rid, oid, next_number('kot'), 'pending', c.course > 1) returning id into kid;
    for it in select x from jsonb_array_elements(p_items) x where greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) = c.course loop
      pl := price_line(rid, it);
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status,
                              variant_id, variant_name, addons, components, course)
        values (rid, oid, kid, (pl->>'menu_item_id')::uuid, pl->>'name', (pl->>'price')::numeric,
                greatest(1, round((it->>'qty')::numeric)::int),
                nullif(coalesce(it->>'notes', it->>'note'), ''),
                'pending',
                nullif(pl->>'variant_id', '')::uuid, pl->>'variant_name', coalesce(pl->'addons', '[]'::jsonb), coalesce(pl->'components', '[]'::jsonb), c.course);
    end loop;
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;
grant execute on function place_order(uuid, order_type, jsonb, jsonb, text, uuid, timestamptz, boolean) to authenticated;
