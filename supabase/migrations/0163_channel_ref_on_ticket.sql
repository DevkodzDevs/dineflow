-- 0163 — A channel order's reference goes on its ticket, not in the cooking request (2026-11-03, the owner's iPad: an amber
-- warning pill on Kitchen tickets reading "TEST-040011", "5-eeea", "0-2fee" — "please explain what this is", then "fix this").
--
-- Since 0004, accepting an online order (an aggregator's, the website's, a guest's table-QR round) copied the order's
-- reference — `coalesce(display_id, external_id)` — into `orders.notes`. Since 2026-10-30 the Kitchen reads `orders.notes` as
-- the whole order's cooking request ("Jain", "No onion") and shows it as an amber warning pill, so the reference looked like
-- an instruction to the cook. The guest's own note already rides on every dish (0145, `gnote`), so the order note only ever
-- held the reference.
--
-- 1. `kots.online_order_id` → online_orders(id), on delete set null: the ticket says which online order it came from. One
--    order can carry several QR rounds (0145: a table's next round joins its open order), so the link is on the ticket —
--    each round shows its own reference. Written only by accept_online_order_for (security definer) and by this file;
--    kots' existing policy (tenant_all) covers the column — no new table, no new policy. 0098's zz_same_property trigger is
--    rebuilt for kots so the new column is checked like its others: another property's online order is refused.
-- 2. accept_online_order_for (0146's body, live): a new order gets no `notes`; the ticket gets `online_order_id`.
-- 3. The tickets already made are linked (each accepted online order → the first ticket of its order, made after it was
--    placed, holding one of its dishes, not already linked), and an **open** order whose note is exactly one of its
--    references has that note cleared. Billed and cancelled orders are left as they were.

-- 1 · the ticket names its online order
alter table public.kots add column if not exists online_order_id uuid references public.online_orders(id) on delete set null;
create index if not exists kots_online_order_idx on public.kots(online_order_id) where online_order_id is not null;

do $$
declare t record;
begin
  for t in
    select c.conrelid::regclass as tbl,
           string_agg(format('%L, %L, %L', a.attname, ft.relname, fa.attname), ', ' order by a.attname) as args,
           string_agg(quote_ident(a.attname), ', ' order by a.attname) as cols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ft on ft.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
     where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and c.conrelid = 'public.kots'::regclass
       and a.attname <> 'restaurant_id' and a.atttypid = 'uuid'::regtype
       and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'restaurant_id' and not x.attisdropped)
     group by c.conrelid
  loop
    execute format('drop trigger if exists zz_same_property on %s', t.tbl);
    execute format('create trigger zz_same_property before insert or update of %s, restaurant_id on %s for each row execute function public._same_property(%s)',
                   t.cols, t.tbl, t.args);
  end loop;
end $$;

-- 2 · accepting: no reference in the cooking request; the ticket carries the link
create or replace function public.accept_online_order_for(p_id uuid, p_rid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype; gnote text; lnote text; own boolean;
begin
  -- for update: the second person to press Accept waits, then finds it already accepted
  select * into o from online_orders where id = p_id and restaurant_id = p_rid for update;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  gnote := nullif(left(trim(coalesce(o.raw->>'note', '')), 200), '');
  own := exists (select 1 from order_channels ch where ch.id = o.channel_id and ch.kind = 'website');
  -- 0145: a table's next round joins its open ticket while no bill has been printed on it
  if o.table_id is not null then
    select ord.id into oid from orders ord
     where ord.restaurant_id = p_rid and ord.table_id = o.table_id and ord.status = 'open'
       and not exists (select 1 from bills b where b.order_id = ord.id and b.status in ('unpaid', 'paid'))
     order by ord.created_at desc limit 1;
  end if;
  if oid is null then
    -- 0163: `notes` is the whole order's cooking request — the reference is on the ticket (kots.online_order_id)
    insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by)
      values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type else 'delivery'::order_type end, o.table_id, 'open',
              o.customer_name, o.customer_phone, null, o.channel_id, auth.uid())
      returning id into oid;
  end if;
  -- 0146: what the guest was quoted travels with the ticket — the offer's money off and the packing / delivery fee
  if own then
    update orders set discount_amount = discount_amount + greatest(0, coalesce((o.raw->>'discount')::numeric, 0)),
                      extra_charges = extra_charges + greatest(0, coalesce((o.raw->>'fee')::numeric, 0)),
                      offer_title = coalesce(nullif(o.raw->>'offer', ''), offer_title)
     where id = oid;
  end if;
  insert into kots(restaurant_id, order_id, kot_no, status, online_order_id)
    values (p_rid, oid, next_number('kot', p_rid), 'pending', o.id) returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    -- 0145: the guest's note for the kitchen rides on every dish of the ticket
    lnote := nullif(concat_ws(' · ', nullif(trim(coalesce(it->>'note', '')), ''), gnote), '');
    select * into mi from menu_items where restaurant_id = p_rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, mi.id, coalesce(nullif(it->>'name', ''), mi.name), coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, lnote, 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, lnote, 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    end if;
  end loop;
  if o.table_id is not null then update dining_tables set status = 'occupied' where id = o.table_id; end if;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $$;
revoke all on function public.accept_online_order_for(uuid, uuid) from public, anon, authenticated;   -- as 0146: reached through accept_online_order

-- 3 · the tickets already made, and the open orders' notes
do $$
declare oo record; k uuid;
begin
  for oo in select o.id, o.order_id, o.placed_at, o.created_at, o.items from online_orders o where o.order_id is not null order by o.created_at loop
    select kt.id into k from kots kt
     where kt.order_id = oo.order_id and kt.online_order_id is null
       and kt.created_at >= least(oo.placed_at, oo.created_at)
       and exists (select 1 from order_items oi, jsonb_array_elements(oo.items) x
                    where oi.kot_id = kt.id and oi.name_snapshot = x->>'name')
     order by kt.created_at, kt.kot_no limit 1;
    if k is not null then update kots set online_order_id = oo.id where id = k; end if;
  end loop;
end $$;

update public.orders o set notes = null
 where o.status = 'open' and o.notes is not null
   and exists (select 1 from public.online_orders oo where oo.order_id = o.id and o.notes = coalesce(oo.display_id, oo.external_id));

notify pgrst, 'reload schema';
