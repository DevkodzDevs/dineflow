-- ═══════════ The Tomorrow brief, second fault ═══════════
-- 0024 made forecast_day volatile so it could build its temporary table. The next statement then
-- failed: "DELETE requires a WHERE clause". This database rejects an unqualified DELETE, and the
-- function cleared its scratch table with a bare "delete from _hist".
--
-- TRUNCATE empties the table just as completely, is not a DELETE so the guard does not apply, and
-- is cheaper besides. The table itself is kept: it is read twice, once for the averages and again
-- for the dish mix, so folding it into a single CTE would mean computing it twice.
--
-- This supersedes 0024. Both are kept rather than edited, because editing a migration that has
-- already run is what hid the original fault for so long.

create or replace function forecast_day(p_date date default (current_date + 1)) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype;
  n_samples int := 0; avg_covers numeric := 0; sd numeric := 0; avg_house numeric := 0;
  house_tmr int := 0; arr int := 0; dep int := 0; rooms_total int := 0;
  factor numeric := 1; area numeric := 1; predicted numeric := 0; conf numeric := 0; buf numeric;
  drivers jsonb := '[]'; dishes jsonb := '[]'; purchase jsonb := '[]'; cost numeric := 0;
  d record; total_hist_covers numeric := 0; basis text; dow int; dem jsonb;
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

  for d in
    select i.id, i.name, i.unit::text as unit, i.current_stock, i.cost_per_unit, sum(ri.qty * (x->>'qty')::numeric) as need
    from jsonb_array_elements(dishes) x
    join recipe_items ri on ri.menu_item_id = (x->>'id')::uuid
    join ingredients i on i.id = ri.ingredient_id
    where i.restaurant_id = rid and i.is_active
    group by i.id, i.name, i.unit, i.current_stock, i.cost_per_unit
  loop
    if d.need > d.current_stock then
      purchase := purchase || jsonb_build_object('id', d.id, 'name', d.name, 'unit', d.unit, 'need', round(d.need, 2),
        'have', round(d.current_stock, 2), 'buy', round(d.need - d.current_stock, 2), 'cost', round((d.need - d.current_stock) * d.cost_per_unit, 2));
      cost := cost + (d.need - d.current_stock) * d.cost_per_unit;
    end if;
  end loop;

  return jsonb_build_object('for_date', p_date, 'weekday', trim(to_char(p_date, 'Day')),
    'predicted_covers', predicted, 'low', greatest(0, round(predicted - greatest(sd, predicted * 0.12))),
    'high', round(predicted + greatest(sd, predicted * 0.12)), 'confidence', round(conf, 2), 'basis', basis, 'samples', n_samples,
    'in_house', house_tmr, 'arrivals', arr, 'departures', dep, 'rooms', rooms_total, 'area_factor', area, 'neighbourhood', dem,
    'drivers', drivers, 'dishes', dishes, 'purchase', purchase, 'est_purchase_cost', round(cost, 2), 'buffer_pct', r.prep_buffer_pct);
end $$;
