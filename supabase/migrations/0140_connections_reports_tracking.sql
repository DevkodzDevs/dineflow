-- 0140 — one Connections page, owner-given access, delivery tracking, and reports by department (2026-10-24, the owner:
-- "every outside link in one page — Swiggy, Zomato, the room sites, Razorpay, the rider's live tracking — owner only, and
-- the owner gives a manager access; every in and out, every department its own table, Excel and PDF, charts, owner only
-- and the owner gives access to view").
--
-- • profiles.grants text[] — what the owner has given one person beyond their sections: 'connections', 'reports'.
--   _grant_allowed(me, g): the owner always; anyone else with the grant. staff_set_grant(p_user, p_grant, p_on): the
--   owner only, for anyone below the owner at the property. session_bundle carries grants.
-- • Delivery tracking: online_orders.track_token (the customer's link, minted with the order); deliveries — one row per
--   order out for delivery: who rides (a staff member, or a name and phone), where they are (lat/lng/located_at), picked
--   up / delivered; restaurants.delivery_tracking (the switch on Connections).
--   delivery_assign (staff) · delivery_track (anon, the customer's page) · delivery_rider_view / delivery_rider_set (anon,
--   the rider's page, by the rider's own token) · dine_track_token (anon: the token for an order placed on the website).
-- • report_departments(p_from, p_to): every department as rows, plus income and outgoings by day and by department —
--   the owner, or whoever holds the 'reports' grant (or the master).
-- Additive: columns with safe defaults, one table, functions; session_bundle rebuilt from its live definition.

-- ── grants ───────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists grants text[] not null default '{}';

create or replace function public._grant_allowed(me profiles, g text)
returns boolean language sql stable set search_path = public as $$
  select me.id is not null and (me.role = 'owner' or g = any(coalesce(me.grants, '{}'::text[])));
$$;
revoke all on function public._grant_allowed(profiles, text) from public, anon;
grant execute on function public._grant_allowed(profiles, text) to authenticated;

create or replace function public.staff_set_grant(p_user uuid, p_grant text, p_on boolean)
returns text[] language plpgsql security definer set search_path = public as $$
declare me profiles; t profiles; g text[];
begin
  me := acting_profile();
  if me.id is null or me.role <> 'owner' then raise exception 'Only the owner can give this access.' using errcode = '42501'; end if;
  if p_grant not in ('connections', 'reports') then raise exception 'unknown grant'; end if;
  select * into t from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if t.id is null then raise exception 'not a member of this property'; end if;
  if t.role = 'owner' then raise exception 'An owner has it already.' using errcode = '42501'; end if;
  g := array_remove(coalesce(t.grants, '{}'::text[]), p_grant);
  if coalesce(p_on, false) then g := array_append(g, p_grant); end if;
  update profiles set grants = g where id = t.id;
  return g;
end $$;
revoke all on function public.staff_set_grant(uuid, text, boolean) from public, anon;
grant execute on function public.staff_set_grant(uuid, text, boolean) to authenticated;

-- ── delivery tracking ────────────────────────────────────────────────────────────────────────────────────────────
alter table public.restaurants add column if not exists delivery_tracking boolean not null default true;
alter table public.online_orders add column if not exists track_token text default encode(gen_random_bytes(10), 'hex');
update public.online_orders set track_token = encode(gen_random_bytes(10), 'hex') where track_token is null;
create unique index if not exists online_orders_track_token_idx on public.online_orders (track_token);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  online_order_id uuid references public.online_orders(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  token text not null default encode(gen_random_bytes(12), 'hex'),         -- the customer's link, for a till order
  rider_token text not null default encode(gen_random_bytes(12), 'hex'),   -- the rider's page
  rider_id uuid references public.profiles(id) on delete set null,
  rider_name text, rider_phone text,
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'delivered', 'cancelled')),
  lat double precision, lng double precision, located_at timestamptz,
  eta_min integer,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), picked_up_at timestamptz, delivered_at timestamptz,
  check (online_order_id is not null or order_id is not null)
);
create unique index if not exists deliveries_token_idx on public.deliveries (token);
create unique index if not exists deliveries_rider_token_idx on public.deliveries (rider_token);
create unique index if not exists deliveries_online_order_idx on public.deliveries (online_order_id) where online_order_id is not null;
create unique index if not exists deliveries_order_idx on public.deliveries (order_id) where order_id is not null;
create index if not exists deliveries_restaurant_idx on public.deliveries (restaurant_id, created_at desc);
alter table public.deliveries enable row level security;
drop policy if exists deliveries_tenant_read on public.deliveries;
create policy deliveries_tenant_read on public.deliveries for select to authenticated using (restaurant_id = auth_restaurant_id());
-- no direct write policy: every change goes through the functions below
revoke all on public.deliveries from anon;
grant select on public.deliveries to authenticated;

/* a staff member sends an order out: who rides it, how long it should take. One delivery per order; assigning again
   re-points it at the new rider and keeps the customer's link. */
create or replace function public.delivery_assign(p_online_order uuid default null, p_order uuid default null, p_rider uuid default null, p_rider_name text default null, p_rider_phone text default null, p_eta integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles; rid uuid; d deliveries; nm text; ph text; tt text;
begin
  me := acting_profile();
  if me.id is null then raise exception 'sign in first' using errcode = '42501'; end if;
  rid := me.restaurant_id;
  if p_online_order is null and p_order is null then raise exception 'which order?'; end if;
  if p_online_order is not null and not exists (select 1 from online_orders where id = p_online_order and restaurant_id = rid) then raise exception 'not this property''s order'; end if;
  if p_order is not null and not exists (select 1 from orders where id = p_order and restaurant_id = rid) then raise exception 'not this property''s order'; end if;
  if p_rider is not null then
    select full_name, phone into nm, ph from profiles where id = p_rider and restaurant_id = rid and is_active;
    if nm is null then raise exception 'that rider is not on this property'; end if;
  else
    nm := nullif(trim(coalesce(p_rider_name, '')), ''); ph := nullif(regexp_replace(coalesce(p_rider_phone, ''), '\D', '', 'g'), '');
    if nm is null then raise exception 'who is riding?'; end if;
  end if;
  if p_online_order is not null then
    insert into deliveries (restaurant_id, online_order_id, rider_id, rider_name, rider_phone, eta_min, assigned_by)
    values (rid, p_online_order, p_rider, nm, ph, p_eta, me.id)
    on conflict (online_order_id) where online_order_id is not null do update
      set rider_id = excluded.rider_id, rider_name = excluded.rider_name, rider_phone = excluded.rider_phone, eta_min = coalesce(excluded.eta_min, deliveries.eta_min),
          status = case when deliveries.status = 'delivered' then 'delivered' else 'assigned' end, assigned_by = excluded.assigned_by
    returning * into d;
  else
    insert into deliveries (restaurant_id, order_id, rider_id, rider_name, rider_phone, eta_min, assigned_by)
    values (rid, p_order, p_rider, nm, ph, p_eta, me.id)
    on conflict (order_id) where order_id is not null do update
      set rider_id = excluded.rider_id, rider_name = excluded.rider_name, rider_phone = excluded.rider_phone, eta_min = coalesce(excluded.eta_min, deliveries.eta_min),
          status = case when deliveries.status = 'delivered' then 'delivered' else 'assigned' end, assigned_by = excluded.assigned_by
    returning * into d;
  end if;
  if d.online_order_id is not null then select track_token into tt from online_orders where id = d.online_order_id; end if;
  return jsonb_build_object('id', d.id, 'track_token', coalesce(tt, d.token), 'rider_token', d.rider_token, 'rider_name', d.rider_name, 'rider_phone', d.rider_phone, 'status', d.status);
end $$;
revoke all on function public.delivery_assign(uuid, uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.delivery_assign(uuid, uuid, uuid, text, text, integer) to authenticated;

/* the order placed on the website: its tracking token, for the phone that placed it */
create or replace function public.dine_track_token(p_id uuid, p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select o.track_token from online_orders o
  where o.id = p_id and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
  limit 1;
$$;
grant execute on function public.dine_track_token(uuid, text) to anon, authenticated;

/* the customer's page: where the order stands, who is bringing it and where they are (a position older than 3 hours
   is not shown) — by the token in the link, and nothing else about the property or its other orders */
create or replace function public.delivery_track(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d deliveries; o online_orders; ord orders; r restaurants; st text; items jsonb; total numeric; ref text; placed timestamptz; mode text; eta integer;
  tl jsonb;
begin
  if p_token is null or length(p_token) < 12 then return null; end if;
  select * into o from online_orders where track_token = p_token;
  if o.id is not null then select * into d from deliveries where online_order_id = o.id;
  else
    select * into d from deliveries where token = p_token;
    if d.id is null then return null; end if;
    if d.online_order_id is not null then select * into o from online_orders where id = d.online_order_id; end if;
  end if;
  if d.order_id is not null then select * into ord from orders where id = d.order_id; end if;
  select * into r from restaurants where id = coalesce(o.restaurant_id, d.restaurant_id);
  if o.id is not null then
    items := case when jsonb_typeof(o.items) = 'array' then coalesce((select jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', coalesce((i->>'qty')::numeric, 1))) from jsonb_array_elements(o.items) i), '[]'::jsonb) else '[]'::jsonb end;
    total := o.gross; ref := o.display_id; placed := o.placed_at; eta := d.eta_min;
    mode := coalesce(o.raw->>'mode', case when o.address is not null then 'delivery' else 'takeaway' end);
  elsif ord.id is not null then
    items := coalesce((select jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty)) from order_items oi where oi.order_id = ord.id and oi.status <> 'cancelled'), '[]'::jsonb);
    total := (select coalesce(sum(oi.price_snapshot * oi.qty), 0) from order_items oi where oi.order_id = ord.id and oi.status <> 'cancelled');
    ref := '#' || ord.order_no; placed := ord.created_at; mode := ord.type::text; eta := d.eta_min;
  end if;
  st := case
    when d.status = 'delivered' then 'delivered'
    when d.status = 'picked_up' or o.status = 'picked_up' then 'on_the_way'
    when o.status in ('rejected', 'cancelled') or ord.status = 'cancelled' then 'cancelled'
    when o.status = 'ready' then 'ready'
    when o.status in ('accepted', 'preparing') then 'cooking'
    when o.status = 'new' then 'placed'
    when d.id is not null then 'ready'
    when ord.status = 'open' then 'cooking'
    else 'placed' end;
  tl := jsonb_build_object('placed', placed, 'picked_up', d.picked_up_at, 'delivered', d.delivered_at);
  return jsonb_build_object(
    'status', st, 'mode', mode, 'ref', ref, 'items', items, 'total', total, 'eta_min', eta,
    'property', jsonb_build_object('name', r.name, 'phone', r.phone),
    'rider', case when d.id is not null and d.status <> 'cancelled' then jsonb_build_object('name', d.rider_name, 'phone', d.rider_phone) end,
    'position', case when d.located_at is not null and d.located_at > now() - interval '3 hours' and d.status <> 'delivered' and r.delivery_tracking
                     then jsonb_build_object('lat', d.lat, 'lng', d.lng, 'at', d.located_at) end,
    'timeline', tl);
end $$;
grant execute on function public.delivery_track(text) to anon, authenticated;

/* the rider's page: the drop, by the rider's own token */
create or replace function public.delivery_rider_view(p_rider_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d deliveries; o online_orders; ord orders; r restaurants; items jsonb; total numeric; ref text; nm text; ph text; addr text; prepaid boolean;
begin
  if p_rider_token is null or length(p_rider_token) < 12 then return null; end if;
  select * into d from deliveries where rider_token = p_rider_token;
  if d.id is null then return null; end if;
  select * into r from restaurants where id = d.restaurant_id;
  if d.online_order_id is not null then
    select * into o from online_orders where id = d.online_order_id;
    items := case when jsonb_typeof(o.items) = 'array' then coalesce((select jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', coalesce((i->>'qty')::numeric, 1))) from jsonb_array_elements(o.items) i), '[]'::jsonb) else '[]'::jsonb end;
    total := o.gross; ref := o.display_id; nm := o.customer_name; ph := o.customer_phone; addr := o.address; prepaid := coalesce(o.is_prepaid, false);
  else
    select * into ord from orders where id = d.order_id;
    items := coalesce((select jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty)) from order_items oi where oi.order_id = ord.id and oi.status <> 'cancelled'), '[]'::jsonb);
    total := (select coalesce(sum(oi.price_snapshot * oi.qty), 0) from order_items oi where oi.order_id = ord.id and oi.status <> 'cancelled');
    ref := '#' || ord.order_no; nm := ord.customer_name; ph := ord.customer_phone; addr := ord.delivery_address;
    prepaid := exists (select 1 from bills b where b.order_id = ord.id and b.status = 'paid');
  end if;
  return jsonb_build_object('status', d.status, 'ref', ref, 'items', items, 'total', total, 'prepaid', prepaid,
    'customer', jsonb_build_object('name', nm, 'phone', ph, 'address', addr),
    'property', jsonb_build_object('name', r.name, 'phone', r.phone), 'rider', d.rider_name, 'eta_min', d.eta_min,
    'located_at', d.located_at, 'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at);
end $$;
grant execute on function public.delivery_rider_view(text) to anon, authenticated;

/* the rider's page writes: a position, Picked up, Delivered — by the rider's own token */
create or replace function public.delivery_rider_set(p_rider_token text, p_status text default null, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d deliveries;
begin
  if p_rider_token is null or length(p_rider_token) < 12 then return null; end if;
  select * into d from deliveries where rider_token = p_rider_token for update;
  if d.id is null then return null; end if;
  if p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180 then
    update deliveries set lat = p_lat, lng = p_lng, located_at = now() where id = d.id;
  end if;
  if p_status = 'picked_up' and d.status = 'assigned' then
    update deliveries set status = 'picked_up', picked_up_at = now() where id = d.id;
    if d.online_order_id is not null then update online_orders set status = 'picked_up' where id = d.online_order_id and status in ('accepted', 'preparing', 'ready'); end if;
  elsif p_status = 'delivered' and d.status in ('assigned', 'picked_up') then
    update deliveries set status = 'delivered', delivered_at = now(), picked_up_at = coalesce(picked_up_at, now()) where id = d.id;
    if d.online_order_id is not null then update online_orders set status = 'picked_up' where id = d.online_order_id and status in ('accepted', 'preparing', 'ready'); end if;
  end if;
  select * into d from deliveries where id = d.id;
  return jsonb_build_object('status', d.status, 'located_at', d.located_at, 'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at);
end $$;
grant execute on function public.delivery_rider_set(text, text, double precision, double precision) to anon, authenticated;

-- ── reports by department ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.report_departments(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me profiles; rid uuid; out jsonb;
begin
  me := acting_profile();
  if not (_grant_allowed(me, 'reports') or is_platform_admin()) then raise exception 'Reports are the owner''s — ask the owner for access.' using errcode = '42501'; end if;
  rid := auth_restaurant_id();
  if rid is null then return null; end if;
  if p_to < p_from then raise exception 'the window ends before it starts'; end if;
  if p_to - p_from > 366 then raise exception 'at most a year at a time'; end if;

  out := jsonb_build_object('from', p_from, 'to', p_to,
    -- every paid bill: the day, what kind of order, where, how much, how it was paid, who billed
    'sales', coalesce((select jsonb_agg(x order by x->>'paid_at' desc) from (
      select jsonb_build_object('bill_no', b.bill_no, 'day', (b.paid_at at time zone 'Asia/Kolkata')::date, 'paid_at', b.paid_at,
        'type', o.type::text, 'where', coalesce(t.name, case when o.token_no is not null then 'Token ' || o.token_no end),
        'customer', coalesce(o.customer_name, c.name), 'items', (select coalesce(sum(oi.qty), 0) from order_items oi where oi.order_id = o.id and oi.status <> 'cancelled'),
        'subtotal', b.subtotal, 'discount', b.discount_amount, 'service', b.service_charge, 'gst', b.cgst + b.sgst, 'total', b.total,
        'paid_by', (select string_agg(initcap(p.method::text) || ' ' || p.amount, ' · ' order by p.created_at) from payments p where p.bill_id = b.id),
        'billed_by', pr.full_name) x
      from bills b join orders o on o.id = b.order_id left join dining_tables t on t.id = o.table_id left join customers c on c.id = b.customer_id left join profiles pr on pr.id = b.created_by
      where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      order by b.paid_at desc limit 2000) q), '[]'::jsonb),
    'sales_totals', (select jsonb_build_object('bills', count(*), 'total', coalesce(sum(b.total), 0), 'gst', coalesce(sum(b.cgst + b.sgst), 0), 'discount', coalesce(sum(b.discount_amount), 0))
      from bills b where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    -- Swiggy, Zomato, the website: each order with what the platform kept
    'online', coalesce((select jsonb_agg(x order by x->>'placed_at' desc) from (
      select jsonb_build_object('day', (o.placed_at at time zone 'Asia/Kolkata')::date, 'placed_at', o.placed_at, 'channel', ch.label, 'kind', ch.kind::text, 'ref', o.display_id,
        'customer', o.customer_name, 'status', o.status::text, 'gross', o.gross, 'commission', o.commission, 'payout', o.payout, 'prepaid', coalesce(o.is_prepaid, false),
        'rider', d.rider_name, 'delivered', d.delivered_at) x
      from online_orders o left join order_channels ch on ch.id = o.channel_id left join deliveries d on d.online_order_id = o.id
      where o.restaurant_id = rid and (o.placed_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      order by o.placed_at desc limit 2000) q), '[]'::jsonb),
    'online_totals', (select jsonb_build_object('orders', count(*) filter (where o.status not in ('rejected', 'cancelled')), 'rejected', count(*) filter (where o.status in ('rejected', 'cancelled')),
        'gross', coalesce(sum(o.gross) filter (where o.status not in ('rejected', 'cancelled')), 0), 'commission', coalesce(sum(o.commission) filter (where o.status not in ('rejected', 'cancelled')), 0),
        'payout', coalesce(sum(o.payout) filter (where o.status not in ('rejected', 'cancelled')), 0))
      from online_orders o where o.restaurant_id = rid and (o.placed_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    -- every stay that touched the window, with its folio
    'rooms', coalesce((select jsonb_agg(x order by x->>'check_in' desc) from (
      select jsonb_build_object('booking_no', b.booking_no, 'guest', g.full_name, 'room', rm.number, 'type', rt.name, 'check_in', b.check_in, 'check_out', b.check_out,
        'nights', greatest(1, b.check_out - b.check_in), 'rate', b.rate, 'room_total', f.room_total, 'extras', f.extras, 'gst', f.gst, 'total', f.total, 'paid', f.paid, 'balance', f.balance,
        'status', b.status::text, 'source', coalesce(oc.label, b.source)) x
      from bookings b left join guests g on g.id = b.guest_id left join rooms rm on rm.id = b.room_id left join room_types rt on rt.id = rm.room_type_id
        left join ota_channels oc on oc.id = b.ota_channel_id, lateral folio_totals(b.id) f
      where b.restaurant_id = rid and b.check_in <= p_to and b.check_out >= p_from and b.status not in ('cancelled', 'no_show') and not coalesce(b.is_block, false)
      order by b.check_in desc limit 1000) q), '[]'::jsonb),
    'rooms_totals', (select jsonb_build_object('stays', count(*), 'nights', coalesce(sum(greatest(1, least(b.check_out, p_to + 1) - greatest(b.check_in, p_from))), 0),
        'revenue', coalesce((select sum(b2.rate) from (select generate_series(p_from, p_to, interval '1 day')::date d) g join bookings b2 on b2.restaurant_id = rid and b2.check_in <= d and b2.check_out > d and b2.status in ('checked_in', 'checked_out') and not coalesce(b2.is_block, false)), 0))
      from bookings b where b.restaurant_id = rid and b.check_in <= p_to and b.check_out >= p_from and b.status in ('checked_in', 'checked_out') and not coalesce(b.is_block, false)),
    -- spa, pool, hall: each booking
    'facilities', coalesce((select jsonb_agg(x order by x->>'starts_at' desc) from (
      select jsonb_build_object('day', (fb.starts_at at time zone 'Asia/Kolkata')::date, 'starts_at', fb.starts_at, 'facility', f.name, 'kind', f.kind, 'guest', fb.guest_name, 'people', fb.people,
        'amount', fb.amount, 'status', fb.status, 'on_folio', fb.booking_id is not null) x
      from facility_bookings fb left join facilities f on f.id = fb.facility_id
      where fb.restaurant_id = rid and (fb.starts_at at time zone 'Asia/Kolkata')::date between p_from and p_to and coalesce(fb.status, '') <> 'cancelled'
      order by fb.starts_at desc limit 1000) q), '[]'::jsonb),
    'facilities_totals', (select jsonb_build_object('bookings', count(*), 'amount', coalesce(sum(fb.amount), 0)) from facility_bookings fb
      where fb.restaurant_id = rid and (fb.starts_at at time zone 'Asia/Kolkata')::date between p_from and p_to and coalesce(fb.status, '') <> 'cancelled'),
    -- what went out: each expense
    'expenses', coalesce((select jsonb_agg(x order by x->>'day' desc, x->>'created_at' desc) from (
      select jsonb_build_object('day', e.spent_on, 'created_at', e.created_at, 'category', e.category, 'payee', e.payee, 'amount', e.amount, 'gst', e.gst_amount, 'method', e.method, 'ref', e.ref, 'note', e.note, 'by', pr.full_name) x
      from expenses e left join profiles pr on pr.id = e.created_by
      where e.restaurant_id = rid and e.voided_at is null and e.spent_on between p_from and p_to
      order by e.spent_on desc, e.created_at desc limit 2000) q), '[]'::jsonb),
    'expenses_totals', (select jsonb_build_object('entries', count(*), 'amount', coalesce(sum(e.amount), 0), 'gst', coalesce(sum(e.gst_amount), 0),
        'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', c.category, 'amount', c.amount) order by c.amount desc) from (select e2.category, sum(e2.amount) amount from expenses e2 where e2.restaurant_id = rid and e2.voided_at is null and e2.spent_on between p_from and p_to group by e2.category) c), '[]'::jsonb))
      from expenses e where e.restaurant_id = rid and e.voided_at is null and e.spent_on between p_from and p_to),
    -- what the pantry bought
    'purchases', coalesce((select jsonb_agg(x order by x->>'day' desc) from (
      select jsonb_build_object('day', pu.purchased_at, 'supplier', coalesce(s.name, pu.supplier), 'invoice', pu.invoice_no, 'items', (select count(*) from purchase_items pi where pi.purchase_id = pu.id),
        'qty', (select coalesce(sum(pi.qty), 0) from purchase_items pi where pi.purchase_id = pu.id), 'total', pu.total, 'by', pr.full_name, 'po', pu.po_id is not null) x
      from purchases pu left join suppliers s on s.id = pu.supplier_id left join profiles pr on pr.id = pu.created_by
      where pu.restaurant_id = rid and pu.purchased_at between p_from and p_to
      order by pu.purchased_at desc limit 2000) q), '[]'::jsonb),
    'purchases_totals', (select jsonb_build_object('purchases', count(*), 'total', coalesce(sum(pu.total), 0)) from purchases pu where pu.restaurant_id = rid and pu.purchased_at between p_from and p_to),
    -- pay: each line of the runs whose month falls in the window
    'payroll', coalesce((select jsonb_agg(x order by x->>'month' desc, x->>'name') from (
      select jsonb_build_object('month', to_char(r.month, 'Mon YYYY'), 'run', r.status, 'name', l.name, 'role', l.role, 'basis', l.basis, 'rate', l.rate, 'days', l.paid_days, 'present', l.days_present,
        'gross', l.gross, 'bonus', l.bonus, 'deductions', coalesce(l.pf_employee, 0) + coalesce(l.esi_employee, 0) + coalesce(l.advances, 0) + coalesce(l.other_deduction, 0),
        'net', l.net, 'paid_at', l.paid_at, 'method', l.paid_method) x
      from payroll_lines l join payroll_runs r on r.id = l.run_id
      where l.restaurant_id = rid and r.month between date_trunc('month', p_from)::date and p_to
      order by r.month desc, l.name limit 2000) q), '[]'::jsonb),
    'payroll_totals', (select jsonb_build_object('people', count(distinct l.profile_id), 'gross', coalesce(sum(l.gross), 0), 'net', coalesce(sum(l.net), 0), 'paid', coalesce(sum(l.net) filter (where l.paid_at is not null), 0))
      from payroll_lines l join payroll_runs r on r.id = l.run_id where l.restaurant_id = rid and r.month between date_trunc('month', p_from)::date and p_to),
    -- who worked: staff by the day, daily labour with wages
    'attendance', coalesce((select jsonb_agg(x order by (x->>'hours')::numeric desc) from (
      select jsonb_build_object('kind', 'Staff', 'name', pr.full_name, 'role', coalesce(pr.position_title, pr.role::text), 'days', count(distinct a.work_date), 'hours', round(coalesce(sum(a.hours), 0)::numeric, 1), 'wage', null) x
      from staff_attendance a join profiles pr on pr.id = a.profile_id where a.restaurant_id = rid and a.work_date between p_from and p_to group by pr.id, pr.full_name, pr.position_title, pr.role
      union all
      select jsonb_build_object('kind', 'Daily labour', 'name', lb.full_name, 'role', lb.skill, 'days', count(distinct a.work_date), 'hours', round(coalesce(sum(a.hours), 0)::numeric, 1), 'wage', coalesce(sum(a.wage), 0)) x
      from labour_attendance a join labourers lb on lb.id = a.labourer_id where a.restaurant_id = rid and a.work_date between p_from and p_to group by lb.id, lb.full_name, lb.skill) q), '[]'::jsonb),
    'attendance_totals', (select jsonb_build_object('staff', (select count(distinct a.profile_id) from staff_attendance a where a.restaurant_id = rid and a.work_date between p_from and p_to),
        'hours', (select round(coalesce(sum(a.hours), 0)::numeric, 1) from staff_attendance a where a.restaurant_id = rid and a.work_date between p_from and p_to),
        'labour_wages', (select coalesce(sum(a.wage), 0) from labour_attendance a where a.restaurant_id = rid and a.work_date between p_from and p_to))),
    -- housekeeping: each person's finished tasks
    'housekeeping', coalesce((select jsonb_agg(x order by x->>'done' desc) from (
      select jsonb_build_object('name', coalesce(pr.full_name, 'Unassigned'), 'done', count(*), 'rooms', count(*) filter (where h.kind = 'clean'), 'turndown', count(*) filter (where h.kind = 'turndown'),
        'maintenance', count(*) filter (where h.kind = 'maintenance'), 'avg_min', round(coalesce(avg(extract(epoch from (h.done_at - coalesce(h.taken_at, h.created_at))) / 60), 0)::numeric, 0),
        'inspected', count(*) filter (where h.inspected_at is not null)) x
      from housekeeping_tasks h left join profiles pr on pr.id = coalesce(h.done_by, h.taken_by, h.assigned_to)
      where h.restaurant_id = rid and h.status = 'done' and (h.done_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      group by pr.id, pr.full_name) q), '[]'::jsonb),
    'housekeeping_totals', (select jsonb_build_object('done', count(*), 'open', (select count(*) from housekeeping_tasks h2 where h2.restaurant_id = rid and h2.status <> 'done'))
      from housekeeping_tasks h where h.restaurant_id = rid and h.status = 'done' and (h.done_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    -- customers who came in the window: visits, spend, points
    'customers', coalesce((select jsonb_agg(x order by x->>'spend' desc) from (
      select jsonb_build_object('name', c.name, 'phone', c.phone, 'visits', count(b.id), 'spend', coalesce(sum(b.total), 0), 'earned', coalesce(sum(b.points_earned), 0), 'redeemed', coalesce(sum(b.points_redeemed), 0),
        'points', c.points, 'first_visit', c.first_visit_at, 'new', (c.first_visit_at at time zone 'Asia/Kolkata')::date between p_from and p_to) x
      from customers c join bills b on b.customer_id = c.id and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      where c.restaurant_id = rid group by c.id order by sum(b.total) desc limit 1000) q), '[]'::jsonb),
    'customers_totals', (select jsonb_build_object('came', (select count(distinct b.customer_id) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.customer_id is not null and (b.paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'new', (select count(*) from customers c where c.restaurant_id = rid and (c.first_visit_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'points_out', (select coalesce(sum(c.points), 0) from customers c where c.restaurant_id = rid))),
    -- the pantry now, and what was wasted in the window
    'inventory', coalesce((select jsonb_agg(x order by x->>'value' desc) from (
      select jsonb_build_object('name', i.name, 'category', i.category, 'unit', i.unit::text, 'stock', i.current_stock, 'reorder', i.reorder_level, 'cost', i.cost_per_unit, 'value', round((i.current_stock * i.cost_per_unit)::numeric, 2),
        'low', i.current_stock <= i.reorder_level and i.reorder_level > 0,
        'wasted', (select coalesce(sum(abs(sl.qty)), 0) from stock_ledger sl where sl.ingredient_id = i.id and sl.reason = 'wastage' and (sl.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to)) x
      from ingredients i where i.restaurant_id = rid and i.is_active order by (i.current_stock * i.cost_per_unit) desc limit 2000) q), '[]'::jsonb),
    'inventory_totals', (select jsonb_build_object('items', count(*), 'value', coalesce(sum(i.current_stock * i.cost_per_unit), 0), 'low', count(*) filter (where i.current_stock <= i.reorder_level and i.reorder_level > 0),
        'wastage_cost', (select coalesce(sum(abs(sl.qty) * coalesce(sl.unit_cost, i2.cost_per_unit)), 0) from stock_ledger sl join ingredients i2 on i2.id = sl.ingredient_id where sl.restaurant_id = rid and sl.reason = 'wastage' and (sl.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to))
      from ingredients i where i.restaurant_id = rid and i.is_active),
    -- what was taken back: cancelled lines, voided bills
    'cancelled', coalesce((select jsonb_agg(x order by x->>'at' desc) from (select x from (
      select jsonb_build_object('day', (coalesce(oi.cancelled_at, oi.created_at) at time zone 'Asia/Kolkata')::date, 'at', coalesce(oi.cancelled_at, oi.created_at), 'kind', 'Cancelled line', 'what', oi.name_snapshot, 'qty', oi.qty,
        'amount', oi.price_snapshot * oi.qty, 'reason', oi.cancel_reason, 'by', pr.full_name, 'ref', '#' || o.order_no) x
      from order_items oi join orders o on o.id = oi.order_id left join profiles pr on pr.id = oi.cancelled_by
      where oi.restaurant_id = rid and oi.status = 'cancelled' and (coalesce(oi.cancelled_at, oi.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to
      union all
      select jsonb_build_object('day', (coalesce(b.voided_at, b.created_at) at time zone 'Asia/Kolkata')::date, 'at', coalesce(b.voided_at, b.created_at), 'kind', 'Voided bill', 'what', 'Bill ' || b.bill_no, 'qty', 1,
        'amount', b.total, 'reason', b.void_reason, 'by', pr.full_name, 'ref', 'Bill ' || b.bill_no) x
      from bills b left join profiles pr on pr.id = b.voided_by
      where b.restaurant_id = rid and b.status = 'void' and (coalesce(b.voided_at, b.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to) u
      order by x->>'at' desc limit 2000) q), '[]'::jsonb),
    'cancelled_totals', (select jsonb_build_object(
        'lines', (select count(*) from order_items oi where oi.restaurant_id = rid and oi.status = 'cancelled' and (coalesce(oi.cancelled_at, oi.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'lines_amount', (select coalesce(sum(oi.price_snapshot * oi.qty), 0) from order_items oi where oi.restaurant_id = rid and oi.status = 'cancelled' and (coalesce(oi.cancelled_at, oi.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'voids', (select count(*) from bills b where b.restaurant_id = rid and b.status = 'void' and (coalesce(b.voided_at, b.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'voids_amount', (select coalesce(sum(b.total), 0) from bills b where b.restaurant_id = rid and b.status = 'void' and (coalesce(b.voided_at, b.created_at) at time zone 'Asia/Kolkata')::date between p_from and p_to))),
    -- the till's cash-ups
    'cashups', coalesce((select jsonb_agg(x order by x->>'closed_at' desc) from (
      select jsonb_build_object('day', sc.business_date, 'closed_at', sc.closed_at, 'expected', (sc.expected->>'total')::numeric, 'cash_expected', (sc.expected->>'cash')::numeric, 'cash_drawer', (sc.expected->>'cash_drawer')::numeric,
        'counted', sc.counted_cash, 'float', sc.float_cash, 'variance', sc.variance, 'upi', (sc.expected->>'upi')::numeric, 'card', (sc.expected->>'card')::numeric, 'by', pr.full_name, 'note', sc.note) x
      from shift_closes sc left join profiles pr on pr.id = sc.closed_by
      where sc.restaurant_id = rid and sc.business_date between p_from and p_to order by sc.closed_at desc limit 500) q), '[]'::jsonb),
    'cashups_totals', (select jsonb_build_object('closes', count(*), 'variance', coalesce(sum(sc.variance), 0), 'short', coalesce(sum(sc.variance) filter (where sc.variance < 0), 0)) from shift_closes sc where sc.restaurant_id = rid and sc.business_date between p_from and p_to)
  );

  -- income and outgoings, by day (the charts) and by department (the share)
  out := out || jsonb_build_object(
    'by_day', (select jsonb_agg(jsonb_build_object('day', d, 'label', to_char(d, 'DD Mon'),
        'dining', coalesce((select sum(b.total) from bills b where b.restaurant_id = rid and b.status = 'paid' and (b.paid_at at time zone 'Asia/Kolkata')::date = d), 0),
        'rooms', coalesce((select sum(b2.rate) from bookings b2 where b2.restaurant_id = rid and b2.check_in <= d and b2.check_out > d and b2.status in ('checked_in', 'checked_out') and not coalesce(b2.is_block, false)), 0),
        'facilities', coalesce((select sum(fb.amount) from facility_bookings fb where fb.restaurant_id = rid and (fb.starts_at at time zone 'Asia/Kolkata')::date = d and coalesce(fb.status, '') <> 'cancelled'), 0),
        'expenses', coalesce((select sum(e.amount) from expenses e where e.restaurant_id = rid and e.voided_at is null and e.spent_on = d), 0),
        'purchases', coalesce((select sum(pu.total) from purchases pu where pu.restaurant_id = rid and pu.purchased_at = d), 0)) order by d)
      from (select generate_series(p_from, p_to, interval '1 day')::date d) g));
  return out;
end $$;
revoke all on function public.report_departments(date, date) from public, anon;
grant execute on function public.report_departments(date, date) to authenticated, service_role;

-- ── session_bundle, rebuilt from the live definition with grants in the profile ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.session_bundle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until, p.department, p.position, p.assist_access, p.grants
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
  acting as (select admin_acting_as() as rid),
  cur as (select case when (select is_active from prof) then _outlet_current() end as rid),
  target as (
    select coalesce((select rid from cur), (select restaurant_id from prof), (select rid from acting)) as id
  ),
  rest as (select r.* from restaurants r, target t where r.id = t.id),
  late as (
    select count(*)::int as c
    from kots k, target t
    where k.restaurant_id = t.id and k.status in ('pending', 'preparing')
      and k.created_at < now() - interval '15 minutes'
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'user_id',    (select uid from me),
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) || jsonb_build_object('restaurant_id', (select id from target), 'home_restaurant_id', p.restaurant_id) from prof p),
    'restaurant', (select to_jsonb(r) - 'box_token' - 'screen_key' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid),
    'outlets',    case when exists (select 1 from outlet_access oa, me where oa.user_id = me.uid) then my_outlets() else '[]'::jsonb end
  ) end;
$function$;
