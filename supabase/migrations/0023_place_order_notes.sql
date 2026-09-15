-- ═══════════ "Send to kitchen" could not save an order ═══════════
-- The live place_order inserted into order_items(… note …). The column is "notes", so every
-- attempt failed with: column "note" of relation "order_items" does not exist.
--
-- Why the file looked right while the database was wrong: scripts/migrate.mjs records each
-- migration by filename and skips it thereafter. 0004 was applied while it still said "note";
-- the file was corrected afterwards, so the correction never reached an existing database.
-- The lesson is that an applied migration must never be edited in place — a new file has to
-- carry the fix, which is what this one does.
--
-- It also reads the wrong key out of the item payload. The app sends {menu_item_id, qty, notes}
-- but the function looked for 'note', so a waiter's "less spicy" was dropped even when the
-- insert happened to work. Both keys are accepted here so orders already sitting in the offline
-- queue, whichever shape they were written in, still replay correctly.

create or replace function place_order(
  p_table_id uuid, p_type order_type, p_items jsonb, p_customer jsonb default '{}',
  p_note text default null, p_client_id uuid default null, p_placed_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if p_client_id is not null then
    select id into oid from orders where restaurant_id = rid and client_id = p_client_id;
    if found then return oid; end if;                      -- replayed from the offline queue
  end if;
  insert into orders(restaurant_id, order_no, table_id, type, status, customer_name, customer_phone, notes, created_by, client_id, created_at, synced_at)
    values (rid, next_number('order'), p_table_id, p_type, 'open', p_customer->>'name', p_customer->>'phone', p_note, auth.uid(), p_client_id, coalesce(p_placed_at, now()), now())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (rid, oid, next_number('kot'), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it->>'menu_item_id')::uuid and restaurant_id = rid;
    if not found then raise exception 'dish not found'; end if;
    insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status)
      values (rid, oid, kid, mi.id, mi.name, mi.price,
              greatest(1, round((it->>'qty')::numeric)::int),
              nullif(coalesce(it->>'notes', it->>'note'), ''),
              'pending');
  end loop;
  if p_table_id is not null then update dining_tables set status = 'occupied' where id = p_table_id; end if;
  return oid;
end $$;
