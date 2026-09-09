-- DineFlow v6.0 — the Tomorrow brief.
-- Predicts tomorrow's covers from your own bookings + sales history, turns that into a
-- kitchen prep sheet and a market list, and grades itself the next day. Run AFTER 0005.

alter table restaurants
  add column if not exists prep_buffer_pct numeric(5,2) not null default 10,   -- cook this much extra
  add column if not exists brief_time time not null default '21:30',            -- when the brief is generated
  add column if not exists brief_whatsapp text;                                 -- owner's number for the share text

create table if not exists forecast_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  for_date date not null,
  generated_at timestamptz not null default now(),
  predicted_covers integer not null default 0,
  low_covers integer not null default 0,
  high_covers integer not null default 0,
  confidence numeric(4,2) not null default 0,          -- 0..1
  basis text,                                          -- plain-language reason
  in_house integer not null default 0, arrivals integer not null default 0, departures integer not null default 0,
  drivers jsonb not null default '[]',                 -- [{label, detail}]
  dishes jsonb not null default '[]',                  -- [{id,name,qty,unit}]
  purchase jsonb not null default '[]',                -- [{id,name,unit,need,have,buy,cost}]
  est_purchase_cost numeric(12,2) not null default 0,
  actual_covers integer, actual_sales numeric(12,2), graded_at timestamptz,
  chef_notes jsonb not null default '{}',              -- {dish_id: actually_made}
  unique (restaurant_id, for_date)
);
create index if not exists forecast_date_idx on forecast_runs(restaurant_id, for_date desc);

/**
 * The forecast itself. Pure read — safe to call as often as you like.
 * Looks at the same weekday over the last 8 weeks, scales by how full the rooms are
 * tomorrow compared with those days, then works out dishes and ingredients from recipes.
 */
create or replace function forecast_day(p_date date default (current_date + 1)) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype;
  hist record; n_samples int := 0; avg_covers numeric := 0; sd numeric := 0; avg_house numeric := 0;
  house_tmr int := 0; arr int := 0; dep int := 0; rooms_total int := 0;
  factor numeric := 1; predicted numeric := 0; conf numeric := 0; buf numeric;
  drivers jsonb := '[]'; dishes jsonb := '[]'; purchase jsonb := '[]'; cost numeric := 0;
  d record; total_hist_covers numeric := 0; basis text; dow int;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into r from restaurants where id = rid;
  buf := 1 + r.prep_buffer_pct / 100;
  dow := extract(isodow from p_date);

  -- ── 1. history: the same weekday, last 8 occurrences, covers + how full we were ──
  create temp table if not exists _hist (d date, covers int, house int) on commit drop;
  delete from _hist;
  insert into _hist
  select g::date,
    (select count(*) from orders o where o.restaurant_id = rid and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Kolkata')::date = g::date),
    (select count(*) from bookings b where b.restaurant_id = rid and b.status in ('checked_in','checked_out')
        and b.check_in <= g::date and b.check_out > g::date)
  from generate_series(p_date - 56, p_date - 1, interval '1 day') g
  where extract(isodow from g) = dow;

  select count(*) filter (where covers > 0), coalesce(avg(covers) filter (where covers > 0), 0),
         coalesce(stddev_samp(covers) filter (where covers > 0), 0), coalesce(avg(house) filter (where covers > 0), 0),
         coalesce(sum(covers), 0)
    into n_samples, avg_covers, sd, avg_house, total_hist_covers from _hist;

  -- ── 2. what we already know about tomorrow, from the bookings ──
  select count(*) into rooms_total from rooms where restaurant_id = rid;
  select count(*) into house_tmr from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_in <= p_date and check_out > p_date;
  select count(*) into arr from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_in = p_date;
  select count(*) into dep from bookings where restaurant_id = rid and status in ('reserved','checked_in') and check_out = p_date;

  -- ── 3. combine: rooms move the number, history sets the base ──
  if rooms_total > 0 and avg_house > 0.5 then
    factor := greatest(0.55, least(1.6, 0.55 + 0.45 * (house_tmr::numeric / avg_house)));
  end if;
  predicted := round(avg_covers * factor);

  if n_samples = 0 then
    -- brand new: predict only what the rooms guarantee, and say so
    predicted := round(house_tmr * 1.4);
    basis := case when rooms_total > 0
      then 'No sales history for this weekday yet, so this is based only on the ' || house_tmr || ' guest(s) staying tomorrow. It gets sharper after about four weeks.'
      else 'No sales history for this weekday yet. Take a first shift, and the brief starts predicting from next week.' end;
    conf := 0.15;
  else
    conf := least(0.95, (n_samples::numeric / 8) * (case when avg_covers > 0 then greatest(0.35, 1 - (sd / greatest(avg_covers, 1))) else 0.4 end));
    basis := 'Last ' || n_samples || ' ' || to_char(p_date, 'Day') || 's averaged ' || round(avg_covers) || ' covers'
      || case when rooms_total > 0 then ', with ' || round(avg_house) || ' guests in house; tomorrow you have ' || house_tmr else '' end || '.';
  end if;

  drivers := jsonb_build_array(
    jsonb_build_object('label', to_char(p_date, 'FMDay'), 'detail', case when n_samples > 0 then round(avg_covers) || ' covers on an average ' || trim(to_char(p_date, 'Day')) else 'no history yet' end),
    jsonb_build_object('label', 'Guests in house', 'detail', house_tmr || case when rooms_total > 0 then ' of ' || rooms_total || ' rooms' else '' end),
    jsonb_build_object('label', 'Arrivals · departures', 'detail', arr || ' in · ' || dep || ' out'),
    jsonb_build_object('label', 'Confidence', 'detail', round(conf * 100) || '% · ' || n_samples || ' comparable days')
  );

  -- ── 4. dishes: each dish's share of historical covers, scaled to the prediction ──
  if total_hist_covers > 0 then
    for d in
      select mi.id, mi.name, sum(oi.qty) as qty
      from order_items oi join orders o on o.id = oi.order_id join menu_items mi on mi.id = oi.menu_item_id
      where oi.restaurant_id = rid and oi.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Kolkata')::date in (select d from _hist)
      group by mi.id, mi.name having sum(oi.qty) > 0 order by sum(oi.qty) desc
    loop
      dishes := dishes || jsonb_build_object('id', d.id, 'name', d.name,
        'qty', greatest(1, round(d.qty / total_hist_covers * predicted * buf)));
    end loop;
  end if;

  -- ── 5. ingredients: recipes × predicted dishes, minus what's already in the pantry ──
  for d in
    select i.id, i.name, i.unit::text as unit, i.current_stock, i.cost_per_unit,
      sum(ri.qty * (x->>'qty')::numeric) as need
    from jsonb_array_elements(dishes) x
    join recipe_items ri on ri.menu_item_id = (x->>'id')::uuid
    join ingredients i on i.id = ri.ingredient_id
    where i.restaurant_id = rid and i.is_active
    group by i.id, i.name, i.unit, i.current_stock, i.cost_per_unit
  loop
    if d.need > d.current_stock then
      purchase := purchase || jsonb_build_object('id', d.id, 'name', d.name, 'unit', d.unit,
        'need', round(d.need, 2), 'have', round(d.current_stock, 2),
        'buy', round(d.need - d.current_stock, 2), 'cost', round((d.need - d.current_stock) * d.cost_per_unit, 2));
      cost := cost + (d.need - d.current_stock) * d.cost_per_unit;
    end if;
  end loop;

  return jsonb_build_object(
    'for_date', p_date, 'weekday', trim(to_char(p_date, 'Day')),
    'predicted_covers', predicted,
    'low', greatest(0, round(predicted - greatest(sd, predicted * 0.12))),
    'high', round(predicted + greatest(sd, predicted * 0.12)),
    'confidence', round(conf, 2), 'basis', basis, 'samples', n_samples,
    'in_house', house_tmr, 'arrivals', arr, 'departures', dep, 'rooms', rooms_total,
    'drivers', drivers, 'dishes', dishes, 'purchase', purchase,
    'est_purchase_cost', round(cost, 2), 'buffer_pct', r.prep_buffer_pct
  );
end $$;

/** Freeze tonight's brief so tomorrow we can grade it honestly. */
create or replace function save_forecast(p_date date default (current_date + 1), p_covers integer default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); f jsonb; fid uuid; pred int;
begin
  f := forecast_day(p_date);
  pred := coalesce(p_covers, (f->>'predicted_covers')::int);
  insert into forecast_runs(restaurant_id, for_date, predicted_covers, low_covers, high_covers, confidence, basis,
      in_house, arrivals, departures, drivers, dishes, purchase, est_purchase_cost)
    values (rid, p_date, pred, (f->>'low')::int, (f->>'high')::int, (f->>'confidence')::numeric, f->>'basis',
      (f->>'in_house')::int, (f->>'arrivals')::int, (f->>'departures')::int, f->'drivers', f->'dishes', f->'purchase', (f->>'est_purchase_cost')::numeric)
  on conflict (restaurant_id, for_date) do update set
    generated_at = now(), predicted_covers = excluded.predicted_covers, low_covers = excluded.low_covers, high_covers = excluded.high_covers,
    confidence = excluded.confidence, basis = excluded.basis, in_house = excluded.in_house, arrivals = excluded.arrivals,
    departures = excluded.departures, drivers = excluded.drivers, dishes = excluded.dishes, purchase = excluded.purchase,
    est_purchase_cost = excluded.est_purchase_cost
  returning id into fid;
  return fid;
end $$;

/** Fill in what actually happened, for every past brief that hasn't been graded. */
create or replace function grade_forecasts() returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); f record; n int := 0;
begin
  for f in select * from forecast_runs where restaurant_id = rid and for_date < current_date and graded_at is null loop
    update forecast_runs set
      actual_covers = (select count(*) from orders o where o.restaurant_id = rid and o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date = f.for_date),
      actual_sales = coalesce((select sum(total) from bills b where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = f.for_date), 0),
      graded_at = now()
    where id = f.id;
    n := n + 1;
  end loop;
  return n;
end $$;

/** How well the brief has been doing — shown to the owner so they know whether to trust it. */
create or replace function forecast_scorecard(p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with g as (select * from forecast_runs where restaurant_id = auth_restaurant_id() and actual_covers is not null and for_date >= current_date - p_days)
  select jsonb_build_object(
    'days', (select count(*) from g),
    'accuracy', coalesce((select round(100 - avg(abs(actual_covers - predicted_covers)::numeric / greatest(actual_covers, 1) * 100)) from g), null),
    'within_range', coalesce((select round(count(*) filter (where actual_covers between low_covers and high_covers)::numeric / greatest(count(*), 1) * 100) from g), null),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('date', for_date, 'predicted', predicted_covers, 'actual', actual_covers) order by for_date desc)
                        from (select * from g order by for_date desc limit 14) x), '[]')
  )
$$;

/** The chef writes back what was actually made — that is what teaches the next brief. */
create or replace function record_chef_notes(p_date date, p_notes jsonb) returns void
language sql security definer set search_path = public as $$
  update forecast_runs set chef_notes = p_notes where restaurant_id = auth_restaurant_id() and for_date = p_date
$$;

/** Turn the shortfall list into a real purchase, in one press. */
create or replace function buy_purchase_list(p_date date, p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, note, created_by)
      values (rid, (it->>'id')::uuid, (it->>'buy')::numeric, 'purchase', 'Tomorrow brief · ' || p_date, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

alter table forecast_runs enable row level security;
drop policy if exists tenant_all on forecast_runs;
create policy tenant_all on forecast_runs for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on forecast_runs;
create trigger trg_set_rid before insert on forecast_runs for each row execute function set_restaurant_id();
