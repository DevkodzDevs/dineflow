-- 0167 — order_add_items' printed-bill refusal, worded for a table (2026-11-03). Since 0166 (no second open order on a table),
-- "start a separate order" points nowhere for a dine-in order: the till cannot send one. A table's order with a printed bill
-- now says "void it to add more"; a parcel or room order keeps "start a separate order". Otherwise 0165's body, unchanged.
-- No new table, column or policy.

create or replace function public.order_add_items(p_order_id uuid, p_items jsonb, p_note text default null,
                                                  p_client_id uuid default null, p_placed_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); o orders%rowtype; kid uuid; it jsonb; pl jsonb; c record; short text; rnote text;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to add' using errcode = 'P0001';
  end if;
  select * into o from orders where id = p_order_id and restaurant_id = rid for update;
  if not found then raise exception 'order not found'; end if;
  -- replayed from the offline queue: this round is already in
  if p_client_id is not null and exists (select 1 from kots where restaurant_id = rid and client_id = p_client_id) then return o.id; end if;
  if o.status <> 'open' then raise exception 'Order #% is closed — start a new order', o.order_no using errcode = 'P0001'; end if;
  if exists (select 1 from bills b where b.order_id = o.id and b.status in ('unpaid', 'paid')) then
    if o.table_id is not null then
      raise exception 'The bill for #% is printed — void it to add more', o.order_no using errcode = 'P0001';
    end if;
    raise exception 'The bill for #% is printed — start a separate order', o.order_no using errcode = 'P0001';
  end if;
  -- 0137: the pantry must cover what is ordered (never refused for a round that already happened offline)
  if p_placed_at is null and coalesce((select stock_block from restaurants where id = rid), true) then
    short := _stock_short(p_items);
    if short is not null then raise exception 'Not enough in the pantry: %', short using errcode = 'P0001'; end if;
  end if;
  rnote := nullif(left(trim(coalesce(p_note, '')), 200), '');
  for c in select distinct greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) as course from jsonb_array_elements(p_items) x order by 1 loop
    insert into kots(restaurant_id, order_id, kot_no, status, held, client_id)
      values (rid, o.id, next_number('kot'), 'pending', c.course > 1, p_client_id) returning id into kid;
    for it in select x from jsonb_array_elements(p_items) x where greatest(1, coalesce(nullif(x->>'course', '')::int, 1)) = c.course loop
      pl := price_line(rid, it);
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status,
                              variant_id, variant_name, addons, components, course)
        values (rid, o.id, kid, (pl->>'menu_item_id')::uuid, pl->>'name', (pl->>'price')::numeric,
                greatest(1, round((it->>'qty')::numeric)::int),
                nullif(concat_ws(' · ', nullif(trim(coalesce(it->>'notes', it->>'note', '')), ''), rnote), ''),
                'pending',
                nullif(pl->>'variant_id', '')::uuid, pl->>'variant_name', coalesce(pl->'addons', '[]'::jsonb), coalesce(pl->'components', '[]'::jsonb), c.course);
    end loop;
  end loop;
  if o.table_id is not null then update dining_tables set status = 'occupied' where id = o.table_id; end if;
  return o.id;
end $$;
revoke all on function public.order_add_items(uuid, jsonb, text, uuid, timestamptz) from public, anon;
grant execute on function public.order_add_items(uuid, jsonb, text, uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
