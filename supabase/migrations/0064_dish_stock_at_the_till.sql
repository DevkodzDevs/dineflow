-- 0064 · What the pantry can still cover, dish by dish, at the moment of ordering.
--
-- Stock already leaves the pantry when the kitchen starts cooking (0055), and the kitchen display
-- already warns that a ticket is short (kots_needs). But that is the wrong end of the room: by then
-- the waiter has promised the dish to a guest, and someone has to walk back to the table and take it
-- away again. This answers the same question one step earlier, at the till.
--
-- It only ever reports. Nothing here refuses an order, and that is deliberate: a pantry count drifts
-- the moment a delivery goes unlogged, and a till that refuses to sell chicken because the number on
-- the screen says zero — while the chicken is sitting in the fridge — costs a restaurant its service.
-- The waiter is told, and the waiter decides.

-- ───────── how many portions of each dish the shelf can still cover ─────────
-- Keyed by menu_item_id, so the till can look a dish up as it draws it:
--   { "<uuid>": { "portions": 4, "short": [{ "name": "Chicken", "unit": "kg", "per": 0.25, "stock": 0.1 }] } }
--
-- A dish with no recipe never appears. That is not an oversight: an untracked dish moves no stock, so
-- there is nothing truthful to say about it, and guessing "0" would grey out half a menu that has
-- simply never been costed. Absent means unknown, and unknown means sell it.
create or replace function menu_stock() returns jsonb
language sql stable security definer set search_path = public as $$
  with per_ingredient as (
    select r.menu_item_id,
           i.name, i.unit, r.qty as per_portion, i.current_stock,
           -- portions this one ingredient allows; a shelf in deficit counts as none
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
           -- the dish can only be made as often as its scarcest ingredient allows
           least(min(portions), 9999)::int as portions,
           coalesce(
             jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'per', per_portion, 'stock', current_stock)
                       order by current_stock / per_portion)
               filter (where portions < 1),
             '[]'::jsonb) as short
    from per_ingredient
    group by menu_item_id
  )
  -- ::text on the key, as kots_needs does: the object key has to be text, not a uuid
  select coalesce(jsonb_object_agg(menu_item_id::text, jsonb_build_object('portions', portions, 'short', short)), '{}'::jsonb)
  from per_dish;
$$;

grant execute on function menu_stock() to authenticated;

-- The lookup above walks every recipe line for the property on each call, and the till calls it on
-- every visit to the order screen.
create index if not exists recipe_items_menu_idx on recipe_items(menu_item_id, ingredient_id);
