-- 0145 · A table's QR order, start to end (2026-10-27, the owner: "the kitchen note does not show in the kitchen; follow every
-- table order from the order to the paid bill"). Additive: two functions replaced, no table or policy changed.
--
-- 1. accept_online_order_for: the guest's "Note for the kitchen" (online_orders.raw->>'note') was never carried over — the
--    order's notes took the reference and the dishes took nothing, so the kitchen never saw "Extra spicy". It now goes on
--    every dish of the ticket (after the dish's own note, if any), which is where the kitchen screen and the printed KOT
--    read notes. And a table that already has an open ticket with no bill yet gets the new dishes on that ticket, as a
--    new KOT — a second round from the QR was a second order on the same table: the floor showed only the first and the
--    table ended with two bills. A table whose bill is already printed or paid still gets a new order.
-- 2. dine_table_orders: two more stages after served — 'bill' (a bill printed, not paid) and 'paid' — and the bill's total.

create or replace function public.accept_online_order_for(p_id uuid, p_rid uuid)
returns uuid language plpgsql security definer set search_path = public as $function$
declare o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype; gnote text; lnote text;
begin
  -- for update: the second person to press Accept waits, then finds it already accepted
  select * into o from online_orders where id = p_id and restaurant_id = p_rid for update;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  gnote := nullif(left(trim(coalesce(o.raw->>'note', '')), 200), '');
  -- 0145: a table's next round joins its open ticket while no bill has been printed on it
  if o.table_id is not null then
    select ord.id into oid from orders ord
     where ord.restaurant_id = p_rid and ord.table_id = o.table_id and ord.status = 'open'
       and not exists (select 1 from bills b where b.order_id = ord.id and b.status in ('unpaid', 'paid'))
     order by ord.created_at desc limit 1;
  end if;
  if oid is null then
    insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by)
      values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type else 'delivery'::order_type end, o.table_id, 'open',
              o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
      returning id into oid;
  end if;
  insert into kots(restaurant_id, order_id, kot_no, status) values (p_rid, oid, next_number('kot', p_rid), 'pending') returning id into kid;
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
end $function$;

create or replace function public.dine_table_orders(p_slug text, p_table text, p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'ref', o.display_id, 'at', o.created_at, 'total', o.gross, 'order_no', ord.order_no,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', (i->>'qty')::numeric)), '[]'::jsonb) from jsonb_array_elements(o.items) i),
      'n', coalesce(s.n, 0), 'ready', coalesce(s.ready, 0) + coalesce(s.served, 0), 'served', coalesce(s.served, 0), 'bill', bl.total,
      'stage', case
        when o.status::text in ('rejected', 'cancelled') or ord.status::text = 'cancelled' then 'rejected'
        when o.order_id is null then 'sent'
        when bl.paid then 'paid'
        when bl.total is not null then 'bill'
        when coalesce(s.n, 0) = 0 then 'accepted'
        when s.served = s.n then 'served'
        when s.ready + s.served = s.n then 'ready'
        when s.cooking + s.ready + s.served > 0 then 'cooking'
        else 'accepted' end) as x
    from online_orders o
    join dining_tables t on t.id = o.table_id and t.qr_token = p_table
    join restaurants r on r.id = o.restaurant_id and r.booking_slug = p_slug
    left join orders ord on ord.id = o.order_id
    left join lateral (
      select count(*) filter (where i.status <> 'cancelled') as n, count(*) filter (where i.status = 'preparing') as cooking,
             count(*) filter (where i.status = 'ready') as ready, count(*) filter (where i.status = 'served') as served
        from order_items i where i.order_id = o.order_id) s on true
    left join lateral (
      select bool_or(b.status = 'paid') as paid, sum(b.total) filter (where b.status <> 'void') as total
        from bills b where b.order_id = o.order_id and b.status <> 'void') bl on true
    where p_table is not null and o.id = any(p_ids[1:10]) and o.created_at > now() - interval '12 hours'
  ) q
$$;
revoke all on function public.dine_table_orders(text, text, uuid[]) from public;
grant execute on function public.dine_table_orders(text, text, uuid[]) to anon, authenticated;
