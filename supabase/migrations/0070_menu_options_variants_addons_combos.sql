-- 0070 · Menu options: variants, add-ons and combos.
--
-- Until now a dish was one name at one price, and everything else a guest asked for went into the
-- note for the kitchen — "half plate", "extra cheese", "no onion". A note does not change the price,
-- so a half biryani was rung up as a full one and the waiter corrected the bill by hand, and the
-- pantry drew a full plate's stock for it. The three things every other till on the market does:
--
--   variants   · one dish sold in sizes or styles, each with its own price (Half ₹180 / Full ₹320).
--                The variant's price *replaces* the dish's price. A dish with variants must be sold
--                in one of them; when none is named the default (or the first) is taken.
--   add-ons    · extras grouped into named sets with a minimum and maximum choice ("Choose your
--                bread · pick 1", "Toppings · up to 3"). Each add-on has its own price, which is
--                *added* to the line, and may draw an ingredient from the pantry (extra cheese → 30 g).
--   combos     · a dish made of other dishes, sold at one price. The kitchen ticket lists its parts,
--                and the pantry draws what each part's recipe draws.
--
-- The line remembers what was chosen — variant name, the add-ons with their prices, the combo's
-- parts — so the bill, the KOT and the reports say what was actually sold, however the menu is
-- edited afterwards. One function, price_line(), does the pricing and the checking, and both the
-- till and the public storefront go through it, so a rule holds at both doors.

-- ───────── 1. variants ─────────
create table if not exists menu_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_variants_item_idx on menu_variants(restaurant_id, menu_item_id);
alter table menu_variants enable row level security;
drop policy if exists tenant_all on menu_variants;
create policy tenant_all on menu_variants for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on menu_variants;
create trigger trg_set_rid before insert on menu_variants for each row execute function set_restaurant_id();

-- ───────── 2. add-on groups and add-ons ─────────
create table if not exists addon_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,        -- 0 = optional
  max_select integer not null default 0,        -- 0 = no limit; 1 = pick one
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists addon_groups_rid_idx on addon_groups(restaurant_id);
alter table addon_groups enable row level security;
drop policy if exists tenant_all on addon_groups;
create policy tenant_all on addon_groups for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on addon_groups;
create trigger trg_set_rid before insert on addon_groups for each row execute function set_restaurant_id();

create table if not exists addons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  group_id uuid not null references addon_groups(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  is_veg boolean not null default true,
  is_available boolean not null default true,
  ingredient_id uuid references ingredients(id) on delete set null,   -- what one of these draws from the pantry
  ingredient_qty numeric(12,3),                                        -- in that ingredient's own unit
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists addons_group_idx on addons(restaurant_id, group_id);
alter table addons enable row level security;
drop policy if exists tenant_all on addons;
create policy tenant_all on addons for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on addons;
create trigger trg_set_rid before insert on addons for each row execute function set_restaurant_id();

-- which groups a dish offers
create table if not exists menu_item_addon_groups (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  group_id uuid not null references addon_groups(id) on delete cascade,
  primary key (menu_item_id, group_id)
);
create index if not exists menu_item_addon_groups_rid_idx on menu_item_addon_groups(restaurant_id, group_id);
alter table menu_item_addon_groups enable row level security;
drop policy if exists tenant_all on menu_item_addon_groups;
create policy tenant_all on menu_item_addon_groups for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on menu_item_addon_groups;
create trigger trg_set_rid before insert on menu_item_addon_groups for each row execute function set_restaurant_id();

-- ───────── 3. combos ─────────
alter table menu_items add column if not exists is_combo boolean not null default false;
create table if not exists combo_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  combo_id uuid not null references menu_items(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  qty integer not null default 1,
  unique (combo_id, menu_item_id)
);
create index if not exists combo_items_rid_idx on combo_items(restaurant_id, combo_id);
alter table combo_items enable row level security;
drop policy if exists tenant_all on combo_items;
create policy tenant_all on combo_items for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on combo_items;
create trigger trg_set_rid before insert on combo_items for each row execute function set_restaurant_id();

-- ───────── 4. what the order line remembers ─────────
alter table order_items
  add column if not exists variant_id uuid references menu_variants(id) on delete set null,
  add column if not exists variant_name text,
  add column if not exists addons jsonb not null default '[]',        -- [{id, name, price, group_id}]
  add column if not exists components jsonb not null default '[]';    -- a combo's parts: [{menu_item_id, name, qty}]

-- ───────── 5. pricing a line ─────────
-- p_item: {menu_item_id, variant_id?, addon_ids?}. Returns the priced line — the name as it should
-- print, the price per unit with the variant and every add-on in it, and what was chosen — or raises
-- when a choice is not one the dish offers, or a group's minimum or maximum is not met. Both doors,
-- the till and the storefront, price through here.
create or replace function price_line(p_rid uuid, p_item jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  mi menu_items%rowtype; v menu_variants%rowtype; a record; g record;
  price numeric; vname text := null; vid uuid := null; adds jsonb := '[]'; n int; want uuid[]; comps jsonb;
begin
  select * into mi from menu_items where id = (p_item->>'menu_item_id')::uuid and restaurant_id = p_rid;
  if not found then raise exception 'dish not found'; end if;
  price := mi.price;

  if nullif(p_item->>'variant_id', '') is not null then
    select * into v from menu_variants where id = (p_item->>'variant_id')::uuid and menu_item_id = mi.id and restaurant_id = p_rid and is_active;
    if not found then raise exception 'that option of % is not available', mi.name; end if;
    price := v.price; vname := v.name; vid := v.id;
  elsif exists (select 1 from menu_variants where menu_item_id = mi.id and is_active) then
    -- sold in sizes, none named: the default, else the first
    select * into v from menu_variants where menu_item_id = mi.id and is_active order by is_default desc, sort_order, name limit 1;
    price := v.price; vname := v.name; vid := v.id;
  end if;

  want := coalesce(array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_item->'addon_ids', '[]'::jsonb)) x where x <> ''), '{}'::uuid[]);
  if cardinality(want) > 0 then
    for a in select ad.* from addons ad
             join menu_item_addon_groups l on l.group_id = ad.group_id and l.menu_item_id = mi.id
             where ad.id = any(want) and ad.restaurant_id = p_rid and ad.is_active and ad.is_available
             order by ad.sort_order, ad.name loop
      adds := adds || jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'group_id', a.group_id);
      price := price + a.price;
    end loop;
    -- anything asked for that is not on offer for this dish is refused, never silently dropped: a
    -- dropped add-on is an under-charge nobody notices until the count
    if jsonb_array_length(adds) <> cardinality(want) then raise exception 'an add-on chosen for % is not available', mi.name; end if;
  end if;

  for g in select ag.* from addon_groups ag join menu_item_addon_groups l on l.group_id = ag.id
           where l.menu_item_id = mi.id and ag.is_active loop
    select count(*) into n from jsonb_array_elements(adds) e where (e->>'group_id')::uuid = g.id;
    if n < g.min_select then raise exception '% needs % choice% from "%"', mi.name, g.min_select, case when g.min_select = 1 then '' else 's' end, g.name; end if;
    if g.max_select > 0 and n > g.max_select then raise exception '"%" allows at most % for %', g.name, g.max_select, mi.name; end if;
  end loop;

  comps := case when mi.is_combo then coalesce((
    select jsonb_agg(jsonb_build_object('menu_item_id', c.menu_item_id, 'name', m.name, 'qty', c.qty) order by m.name)
    from combo_items c join menu_items m on m.id = c.menu_item_id where c.combo_id = mi.id), '[]'::jsonb) else '[]'::jsonb end;

  return jsonb_build_object(
    'menu_item_id', mi.id,
    'name', mi.name || case when vname is not null then ' · ' || vname else '' end,
    'price', price, 'variant_id', vid, 'variant_name', vname, 'addons', adds, 'components', comps,
    'is_available', mi.is_available, 'is_active', mi.is_active);
end $$;

-- ───────── 6. the till ─────────
-- Same signature as before, so the offline outbox's queued orders and the server action both keep
-- working. Each item may now carry variant_id and addon_ids; the line is priced by price_line.
create or replace function place_order(
  p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb default '{}',
  p_note text default null, p_client_id uuid default null, p_placed_at timestamptz default null,
  p_promise boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; pl jsonb;
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
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(p_items) loop
    pl := price_line(rid, it);
    insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status,
                            variant_id, variant_name, addons, components)
      values (rid, oid, kid, (pl->>'menu_item_id')::uuid, pl->>'name', (pl->>'price')::numeric,
              greatest(1, round((it->>'qty')::numeric)::int),
              nullif(coalesce(it->>'notes', it->>'note'), ''),
              'pending',
              nullif(pl->>'variant_id', '')::uuid, pl->>'variant_name', coalesce(pl->'addons', '[]'::jsonb), coalesce(pl->'components', '[]'::jsonb));
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;
grant execute on function place_order(uuid, order_type, jsonb, jsonb, text, uuid, timestamptz, boolean) to authenticated;

-- An accepted online order carries what the guest chose onto its lines.
create or replace function accept_online_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  select * into o from online_orders where id = p_id and restaurant_id = rid;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  insert into orders(restaurant_id, order_no, type, status, customer_name, customer_phone, notes, channel_id, created_by)
    values (rid, next_number('order'), 'delivery', 'open', o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    select * into mi from menu_items where restaurant_id = rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (rid, oid, kid, mi.id, coalesce(nullif(it->>'name', ''), mi.name), coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    end if;
  end loop;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $$;

-- ───────── 7. the pantry ─────────
-- A line draws its dish's recipe, plus each part of a combo, plus any add-on mapped to an ingredient.
create or replace function consume_recipe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('preparing', 'ready', 'served') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('preparing', 'ready', 'served') then return new; end if;
  if new.menu_item_id is null then return new; end if;
  if exists (select 1 from stock_ledger l where l.ref_type = 'order_item' and l.ref_id = new.id and l.reason = 'sale') then return new; end if;
  -- the dish's own recipe
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, -1 * r.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from recipe_items r where r.menu_item_id = new.menu_item_id;
  -- a combo draws what each of its parts draws
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, -1 * r.qty * c.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from combo_items c join recipe_items r on r.menu_item_id = c.menu_item_id where c.combo_id = new.menu_item_id;
  -- an add-on mapped to an ingredient (extra cheese → 30 g of cheese)
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, a.ingredient_id, -1 * a.ingredient_qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb)) e
  join addons a on a.id = nullif(e->>'id', '')::uuid
  where a.ingredient_id is not null and coalesce(a.ingredient_qty, 0) > 0;
  return new;
end $$;

-- What a ticket needs, now counting a combo's parts and the add-ons that draw stock.
create or replace function kots_needs(p_kots uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  with items as (
    select oi.kot_id, oi.id, oi.menu_item_id, oi.name_snapshot, oi.qty, coalesce(oi.addons, '[]'::jsonb) as addons
    from order_items oi
    where oi.kot_id = any(p_kots) and oi.restaurant_id = auth_restaurant_id() and oi.status <> 'cancelled'
  ),
  draws as (
    select it.kot_id, i.id as ingredient_id, i.name, i.unit, r.qty * it.qty as need, i.current_stock as stock
    from items it join recipe_items r on r.menu_item_id = it.menu_item_id join ingredients i on i.id = r.ingredient_id
    union all
    select it.kot_id, i.id, i.name, i.unit, r.qty * c.qty * it.qty, i.current_stock
    from items it join combo_items c on c.combo_id = it.menu_item_id
    join recipe_items r on r.menu_item_id = c.menu_item_id join ingredients i on i.id = r.ingredient_id
    union all
    select it.kot_id, i.id, i.name, i.unit, a.ingredient_qty * it.qty, i.current_stock
    from items it cross join lateral jsonb_array_elements(it.addons) e
    join addons a on a.id = nullif(e->>'id', '')::uuid join ingredients i on i.id = a.ingredient_id
    where coalesce(a.ingredient_qty, 0) > 0
  ),
  need as (
    select kot_id, ingredient_id, name, unit, sum(need) as need, max(stock) as stock
    from draws group by kot_id, ingredient_id, name, unit
  ),
  unmapped as (
    select it.kot_id, jsonb_agg(distinct it.name_snapshot) as dishes
    from items it
    where it.menu_item_id is null
       or (not exists (select 1 from recipe_items r where r.menu_item_id = it.menu_item_id)
           and not exists (select 1 from combo_items c join recipe_items r on r.menu_item_id = c.menu_item_id where c.combo_id = it.menu_item_id))
    group by it.kot_id
  ),
  started as (
    select it.kot_id,
           bool_or(exists (select 1 from stock_ledger l where l.ref_type = 'order_item' and l.ref_id = it.id and l.reason = 'sale')) as started
    from items it group by it.kot_id
  )
  select coalesce(jsonb_object_agg(k.kot_id::text, jsonb_build_object(
    'started',  coalesce(s.started, false),
    'unmapped', coalesce(u.dishes, '[]'::jsonb),
    'needs',    coalesce((
      select jsonb_agg(jsonb_build_object(
               'ingredient_id', n.ingredient_id, 'name', n.name, 'unit', n.unit,
               'need', n.need, 'stock', n.stock, 'short', n.need > coalesce(n.stock, 0))
             order by (n.need > coalesce(n.stock, 0)) desc, n.name)
      from need n where n.kot_id = k.kot_id), '[]'::jsonb)
  )), '{}'::jsonb)
  from (select distinct kot_id from items) k
  left join started  s on s.kot_id = k.kot_id
  left join unmapped u on u.kot_id = k.kot_id;
$$;

-- How many of each dish the pantry covers — a combo as often as its scarcest part allows.
create or replace function menu_stock() returns jsonb
language sql stable security definer set search_path = public as $$
  with per_ingredient as (
    select r.menu_item_id,
           i.name, i.unit, r.qty as per_portion, i.current_stock,
           greatest(0, floor(i.current_stock / r.qty)) as portions
    from recipe_items r
    join ingredients i on i.id = r.ingredient_id
    join menu_items m on m.id = r.menu_item_id
    where m.restaurant_id = auth_restaurant_id()
      and m.is_active
      and i.is_active
      and r.qty > 0
  ),
  per_dish as (
    select menu_item_id,
           least(min(portions), 9999)::int as portions,
           coalesce(
             jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'per', per_portion, 'stock', current_stock)
                       order by current_stock / per_portion)
               filter (where portions < 1),
             '[]'::jsonb) as short
    from per_ingredient
    group by menu_item_id
  ),
  combos as (
    -- parts with no recipe say nothing, so they do not count
    select c.combo_id as menu_item_id, least(min(floor(pd.portions / greatest(c.qty, 1))), 9999)::int as portions
    from combo_items c
    join per_dish pd on pd.menu_item_id = c.menu_item_id
    join menu_items m on m.id = c.combo_id
    where m.restaurant_id = auth_restaurant_id() and m.is_active
    group by c.combo_id
  )
  select coalesce(jsonb_object_agg(x.menu_item_id::text, jsonb_build_object('portions', x.portions, 'short', x.short)), '{}'::jsonb)
  from (
    select menu_item_id, portions, short from per_dish
    union all
    select menu_item_id, portions, '[]'::jsonb from combos where menu_item_id not in (select menu_item_id from per_dish)
  ) x;
$$;

-- ───────── 8. the storefront ─────────
-- The public menu now carries each dish's variants, add-on groups and, for a combo, its parts.
create or replace function dine_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'tagline', r.tagline,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'phone', r.phone, 'district', r.district, 'photos', to_jsonb(r.photos), 'policies', r.policies,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'gst_rate', r.gst_rate, 'room_gst_rate', r.room_gst_rate,
    'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
    'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
    'min_order', r.min_order, 'delivery_fee', r.delivery_fee, 'packing_charge', r.packing_charge,
    'open_now', (current_time between r.opens_at and r.closes_at),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available,
                    'is_combo', m.is_combo,
                    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'is_default', v.is_default) order by v.sort_order, v.name)
                                          from menu_variants v where v.menu_item_id = m.id and v.is_active), '[]'::jsonb),
                    'addon_groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min', g.min_select, 'max', g.max_select,
                                        'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_veg', a.is_veg) order by a.sort_order, a.name)
                                                            from addons a where a.group_id = g.id and a.is_active and a.is_available), '[]'::jsonb)) order by g.sort_order, g.name)
                                              from addon_groups g join menu_item_addon_groups l on l.group_id = g.id where l.menu_item_id = m.id and g.is_active), '[]'::jsonb),
                    'components', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'qty', ci.qty) order by x.name)
                                            from combo_items ci join menu_items x on x.id = ci.menu_item_id where ci.combo_id = m.id), '[]'::jsonb)
                  ) order by m.name)
                           from menu_items m where m.category_id = c.id and m.is_active), '[]')) order by c.sort_order)
      from categories c where c.restaurant_id = r.id), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'value', o.value, 'scope', o.scope, 'min_order', o.min_order, 'code', o.code, 'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)))
      from offers o where o.restaurant_id = r.id and o.is_active and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
      from (select * from reviews where restaurant_id = r.id order by created_at desc limit 20) v), '[]'))
  from restaurants r where r.booking_slug = p_slug and r.is_listed and r.membership in ('trial','active')
$$;

-- A guest's basket line: {id, qty, note, variant_id?, addon_ids?}. Priced by price_line, like the till.
create or replace function dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text default 'delivery', p_note text default null, p_offer uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid;
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and membership in ('trial','active');
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  if p_mode = 'delivery' and not r.delivery_enabled then raise exception 'delivery is not available here'; end if;
  if p_mode = 'takeaway' and not r.takeaway_enabled then raise exception 'takeaway is not available here'; end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    -- a dish that has gone off the menu is left out, as before; a bad choice on one that is still on it is refused
    select m.is_active and m.is_available into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := greatest(1, (it->>'qty')::numeric);
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', it->>'note',
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active and scope in ('delivery','both') and sub >= min_order;
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + r.packing_charge;
  tot := round(sub - disc + fee + round((sub - disc) * r.gst_rate / 100, 2));

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := 'WEB-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at)
    values (rid, ch.id, ext, right(ext, 6), p_guest->>'full_name', p_guest->>'phone', p_guest->>'address', items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', p_note, 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title), now())
    returning id into oid;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end);
end $$;

-- The pay page names the add-ons on a line, so the guest reads the bill they were handed.
create or replace function pay_link(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bill_no', b.bill_no, 'status', b.status, 'total', b.total, 'subtotal', b.subtotal,
    'discount', b.discount_amount, 'service', b.service_charge, 'cgst', b.cgst, 'sgst', b.sgst, 'round_off', b.round_off,
    'created_at', b.created_at, 'paid_at', b.paid_at, 'claim_ref', b.pay_claim_ref,
    'where', case when t.name is not null then 'Table ' || t.name else initcap(replace(o.type::text, '_', ' ')) end,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.name_snapshot || case when jsonb_array_length(coalesce(i.addons, '[]'::jsonb)) > 0
                                                then ' + ' || (select string_agg(e->>'name', ', ') from jsonb_array_elements(i.addons) e) else '' end,
                'qty', i.qty, 'price', i.price_snapshot) order by i.created_at), '[]'::jsonb)
              from order_items i where i.order_id = o.id and i.status <> 'cancelled'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'ref', p.ref) order by p.created_at), '[]'::jsonb)
                 from payments p where p.bill_id = b.id),
    'restaurant', jsonb_build_object('name', r.name, 'address', r.address, 'phone', r.phone, 'gstin', r.gstin, 'logo_url', r.logo_url, 'brand_colour', r.brand_colour),
    'upi', case when nullif(trim(r.upi_vpa), '') is not null
                then jsonb_build_object('vpa', trim(r.upi_vpa), 'payee', coalesce(nullif(trim(r.upi_payee), ''), r.name)) end,
    'gateway', case when g.key_id is not null and nullif(g.key_secret, '') is not null
                    then jsonb_build_object('kind', g.provider, 'key_id', g.key_id) end
  )
  from bills b
  join orders o on o.id = b.order_id
  join restaurants r on r.id = b.restaurant_id
  left join dining_tables t on t.id = o.table_id
  left join payment_gateways g on g.restaurant_id = r.id
  where b.pay_token = p_token and b.status <> 'void'
$$;
