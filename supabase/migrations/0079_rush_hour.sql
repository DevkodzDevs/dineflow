-- 0079 · Rush hour: a busy kitchen can ask for more time, or pause online orders for a while.
--
-- Zomato's restaurant app has a "rush hour" switch that adds preparation time when the kitchen is
-- swamped. Here the kitchen can add 15 or 30 minutes to every quoted online-order time for the next
-- hour, or stop taking online (delivery / takeaway) orders until a set time. A guest ordering at a
-- table by QR is never refused — they are already sitting down.
--
-- Additive: three columns on restaurants, a setter that only the property's own people can call,
-- a public read for the storefront, and dine_order as in 0074 with the pause check and the extra
-- minutes in its quote. Nothing else in dine_order changes.

alter table restaurants add column if not exists rush_extra_min integer not null default 0 check (rush_extra_min between 0 and 120);
alter table restaurants add column if not exists rush_until timestamptz;
alter table restaurants add column if not exists online_paused_until timestamptz;

-- p_extra: minutes to add (0 = normal pace); p_for_min: how long it lasts; p_pause: stop online orders for p_for_min
create or replace function set_rush(p_extra integer, p_for_min integer default 60, p_pause boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype;
begin
  if rid is null then raise exception 'not signed in to a property'; end if;
  if p_extra < 0 or p_extra > 120 then raise exception 'extra time must be 0 to 120 minutes'; end if;
  if p_for_min < 0 or p_for_min > 480 then raise exception 'a rush lasts at most 8 hours'; end if;
  update restaurants set
    rush_extra_min = case when p_pause then rush_extra_min else p_extra end,
    rush_until = case when p_pause then rush_until when p_extra > 0 then now() + make_interval(mins => p_for_min) else null end,
    online_paused_until = case when p_pause then now() + make_interval(mins => p_for_min) when p_extra = 0 and not p_pause then null else online_paused_until end
  where id = rid returning * into r;
  return jsonb_build_object('rush_extra_min', r.rush_extra_min, 'rush_until', r.rush_until, 'online_paused_until', r.online_paused_until);
end $$;
revoke all on function set_rush(integer, integer, boolean) from public, anon;
grant execute on function set_rush(integer, integer, boolean) to authenticated;

-- what the public storefront needs to say about the kitchen's pace right now
create or replace function dine_busy(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'paused_until', case when r.online_paused_until > now() then r.online_paused_until end,
    'extra_min', case when r.rush_until > now() then r.rush_extra_min else 0 end)
  from restaurants r where r.booking_slug = p_slug;
$$;
grant execute on function dine_busy(text) to anon, authenticated;

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
    -- the kitchen asked for a breather: online orders wait; a guest at a table is never turned away
    if r.online_paused_until > now() then
      raise exception 'not taking online orders right now — back at %', to_char(r.online_paused_until at time zone 'Asia/Kolkata', 'HH12:MI am');
    end if;
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
    'eta', coalesce(ch.prep_minutes, 25) + case when p_mode = 'delivery' then 15 else 0 end
           + case when r.rush_until > now() then coalesce(r.rush_extra_min, 0) else 0 end);
end $$;
grant execute on function dine_order(text, jsonb, jsonb, text, text, uuid, text) to anon, authenticated;
