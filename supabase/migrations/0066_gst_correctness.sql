-- 0066 · Getting the tax right.
--
-- Four things were wrong, and every one of them is the kind that is only discovered by an officer or
-- an auditor:
--
--  1. A composition dealer's bill still carried CGST and SGST. Section 10(4) of the CGST Act says a
--     composition taxable person "shall not collect any tax from the recipient" — and the receipt was
--     already printing the Rule 49 declaration that says exactly that, above a total that included
--     tax. An unregistered business has no authority to collect it either.
--
--  2. Accommodation was taxed at one rate for the whole property. Since 22 September 2025 the rate is
--     decided per unit per day by the value of supply: 5% at or below ₹7,500 a night, 18% above it.
--     One invoice for a hotel with a ₹4,000 room and a ₹9,000 suite must carry both.
--
--  3. That single rate still defaulted to 12%, which was the rate for rooms up to ₹7,500 *before*
--     22 September 2025 and has not been lawful since.
--
--  4. The folio and the stay invoice disagreed. Extras and facilities — a spa, laundry, an airport
--     drop — were taxed on the invoice and not on the folio, so check-out collected one amount and
--     the invoice the guest carried away stated another.
--
-- Rates move by notification. Everything below is a number the owner can change, not a constant
-- compiled into the app; the defaults are the schedule in force from 22 September 2025.

-- ───────── the numbers the owner owns ─────────
-- room_gst_rate is kept, and now means "the rate at or below the threshold" — the rate almost every
-- room in India is charged at. The slab above it and the threshold itself sit beside it.
alter table restaurants
  add column if not exists room_gst_rate_high numeric(5,2)  not null default 18,
  add column if not exists room_gst_threshold numeric(12,2) not null default 7500,
  add column if not exists facility_gst_rate  numeric(5,2)  not null default 18;

comment on column restaurants.room_gst_rate is
  'GST % on a room at or below room_gst_threshold per night. 5% (no ITC) from 22 Sep 2025.';
comment on column restaurants.room_gst_rate_high is
  'GST % on a room above room_gst_threshold per night. 18% (with ITC) from 22 Sep 2025.';
comment on column restaurants.facility_gst_rate is
  'GST % on folio extras — spa, laundry, transport. Their own rate, not the room''s.';

-- 12% was the pre-22-September-2025 rate for rooms up to ₹7,500 and is no longer a lawful choice for
-- them. Only the untouched default is corrected; a property that deliberately set something else
-- keeps it, because that is a decision its accountant made and this migration has no standing to
-- overrule it.
update restaurants set room_gst_rate = 5 where room_gst_rate = 12;

-- ───────── who may collect tax at all ─────────
-- A regular registered dealer, and nobody else. A composition dealer issues a bill of supply; an
-- unregistered business issues a plain bill. Both charge the food and the room, and no tax on top.
create or replace function gst_collectable(p_scheme text, p_gstin text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_scheme, 'regular') = 'regular' and nullif(trim(coalesce(p_gstin, '')), '') is not null;
$$;

-- ───────── which accommodation slab a night falls in ─────────
-- The test is the value of supply of that unit for that day — the rate actually charged, which is
-- what has decided it since the "declared tariff" wording was dropped in October 2019.
create or replace function room_gst_for(p_nightly numeric, p_low numeric, p_high numeric, p_threshold numeric)
returns numeric language sql immutable set search_path = public as $$
  select case when coalesce(p_nightly, 0) > coalesce(p_threshold, 7500)
              then coalesce(p_high, 18) else coalesce(p_low, 5) end;
$$;

grant execute on function gst_collectable(text, text) to authenticated;
grant execute on function room_gst_for(numeric, numeric, numeric, numeric) to authenticated;

-- ───────── the dining bill ─────────
-- Unchanged but for one line: a property that may not collect tax does not. The service charge and
-- the on-time promise fee are not taxes and are still charged — they are part of what was sold, which
-- is also why they are taxed when tax applies at all.
create or replace function generate_bill(
  p_order_id uuid,
  p_discount_pct numeric default 0,
  p_discount_amount numeric default 0,
  p_promise_kept boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; half numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
  fee numeric := 0; waived numeric := 0; kept boolean := null;
begin
  select * into r from restaurants where id = rid;
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;

  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';
  disc := least(sub, round(sub * coalesce(p_discount_pct,0)/100, 2) + coalesce(p_discount_amount,0));
  taxable := sub - disc;

  if o.promised_at is not null then
    kept := coalesce(
      p_promise_kept,
      case when o.served_at is not null then o.served_at <= o.promised_at else true end);
    if kept then
      fee := round(taxable * coalesce(o.promise_pct, 0) / 100, 2);
    else
      waived := taxable;
      taxable := 0;
    end if;
  end if;

  sc := round(taxable * r.service_charge_pct/100, 2);
  half := case when gst_collectable(r.gst_scheme, r.gstin) then r.gst_rate/2 else 0 end;
  cg := round((taxable + sc + fee) * half/100, 2);
  sg := cg;
  raw := taxable + sc + fee + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount,
                    service_charge, cgst, sgst, round_off, total,
                    promise_fee, promise_waived, promise_kept, created_by)
    values (rid, p_order_id, next_number('bill'), sub, coalesce(p_discount_pct,0), disc,
            sc, cg, sg, tot - raw, tot,
            fee, waived, kept, auth.uid())
    returning id into bid;
  return bid;
end $$;

grant execute on function generate_bill(uuid, numeric, numeric, boolean) to authenticated;

-- ───────── the running folio ─────────
-- Now taxes what the invoice taxes, at the rates the invoice uses: the room on its own slab, extras
-- and facilities on theirs. Restaurant charges posted from a table already carry their tax as a
-- separate 'tax' row, so they are added whole and not taxed twice.
create or replace function folio_totals(p_booking_id uuid)
returns table (nights int, room_total numeric, extras numeric, discounts numeric, taxable numeric,
               gst numeric, total numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare b bookings%rowtype; r restaurants%rowtype; n int; rt numeric; ex numeric; ds numeric; pd numeric; tx numeric;
        rate numeric; room_gst numeric; extra_gst numeric; collects boolean;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id();
  select * into r from restaurants where id = b.restaurant_id;
  collects := gst_collectable(r.gst_scheme, r.gstin);
  n := greatest(1, b.check_out - b.check_in);
  rt := n * b.rate;
  select coalesce(sum(amount),0) into ex from booking_charges where booking_id = b.id and kind in ('restaurant','facility','extra');
  select coalesce(-sum(amount),0) into ds from booking_charges where booking_id = b.id and kind = 'discount' and description <> 'Advance received';
  select coalesce(-sum(amount),0) into pd from booking_charges where booking_id = b.id and kind = 'discount' and description = 'Advance received';
  select coalesce(sum(amount),0) into tx from booking_charges where booking_id = b.id and kind = 'tax';  -- restaurant GST, already charged on its bill

  rate := room_gst_for(b.rate, r.room_gst_rate, r.room_gst_rate_high, r.room_gst_threshold);
  nights := n; room_total := rt; extras := ex; discounts := ds;
  taxable := rt - ds;
  room_gst := case when collects then round(taxable * rate/100, 2) else 0 end;
  -- extras and facilities carry their own rate; restaurant charges are excluded, their tax is in tx
  select case when collects then coalesce(round(sum(amount) * r.facility_gst_rate/100, 2), 0) else 0 end
    into extra_gst from booking_charges where booking_id = b.id and kind in ('facility','extra');
  gst := room_gst + extra_gst;
  total := round(taxable + gst + ex + tx, 2);
  paid := pd;
  balance := total - pd;
  return next;
end $$;

-- ───────── the stay invoice ─────────
-- Every line carries the rate that line is due, so a folio with a room, a spa and a dinner shows
-- three rates on one invoice, which is what Rule 46 asks for and what the folio now collects.
create or replace function generate_stay_invoice(p_booking_id uuid, p_guest_gstin text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bookings%rowtype; r restaurants%rowtype; g guests%rowtype; rm rooms%rowtype; rt room_types%rowtype;
        n int; lines jsonb := '[]'; c record; sub numeric := 0; disc numeric := 0; cg numeric := 0; sg numeric := 0;
        raw numeric; tot numeric; paid numeric := 0; pays jsonb := '[]'; iid uuid;
        line_gst numeric; line_rate numeric; collects boolean;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = rid; if not found then raise exception 'booking not found'; end if;
  if exists (select 1 from invoices where booking_id = b.id and kind = 'stay') then select id into iid from invoices where booking_id = b.id and kind = 'stay'; return iid; end if;
  select * into r from restaurants where id = rid; select * into g from guests where id = b.guest_id;
  select * into rm from rooms where id = b.room_id; select * into rt from room_types where id = rm.room_type_id;
  collects := gst_collectable(r.gst_scheme, r.gstin);
  n := greatest(1, b.check_out - b.check_in);

  -- the room, on the slab its nightly value falls in
  line_rate := case when collects then room_gst_for(b.rate, r.room_gst_rate, r.room_gst_rate_high, r.room_gst_threshold) else 0 end;
  line_gst := round(n * b.rate * line_rate/100, 2);
  lines := lines || jsonb_build_object('description', 'Room '||rm.number||' · '||coalesce(rt.name,'')||' · '||n||' night'||case when n>1 then 's' else '' end,
                                       'qty', n, 'rate', b.rate, 'amount', n*b.rate, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '996311');
  sub := sub + n*b.rate; cg := cg + line_gst/2; sg := sg + line_gst/2;

  for c in select * from booking_charges where booking_id = b.id order by created_at loop
    if c.kind = 'restaurant' then
      line_rate := case when collects then r.gst_rate else 0 end;
      line_gst := round(c.amount * line_rate/100, 2);
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '996331');
      sub := sub + c.amount; cg := cg + line_gst/2; sg := sg + line_gst/2;
    elsif c.kind in ('facility','extra') then
      line_rate := case when collects then r.facility_gst_rate else 0 end;
      line_gst := round(c.amount * line_rate/100, 2);
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'gst_rate', line_rate, 'gst', line_gst, 'sac', '999721');
      sub := sub + c.amount; cg := cg + line_gst/2; sg := sg + line_gst/2;
    elsif c.kind = 'discount' and (c.description = 'Advance received' or c.description like 'Payment ·%') then
      paid := paid - c.amount;
      pays := pays || jsonb_build_object('description', c.description, 'amount', -c.amount, 'at', c.created_at);
    elsif c.kind = 'discount' then
      disc := disc - c.amount;
    end if;
  end loop;
  cg := round(cg, 2); sg := round(sg, 2);
  raw := sub - disc + cg + sg; tot := round(raw);
  insert into invoices(restaurant_id, invoice_no, kind, booking_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'stay', b.id, g.full_name, g.phone, p_guest_gstin, lines, sub, disc, cg, sg, tot - raw, tot, paid, pays,
            case when paid + 0.01 >= tot then 'paid' else 'unpaid' end, auth.uid())
    returning id into iid;
  return iid;
end $$;

grant execute on function generate_stay_invoice(uuid, text) to authenticated;
