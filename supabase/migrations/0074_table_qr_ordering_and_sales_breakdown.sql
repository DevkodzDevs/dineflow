-- 0074 · Ordering from the table by QR, and the sales breakdown.
--
-- table QR · every table gets a code. A guest scans it, sees the menu on their phone, and what they
--            order lands on that table — in the online-orders queue, or straight in the kitchen when
--            the website channel is set to accept on its own. No address, no delivery fee, no app
--            to install, and the property need not be listed on the public directory for it to work.
-- breakdown · what the reports could not yet say: sales by category, by hour, by order type, by
--             cashier; discounts, coupons and points given; lines cancelled; the add-ons and sizes
--             that sell. One call, already added up, like report_summary.

-- ───────── the code on the table ─────────
alter table dining_tables add column if not exists qr_token text;
update dining_tables set qr_token = encode(gen_random_bytes(9), 'hex') where qr_token is null;
alter table dining_tables alter column qr_token set default encode(gen_random_bytes(9), 'hex');
create unique index if not exists dining_tables_qr_idx on dining_tables(qr_token);
alter table online_orders add column if not exists table_id uuid references dining_tables(id) on delete set null;

-- ───────── the storefront, reached from a table ─────────
-- A valid table code opens the menu even for a property that is not on the public directory.
drop function if exists dine_storefront(text);
create or replace function dine_storefront(p_slug text, p_table text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'tagline', r.tagline,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'phone', r.phone, 'district', r.district, 'photos', to_jsonb(r.photos), 'policies', r.policies,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'gst_rate', r.gst_rate, 'room_gst_rate', r.room_gst_rate,
    'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
    'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
    'min_order', r.min_order, 'delivery_fee', r.delivery_fee, 'packing_charge', r.packing_charge,
    'open_now', (current_time between r.opens_at and r.closes_at),
    'table', (select jsonb_build_object('id', t.id, 'name', t.name, 'zone', t.zone) from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table and p_table is not null),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available,
                    'is_combo', m.is_combo,
                    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'is_default', v.is_default) order by v.sort_order, v.name)
                                          from menu_variants v where v.menu_item_id = m.id and v.is_active), '[]'::jsonb),
                    'addon_groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min', g.min_select, 'max', g.max_select,
                                        'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_veg', a.is_veg) order by a.sort_order, a.name)
                                                            from addons a where a.group_id = g.id and a.is_active and a.is_available), '[]'::jsonb)) order by g.sort_order, g.name)
                                              from addon_groups g join menu_item_addon_groups l on l.group_id = g.id where l.menu_item_id = m.id and g.is_active), '[]'::jsonb),
                    'components', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'qty', ci.qty) order by x.name)
                                            from combo_items ci join menu_items x on x.id = ci.menu_item_id where ci.combo_id = m.id), '[]'::jsonb)
                  ) order by m.name)
                           from menu_items m where m.category_id = c.id and m.is_active), '[]')) order by c.sort_order)
      from categories c where c.restaurant_id = r.id), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'value', o.value, 'scope', o.scope, 'min_order', o.min_order, 'code', o.code, 'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)))
      from offers o where o.restaurant_id = r.id and o.is_active and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
      from (select * from reviews where restaurant_id = r.id order by created_at desc limit 20) v), '[]'))
  from restaurants r
  where r.booking_slug = p_slug and r.membership in ('trial','active')
    and (r.is_listed or exists (select 1 from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table))
$$;
grant execute on function dine_storefront(text, text) to anon, authenticated;

-- ───────── accepting an online order, from the screen or straight from the table ─────────
create or replace function accept_online_order_for(p_id uuid, p_rid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; oid uuid; kid uuid; it jsonb; mi menu_items%rowtype;
begin
  select * into o from online_orders where id = p_id and restaurant_id = p_rid;
  if not found then raise exception 'order not found'; end if;
  if o.order_id is not null then return o.order_id; end if;
  insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by)
    values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type else 'delivery'::order_type end, o.table_id, 'open',
            o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
    returning id into oid;
  insert into kots(restaurant_id, order_id, kot_no, status) values (p_rid, oid, next_number('kot', p_rid), 'pending') returning id into kid;
  for it in select * from jsonb_array_elements(o.items) loop
    select * into mi from menu_items where restaurant_id = p_rid and id = nullif(it->>'menu_item_id','')::uuid;
    if found then
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, mi.id, coalesce(nullif(it->>'name', ''), mi.name), coalesce((it->>'price')::numeric, mi.price), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    else
      insert into order_items(restaurant_id, order_id, kot_id, menu_item_id, name_snapshot, price_snapshot, qty, notes, status, variant_name, addons, components)
        values (p_rid, oid, kid, null, it->>'name', coalesce((it->>'price')::numeric, 0), (it->>'qty')::numeric, it->>'note', 'pending',
                it->>'variant_name', coalesce(it->'addons', '[]'::jsonb), coalesce(it->'components', '[]'::jsonb));
    end if;
  end loop;
  if o.table_id is not null then update dining_tables set status = 'occupied' where id = o.table_id; end if;
  update online_orders set status = 'accepted', order_id = oid where id = o.id;
  return oid;
end $$;

create or replace function accept_online_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return accept_online_order_for(p_id, auth_restaurant_id());
end $$;

-- ───────── the guest's order, now also from a table ─────────
drop function if exists dine_order(text, jsonb, jsonb, text, text, uuid);
create or replace function dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text default 'delivery', p_note text default null, p_offer uuid default null, p_table text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
begin
  select * into r from restaurants where booking_slug = p_slug and membership in ('trial','active');
  if not found then raise exception 'this place is not taking orders'; end if;
  rid := r.id;
  if p_mode = 'dine_in' then
    select * into t from dining_tables where restaurant_id = rid and qr_token = p_table and p_table is not null;
    if not found then raise exception 'scan the code on your table to order'; end if;
    if not r.dining_enabled then raise exception 'ordering at the table is not switched on here'; end if;
  else
    if not r.is_listed then raise exception 'this place is not taking orders'; end if;
    if p_mode = 'delivery' and not r.delivery_enabled then raise exception 'delivery is not available here'; end if;
    if p_mode = 'takeaway' and not r.takeaway_enabled then raise exception 'takeaway is not available here'; end if;
  end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select m.is_active and m.is_available into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := greatest(1, (it->>'qty')::numeric);
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', it->>'note',
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if p_mode <> 'dine_in' and sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active
      and scope in (case when p_mode = 'dine_in' then 'dining' else 'delivery' end, 'both') and sub >= min_order;
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  -- at the table there is nothing to pack and nothing to deliver
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + case when p_mode = 'dine_in' then 0 else r.packing_charge end;
  tot := round(sub - disc + fee + round((sub - disc) * r.gst_rate / 100, 2));

  select * into ch from order_channels where restaurant_id = rid and kind = 'website' limit 1;
  if not found then
    insert into order_channels(restaurant_id, kind, label, outlet_ref, commission_pct, is_live)
      values (rid, 'website', 'My website', 'storefront', 0, true) returning * into ch;
  end if;
  ext := case when p_mode = 'dine_in' then 'TBL-' else 'WEB-' end || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at, table_id)
    values (rid, ch.id, ext, right(ext, 6), p_guest->>'full_name', p_guest->>'phone',
            case when p_mode = 'dine_in' then 'Table ' || t.name else p_guest->>'address' end,
            items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', p_note, 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name), now(), t.id)
    returning id into oid;
  -- a table order goes straight to the kitchen when the website channel accepts on its own
  if p_mode = 'dine_in' and ch.auto_accept then
    accepted := accept_online_order_for(oid, rid);
    select order_no into ono from orders where id = accepted;
  end if;
  return jsonb_build_object('ok', true, 'id', oid, 'ref', right(ext, 6), 'name', r.name, 'phone', r.phone,
    'subtotal', sub, 'discount', disc, 'fee', fee, 'total', tot, 'mode', p_mode, 'table', t.name, 'accepted', accepted is not null, 'order_no', ono,
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end);
end $$;
grant execute on function dine_order(text, jsonb, jsonb, text, text, uuid, text) to anon, authenticated;

-- ───────── the sales breakdown ─────────
create or replace function sales_breakdown(p_days integer default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  win as (select now() - make_interval(days => greatest(1, p_days)) as since),
  b as (select b.* from bills b, rid, win where b.restaurant_id = rid.id and b.status = 'paid' and b.paid_at >= win.since),
  oi as (
    select oi.*, o.type as order_type, b.paid_at
    from order_items oi join orders o on o.id = oi.order_id join b on b.order_id = o.id
    where oi.status <> 'cancelled'
  )
  select jsonb_build_object(
    'days', greatest(1, p_days),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'rev', rev, 'qty', qty) order by rev desc) from (
        select coalesce(c.name, 'Uncategorised') as name, sum(oi.price_snapshot * oi.qty) as rev, sum(oi.qty) as qty
        from oi left join menu_items m on m.id = oi.menu_item_id left join categories c on c.id = m.category_id group by 1) x), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('h', h, 'rev', rev, 'bills', n) order by h) from (
        select extract(hour from (paid_at at time zone 'Asia/Kolkata'))::int as h, sum(total) as rev, count(*) as n from b group by 1) x), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('type', t, 'rev', rev, 'bills', n) order by rev desc) from (
        select o.type::text as t, sum(b.total) as rev, count(*) as n from b join orders o on o.id = b.order_id group by 1) x), '[]'::jsonb),
    'by_cashier', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'rev', rev, 'bills', n) order by rev desc) from (
        select coalesce(p.full_name, '—') as name, sum(b.total) as rev, count(*) as n from b left join profiles p on p.id = b.created_by group by 1) x), '[]'::jsonb),
    'discounts', (select jsonb_build_object(
        'bills', count(*) filter (where discount_amount > 0), 'amount', coalesce(sum(discount_amount), 0),
        'coupons', count(*) filter (where coupon_code is not null), 'points_redeemed', coalesce(sum(points_redeemed), 0), 'points_earned', coalesce(sum(points_earned), 0),
        'promise_waived', coalesce(sum(promise_waived), 0)) from b),
    'cancelled', (select jsonb_build_object('lines', count(*), 'value', coalesce(sum(oi2.price_snapshot * oi2.qty), 0))
        from order_items oi2, rid, win where oi2.restaurant_id = rid.id and oi2.status = 'cancelled' and oi2.created_at >= win.since),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'rev', rev) order by n desc) from (
        select e->>'name' as name, sum(oi.qty) as n, sum(coalesce((e->>'price')::numeric, 0) * oi.qty) as rev
        from oi cross join lateral jsonb_array_elements(coalesce(oi.addons, '[]'::jsonb)) e group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'variants', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'rev', rev) order by rev desc) from (
        select name_snapshot as name, sum(qty) as qty, sum(price_snapshot * qty) as rev from oi where variant_name is not null group by 1 order by 3 desc limit 10) x), '[]'::jsonb),
    'table_qr', (select count(*) from online_orders oo, rid, win where oo.restaurant_id = rid.id and oo.table_id is not null and oo.placed_at >= win.since)
  )
$$;
grant execute on function sales_breakdown(integer) to authenticated;
