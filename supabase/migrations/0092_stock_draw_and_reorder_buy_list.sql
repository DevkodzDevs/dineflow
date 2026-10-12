-- 0092 · Stock leaves the pantry when the order reaches the kitchen — the owner's choice — and
--        Tomorrow's buy list carries whatever has slipped below its reorder level.
--
-- Since 0055 a dish drew its recipe from the pantry when the kitchen pressed "Start cooking" (or, at
-- the latest, when the bill was settled, which marks every line served). A kitchen that prints its
-- tickets and never touches the screen therefore showed stock on the shelf that was already in the
-- pan, for the whole of service. The owner wants the pantry to move the moment the order is sent.
--
-- restaurants.stock_draw decides: 'ticket' (default) draws the recipe when the line is inserted —
-- place_order and add_items insert lines as 'pending', so insert means "reached the kitchen"; a line
-- cancelled while still 'pending' is credited straight back (the food was never made). 'cook' is
-- the 0055 behaviour. Either way a line draws once only — the guard is the ledger's net for that
-- line, so a credited line can draw again if it is revived, and a property switching from 'cook'
-- to 'ticket' mid-service still draws its pending lines when they start cooking or are served.
--
-- forecast_day's purchase list used to hold only what tomorrow's cooking needs beyond the shelf.
-- Now any active ingredient whose shelf after tomorrow would be at or under its reorder level is
-- listed too, topped up to twice the reorder level; each line says why ('tomorrow' | 'reorder').
--
-- The leak report and report_summary sum the ledger (-sum(qty) for 'sale'), so a credit nets out.
-- RLS: no new table; restaurants is already tenant_all. consume_recipe runs as definer.

alter table restaurants add column if not exists stock_draw text not null default 'ticket';
alter table restaurants drop constraint if exists restaurants_stock_draw_check;
alter table restaurants add constraint restaurants_stock_draw_check check (stock_draw in ('ticket', 'cook'));

create or replace function consume_recipe() returns trigger
language plpgsql security definer set search_path = public as $$
declare mode text; net numeric;
begin
  if current_setting('dineflow.skip_consume', true) = 'on' then return new; end if;
  if new.menu_item_id is null then return new; end if;

  -- cancelled before the kitchen started it: whatever it drew goes back on the shelf
  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status = 'pending' then
    insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, note, created_by)
    select l.restaurant_id, l.ingredient_id, -sum(l.qty), 'sale', 'order_item', new.id, 'cancelled before cooking', auth.uid()
    from stock_ledger l
    where l.ref_type = 'order_item' and l.ref_id = new.id and l.reason = 'sale'
    group by l.restaurant_id, l.ingredient_id
    having sum(l.qty) < 0;
    return new;
  end if;
  if new.status = 'cancelled' then return new; end if;

  select r.stock_draw into mode from restaurants r where r.id = new.restaurant_id;
  if coalesce(mode, 'ticket') = 'cook' then
    -- the 0055 rule: not before the kitchen starts, and not again once it has
    if new.status = 'pending' then return new; end if;
    if tg_op = 'UPDATE' and old.status in ('preparing', 'ready', 'served') then return new; end if;
  end if;
  -- 'ticket': any insert, and any status change of a line that has not drawn yet

  -- once only, whatever path led here: the net of what this line has drawn and been credited
  select coalesce(sum(l.qty), 0) into net from stock_ledger l
  where l.ref_type = 'order_item' and l.ref_id = new.id and l.reason = 'sale';
  if net < 0 then return new; end if;

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
-- the trigger itself is unchanged: after insert or update of status on order_items (0055)

-- ───────── forecast_day: the buy list also carries what is below its reorder level ─────────
create or replace function forecast_day(p_date date default (current_date + 1)) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype;
  n_samples int := 0; avg_covers numeric := 0; sd numeric := 0; avg_house numeric := 0;
  house_tmr int := 0; arr int := 0; dep int := 0; rooms_total int := 0;
  factor numeric := 1; area numeric := 1; predicted numeric := 0; conf numeric := 0; buf numeric;
  drivers jsonb := '[]'; dishes jsonb := '[]'; purchase jsonb := '[]'; cost numeric := 0;
  d record; total_hist_covers numeric := 0; basis text; dow int; dem jsonb;
  buy numeric; low boolean;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into r from restaurants where id = rid;
  buf := 1 + r.prep_buffer_pct / 100;
  dow := extract(isodow from p_date);

  create temp table if not exists _hist (hd date, covers int, house int) on commit drop;
  truncate table _hist;   -- clears a leftover from an earlier call in the same transaction
  insert into _hist
  select g::date,
    (select count(*) from orders o where o.restaurant_id = rid and o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date = g::date),
    (select count(*) from bookings b where b.restaurant_id = rid and b.status in ('checked_in','checked_out') and b.check_in <= g::date and b.check_out > g::date)
  from generate_series(p_date - 56, p_date - 1, interval '1 day') g where extract(isodow from g) = dow;

  select count(*) filter (where _hist.covers > 0), coalesce(avg(_hist.covers) filter (where _hist.covers > 0), 0),
         coalesce(stddev_samp(_hist.covers) filter (where _hist.covers > 0), 0), coalesce(avg(_hist.house) filter (where _hist.covers > 0), 0),
         coalesce(sum(_hist.covers), 0)
    into n_samples, avg_covers, sd, avg_house, total_hist_covers from _hist;

  select count(*) into rooms_total from rooms where restaurant_id = rid;
  select count(*) into house_tmr from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_in <= p_date and check_out > p_date;
  select count(*) into arr from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_in = p_date;
  select count(*) into dep from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_out = p_date;

  if rooms_total > 0 and avg_house > 0.5 then
    factor := greatest(0.55, least(1.6, 0.55 + 0.45 * (house_tmr::numeric / avg_house)));
  end if;
  area := forecast_area_factor(p_date);
  dem := network_demand(p_date - 7);
  predicted := round(avg_covers * factor * area);

  if n_samples = 0 then
    predicted := round(house_tmr * 1.4);
    basis := case when rooms_total > 0
      then 'No sales history for this weekday yet, so this is based only on the ' || house_tmr || ' guest(s) staying tomorrow. It gets sharper after about four weeks.'
      else 'No sales history for this weekday yet. Take a first shift, and the brief starts predicting from next week.' end;
    conf := 0.15;
  else
    conf := least(0.95, (n_samples::numeric / 8) * (case when avg_covers > 0 then greatest(0.35, 1 - (sd / greatest(avg_covers, 1))) else 0.4 end));
    basis := 'Last ' || n_samples || ' ' || trim(to_char(p_date, 'Day')) || 's averaged ' || round(avg_covers) || ' covers'
      || case when rooms_total > 0 then ', with ' || round(avg_house) || ' guests in house; tomorrow you have ' || house_tmr else '' end || '.'
      || case when area <> 1 then ' Neighbouring properties ran ' || round(abs((dem->>'index')::numeric - 1) * 100) || '% '
              || case when area > 1 then 'above' else 'below' end || ' normal last ' || trim(to_char(p_date, 'Day')) || ', so this is nudged '
              || case when area > 1 then 'up' else 'down' end || '.' else '' end;
    if area <> 1 then conf := least(0.95, conf + 0.05); end if;
  end if;

  drivers := jsonb_build_array(
    jsonb_build_object('label', trim(to_char(p_date, 'Day')), 'detail', case when n_samples > 0 then round(avg_covers) || ' covers on an average ' || trim(to_char(p_date, 'Day')) else 'no history yet' end),
    jsonb_build_object('label', 'Guests in house', 'detail', house_tmr || case when rooms_total > 0 then ' of ' || rooms_total || ' rooms' else '' end),
    jsonb_build_object('label', 'Arrivals · departures', 'detail', arr || ' in · ' || dep || ' out'),
    case when coalesce((dem->>'available')::boolean, false)
      then jsonb_build_object('label', 'Neighbourhood', 'detail', round((dem->>'index')::numeric * 100) || '% of normal · ' || (dem->>'peers') || ' properties')
      else jsonb_build_object('label', 'Confidence', 'detail', round(conf * 100) || '% · ' || n_samples || ' comparable days') end
  );

  if total_hist_covers > 0 then
    for d in
      select mi.id, mi.name, sum(oi.qty) as qty
      from order_items oi join orders o on o.id = oi.order_id join menu_items mi on mi.id = oi.menu_item_id
      where oi.restaurant_id = rid and oi.status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date in (select hd from _hist)
      group by mi.id, mi.name having sum(oi.qty) > 0 order by sum(oi.qty) desc
    loop
      dishes := dishes || jsonb_build_object('id', d.id, 'name', d.name, 'qty', greatest(1, round(d.qty / total_hist_covers * predicted * buf)));
    end loop;
  end if;

  -- what tomorrow's cooking needs of each ingredient, by the recipes
  create temp table if not exists _need (id uuid, need numeric) on commit drop;
  truncate table _need;
  insert into _need
    select i.id, sum(ri.qty * (x->>'qty')::numeric)
    from jsonb_array_elements(dishes) x
    join recipe_items ri on ri.menu_item_id = (x->>'id')::uuid
    join ingredients i on i.id = ri.ingredient_id
    where i.restaurant_id = rid and i.is_active
    group by i.id;

  -- the list: short for tomorrow, or left at/under the reorder level by it. Buy what tomorrow needs,
  -- and where that leaves the shelf at the line, bring the shelf after tomorrow to twice the line.
  for d in
    select i.id, i.name, i.unit::text as unit, i.current_stock, i.cost_per_unit, i.reorder_level, coalesce(n.need, 0) as need
    from ingredients i left join _need n on n.id = i.id
    where i.restaurant_id = rid and i.is_active
      and (coalesce(n.need, 0) > i.current_stock
           or (i.reorder_level > 0 and i.current_stock - coalesce(n.need, 0) <= i.reorder_level))
    order by (coalesce(n.need, 0) > i.current_stock) desc, i.name
  loop
    low := d.reorder_level > 0 and d.current_stock - d.need <= d.reorder_level;
    buy := greatest(d.need - d.current_stock, case when low then d.need + d.reorder_level * 2 - d.current_stock else 0 end);
    buy := greatest(round(buy, 2), case when d.unit = 'pcs' then 1 else 0.01 end);
    purchase := purchase || jsonb_build_object('id', d.id, 'name', d.name, 'unit', d.unit, 'need', round(d.need, 2),
      'have', round(d.current_stock, 2), 'buy', buy, 'cost', round(buy * d.cost_per_unit, 2),
      'reorder', d.reorder_level, 'why', case when d.need > d.current_stock then 'tomorrow' else 'reorder' end);
    cost := cost + buy * d.cost_per_unit;
  end loop;

  return jsonb_build_object('for_date', p_date, 'weekday', trim(to_char(p_date, 'Day')),
    'predicted_covers', predicted, 'low', greatest(0, round(predicted - greatest(sd, predicted * 0.12))),
    'high', round(predicted + greatest(sd, predicted * 0.12)), 'confidence', round(conf, 2), 'basis', basis, 'samples', n_samples,
    'in_house', house_tmr, 'arrivals', arr, 'departures', dep, 'rooms', rooms_total, 'area_factor', area, 'neighbourhood', dem,
    'drivers', drivers, 'dishes', dishes, 'purchase', purchase, 'est_purchase_cost', round(cost, 2), 'buffer_pct', r.prep_buffer_pct);
end $$;
