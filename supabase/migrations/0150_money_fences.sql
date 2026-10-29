-- 0150 — Money changes only through the till (2026-10-29, the owner: "complete every open upgrade" — item 7, the 2026-10-13
-- money review). Any signed-in person could change, straight through the API (a browser's developer tools), a dish's price
-- or quantity on an order, an order's status or its online discount, a room's rate, loyalty points, a shift's count. The
-- app's own screens never did — they change money through security-definer functions (generate_bill, settle_bill,
-- place_order, the move / merge / split RPCs, shift_close, customer_upsert, the loyalty triggers…), which run as the
-- function's owner — and change only a line's *status* directly (the kitchen, the waiter's Serve, the offline queue, the
-- mobile app).
--
-- So each table gets a fence that looks at who is writing: `current_user` is 'authenticated' (or 'anon') only for a write
-- that came straight from the API; inside a security-definer function it is the owner, and the service role is itself.
-- A direct write that touches money is refused with a sentence that says where to do it; everything else passes as
-- before. Room charges stay addable from the front desk (its form inserts them) but are never edited or deleted — a
-- correction is a new line — and every one is written to the audit trail. Nothing here changes what an RPC may do.

create or replace function public._api_write() returns boolean language sql stable set search_path = public as $$
  select current_user in ('authenticated', 'anon');
$$;

-- ── order lines: the status moves; the price, the count, the dish do not ─────────────────────────────────────────────
create or replace function public.fence_order_items() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then raise exception 'dishes are added at the till' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then raise exception 'a dish is cancelled at the till, with a reason' using errcode = '42501'; end if;
  if (new.price_snapshot, new.qty, new.name_snapshot, new.menu_item_id, new.variant_id, new.variant_name, new.addons, new.components, new.order_id, new.restaurant_id)
     is distinct from (old.price_snapshot, old.qty, old.name_snapshot, old.menu_item_id, old.variant_id, old.variant_name, old.addons, old.components, old.order_id, old.restaurant_id)
  then raise exception 'a dish''s price and quantity change at the till' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists money_fence on order_items;
create trigger money_fence before insert or update or delete on order_items for each row execute function public.fence_order_items();

-- ── orders: no status, discount or charge by hand ───────────────────────────────────────────────────────────────────
create or replace function public.fence_orders() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then raise exception 'orders are placed at the till' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then raise exception 'an order is cancelled at the till, with a reason' using errcode = '42501'; end if;
  if (new.status, new.discount_amount, new.extra_charges, new.promise_pct, new.promised_at, new.order_no, new.channel_id, new.restaurant_id)
     is distinct from (old.status, old.discount_amount, old.extra_charges, old.promise_pct, old.promised_at, old.order_no, old.channel_id, old.restaurant_id)
  then raise exception 'an order''s status and money change at the till and at billing' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists money_fence on orders;
create trigger money_fence before insert or update or delete on orders for each row execute function public.fence_orders();

-- ── bookings: the rate is set at the front desk's own steps ──────────────────────────────────────────────────────────
create or replace function public.fence_bookings() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then raise exception 'bookings are made at the front desk' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then raise exception 'a booking is cancelled, not deleted' using errcode = '42501'; end if;
  if (new.rate, new.restaurant_id) is distinct from (old.rate, old.restaurant_id) then raise exception 'a room''s rate changes at the front desk' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists money_fence on bookings;
create trigger money_fence before insert or update or delete on bookings for each row execute function public.fence_bookings();

-- ── room charges: added, never edited or deleted; every one in the audit trail ───────────────────────────────────────
create or replace function public.fence_booking_charges() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' then raise exception 'a room charge is corrected with a new line, not changed' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists money_fence on booking_charges;
create trigger money_fence before insert or update or delete on booking_charges for each row execute function public.fence_booking_charges();

create or replace function public.audit_booking_charges() returns trigger language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select booking_no into b from bookings where id = new.booking_id;
  perform audit_log(new.restaurant_id, case when new.kind::text = 'discount' or new.amount < 0 then 'discount.give' else 'charge.add' end, 'booking', new.booking_id,
    format('Booking %s · %s', b.booking_no, left(coalesce(new.description, new.kind::text), 60)), null, null,
    jsonb_build_object('kind', new.kind, 'amount', new.amount, 'ref_type', new.ref_type), abs(new.amount));
  return new;
end $$;
drop trigger if exists audit_booking_charges on booking_charges;
create trigger audit_booking_charges after insert on booking_charges for each row execute function public.audit_booking_charges();

-- ── customers: points, visits and spend move with bills and the loyalty ledger only ─────────────────────────────────
create or replace function public.fence_customers() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then new.points := 0; new.visits := 0; new.total_spend := 0; return new; end if;
  if tg_op = 'DELETE' then return old; end if;
  if (new.points, new.visits, new.total_spend, new.restaurant_id) is distinct from (old.points, old.visits, old.total_spend, old.restaurant_id)
  then raise exception 'points and spend change with bills, not by hand' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists money_fence on customers;
create trigger money_fence before insert or update or delete on customers for each row execute function public.fence_customers();

-- ── shift closes: written by Billing → Close shift alone ────────────────────────────────────────────────────────────
create or replace function public.fence_shift_closes() returns trigger language plpgsql set search_path = public as $$
begin
  if not _api_write() then return coalesce(new, old); end if;
  raise exception 'a shift is closed at Billing → Close shift' using errcode = '42501';
end $$;
drop trigger if exists money_fence on shift_closes;
create trigger money_fence before insert or update or delete on shift_closes for each row execute function public.fence_shift_closes();
