-- 0055 · Stock leaves the pantry when the kitchen starts cooking, not when the waiter takes the order.
--
-- Until now trg_consume_recipe deducted every recipe the moment an order item was INSERTED. That meant a
-- dish ordered and cancelled before the fire was lit had to be credited back, and between order and cook
-- the pantry showed stock gone that was still on the shelf. Now an item consumes its recipe exactly once,
-- the first time it reaches 'preparing' — which is what "Start cooking" on the kitchen display sets — or
-- when it is inserted already past that point (sample data lands as 'served'). A dish cancelled after
-- cooking began keeps its consumption: the food was made, the ingredients are gone.

-- the once-only guard looks the ledger up by what it refers to
create index if not exists ledger_ref_idx on stock_ledger(ref_type, ref_id);

create or replace function consume_recipe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 'pending' has not been started; 'cancelled' never will be
  if new.status not in ('preparing', 'ready', 'served') then return new; end if;
  -- already past the fire: ready → preparing (un-ticking a dish), preparing → ready, ready → served
  if tg_op = 'UPDATE' and old.status in ('preparing', 'ready', 'served') then return new; end if;
  if new.menu_item_id is null then return new; end if;
  -- once only, whatever path led here
  if exists (select 1 from stock_ledger l where l.ref_type = 'order_item' and l.ref_id = new.id and l.reason = 'sale') then return new; end if;
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, created_by)
  select new.restaurant_id, r.ingredient_id, -1 * r.qty * new.qty, 'sale', 'order_item', new.id, auth.uid()
  from recipe_items r where r.menu_item_id = new.menu_item_id;
  return new;
end $$;
drop trigger if exists trg_consume_recipe on order_items;
create trigger trg_consume_recipe after insert or update of status on order_items
  for each row execute function consume_recipe();

-- ───────── what a ticket needs, against what is on the shelf ─────────
-- For each KOT: every ingredient its live dishes call for (recipe × quantity, summed across dishes), the
-- pantry's current stock of it, whether that falls short, whether the ticket has already drawn its stock,
-- and which dishes have no recipe at all (their stock will not move). Keyed by KOT id.
create or replace function kots_needs(p_kots uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  with items as (
    select oi.kot_id, oi.id, oi.menu_item_id, oi.name_snapshot, oi.qty
    from order_items oi
    where oi.kot_id = any(p_kots) and oi.restaurant_id = auth_restaurant_id() and oi.status <> 'cancelled'
  ),
  need as (
    select it.kot_id, i.id as ingredient_id, i.name, i.unit, sum(r.qty * it.qty) as need, max(i.current_stock) as stock
    from items it
    join recipe_items r on r.menu_item_id = it.menu_item_id
    join ingredients i on i.id = r.ingredient_id
    group by it.kot_id, i.id, i.name, i.unit
  ),
  unmapped as (
    select it.kot_id, jsonb_agg(distinct it.name_snapshot) as dishes
    from items it
    where it.menu_item_id is null or not exists (select 1 from recipe_items r where r.menu_item_id = it.menu_item_id)
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

-- ───────── map a dish to a standard recipe in one go ─────────
-- p_lines: [{name, unit, qty, category}] for ONE plate. Ingredients the pantry does not have yet are
-- created by name (with the given unit and category); ones it has are reused — and if the pantry keeps
-- that ingredient in a kindred unit (g where the recipe says kg, ml where it says l) the quantity is
-- converted, while an unrelated unit (pcs against kg) skips the line and says so. The dish's recipe is
-- then replaced wholesale, the same as saving it by hand.
create or replace function apply_standard_recipe(p_menu_item uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id();
  ln jsonb; iid uuid; iunit stock_unit; lunit stock_unit; q numeric;
  created int := 0; mapped int := 0; skipped jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from menu_items where id = p_menu_item and restaurant_id = rid) then
    raise exception 'dish not found';
  end if;
  delete from recipe_items where menu_item_id = p_menu_item and restaurant_id = rid;
  for ln in select * from jsonb_array_elements(p_lines) loop
    q := (ln->>'qty')::numeric; lunit := (ln->>'unit')::stock_unit;
    if q is null or q <= 0 then continue; end if;
    select id, unit into iid, iunit from ingredients
      where restaurant_id = rid and lower(name) = lower(ln->>'name')
      order by is_active desc limit 1;
    if iid is null then
      insert into ingredients(restaurant_id, name, unit, category, reorder_level, cost_per_unit)
        values (rid, ln->>'name', lunit, ln->>'category', 0, 0)
        returning id, unit into iid, iunit;
      created := created + 1;
    else
      update ingredients set is_active = true where id = iid and not is_active;
      if iunit <> lunit then
        if    (iunit::text, lunit::text) in (('g','kg'), ('ml','l')) then q := q * 1000;
        elsif (iunit::text, lunit::text) in (('kg','g'), ('l','ml')) then q := q / 1000;
        else skipped := skipped || to_jsonb(ln->>'name'); continue;
        end if;
      end if;
    end if;
    insert into recipe_items(restaurant_id, menu_item_id, ingredient_id, qty)
      values (rid, p_menu_item, iid, q)
      on conflict (menu_item_id, ingredient_id) do update set qty = excluded.qty;
    mapped := mapped + 1;
  end loop;
  return jsonb_build_object('created', created, 'mapped', mapped, 'skipped', skipped);
end $$;
