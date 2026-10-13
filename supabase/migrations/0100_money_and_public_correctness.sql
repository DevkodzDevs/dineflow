-- 0100 · Money that adds up, GST only where it is owed, and closed means closed — 2026-10-13.
--
-- From the money and GST review of the live functions (each case is in dry100.cjs, run on the live database,
-- rolled back):
--   · The stay invoice taxed the room before its discount and subtracted the discount afterwards; the folio
--     takes the discount off first. 2 nights × ₹4,000 with ₹1,000 off: the guest paid the folio's ₹7,350, the
--     invoice said ₹7,400 and stayed "unpaid". And once a guest had checked out, the folio counted their
--     payments as discounts (a reprint showed a negative total).
--   · A dining invoice listed every dish at full price with tax on it, and left out the service charge and
--     the on-time fee the bill had charged and taxed: in 19 of 36 live invoices the lines and the header
--     disagreed, and none added up to the total.
--   · A property with no GSTIN (or on composition) still charged GST on room-posted orders, at check-out, and
--     showed a rate on every invoice line.
--   · Any staff login could rewrite `counters` (reset the bill or invoice series — duplicate invoice numbers);
--     bills and invoices had no unique number.
--   · New properties still started at 12% room GST — the slab that ended on 22 Sep 2025 (0066 fixed the rows,
--     not the default).
--   · generate_bill took a negative discount (a hidden surcharge, taxed); settle_bill could mark a voided bill
--     paid.
--   · The public pages took orders, table bookings, queue joins and room bookings for a property whose trial or
--     membership had ended: they read `membership`, which nothing ever sets to 'expired'.
--   · The storefront showed Wikimedia dish photos without the credit their licence requires.
--   · "Push rates" and "Push menu" said "pushed … to Booking.com / Swiggy" with an API key saved — DineFlow
--     makes no such call. Now they say nothing was sent.
--
-- Bodies are the live pg_get_functiondef text of 2026-10-13 with only the marked lines changed, except
-- folio_totals, generate_stay_invoice and generate_dining_invoice, which are rewritten whole (marked 0100).


-- ═══ 1 · a stay: the folio and the invoice compute the same thing ══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.folio_totals(p_booking_id uuid)
 RETURNS TABLE(nights integer, room_total numeric, extras numeric, discounts numeric, taxable numeric, gst numeric, total numeric, paid numeric, balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b bookings%rowtype; r restaurants%rowtype; n int; rt numeric; ex numeric; ds numeric; pd numeric; tx numeric;
        rate numeric; room_gst numeric; extra_gst numeric; collects boolean;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id();
  select * into r from restaurants where id = b.restaurant_id;
  collects := gst_collectable(r.gst_scheme, r.gstin);
  n := greatest(1, b.check_out - b.check_in);
  rt := n * b.rate;
  select coalesce(sum(amount),0) into ex from booking_charges where booking_id = b.id and kind in ('restaurant','facility','extra');
  -- 0100: money received — the advance and the payments taken at check-out — is not a discount
  select coalesce(-sum(amount),0) into ds from booking_charges where booking_id = b.id and kind = 'discount'
     and description <> 'Advance received' and description not like 'Payment ·%';
  select coalesce(-sum(amount),0) into pd from booking_charges where booking_id = b.id and kind = 'discount'
     and (description = 'Advance received' or description like 'Payment ·%');
  -- restaurant GST, charged on each order when it was posted — only where this property collects GST (0100)
  select case when collects then coalesce(sum(amount),0) else 0 end into tx from booking_charges where booking_id = b.id and kind = 'tax';

  rate := room_gst_for(b.rate, r.room_gst_rate, r.room_gst_rate_high, r.room_gst_threshold);
  ds := least(ds, rt);   -- 0100: a discount comes off the room, and no further
  nights := n; room_total := rt; extras := ex; discounts := ds;
  taxable := rt - ds;
  room_gst := case when collects then round(taxable * rate/100, 2) else 0 end;
  -- extras and facilities carry their own rate, rounded line by line as the invoice does (0100)
  select case when collects then coalesce(sum(round(amount * r.facility_gst_rate/100, 2)), 0) else 0 end
    into extra_gst from booking_charges where booking_id = b.id and kind in ('facility','extra');
  gst := room_gst + extra_gst;
  total := round(taxable + gst + ex + tx);   -- 0100: whole rupees, as the stay invoice rounds
  paid := pd;
  balance := total - pd;
  return next;
end $function$;

CREATE OR REPLACE FUNCTION public.generate_stay_invoice(p_booking_id uuid, p_guest_gstin text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); b bookings%rowtype; r restaurants%rowtype; g guests%rowtype; rm rooms%rowtype; rt room_types%rowtype;
        n int; lines jsonb := '[]'; c record; sub numeric := 0; disc numeric := 0; gst_total numeric := 0; cg numeric; sg numeric;
        raw numeric; tot numeric; paid numeric := 0; pays jsonb := '[]'; iid uuid;
        line_gst numeric; line_rate numeric; collects boolean; room_amt numeric; room_taxable numeric;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = rid; if not found then raise exception 'booking not found'; end if;
  if exists (select 1 from invoices where booking_id = b.id and kind = 'stay') then select id into iid from invoices where booking_id = b.id and kind = 'stay'; return iid; end if;
  select * into r from restaurants where id = rid; select * into g from guests where id = b.guest_id;
  select * into rm from rooms where id = b.room_id; select * into rt from room_types where id = rm.room_type_id;
  collects := gst_collectable(r.gst_scheme, r.gstin);
  n := greatest(1, b.check_out - b.check_in);

  -- 0100: the discount comes off the room before its tax — as folio_totals has always done. This used to tax
  -- the full room and subtract the discount after, so a stay paid in full showed money still due.
  room_amt := n * b.rate;
  select coalesce(-sum(amount),0) into disc from booking_charges where booking_id = b.id and kind = 'discount'
     and description <> 'Advance received' and description not like 'Payment ·%';
  disc := least(disc, room_amt);
  room_taxable := room_amt - disc;
  line_rate := case when collects then room_gst_for(b.rate, r.room_gst_rate, r.room_gst_rate_high, r.room_gst_threshold) else 0 end;
  line_gst := round(room_taxable * line_rate/100, 2);
  lines := lines || jsonb_build_object('description', 'Room '||rm.number||' · '||coalesce(rt.name,'')||' · '||n||' night'||case when n>1 then 's' else '' end,
                                       'qty', n, 'rate', b.rate, 'amount', room_amt, 'taxable', room_taxable, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '996311');
  sub := sub + room_amt; gst_total := gst_total + line_gst;

  for c in select * from booking_charges where booking_id = b.id order by created_at loop
    if c.kind = 'restaurant' then
      line_rate := case when collects then r.gst_rate else 0 end;
      -- the tax charged on that order when it was posted (0100), so the invoice and the folio agree to the paisa
      line_gst := case when not collects then 0
                       else coalesce((select sum(t.amount) from booking_charges t where t.booking_id = b.id and t.kind = 'tax' and c.ref_id is not null and t.ref_id = c.ref_id),
                                     round(c.amount * line_rate/100, 2)) end;
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'taxable', c.amount, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '996331');
      sub := sub + c.amount; gst_total := gst_total + line_gst;
    elsif c.kind in ('facility','extra') then
      line_rate := case when collects then r.facility_gst_rate else 0 end;
      line_gst := round(c.amount * line_rate/100, 2);
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'taxable', c.amount, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '999721');
      sub := sub + c.amount; gst_total := gst_total + line_gst;
    elsif c.kind = 'discount' and (c.description = 'Advance received' or c.description like 'Payment ·%') then
      paid := paid - c.amount;
      pays := pays || jsonb_build_object('description', c.description, 'amount', -c.amount, 'at', c.created_at);
    end if;
  end loop;
  cg := round(gst_total / 2, 2); sg := gst_total - cg;   -- 0100: the halves add up to the tax exactly
  raw := sub - disc + gst_total; tot := round(raw);
  insert into invoices(restaurant_id, invoice_no, kind, booking_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'stay', b.id, g.full_name, g.phone, p_guest_gstin, lines, sub, disc, cg, sg, tot - raw, tot, paid, pays,
            case when paid + 0.01 >= tot then 'paid' else 'unpaid' end, auth.uid())
    returning id into iid;
  return iid;
end $function$;


-- ═══ 2 · a dining invoice is its bill, line for line ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_dining_invoice(p_bill_id uuid, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_guest_gstin text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); bl bills%rowtype; r restaurants%rowtype; lines jsonb := '[]'; pays jsonb; iid uuid;
        rate numeric; it record; items_taxable numeric; share numeric; gst numeric; total_gst numeric;
        given_tax numeric := 0; given_share numeric := 0; big int;
begin
  select * into bl from bills where id = p_bill_id and restaurant_id = rid; if not found then raise exception 'bill not found'; end if;
  if exists (select 1 from invoices where bill_id = bl.id) then select id into iid from invoices where bill_id = bl.id; return iid; end if;
  select * into r from restaurants where id = rid;
  -- 0100: each dish carries its share of the bill's taxable value after the discount; the service charge and
  -- the on-time fee the bill charged (and taxed) are lines of their own; the lines' tax is the bill's tax to
  -- the paisa. A bill that collected no GST (no GSTIN, composition) shows no rate.
  total_gst := coalesce(bl.cgst, 0) + coalesce(bl.sgst, 0);
  rate := case when total_gst > 0 then r.gst_rate else 0 end;
  items_taxable := greatest(0, bl.subtotal - bl.discount_amount - coalesce(bl.promise_waived, 0));
  for it in select name_snapshot, qty, price_snapshot from order_items where order_id = bl.order_id and status <> 'cancelled' order by created_at, id loop
    share := case when bl.subtotal > 0 then round(it.price_snapshot * it.qty * items_taxable / bl.subtotal, 2) else 0 end;
    gst := round(share * rate/100, 2);
    lines := lines || jsonb_build_object('description', it.name_snapshot, 'qty', it.qty, 'rate', it.price_snapshot, 'amount', it.price_snapshot * it.qty,
                                         'taxable', share, 'gst_rate', rate, 'gst', gst, 'sac', '996331');
    given_tax := given_tax + gst; given_share := given_share + share;
  end loop;
  if coalesce(bl.service_charge, 0) > 0 then
    gst := round(bl.service_charge * rate/100, 2);
    lines := lines || jsonb_build_object('description', 'Service charge', 'qty', 1, 'rate', bl.service_charge, 'amount', bl.service_charge,
                                         'taxable', bl.service_charge, 'gst_rate', rate, 'gst', gst, 'sac', '996331');
    given_tax := given_tax + gst;
  end if;
  if coalesce(bl.promise_fee, 0) > 0 then
    gst := round(bl.promise_fee * rate/100, 2);
    lines := lines || jsonb_build_object('description', 'On-time promise fee', 'qty', 1, 'rate', bl.promise_fee, 'amount', bl.promise_fee,
                                         'taxable', bl.promise_fee, 'gst_rate', rate, 'gst', gst, 'sac', '996331');
    given_tax := given_tax + gst;
  end if;
  -- the paise of rounding go on the largest line, so the lines' taxable value and tax are the bill's exactly
  if jsonb_array_length(lines) > 0 and (given_tax <> total_gst or given_share <> items_taxable) then
    select (x.o - 1)::int into big from jsonb_array_elements(lines) with ordinality as x(l, o) order by (x.l->>'taxable')::numeric desc, x.o limit 1;
    lines := jsonb_set(lines, array[big::text, 'gst'], to_jsonb(round((lines->big->>'gst')::numeric + total_gst - given_tax, 2)));
    if (lines->big->>'description') not in ('Service charge', 'On-time promise fee') then
      lines := jsonb_set(lines, array[big::text, 'taxable'], to_jsonb(round((lines->big->>'taxable')::numeric + items_taxable - given_share, 2)));
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', 'Payment · '||upper(method::text)||coalesce(' '||ref,''), 'amount', amount, 'at', created_at)), '[]') into pays from payments where bill_id = bl.id;
  -- the header adds up: (dishes + service charge + fee) − (discount + a waived meal) + CGST + SGST + round-off = total
  insert into invoices(restaurant_id, invoice_no, kind, bill_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'dining', bl.id, p_guest_name, p_guest_phone, p_guest_gstin, lines,
            bl.subtotal + coalesce(bl.service_charge, 0) + coalesce(bl.promise_fee, 0),
            bl.discount_amount + coalesce(bl.promise_waived, 0),
            bl.cgst, bl.sgst, bl.round_off, bl.total, case when bl.status='paid' then bl.total else 0 end, pays, case when bl.status='paid' then 'paid' else 'due' end, auth.uid())
    returning id into iid;
  return iid;
end $function$;


-- ═══ 3 · GST only where it is owed; bills that cannot be bent ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.post_order_to_room(p_order_id uuid, p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); amt numeric; ono int;
begin
  if not exists (select 1 from bookings where id = p_booking_id and restaurant_id = rid and status = 'checked_in') then raise exception 'guest not checked in'; end if;
  -- 0098: the order must be this property's and still open (a billed order posted again is charged twice)
  if not exists (select 1 from orders where id = p_order_id and restaurant_id = rid and status = 'open') then raise exception 'order not found or already settled'; end if;
  select coalesce(sum(price_snapshot*qty),0), max(o.order_no) into amt, ono from order_items i join orders o on o.id = i.order_id where i.order_id = p_order_id and i.status <> 'cancelled';
  update orders set booking_id = p_booking_id, status = 'billed' where id = p_order_id and restaurant_id = rid;
  update order_items set status = 'served' where order_id = p_order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = p_order_id;
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    values (rid, p_booking_id, 'restaurant', 'Restaurant order #'||ono, amt, 'order', p_order_id, auth.uid());
  -- restaurant GST on the posted amount
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    select rid, p_booking_id, 'tax', 'GST on order #'||ono, round(amt * r.gst_rate/100, 2), 'order', p_order_id, auth.uid() from restaurants r where r.id = rid
      and gst_collectable(r.gst_scheme, r.gstin);   -- 0100: no GST where the property does not collect it
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = p_order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $function$;

CREATE OR REPLACE FUNCTION public.generate_bill(p_order_id uuid, p_discount_pct numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0, p_promise_kept boolean DEFAULT NULL::boolean, p_customer_phone text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_redeem_points numeric DEFAULT 0, p_coupon text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype; c customers%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; half numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
  fee numeric := 0; waived numeric := 0; kept boolean := null;
  cid uuid := null; cp jsonb := null; pct numeric := coalesce(p_discount_pct, 0); amt numeric := coalesce(p_discount_amount, 0);
  redeem numeric := 0; redeem_amt numeric := 0; other numeric;
begin
  -- 0100: a discount is between nothing and the whole bill — a negative one was a hidden surcharge, and taxed
  if pct < 0 or pct > 100 or amt < 0 or coalesce(p_redeem_points, 0) < 0 then raise exception 'a discount cannot be negative or more than 100%%'; end if;
  select * into r from restaurants where id = rid;
  -- the order is taken for update first: a second cashier reaching the same table waits here, and
  -- then finds the bill this one is about to raise
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open' for update;
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;

  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';

  if norm_phone(p_customer_phone) is not null then cid := customer_upsert(p_customer_phone, coalesce(p_customer_name, o.customer_name));
  elsif norm_phone(o.customer_phone) is not null then cid := customer_upsert(o.customer_phone, o.customer_name);
  else cid := o.customer_id; end if;
  if cid is not null then
    update orders set customer_id = cid, customer_phone = coalesce(customer_phone, p_customer_phone), customer_name = coalesce(customer_name, p_customer_name) where id = o.id;
  end if;

  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    cp := coupon_check(p_coupon, sub);
    pct := pct + (cp->>'pct')::numeric; amt := amt + (cp->>'amount')::numeric;
  end if;
  other := least(sub, round(sub * pct/100, 2) + amt);

  if coalesce(p_redeem_points, 0) > 0 then
    if not r.loyalty_enabled then raise exception 'loyalty points are not switched on'; end if;
    if cid is null then raise exception 'a phone number is needed to redeem points'; end if;
    -- and the guest's balance for update, so the same points cannot be spent at two tills
    select * into c from customers where id = cid for update;
    if p_redeem_points > c.points then raise exception 'only % points available', c.points; end if;
    if p_redeem_points < r.loyalty_min_redeem then raise exception 'at least % points must be redeemed at a time', r.loyalty_min_redeem; end if;
    redeem_amt := least(sub - other, round(p_redeem_points * r.loyalty_point_value, 2));
    redeem := round(redeem_amt / r.loyalty_point_value, 2);
  end if;

  disc := least(sub, other + redeem_amt);
  taxable := sub - disc;

  if o.promised_at is not null then
    kept := coalesce(p_promise_kept, case when o.served_at is not null then o.served_at <= o.promised_at else true end);
    if kept then fee := round(taxable * coalesce(o.promise_pct, 0) / 100, 2);
    else waived := taxable; taxable := 0; end if;
  end if;

  sc := round(taxable * r.service_charge_pct/100, 2);
  half := case when gst_collectable(r.gst_scheme, r.gstin) then r.gst_rate/2 else 0 end;
  cg := round((taxable + sc + fee) * half/100, 2);
  sg := cg;
  raw := taxable + sc + fee + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount,
                    service_charge, cgst, sgst, round_off, total,
                    promise_fee, promise_waived, promise_kept, created_by,
                    customer_id, points_redeemed, offer_id, coupon_code)
    values (rid, p_order_id, next_number('bill'), sub, pct, disc,
            sc, cg, sg, tot - raw, tot,
            fee, waived, kept, auth.uid(),
            cid, redeem, nullif(cp->>'id', '')::uuid, cp->>'code')
    returning id into bid;
  if redeem > 0 then
    update customers set points = points - redeem where id = cid;
    insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (rid, cid, bid, -redeem, 'redeem', 'Redeemed on bill', auth.uid());
  end if;
  return bid;
exception
  -- the index caught what the lock is there to prevent; say the same thing either way
  when unique_violation then
    if sqlerrm like '%bills_one_live_per_order%' then raise exception 'bill already exists'; else raise; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.settle_bill(p_bill_id uuid, p_payments jsonb, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; r restaurants%rowtype; p jsonb; paid numeric := 0; earned numeric := 0;
begin
  -- for update: two tills taking the same payment must not count the visit twice
  select * into b from bills where id = p_bill_id and restaurant_id = rid for update;
  if not found then raise exception 'bill not found'; end if;
  if b.status = 'paid' then return; end if;                -- replay-safe
  if b.status = 'void' then raise exception 'this bill was voided — raise a new bill'; end if;   -- 0100: a queued payment cannot revive it
  for p in select * from jsonb_array_elements(p_payments) loop
    insert into payments(restaurant_id, bill_id, method, amount, ref, client_id)
      values (rid, b.id, (p->>'method')::payment_method, (p->>'amount')::numeric, p->>'ref', nullif(p->>'client_id','')::uuid)
      on conflict do nothing;
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < b.total then raise exception 'short by %', b.total - paid; end if;
  if b.customer_id is not null then
    select * into r from restaurants where id = rid;
    if r.loyalty_enabled then earned := round(greatest(0, b.subtotal - b.discount_amount) * r.loyalty_earn_pct / 100, 2); end if;
    update customers set visits = visits + 1, total_spend = total_spend + b.total, last_visit_at = now(), points = points + earned where id = b.customer_id;
    if earned > 0 then
      insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (rid, b.customer_id, b.id, earned, 'earn', 'Earned on bill', auth.uid());
    end if;
  end if;
  update bills set status = 'paid', paid_at = now(), points_earned = earned where id = b.id;
  update orders set status = 'billed' where id = b.order_id;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = b.order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $function$;


-- the bill and invoice series: written only by next_number (definer), unique per property
revoke insert, update, delete, truncate on public.counters from anon, authenticated;
create unique index if not exists bills_no_once on public.bills (restaurant_id, bill_no);
create unique index if not exists invoices_no_once on public.invoices (restaurant_id, invoice_no);

-- rooms up to ₹7,500 a night are 5% from 22 Sep 2025 (12% no longer exists for rooms): the default too
alter table public.restaurants alter column room_gst_rate set default 5;
update public.restaurants set room_gst_rate = 5 where room_gst_rate = 12;


-- ═══ 4 · a property whose trial or membership has ended takes nothing from the public ══════════════

CREATE OR REPLACE FUNCTION public.dine_storefront(p_slug text, p_table text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- every add-on group this property offers, once, with only the add-ons that can be sold today
    'addon_groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min', g.min_select, 'max', g.max_select,
               'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_veg', a.is_veg) order by a.sort_order, a.name)
                                   from addons a where a.group_id = g.id and a.is_active and a.is_available), '[]'::jsonb)) order by g.sort_order, g.name)
      from addon_groups g
      where g.restaurant_id = r.id and g.is_active
        and exists (select 1 from menu_item_addon_groups l join menu_items m on m.id = l.menu_item_id
                    where l.group_id = g.id and m.restaurant_id = r.id and m.is_active)), '[]'::jsonb),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available,
                    'is_combo', m.is_combo, 'image_url', m.image_url, 'image_credit', m.image_credit,
                    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'is_default', v.is_default) order by v.sort_order, v.name)
                                          from menu_variants v where v.menu_item_id = m.id and v.is_active), '[]'::jsonb),
                    -- just the ids; the groups themselves are above
                    'addon_group_ids', coalesce((select jsonb_agg(l.group_id) from menu_item_addon_groups l join addon_groups g on g.id = l.group_id
                                                 where l.menu_item_id = m.id and g.is_active), '[]'::jsonb),
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
  where r.booking_slug = p_slug and membership_state_for(r.id) in ('trial','active')
    and (r.is_listed or exists (select 1 from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table))
$function$;

CREATE OR REPLACE FUNCTION public.dine_discover(p_q text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->'sort'), '[]') from (
    select jsonb_build_object(
      'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'cuisines', to_jsonb(r.cuisines),
      'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
      'district', r.district, 'address', r.address, 'photo', coalesce(r.photos[1], r.cover_url),
      'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
      'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
      'open_now', (current_time between r.opens_at and r.closes_at),
      'km', km_between(p_lat, p_lng, r.lat, r.lng),
      'offers', coalesce((select jsonb_agg(jsonb_build_object('title', o.title, 'kind', o.kind, 'value', o.value))
                          from offers o where o.restaurant_id = r.id and o.is_active
                            and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
      'sort', coalesce(km_between(p_lat, p_lng, r.lat, r.lng), 999) - coalesce(r.rating, 0)
    ) x
    from restaurants r
    where r.is_listed and membership_state_for(r.id) in ('trial','active')
      and (p_q is null or r.name ilike '%'||p_q||'%' or exists (select 1 from unnest(r.cuisines) c where c ilike '%'||p_q||'%')
           or exists (select 1 from menu_items m where m.restaurant_id = r.id and m.is_active and m.name ilike '%'||p_q||'%'))
      and (p_city is null or r.district ilike '%'||p_city||'%')
      and (p_mode is null or (p_mode = 'dining' and r.dining_enabled) or (p_mode = 'delivery' and r.delivery_enabled) or (p_mode = 'rooms' and exists (select 1 from rooms rm where rm.restaurant_id = r.id)))
  ) y
$function$;

CREATE OR REPLACE FUNCTION public.public_property(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('id', r.id, 'name', r.name, 'tagline', r.tagline, 'address', r.address, 'phone', r.phone,
    'cover_url', r.cover_url, 'policies', r.policies, 'check_in_time', r.check_in_time, 'check_out_time', r.check_out_time,
    'room_gst_rate', r.room_gst_rate, 'advance_pct', r.advance_pct, 'property_type', r.property_type,
    'room_types', (select coalesce(jsonb_agg(jsonb_build_object('id', rt.id, 'name', rt.name, 'base_rate', rt.base_rate, 'capacity', rt.capacity, 'amenities', rt.amenities)), '[]')
                   from room_types rt where rt.restaurant_id = r.id and rt.is_active))
  from restaurants r where r.booking_slug = p_slug and r.booking_engine and membership_state_for(r.id) in ('trial','active')
$function$;

CREATE OR REPLACE FUNCTION public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text DEFAULT 'delivery'::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  ph text;
begin
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial','active');   -- 0100
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
  -- 0098: at most 100 lines, a phone number the restaurant can call, ten orders an hour per number
  -- and three hundred an hour per place
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 100 then raise exception 'that basket is too large — please call the restaurant'; end if;
  ph := right(regexp_replace(p_guest->>'phone', '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the restaurant can call'; end if;
  if not _hit('order:' || rid || ':' || ph, 10, interval '1 hour') then raise exception 'this number has ordered a lot in the last hour — please call the restaurant'; end if;
  if not _hit('order:' || rid, 300, interval '1 hour') then raise exception 'the kitchen is very busy — please try again in a few minutes'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select m.is_active and m.is_available into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := least(99, greatest(1, (it->>'qty')::numeric));                                     -- 0098: at most 99 of a dish
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', left(it->>'note', 200),
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
  ext := case when p_mode = 'dine_in' then 'TBL-' else 'WEB-' end || to_char(now(), 'YYMMDDHH24MISS') || '-' || encode(extensions.gen_random_bytes(2), 'hex');   -- 0098
  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, gross, commission, payout, is_prepaid, raw, placed_at, table_id)
    values (rid, ch.id, ext, right(ext, 6), left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20),
            case when p_mode = 'dine_in' then 'Table ' || t.name else left(p_guest->>'address', 300) end,
            items, tot, 0, tot, false,
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name), now(), t.id)
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
end $function$;

CREATE OR REPLACE FUNCTION public.dine_reserve(p_slug text, p_guest jsonb, p_date date, p_time time without time zone, p_party integer, p_occasion text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; no int; cap int; taken int; off offers%rowtype; res_id uuid; ph text;
begin
  select * into r from restaurants where booking_slug = p_slug and is_listed and dining_enabled and membership_state_for(id) in ('trial','active');   -- 0100
  if not found then raise exception 'this place is not taking bookings'; end if;
  if coalesce(p_guest->>'full_name','') = '' or coalesce(p_guest->>'phone','') = '' then raise exception 'name and phone are needed'; end if;
  if p_date < current_date then raise exception 'choose a future time'; end if;
  rid := r.id;
  -- 0098: a phone number the restaurant can call; five bookings a day per number, sixty an hour per place
  ph := right(regexp_replace(p_guest->>'phone', '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the restaurant can call'; end if;
  if not _hit('reserve:' || rid || ':' || ph, 5, interval '1 day') then raise exception 'this number has booked a few tables today already — please call the restaurant'; end if;
  if not _hit('reserve:' || rid, 60, interval '1 hour') then raise exception 'bookings are very busy right now — please try again in a few minutes'; end if;
  cap := coalesce(r.seats_per_slot, greatest(8, (select coalesce(sum(capacity), 0) from dining_tables where restaurant_id = rid)));
  select coalesce(sum(party_size), 0) into taken from reservations
    where restaurant_id = rid and on_date = p_date and status in ('requested','confirmed','seated')
      and at_time >= p_time - make_interval(mins => r.slot_minutes) and at_time < p_time + make_interval(mins => r.slot_minutes);
  if cap - taken < p_party then raise exception 'that time just filled up — please pick another'; end if;
  if p_offer is not null then select * into off from offers where id = p_offer and restaurant_id = rid and is_active; end if;
  select coalesce(max(reservation_no), 0) + 1 into no from reservations where restaurant_id = rid;
  insert into reservations(restaurant_id, reservation_no, guest_name, guest_phone, guest_email, on_date, at_time, party_size, occasion, note, status, offer_id, offer_label, discount_pct)
    values (rid, no, left(p_guest->>'full_name', 80), left(p_guest->>'phone', 20), left(p_guest->>'email', 120), p_date, p_time, greatest(1, p_party), left(p_occasion, 60), left(p_note, 500),
            'confirmed', off.id, off.title, case when off.kind = 'flat_pct' then off.value else 0 end)
    returning id into res_id;
  return jsonb_build_object('ok', true, 'id', res_id, 'no', no, 'name', r.name, 'date', p_date, 'time', to_char(p_time, 'HH24:MI'),
    'party', p_party, 'offer', off.title, 'discount_pct', case when off.kind = 'flat_pct' then off.value else 0 end, 'phone', r.phone, 'address', r.address);
end $function$;

CREATE OR REPLACE FUNCTION public.queue_join(p_slug text, p_name text, p_phone text, p_party integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; q int; w walkins; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed and membership_state_for(id) in ('trial','active');   -- 0100
  if rid is null then raise exception 'this place is not taking a queue right now'; end if;
  if p_party < 1 or p_party > 20 then raise exception 'party size must be between 1 and 20'; end if;
  if (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting') >= 60 then raise exception 'the queue is full — please ask at the counter'; end if;
  -- 0098: three joins an hour per phone number, a hundred and fifty an hour per place
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if ph <> '' and not _hit('queue:' || rid || ':' || ph, 3, interval '1 hour') then raise exception 'this number has joined a few times already — please ask at the counter'; end if;
  if not _hit('queue:' || rid, 150, interval '1 hour') then raise exception 'the queue is very busy — please ask at the counter'; end if;
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source) values (rid, left(p_name, 60), nullif(left(p_phone, 20), ''), p_party, q, 'qr') returning * into w;
  return queue_status(w.token);
end $function$;

CREATE OR REPLACE FUNCTION public.public_book(p_slug text, p_room_type_id uuid, p_check_in date, p_check_out date, p_guest jsonb, p_adults integer DEFAULT 2, p_children integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; rm uuid; gid uuid; bid uuid; rt numeric; n int; bno int; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and booking_engine and membership_state_for(id) in ('trial','active');   -- 0100
  if rid is null then raise exception 'bookings are closed'; end if;
  if p_check_out <= p_check_in or p_check_in < current_date then raise exception 'choose valid dates'; end if;
  n := p_check_out - p_check_in;
  -- 0098: online, a stay is up to 30 nights and starts within two years; longer, the property takes it
  if n > 30 or p_check_in > current_date + 730 then raise exception 'for a stay this long or this far ahead, please call the property'; end if;
  -- 0098: a name and a phone number the property can call; three bookings a day per number, twenty
  -- an hour per property
  if coalesce(trim(p_guest->>'full_name'), '') = '' then raise exception 'name and phone are needed'; end if;
  ph := right(regexp_replace(coalesce(p_guest->>'phone', ''), '\D', '', 'g'), 10);
  if length(ph) < 8 then raise exception 'please give a phone number the property can call'; end if;
  if not _hit('book:' || rid || ':' || ph, 3, interval '1 day') then raise exception 'this number has booked a few times today already — please call the property'; end if;
  if not _hit('book:' || rid, 20, interval '1 hour') then raise exception 'the booking page is very busy — please try again in a few minutes'; end if;
  -- 0098: what the page shows as stop-sell, or with no rooms left to sell online, cannot be booked here either
  if exists (select 1 from rate_inventory ri where ri.restaurant_id = rid and ri.room_type_id = p_room_type_id
               and ri.stay_date >= p_check_in and ri.stay_date < p_check_out
               and (ri.stop_sell or (ri.open_rooms is not null and ri.open_rooms <= (
                     select count(*) from bookings b join rooms r2 on r2.id = b.room_id
                      where r2.room_type_id = p_room_type_id and b.status in ('reserved','checked_in')
                        and b.check_in <= ri.stay_date and b.check_out > ri.stay_date))))
    then raise exception 'those dates just filled up'; end if;
  select r.id into rm from rooms r where r.restaurant_id = rid and r.room_type_id = p_room_type_id and r.status <> 'maintenance'
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status in ('reserved','checked_in') and b.check_in < p_check_out and b.check_out > p_check_in)
    order by r.sort_order limit 1;
  if rm is null then raise exception 'those dates just filled up'; end if;
  select coalesce(max(coalesce(ri.rate, rt2.base_rate)), 0) into rt from room_types rt2
    left join rate_inventory ri on ri.room_type_id = rt2.id and ri.restaurant_id = rid and ri.stay_date between p_check_in and p_check_out - 1
    where rt2.id = p_room_type_id and rt2.restaurant_id = rid;
  insert into guests(restaurant_id, full_name, phone, email)
    values (rid, left(trim(p_guest->>'full_name'), 80), left(p_guest->>'phone', 20), left(p_guest->>'email', 120)) returning id into gid;
  -- 0098: the property's own counter. next_number('booking') looked for a property in the caller's
  -- session — a guest has none — and raised, so no booking from this page ever went through.
  bno := next_number('booking', rid);
  insert into bookings(restaurant_id, booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, status, source, notes)
    values (rid, bno, gid, rm, p_check_in, p_check_out,
            least(greatest(coalesce(p_adults, 2), 1), 20), least(greatest(coalesce(p_children, 0), 0), 20),
            rt, 'reserved', 'direct', left(p_guest->>'note', 500))
    returning id into bid;
  return jsonb_build_object('booking_id', bid, 'nights', n, 'rate', rt, 'total', rt * n);
end $function$;


-- ═══ 5 · "Push" says what really happens: nothing is sent ═════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.push_channel(p_channel_id uuid, p_kind text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ch ota_channels%rowtype; oc order_channels%rowtype; rid uuid := auth_restaurant_id(); n int := 0; live boolean := false; msg text;
begin
  if p_kind = 'ari' then
    select * into ch from ota_channels where id = p_channel_id and restaurant_id = rid;
    if not found then raise exception 'channel not found'; end if;
    live := false;   -- 0100: DineFlow has no connection to an OTA yet; it never sent anything
    select count(*) into n from rate_inventory where restaurant_id = rid and stay_date >= current_date;
    msg := 'Not sent — DineFlow does not connect to '||ch.label||' directly yet. '||n||' days of rates are ready here; change them in '||ch.label||' as well.';
    insert into ota_sync_log(restaurant_id, channel_id, direction, ok, message, count) values (rid, ch.id, 'push_ari', true, msg, n);
    update ota_channels set last_push_at = now() where id = ch.id;
  else
    select * into oc from order_channels where id = p_channel_id and restaurant_id = rid;
    if not found then raise exception 'channel not found'; end if;
    live := false;   -- 0100: no connection to an aggregator yet either
    select count(*) into n from menu_items where restaurant_id = rid and is_active;
    msg := 'Not sent — DineFlow does not connect to '||oc.label||' directly yet. Change the menu in '||oc.label||'''s partner app as well ('||n||' dishes here).';
    insert into ota_sync_log(restaurant_id, channel_id, direction, ok, message, count) values (rid, null, 'push_menu', true, msg, n);
    update order_channels set last_sync_at = now() where id = oc.id;
  end if;
  return jsonb_build_object('ok', true, 'live', live, 'count', n, 'message', msg);
end $function$;
