-- DineFlow v7.0 — Neighbours: a private, opt-in network across DineFlow properties in a district.
-- Nothing here works without a property switching each stream on, nothing identifies a neighbour,
-- and no figure is ever shown unless enough properties contributed to make it anonymous.
-- Run AFTER 0006.

-- How many properties must contribute before any pooled number is shown. Lower than this
-- and a client could work out a specific neighbour's costs, so we show nothing instead.
create or replace function network_min_contributors() returns int language sql immutable as $$ select 5 $$;

alter table restaurants
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists district text,
  add column if not exists pincode text,
  add column if not exists network_alias text;   -- e.g. "A resort in Kanyakumari" — never the real name

-- purchases need a price to pool; older rows fall back to the ingredient's cost
alter table stock_ledger add column if not exists unit_cost numeric(12,2);
-- the pantry's purchase entry now writes the paid price onto the ledger row and the ingredient
create or replace function purchase_to_ledger() returns trigger language plpgsql security definer as $$
begin
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, ref_id, unit_cost, created_by)
    values (new.restaurant_id, new.ingredient_id, new.qty, 'purchase', 'purchase', new.purchase_id, new.unit_cost, auth.uid());
  if new.unit_cost > 0 then update ingredients set cost_per_unit = new.unit_cost where id = new.ingredient_id; end if;
  return new;
end $$;

create table if not exists network_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  share_prices boolean not null default false,
  share_surplus boolean not null default false,
  share_labour boolean not null default false,
  share_demand boolean not null default false,
  radius_km integer not null default 40,
  joined_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ═══════════ helpers ═══════════
/** Straight-line km between two points. Good enough for "within 40 km". */
create or replace function km_between(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric) returns numeric
language sql immutable as $$
  select case when a_lat is null or b_lat is null then null else
    round((6371 * acos(least(1, greatest(-1,
      cos(radians(a_lat)) * cos(radians(b_lat)) * cos(radians(b_lng) - radians(a_lng)) + sin(radians(a_lat)) * sin(radians(b_lat))
    ))))::numeric, 1) end
$$;

/** Properties near me that share the given stream. Never returns names. */
create or replace function network_peers(p_stream text) returns table (restaurant_id uuid, km numeric)
language sql stable security definer set search_path = public as $$
  with me as (select r.id, r.lat, r.lng, r.district, coalesce(n.radius_km, 40) rad
              from restaurants r left join network_settings n on n.restaurant_id = r.id where r.id = auth_restaurant_id())
  select r.id, km_between(me.lat, me.lng, r.lat, r.lng)
  from restaurants r join network_settings s on s.restaurant_id = r.id, me
  where r.id <> me.id
    and r.membership in ('trial','active')
    and case p_stream when 'prices' then s.share_prices when 'surplus' then s.share_surplus
                      when 'labour' then s.share_labour when 'demand' then s.share_demand else false end
    and (
      (me.lat is not null and r.lat is not null and km_between(me.lat, me.lng, r.lat, r.lng) <= me.rad)
      or (me.lat is null and me.district is not null and r.district is not null and lower(r.district) = lower(me.district))
    )
$$;

/** Am I allowed to read a stream? Only if I contribute to it. */
create or replace function network_shares(p_stream text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case p_stream when 'prices' then share_prices when 'surplus' then share_surplus
    when 'labour' then share_labour when 'demand' then share_demand else false end
    from network_settings where restaurant_id = auth_restaurant_id()), false)
$$;

create or replace function network_join(p_prices boolean, p_surplus boolean, p_labour boolean, p_demand boolean, p_radius int default 40, p_alias text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if auth_role() not in ('owner','manager') then raise exception 'only the owner can change network sharing'; end if;
  insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
    values (rid, p_prices, p_surplus, p_labour, p_demand, greatest(5, least(150, p_radius)), now())
  on conflict (restaurant_id) do update set share_prices = excluded.share_prices, share_surplus = excluded.share_surplus,
    share_labour = excluded.share_labour, share_demand = excluded.share_demand, radius_km = excluded.radius_km,
    joined_at = coalesce(network_settings.joined_at, now()), updated_at = now();
  if p_alias is not null then update restaurants set network_alias = p_alias where id = rid; end if;
end $$;

create or replace function network_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', coalesce((select to_jsonb(n) from network_settings n where n.restaurant_id = auth_restaurant_id()), '{}'::jsonb),
    'located', (select lat is not null or district is not null from restaurants where id = auth_restaurant_id()),
    'district', (select district from restaurants where id = auth_restaurant_id()),
    'peers_prices', (select count(*) from network_peers('prices')),
    'peers_surplus', (select count(*) from network_peers('surplus')),
    'peers_labour', (select count(*) from network_peers('labour')),
    'peers_demand', (select count(*) from network_peers('demand')),
    'min_contributors', network_min_contributors()
  )
$$;

-- ═══════════ 1. What things actually cost around here ═══════════
/**
 * Pools *purchase* prices only. Menu prices are never shared — what a property charges guests
 * stays private, both because it is commercially theirs and because sharing selling prices
 * between competitors is not something a software vendor should facilitate.
 */
create or replace function network_prices(p_days int default 21) returns table (
  item text, unit text, my_price numeric, my_qty numeric, area_median numeric, area_low numeric, area_high numeric,
  contributors int, delta_pct numeric, weekly_excess numeric, samples int
) language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); minc int := network_min_contributors();
begin
  if not network_shares('prices') then return; end if;
  return query
  with peers as (select restaurant_id from network_peers('prices')),
  buys as (
    select rid_x.restaurant_id, lower(trim(i.name)) as item, i.unit::text as unit,
           coalesce(sl.unit_cost, i.cost_per_unit) price, sl.qty, sl.created_at
    from stock_ledger sl
    join ingredients i on i.id = sl.ingredient_id
    join (select restaurant_id from peers union select rid) rid_x on rid_x.restaurant_id = sl.restaurant_id
    where sl.reason = 'purchase' and sl.qty > 0 and sl.created_at > now() - make_interval(days => p_days)
      and coalesce(sl.unit_cost, i.cost_per_unit) > 0
  ),
  mine as (select buys.item, buys.unit, avg(buys.price) price, sum(buys.qty) / greatest(p_days / 7.0, 1) qty from buys where buys.restaurant_id = rid group by buys.item, buys.unit),
  area as (
    select buys.item, buys.unit, count(distinct buys.restaurant_id) contributors, count(*) samples,
      percentile_cont(0.5) within group (order by buys.price) med,
      percentile_cont(0.1) within group (order by buys.price) lo,
      percentile_cont(0.9) within group (order by buys.price) hi
    from buys where buys.restaurant_id <> rid group by buys.item, buys.unit
  )
  select m.item, m.unit, round(m.price::numeric, 2), round(m.qty::numeric, 2), round(a.med::numeric, 2), round(a.lo::numeric, 2), round(a.hi::numeric, 2),
    a.contributors::int, round(((m.price - a.med) / nullif(a.med, 0) * 100)::numeric, 1),
    round((greatest(0, m.price - a.med) * m.qty)::numeric, 0), a.samples::int
  from mine m join area a on a.item = m.item and a.unit = m.unit
  where a.contributors >= minc
  order by 10 desc, 1;
end $$;

-- ═══════════ 2. Surplus board ═══════════
do $$ begin create type surplus_status as enum ('open','claimed','collected','expired','cancelled'); exception when duplicate_object then null; end $$;
create table if not exists surplus_listings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete set null,
  item text not null, qty numeric(12,3) not null, unit text not null,
  best_before date, price numeric(12,2) not null default 0, note text,
  status surplus_status not null default 'open',
  claimed_by uuid references restaurants(id) on delete set null, claimed_at timestamptz,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists surplus_open_idx on surplus_listings(status, best_before);

create or replace function surplus_post(p_ingredient uuid, p_item text, p_qty numeric, p_unit text, p_best_before date, p_price numeric, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); lid uuid;
begin
  if not network_shares('surplus') then raise exception 'turn on surplus sharing first'; end if;
  insert into surplus_listings(restaurant_id, ingredient_id, item, qty, unit, best_before, price, note, created_by)
    values (rid, p_ingredient, p_item, p_qty, p_unit, p_best_before, coalesce(p_price,0), p_note, auth.uid()) returning id into lid;
  return lid;
end $$;

/** The board. Sellers stay anonymous until someone claims — then both sides see a phone number. */
create or replace function surplus_feed() returns table (
  id uuid, item text, qty numeric, unit text, best_before date, price numeric, note text, km numeric,
  who text, mine boolean, status text, contact text, claimed_by_me boolean
) language sql stable security definer set search_path = public as $$
  select l.id, l.item, l.qty, l.unit, l.best_before, l.price, l.note,
    (select p.km from network_peers('surplus') p where p.restaurant_id = l.restaurant_id),
    case when l.restaurant_id = auth_restaurant_id() then 'You'
         else coalesce(r.network_alias, initcap(coalesce(r.district, 'A property')) || ' · ' || r.property_type::text) end,
    l.restaurant_id = auth_restaurant_id(), l.status::text,
    case when l.restaurant_id = auth_restaurant_id() or l.claimed_by = auth_restaurant_id() then r.phone else null end,
    l.claimed_by = auth_restaurant_id()
  from surplus_listings l join restaurants r on r.id = l.restaurant_id
  where network_shares('surplus')
    and (l.restaurant_id = auth_restaurant_id() or l.restaurant_id in (select restaurant_id from network_peers('surplus')))
    and l.status in ('open','claimed') and (l.best_before is null or l.best_before >= current_date)
  order by l.best_before nulls last, l.created_at desc
$$;

create or replace function surplus_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); l surplus_listings%rowtype; ph text;
begin
  if not network_shares('surplus') then raise exception 'turn on surplus sharing first'; end if;
  select * into l from surplus_listings where id = p_id and status = 'open';
  if not found then raise exception 'already taken'; end if;
  if l.restaurant_id = rid then raise exception 'that is your own listing'; end if;
  update surplus_listings set status = 'claimed', claimed_by = rid, claimed_at = now() where id = p_id;
  select phone into ph from restaurants where id = l.restaurant_id;
  return jsonb_build_object('ok', true, 'contact', ph, 'item', l.item);
end $$;

create or replace function surplus_close(p_id uuid, p_status surplus_status) returns void
language sql security definer set search_path = public as $$
  update surplus_listings set status = p_status
  where id = p_id and (restaurant_id = auth_restaurant_id() or claimed_by = auth_restaurant_id())
$$;

-- ═══════════ 3. Standby labour ═══════════
create table if not exists labour_standby (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  labourer_id uuid not null references labourers(id) on delete cascade,
  for_date date not null default current_date,
  from_time time, to_time time, note text,
  status text not null default 'open',        -- open | booked | done | cancelled
  booked_by uuid references restaurants(id) on delete set null, booked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (labourer_id, for_date)
);

create or replace function standby_offer(p_labourer uuid, p_date date, p_from time, p_to time, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); sid uuid;
begin
  if not network_shares('labour') then raise exception 'turn on standby sharing first'; end if;
  insert into labour_standby(restaurant_id, labourer_id, for_date, from_time, to_time, note)
    values (rid, p_labourer, coalesce(p_date, current_date), p_from, p_to, p_note)
  on conflict (labourer_id, for_date) do update set from_time = excluded.from_time, to_time = excluded.to_time,
    note = excluded.note, status = 'open', booked_by = null, booked_at = null
  returning id into sid;
  return sid;
end $$;

/** Available hands nearby. First names and skills only until someone books. */
create or replace function standby_feed(p_date date default current_date) returns table (
  id uuid, name text, skill text, daily_wage numeric, km numeric, from_time time, to_time time, note text,
  who text, mine boolean, status text, contact text, verified boolean, days_worked int
) language sql stable security definer set search_path = public as $$
  select s.id,
    case when s.restaurant_id = auth_restaurant_id() or s.booked_by = auth_restaurant_id() then l.full_name
         else split_part(l.full_name, ' ', 1) end,
    l.skill, l.daily_wage,
    (select p.km from network_peers('labour') p where p.restaurant_id = s.restaurant_id),
    s.from_time, s.to_time, s.note,
    case when s.restaurant_id = auth_restaurant_id() then 'Your worker'
         else coalesce(r.network_alias, initcap(coalesce(r.district, 'A property')) || ' · ' || r.property_type::text) end,
    s.restaurant_id = auth_restaurant_id(), s.status,
    case when s.restaurant_id = auth_restaurant_id() or s.booked_by = auth_restaurant_id() then coalesce(l.phone, r.phone) else null end,
    l.id_last4 is not null,
    (select count(*)::int from labour_attendance a where a.labourer_id = l.id and a.work_date > current_date - 30)
  from labour_standby s join labourers l on l.id = s.labourer_id join restaurants r on r.id = s.restaurant_id
  where network_shares('labour') and s.for_date = p_date and s.status in ('open','booked')
    and (s.restaurant_id = auth_restaurant_id() or s.restaurant_id in (select restaurant_id from network_peers('labour')))
  order by s.status, l.skill
$$;

create or replace function standby_book(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); s labour_standby%rowtype; nm text; ph text;
begin
  if not network_shares('labour') then raise exception 'turn on standby sharing first'; end if;
  select * into s from labour_standby where id = p_id and status = 'open';
  if not found then raise exception 'already booked'; end if;
  if s.restaurant_id = rid then raise exception 'that is your own worker'; end if;
  update labour_standby set status = 'booked', booked_by = rid, booked_at = now() where id = p_id;
  select l.full_name, coalesce(l.phone, r.phone) into nm, ph from labourers l join restaurants r on r.id = l.restaurant_id where l.id = s.labourer_id;
  return jsonb_build_object('ok', true, 'name', nm, 'contact', ph);
end $$;

-- ═══════════ 4. Area demand signal ═══════════
/**
 * How busy the neighbourhood was last night compared with its own normal for that weekday.
 * This is the piece that makes the Tomorrow brief smarter than any one property's history:
 * a festival or a wedding season shows up here before it shows up in your own numbers.
 */
create or replace function network_demand(p_date date default (current_date - 1)) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare minc int := network_min_contributors(); dow int := extract(isodow from p_date);
  n int := 0; idx numeric := 1; last_n numeric; base_n numeric;
begin
  if not network_shares('demand') then return jsonb_build_object('available', false, 'reason', 'not sharing'); end if;
  select count(*) into n from network_peers('demand');
  if n < minc then return jsonb_build_object('available', false, 'reason', 'too few neighbours', 'peers', n, 'need', minc); end if;

  with peers as (select restaurant_id from network_peers('demand')),
  last_day as (select count(*)::numeric c from orders o join peers p on p.restaurant_id = o.restaurant_id
               where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date = p_date),
  baseline as (select count(*)::numeric / 8 c from orders o join peers p on p.restaurant_id = o.restaurant_id
               where o.status <> 'cancelled'
                 and (o.created_at at time zone 'Asia/Kolkata')::date in (
                   select g::date from generate_series(p_date - 56, p_date - 1, interval '1 day') g where extract(isodow from g) = dow))
  select last_day.c, baseline.c into last_n, base_n from last_day, baseline;

  if coalesce(base_n, 0) < 1 then return jsonb_build_object('available', false, 'reason', 'not enough area history', 'peers', n); end if;
  idx := round(last_n / base_n, 2);
  return jsonb_build_object('available', true, 'peers', n, 'date', p_date, 'index', idx,
    'label', case when idx >= 1.25 then 'busier than normal' when idx <= 0.8 then 'quieter than normal' else 'a normal ' || trim(to_char(p_date, 'Day')) end,
    'detail', n || ' properties nearby ran ' || round(abs(idx - 1) * 100) || '% ' || case when idx >= 1 then 'above' else 'below' end
              || ' their usual ' || trim(to_char(p_date, 'Day')) || '.');
end $$;

-- Fold the area signal into tomorrow's forecast (bounded, and only when the network says so)
create or replace function forecast_area_factor(p_date date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare d jsonb; f numeric := 1;
begin
  d := network_demand(p_date - 7);   -- the same weekday last week, area-wide
  if coalesce((d->>'available')::boolean, false) then
    f := greatest(0.85, least(1.2, 1 + ((d->>'index')::numeric - 1) * 0.5));   -- half weight, capped
  end if;
  return f;
exception when others then return 1; end $$;

-- ═══════════ RLS ═══════════
do $$ declare t text; begin
  foreach t in array array['network_settings','surplus_listings','labour_standby'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
  end loop;
end $$;
create policy tenant_all on network_settings for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on surplus_listings for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
create policy tenant_all on labour_standby for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on surplus_listings;
create trigger trg_set_rid before insert on surplus_listings for each row execute function set_restaurant_id();
drop trigger if exists trg_set_rid on labour_standby;
create trigger trg_set_rid before insert on labour_standby for each row execute function set_restaurant_id();

-- Rebuild forecast_day so it also listens to the neighbourhood.
create or replace function forecast_day(p_date date default (current_date + 1)) returns jsonb
language plpgsql security definer set search_path = public as $$   -- volatile: it builds a temp table
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
  delete from _hist;
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

-- purchases recorded from now on carry their own price, so the index stays honest
create or replace function record_purchase(p_ingredient uuid, p_qty numeric, p_unit_cost numeric, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, note, unit_cost, created_by)
    values (rid, p_ingredient, p_qty, 'purchase', p_note, p_unit_cost, auth.uid());
  if p_unit_cost > 0 then update ingredients set cost_per_unit = p_unit_cost where id = p_ingredient and restaurant_id = rid; end if;
end $$;
