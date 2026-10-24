-- 0137 — A dish the pantry cannot cover cannot be ordered (2026-10-24, the owner: "if the pantry stock is low for a product,
-- don't allow orders — it is the most important").
--
-- Until now the till only warned ("The pantry is short" → "Send anyway") and place_order never looked at stock. Now:
-- • restaurants.stock_block (default true) — the owner's switch, Settings → Kitchen: "Stop orders when the pantry is short".
-- • _stock_short(p_items) — for each dish on the ticket, the quantity asked against what menu_stock() says the recipes and
--   the pantry can make (combos through their parts); the dishes it cannot cover, as "Name (N left — Ingredient is out)",
--   or null. A dish with no recipe is never short (menu_stock does not count it).
-- • place_order refuses such a ticket with that message — the till, the kiosk and the table QR all come through it. An
--   order taken offline and synced later (p_placed_at set) is never refused: it already happened. Online orders accepted
--   from an aggregator are not touched (the platform has already taken the money).
-- Additive: one column, one new function, place_order rebuilt from its live definition with that one check before the insert.

alter table public.restaurants add column if not exists stock_block boolean not null default true;

create or replace function public._stock_short(p_items jsonb)
returns text
language plpgsql stable security definer set search_path = public as $$
declare ms jsonb := menu_stock(); msg text;
begin
  with want as (
    select (x->>'menu_item_id')::uuid as mid, sum(greatest(1, round(coalesce(nullif(x->>'qty', '')::numeric, 1))::int))::int as qty
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
    where nullif(x->>'menu_item_id', '') is not null
    group by 1
  )
  select string_agg(format('%s (%s left%s)', m.name, (ms->(w.mid::text)->>'portions')::int,
           case when jsonb_array_length(coalesce(ms->(w.mid::text)->'short', '[]'::jsonb)) > 0
                then ' — ' || (ms->(w.mid::text)->'short'->0->>'name') || ' is out' else '' end), ', ' order by m.name)
    into msg
  from want w join menu_items m on m.id = w.mid
  where ms ? (w.mid::text) and w.qty > (ms->(w.mid::text)->>'portions')::int;
  return msg;
end $$;
revoke all on function public._stock_short(jsonb) from public, anon;
grant execute on function public._stock_short(jsonb) to authenticated;

-- place_order, rebuilt from the live definition with the one check added
CREATE OR REPLACE FUNCTION public.place_order(p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_placed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_promise boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; oid uuid; kid uuid; it jsonb; pl jsonb; c record;
  placed timestamptz; pm integer := null; pp numeric := null; due timestamptz := null; short text;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  -- 0098: the table must be this property's (it is set occupied below)
  if p_table_id is not null and not exists (select 1 from dining_tables where id = p_table_id and restaurant_id = rid) then
    raise exception 'table not found';
  end if;
  -- 0137: the pantry must cover what is ordered (the owner's switch, on by default). An order taken offline and synced
  -- now (p_placed_at set) has already happened, so it is never refused.
  if p_placed_at is null and coalesce((select stock_block from restaurants where id = rid), true) then
    short := _stock_short(p_items);
    if short is not null then raise exception 'Not enough in the pantry: %', short using errcode = 'P0001'; end if;
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
end $function$;
