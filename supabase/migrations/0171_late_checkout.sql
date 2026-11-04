-- 0171 · Late check-out on the stay bill (2026-11-04).
-- The owner: "if the guest overstays, add an extra amount to the bill by how long they stayed on — more than 3 hours, half a
-- day; more than that, a full day; and further on the same way."
--
-- The stay is due out at its check-out date + the property's check-out time (IST). Past that:
--   · each whole 24 hours late is one more night at the booking's rate;
--   · of what is left, up to `late_half_after_min` (3 h) is free, past it half a night, past `late_full_after_min` (6 h) a night.
-- So 2 h late is nothing, 4 h half a night, 7 h a night, 28 h a night and a half, 31 h two nights.
-- It is room revenue: taxed at the room's own slab (room_gst_for), SAC 996311, its own line on the stay invoice.
--
-- While the guest is in, it is worked out live (the folio shows what it is now); at check-out it is frozen on the booking
-- (bookings.late_fee / late_label), so a closed stay never changes. Only stays due out after restaurants.late_checkout_since
-- (the moment 0171 was applied, or the property was made) are charged. Stays checked out before this migration have no
-- late_fee and stay as they were billed. The front desk can waive it on a stay (late_checkout_waive, owner / manager /
-- supervisor), and a property can turn it off (restaurants.late_checkout_on).
-- RLS: no new table. The new columns sit on restaurants and bookings, under their existing policies; the booking columns
-- are written only by these security-definer functions.

alter table public.restaurants
  add column if not exists late_checkout_on boolean not null default true,
  add column if not exists late_half_after_min integer not null default 180,
  add column if not exists late_full_after_min integer not null default 360,
  -- only stays due out after this are charged: a guest already overstaying when 0171 went live (three on the live
  -- database, one since September) gets no surprise charge — the front desk settles those as before
  add column if not exists late_checkout_since timestamptz not null default now();

do $$ begin
  alter table public.restaurants add constraint restaurants_late_checkout_steps
    check (late_half_after_min between 0 and 1439 and late_full_after_min between late_half_after_min and 1439);
exception when duplicate_object then null; end $$;

alter table public.bookings
  add column if not exists late_fee numeric,
  add column if not exists late_label text,
  add column if not exists late_waived boolean not null default false;

-- the money fence on bookings (0150's body): the late check-out is set by check_out and late_checkout_waive only, never
-- straight through the API
create or replace function public.fence_bookings()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if not _api_write() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then raise exception 'bookings are made at the front desk' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then raise exception 'a booking is cancelled, not deleted' using errcode = '42501'; end if;
  if (new.rate, new.restaurant_id) is distinct from (old.rate, old.restaurant_id) then raise exception 'a room''s rate changes at the front desk' using errcode = '42501'; end if;
  if (new.late_fee, new.late_label, new.late_waived) is distinct from (old.late_fee, old.late_label, old.late_waived) then
    raise exception 'a late check-out is set at the front desk' using errcode = '42501';
  end if;
  return new;
end $function$;

-- 1 · the arithmetic, on its own (no table read): minutes late → nights to charge
create or replace function public._late_steps(p_minutes integer, p_half integer, p_full integer)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when coalesce(p_minutes, 0) <= 0 then 0::numeric else
    (p_minutes / 1440)::numeric
    + case when p_minutes % 1440 > coalesce(p_full, 360) then 1
           when p_minutes % 1440 > coalesce(p_half, 180) then 0.5
           else 0 end
  end;
$function$;

-- 2 · one stay: when it was due out, how late it is (or was), and what that costs
create or replace function public.late_checkout(p_booking_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare b bookings%rowtype; r restaurants%rowtype; due timestamptz; at timestamptz; mins integer; steps numeric; fee numeric; label text;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id();
  if not found then return null; end if;
  select * into r from restaurants where id = b.restaurant_id;
  due := (b.check_out + coalesce(r.check_out_time, '11:00'::time)) at time zone 'Asia/Kolkata';

  -- a closed stay: what was frozen at check-out (nothing, for stays closed before 0171)
  if b.status <> 'checked_in' then
    return jsonb_build_object('due_at', due, 'minutes', 0, 'nights', 0, 'fee', coalesce(b.late_fee, 0), 'label', b.late_label,
                              'waived', b.late_waived, 'on', r.late_checkout_on, 'frozen', true,
                              'half_after', r.late_half_after_min, 'full_after', r.late_full_after_min);
  end if;

  at := now();
  mins := greatest(0, floor(extract(epoch from (at - due)) / 60)::integer);
  steps := case when r.late_checkout_on and due >= r.late_checkout_since then _late_steps(mins, r.late_half_after_min, r.late_full_after_min) else 0 end;
  fee := case when b.late_waived then 0 else round(steps * coalesce(b.rate, 0), 2) end;
  label := case when steps = 0 then null
                else 'Late check-out · ' || case when mins >= 60 then (mins / 60) || 'h ' || lpad((mins % 60)::text, 2, '0') || 'm' else mins || ' min' end
                     || ' · ' || case when steps = 0.5 then 'half day'
                                      when steps = trunc(steps) then trunc(steps)::int || ' day' || case when steps > 1 then 's' else '' end
                                      else trunc(steps)::int || ' day' || case when steps >= 2 then 's' else '' end || ' + half' end
                     || case when b.late_waived then ' · waived' else '' end end;
  return jsonb_build_object('due_at', due, 'minutes', mins, 'nights', steps, 'fee', fee, 'label', label,
                            'waived', b.late_waived, 'on', r.late_checkout_on, 'frozen', false,
                            'half_after', r.late_half_after_min, 'full_after', r.late_full_after_min);
end $function$;
revoke all on function public.late_checkout(uuid) from public, anon;
grant execute on function public.late_checkout(uuid) to authenticated, service_role;

-- 3 · waive (or put back) a stay's late check-out — only while the guest is in
create or replace function public.late_checkout_waive(p_booking_id uuid, p_waive boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b bookings%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('owner', 'manager', 'supervisor', 'supervisor_2') then
    raise exception 'only the owner, a manager or a supervisor waives a late check-out' using errcode = '42501';
  end if;
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() for update;
  if not found then raise exception 'booking not found'; end if;
  if b.status <> 'checked_in' then raise exception 'the guest is not checked in'; end if;
  update bookings set late_waived = coalesce(p_waive, false) where id = b.id;
  return late_checkout(b.id);
end $function$;
revoke all on function public.late_checkout_waive(uuid, boolean) from public, anon;
grant execute on function public.late_checkout_waive(uuid, boolean) to authenticated, service_role;

-- 4 · the folio, with the late check-out as room revenue (two columns added at the end, so the return type changes:
-- dropped and made again, 0100's body otherwise)
drop function if exists public.folio_totals(uuid);
create function public.folio_totals(p_booking_id uuid)
 returns table(nights integer, room_total numeric, extras numeric, discounts numeric, taxable numeric, gst numeric, total numeric, paid numeric, balance numeric,
               late_fee numeric, late_label text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare b bookings%rowtype; r restaurants%rowtype; n int; rt numeric; ex numeric; ds numeric; pd numeric; tx numeric;
        rate numeric; room_gst numeric; extra_gst numeric; collects boolean; lt jsonb; lf numeric;
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
  -- 0171: late check-out, live while the guest is in, frozen after
  lt := late_checkout(b.id);
  lf := coalesce((lt->>'fee')::numeric, 0);
  nights := n; room_total := rt; extras := ex; discounts := ds;
  taxable := rt - ds + lf;
  -- the room and the late check-out are two lines on the invoice, each rounded on its own
  room_gst := case when collects then round((rt - ds) * rate/100, 2) + round(lf * rate/100, 2) else 0 end;
  -- extras and facilities carry their own rate, rounded line by line as the invoice does (0100)
  select case when collects then coalesce(sum(round(amount * r.facility_gst_rate/100, 2)), 0) else 0 end
    into extra_gst from booking_charges where booking_id = b.id and kind in ('facility','extra');
  gst := room_gst + extra_gst;
  total := round(taxable + gst + ex + tx);   -- 0100: whole rupees, as the stay invoice rounds
  paid := pd;
  balance := total - pd;
  late_fee := lf; late_label := case when lf > 0 or coalesce((lt->>'waived')::boolean, false) then lt->>'label' end;
  return next;
end $function$;
revoke all on function public.folio_totals(uuid) from public, anon;
grant execute on function public.folio_totals(uuid) to authenticated, service_role;

-- 5 · check-out (0170's body): the late check-out is in the balance it asks for, and frozen on the booking
CREATE OR REPLACE FUNCTION public.check_out(p_booking_id uuid, p_payments jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b bookings%rowtype; f record; p jsonb; paid numeric := 0; iid uuid; ono integer;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'checked_in' for update;
  if not found then raise exception 'guest is not checked in'; end if;
  -- 0170: room service still on its way would never reach the invoice — post it (or bill it) first
  select order_no into ono from orders where booking_id = b.id and status = 'open' order by created_at limit 1;
  if found then raise exception 'room service order #% is still open — post it to the room or bill it before check-out', ono; end if;
  select * into f from folio_totals(b.id);
  for p in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by)
      values (b.restaurant_id, b.id, 'discount', 'Payment · '||upper(p->>'method')||coalesce(' '||(p->>'ref'),''), -(p->>'amount')::numeric, auth.uid());
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < f.balance then
    if coalesce(f.late_fee, 0) > 0 then
      raise exception 'balance % remains — it includes the late check-out (%), reopen the folio to see it', f.balance - paid, f.late_label;
    end if;
    raise exception 'balance % remains', f.balance - paid;
  end if;
  -- 0171: what the late check-out came to, kept, so the closed stay never changes
  update bookings set status = 'checked_out', checked_out_at = now(),
         late_fee = coalesce(f.late_fee, 0), late_label = f.late_label where id = b.id;
  update rooms set status = 'cleaning' where id = b.room_id;
  insert into housekeeping_tasks(restaurant_id, room_id, kind, notes) values (b.restaurant_id, b.room_id, 'clean', 'Checkout clean');
  iid := generate_stay_invoice(b.id);
  return iid;
end $function$;

-- 6 · the stay invoice (0100's body) with the late check-out as its own room line
CREATE OR REPLACE FUNCTION public.generate_stay_invoice(p_booking_id uuid, p_guest_gstin text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); b bookings%rowtype; r restaurants%rowtype; g guests%rowtype; rm rooms%rowtype; rt room_types%rowtype;
        n int; lines jsonb := '[]'; c record; sub numeric := 0; disc numeric := 0; gst_total numeric := 0; cg numeric; sg numeric;
        raw numeric; tot numeric; paid numeric := 0; pays jsonb := '[]'; iid uuid;
        line_gst numeric; line_rate numeric; collects boolean; room_amt numeric; room_taxable numeric; room_rate numeric; lt jsonb; lf numeric;
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
  room_rate := case when collects then room_gst_for(b.rate, r.room_gst_rate, r.room_gst_rate_high, r.room_gst_threshold) else 0 end;
  line_gst := round(room_taxable * room_rate/100, 2);
  lines := lines || jsonb_build_object('description', 'Room '||rm.number||' · '||coalesce(rt.name,'')||' · '||n||' night'||case when n>1 then 's' else '' end,
                                       'qty', n, 'rate', b.rate, 'amount', room_amt, 'taxable', room_taxable, 'gst_rate', room_rate, 'gst', line_gst, 'sac', '996311');
  sub := sub + room_amt; gst_total := gst_total + line_gst;

  -- 0171: the late check-out, at the room's slab (frozen on the booking at check-out; live if the invoice is made earlier)
  lt := late_checkout(b.id);
  lf := coalesce((lt->>'fee')::numeric, 0);
  if lf > 0 then
    line_gst := round(lf * room_rate/100, 2);
    lines := lines || jsonb_build_object('description', coalesce(lt->>'label', 'Late check-out'),
                                         'qty', round(lf / nullif(b.rate, 0), 2), 'rate', b.rate, 'amount', lf, 'taxable', lf, 'gst_rate', room_rate, 'gst', line_gst, 'sac', '996311');
    sub := sub + lf; gst_total := gst_total + line_gst;
  end if;

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

notify pgrst, 'reload schema';
