-- 0184 — loyalty points earned on an own-storefront online order (2026-11-10).
--
-- The loyalty programme (0072) already earns points when a COUNTER bill is paid, and redeems them on a later one. A
-- delivery or takeaway placed on the property's own page never becomes a counter bill, so it earned nothing. This awards
-- points for such an order when the counter accepts it — the same formula generate_bill uses (loyalty_earn_pct of the food
-- value, less any discount) — to the customer found by phone. Dine-in and room orders are untouched: they are billed at the
-- counter and earn there, so awarding here as well would double-count; this path is delivery/takeaway and the 'website'
-- channel only, and it never runs where generate_bill does.
--
-- Off until the owner switches the programme on (restaurants.loyalty_enabled, default false) — applying this changes nothing
-- on its own. Redeeming points on the storefront is NOT in this migration: an anonymous page cannot be shown a phone's balance
-- without a privacy design the owner must weigh. Idempotent: one 'earn' row per online order (a unique index enforces it).

alter table online_orders add column if not exists customer_id uuid references customers(id) on delete set null;
alter table loyalty_ledger add column if not exists online_order_id uuid references online_orders(id) on delete set null;
create unique index if not exists loyalty_ledger_online_earn_idx on loyalty_ledger(online_order_id) where kind = 'earn' and online_order_id is not null;

-- Award points for one accepted own-storefront delivery/takeaway order. Idempotent; safe to call more than once.
create or replace function public.dine_award_order_points(p_online_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; r restaurants%rowtype; ch order_channels%rowtype;
        ph text; cid uuid; sub numeric; dish numeric; earned numeric; mode text;
begin
  select * into o from online_orders where id = p_online_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'no such order'); end if;
  select * into r from restaurants where id = o.restaurant_id;
  if not r.loyalty_enabled then return jsonb_build_object('ok', false, 'why', 'loyalty off'); end if;
  select * into ch from order_channels where id = o.channel_id;
  if ch.kind is distinct from 'website' then return jsonb_build_object('ok', false, 'why', 'not the own storefront'); end if;
  mode := coalesce(o.raw->>'mode', '');
  if mode not in ('delivery', 'takeaway') then return jsonb_build_object('ok', false, 'why', 'dine-in/room earns at the counter'); end if;
  ph := norm_phone(o.customer_phone);
  if ph is null then return jsonb_build_object('ok', false, 'why', 'no phone'); end if;
  -- idempotent: already earned for this order?
  if exists (select 1 from loyalty_ledger where online_order_id = o.id and kind = 'earn') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  -- the food value, less any discount the guest was quoted (the fee and tax do not earn), exactly as generate_bill
  sub := coalesce((o.raw->>'subtotal')::numeric, o.gross);
  dish := greatest(0, sub - coalesce((o.raw->>'discount')::numeric, 0));
  earned := round(dish * r.loyalty_earn_pct / 100, 2);
  if earned <= 0 then return jsonb_build_object('ok', false, 'why', 'nothing to earn'); end if;
  -- the customer, found or made by phone (inline, so this does not depend on the caller's own tenant context)
  insert into customers(restaurant_id, phone, name, visits, total_spend, points, last_visit_at)
  values (o.restaurant_id, ph, nullif(o.customer_name, ''), 1, o.gross, earned, now())
  on conflict (restaurant_id, phone) do update
    set name = coalesce(nullif(customers.name, ''), excluded.name),
        visits = customers.visits + 1, total_spend = customers.total_spend + o.gross,
        points = customers.points + earned, last_visit_at = now()
  returning id into cid;
  insert into loyalty_ledger(restaurant_id, customer_id, online_order_id, points, kind, note, created_by)
  values (o.restaurant_id, cid, o.id, earned, 'earn', 'Earned on online order ' || coalesce(o.display_id, ''), auth.uid());
  update online_orders set customer_id = cid where id = o.id and customer_id is null;
  return jsonb_build_object('ok', true, 'points', earned, 'customer', cid);
end $$;
revoke all on function public.dine_award_order_points(uuid) from public, anon;
grant execute on function public.dine_award_order_points(uuid) to authenticated, service_role;

-- What the storefront shows a guest about earning (no balance, no secret). anon.
create or replace function public.dine_loyalty(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('enabled', r.loyalty_enabled, 'earn_pct', r.loyalty_earn_pct, 'point_value', r.loyalty_point_value)
  from restaurants r where r.booking_slug = p_slug and membership_state_for(r.id) in ('trial', 'active') and r.loyalty_enabled;
$$;
revoke all on function public.dine_loyalty(text) from public;
grant execute on function public.dine_loyalty(text) to anon, authenticated;

notify pgrst, 'reload schema';
