-- 0146 — Bills that charge what the guest was quoted and what the law asks (2026-10-29, the owner: "Stage 1 — the money
-- errors, carefully"). One migration, because every part changes the same sum:
--   1. a QR / website order's offer discount and its packing or delivery fee travel with the order to the bill (the guest
--      at T3 was quoted ₹132 with 10% off; the till billed ₹147);
--   2. a GST rate per dish (menu_items.gst_rate; null = the property's rate), copied onto the order line when it is ordered;
--   3. an HSN / SAC code per dish (menu_items.hsn) for the tax invoice — not IGST: a restaurant's or hotel's place of supply
--      is the property itself, so its bill is always CGST + SGST, whoever the buyer is;
--   4. credit notes: a refund on a paid bill is a numbered document of its own (the bill is never edited);
--   5. Swiggy / Zomato / ONDC orders: the operator pays the GST under section 9(5) — the restaurant's bill charges none;
--   6. the service charge is a choice on each bill (generate_bill p_service_charge): on by default at the till as before,
--      off by default for an order that came from a QR, the website or an aggregator — that guest was never shown it.
-- One tax sum for all of it: bill_tax(groups, base, collect). The bill and the guest's quote both call it; @dineflow/shared
-- computeBill mirrors it for the screen's preview. With every dish at one rate it gives exactly what the old sum gave.

-- ── the dish's rate and code, and the order line's copy of them ─────────────────────────────────────────────────────
alter table menu_items add column if not exists gst_rate numeric(5,2);
alter table menu_items add column if not exists hsn text;
alter table menu_items drop constraint if exists menu_items_gst_rate_ok;
alter table menu_items add constraint menu_items_gst_rate_ok check (gst_rate is null or gst_rate in (0, 5, 12, 18, 28, 40));
alter table menu_items drop constraint if exists menu_items_hsn_ok;
alter table menu_items add constraint menu_items_hsn_ok check (hsn is null or hsn ~ '^[0-9]{4,8}$');

alter table order_items add column if not exists gst_rate numeric(5,2);
alter table order_items add column if not exists hsn text;

/* The line takes the dish's rate and code when it is ordered — whoever writes the line (the till, a QR order, an
   aggregator, the kiosk, a sync) — and keeps them: a rate changed on the menu later changes the next order, never one
   already taken. Nobody sets a line's rate by hand. */
create or replace function public.order_item_tax() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.gst_rate := null; new.hsn := null;
    if new.menu_item_id is not null then
      select m.gst_rate, m.hsn into new.gst_rate, new.hsn from menu_items m where m.id = new.menu_item_id;
    end if;
  else
    new.gst_rate := old.gst_rate; new.hsn := old.hsn;
  end if;
  return new;
end $$;
drop trigger if exists order_item_tax on order_items;
create trigger order_item_tax before insert or update of gst_rate, hsn on order_items for each row execute function public.order_item_tax();

-- ── what an online order brings to the ticket ────────────────────────────────────────────────────────────────────────
alter table orders add column if not exists discount_amount numeric(12,2) not null default 0;
alter table orders add column if not exists extra_charges numeric(12,2) not null default 0;
alter table orders add column if not exists offer_title text;
alter table orders drop constraint if exists orders_online_money_ok;
alter table orders add constraint orders_online_money_ok check (discount_amount >= 0 and extra_charges >= 0);

-- ── what the bill records ────────────────────────────────────────────────────────────────────────────────────────────
alter table bills add column if not exists charges numeric(12,2) not null default 0;           -- packing & delivery
alter table bills add column if not exists service_charge_on boolean;                           -- the cashier's choice
alter table bills add column if not exists tax_lines jsonb;                                     -- [{rate, base, cgst, sgst}]
alter table bills add column if not exists gst_by_operator boolean not null default false;     -- section 9(5)

/* The tax on a bill. p_groups: the dishes' value per rate, [{rate, amount}]; p_base: everything the tax is charged on (the
   dishes after the discount, plus the service charge, the on-time fee and packing & delivery). The base is shared out in
   proportion to each rate's value — the largest takes the paise — and each part is taxed at its own rate, half CGST, half
   SGST. p_collect false (no GSTIN, composition, an operator paying under 9(5)): no tax, every rate shown as 0. */
create or replace function public.bill_tax(p_groups jsonb, p_base numeric, p_collect boolean)
returns jsonb language plpgsql immutable set search_path = public as $$
declare rates numeric[]; amts numeric[]; tot numeric := 0; big int := 1; given numeric := 0; i int; n int;
  base_g numeric; rate_g numeric; cg numeric; lines jsonb := '[]'; sum_cg numeric := 0;
begin
  select coalesce(array_agg(r order by r), '{}'), coalesce(array_agg(a order by r), '{}') into rates, amts
    from (select (x->>'rate')::numeric r, sum(coalesce((x->>'amount')::numeric, 0)) a from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x group by 1) g;
  n := coalesce(array_length(rates, 1), 0);
  if n = 0 then rates := array[0::numeric]; amts := array[0::numeric]; n := 1; end if;
  for i in 1..n loop tot := tot + amts[i]; if amts[i] > amts[big] then big := i; end if; end loop;
  for i in 1..n loop
    if i <> big then given := given + case when tot > 0 then round(p_base * amts[i] / tot, 2) else 0 end; end if;
  end loop;
  for i in 1..n loop
    base_g := case when i = big then round(p_base - given, 2) when tot > 0 then round(p_base * amts[i] / tot, 2) else 0 end;
    rate_g := case when p_collect then rates[i] else 0 end;
    cg := round(base_g * rate_g / 2 / 100, 2);
    if base_g <> 0 or amts[i] <> 0 then
      lines := lines || jsonb_build_object('rate', rate_g, 'base', base_g, 'cgst', cg, 'sgst', cg);
    end if;
    sum_cg := sum_cg + cg;
  end loop;
  return jsonb_build_object('lines', lines, 'cgst', sum_cg, 'sgst', sum_cg);
end $$;
revoke all on function public.bill_tax(jsonb, numeric, boolean) from public, anon;
grant execute on function public.bill_tax(jsonb, numeric, boolean) to authenticated;

-- ── generate_bill: the online order's money, a rate per dish, 9(5), the service charge as a choice ──────────────────
drop function if exists public.generate_bill(uuid, numeric, numeric, boolean, text, text, numeric, text);
create or replace function public.generate_bill(p_order_id uuid, p_discount_pct numeric default 0, p_discount_amount numeric default 0,
  p_promise_kept boolean default null, p_customer_phone text default null, p_customer_name text default null,
  p_redeem_points numeric default 0, p_coupon text default null, p_service_charge boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype; c customers%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; base numeric; chg numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid; grp jsonb; tx jsonb; sc_on boolean; eco boolean; ch_kind text;
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

  select coalesce(sum(price_snapshot * qty), 0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';
  -- 0146: the dishes' value per rate (a dish without its own rate is at the property's)
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'amount', a)), '[]'::jsonb) into grp
    from (select coalesce(gst_rate, r.gst_rate) rate, sum(price_snapshot * qty) a from order_items
           where order_id = p_order_id and status <> 'cancelled' group by 1) g;
  if jsonb_array_length(grp) = 0 then grp := jsonb_build_array(jsonb_build_object('rate', r.gst_rate, 'amount', 0)); end if;

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
  -- 0146: what the guest was already promised off when they ordered online (their offer)
  amt := amt + coalesce(o.discount_amount, 0);
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

  -- 0146: who the order came through. An aggregator or ONDC pays the GST itself (section 9(5)).
  select ch.kind::text into ch_kind from order_channels ch where ch.id = o.channel_id;
  eco := coalesce(ch_kind in ('swiggy', 'zomato', 'ondc'), false);
  -- the service charge: the cashier's choice; untouched, on at the till and off for an order placed online
  sc_on := coalesce(r.service_charge_pct, 0) > 0 and coalesce(p_service_charge, o.channel_id is null);
  sc := case when sc_on then round(taxable * r.service_charge_pct/100, 2) else 0 end;
  chg := coalesce(o.extra_charges, 0);
  base := taxable + sc + fee + chg;
  tx := bill_tax(grp, base, gst_collectable(r.gst_scheme, r.gstin) and not eco);
  cg := (tx->>'cgst')::numeric; sg := (tx->>'sgst')::numeric;
  raw := base + cg + sg;
  tot := round(raw);
  insert into bills(restaurant_id, order_id, bill_no, subtotal, discount_pct, discount_amount,
                    service_charge, cgst, sgst, round_off, total,
                    promise_fee, promise_waived, promise_kept, created_by,
                    customer_id, points_redeemed, offer_id, coupon_code,
                    charges, service_charge_on, tax_lines, gst_by_operator)
    values (rid, p_order_id, next_number('bill'), sub, pct, disc,
            sc, cg, sg, tot - raw, tot,
            fee, waived, kept, auth.uid(),
            cid, redeem, nullif(cp->>'id', '')::uuid, cp->>'code',
            chg, sc_on, tx->'lines', eco)
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
end $$;
revoke all on function public.generate_bill(uuid, numeric, numeric, boolean, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.generate_bill(uuid, numeric, numeric, boolean, text, text, numeric, text, boolean) to authenticated;

-- ── accepting an online order: its discount and its fee come with it (website orders only — an aggregator's own
--    numbers are its own, and it pays the GST) ──────────────────────────────────────────────────────────────────────
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
    insert into orders(restaurant_id, order_no, type, table_id, status, customer_name, customer_phone, notes, channel_id, created_by)
      values (p_rid, next_number('order', p_rid), case when o.table_id is not null then 'dine_in'::order_type else 'delivery'::order_type end, o.table_id, 'open',
              o.customer_name, o.customer_phone, coalesce(o.display_id, o.external_id), o.channel_id, auth.uid())
      returning id into oid;
  end if;
  -- 0146: what the guest was quoted travels with the ticket — the offer's money off and the packing / delivery fee
  if own then
    update orders set discount_amount = discount_amount + greatest(0, coalesce((o.raw->>'discount')::numeric, 0)),
                      extra_charges = extra_charges + greatest(0, coalesce((o.raw->>'fee')::numeric, 0)),
                      offer_title = coalesce(nullif(o.raw->>'offer', ''), offer_title)
     where id = oid;
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
end $$;
revoke all on function public.accept_online_order_for(uuid, uuid) from public, anon, authenticated;

-- ── credit notes ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists credit_notes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  cn_no integer not null,
  bill_id uuid not null references bills(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  taxable numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  tax_lines jsonb,
  refund_method payment_method not null,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (restaurant_id, cn_no)
);
create index if not exists credit_notes_bill_idx on credit_notes(bill_id);
create index if not exists credit_notes_rid_at_idx on credit_notes(restaurant_id, created_at desc);
alter table credit_notes enable row level security;
drop policy if exists credit_notes_read on credit_notes;
create policy credit_notes_read on credit_notes for select to authenticated using (restaurant_id = (select auth_restaurant_id()));
-- no insert / update / delete policy: a credit note is written by issue_credit_note alone, and never changed

/* A refund on a paid bill: a numbered credit note for the amount given back, its GST in proportion to the bill's (the
   last one on a bill takes exactly what is left), a cash refund recorded as cash out so the drawer counts it, a line in the
   audit trail. The bill itself is not touched — it stays the record of what was charged. */
create or replace function public.issue_credit_note(p_bill_id uuid, p_amount numeric, p_reason text, p_method text default 'cash')
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; amt numeric := round(coalesce(p_amount, 0), 2);
  prior numeric; prior_cg numeric; prior_sg numeric; ratio numeric; cg numeric; sg numeric; whole boolean;
  inv uuid; cid uuid; n int; tl jsonb; m payment_method;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'cashier') then raise exception 'your role cannot give a refund — ask a manager' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'say why the money is going back'; end if;
  begin m := p_method::payment_method; exception when others then raise exception 'choose how the money goes back'; end;
  select * into b from bills where id = p_bill_id and restaurant_id = rid for update;
  if not found then raise exception 'bill not found'; end if;
  if b.status <> 'paid' then raise exception 'only a paid bill can be refunded — an unpaid one is voided instead'; end if;
  if amt <= 0 then raise exception 'enter the amount to give back'; end if;
  select coalesce(sum(amount), 0), coalesce(sum(cgst), 0), coalesce(sum(sgst), 0) into prior, prior_cg, prior_sg from credit_notes where bill_id = b.id;
  if prior + amt > b.total + 0.004 then raise exception 'only ₹% is left to refund on this bill', to_char(greatest(0, b.total - prior), 'FM999999990.00'); end if;
  whole := prior + amt >= b.total - 0.004;
  ratio := case when b.total > 0 then amt / b.total else 0 end;
  if whole then cg := b.cgst - prior_cg; sg := b.sgst - prior_sg;
  else cg := round(b.cgst * ratio, 2); sg := round(b.sgst * ratio, 2); end if;
  select coalesce(jsonb_agg(jsonb_build_object('rate', (l->>'rate')::numeric, 'base', round((l->>'base')::numeric * ratio, 2),
           'cgst', round((l->>'cgst')::numeric * ratio, 2), 'sgst', round((l->>'sgst')::numeric * ratio, 2))), null)
    into tl from jsonb_array_elements(coalesce(b.tax_lines, '[]'::jsonb)) l;
  select id into inv from invoices where bill_id = b.id limit 1;
  n := next_number('credit_note');
  insert into credit_notes(restaurant_id, cn_no, bill_id, invoice_id, amount, taxable, cgst, sgst, tax_lines, refund_method, reason, created_by)
    values (rid, n, b.id, inv, amt, amt - cg - sg, cg, sg, tl, m, trim(p_reason), auth.uid())
    returning id into cid;
  if m = 'cash' then
    insert into cash_movements(restaurant_id, kind, amount, reason, note, created_by)
      values (rid, 'out', amt, 'refund', format('Credit note CN-%s · bill %s', lpad(n::text, 4, '0'), b.bill_no), auth.uid());
  end if;
  perform audit_log(rid, 'bill.refund', 'bill', b.id, format('Bill %s · CN-%s', b.bill_no, lpad(n::text, 4, '0')), trim(p_reason),
    jsonb_build_object('total', b.total, 'refunded_before', prior), jsonb_build_object('refund', amt, 'method', m), amt);
  return jsonb_build_object('id', cid, 'cn_no', n, 'amount', amt, 'cgst', cg, 'sgst', sg);
end $$;
revoke all on function public.issue_credit_note(uuid, numeric, text, text) from public, anon;
grant execute on function public.issue_credit_note(uuid, numeric, text, text) to authenticated;

-- ── the day close counts refunds beside the sales ────────────────────────────────────────────────────────────────────
alter table day_closes add column if not exists refunds numeric(12,2) not null default 0;
create or replace function public.close_day(p_date date, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); did uuid;
begin
  if not has_module('billing') then raise exception 'you do not have the billing section'; end if;
  with b as (
    select id, total from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date = p_date
  ), p as (
    select method, sum(amount) amount from payments where bill_id in (select id from b) group by method
  )
  insert into day_closes(restaurant_id, business_date, orders_count, total_sales, cash, upi, card, other, notes, closed_by, refunds)
  values (rid, p_date, (select count(*) from b), (select coalesce(sum(total), 0) from b),
    coalesce((select amount from p where method = 'cash'), 0), coalesce((select amount from p where method = 'upi'), 0),
    coalesce((select amount from p where method = 'card'), 0), coalesce((select amount from p where method = 'other'), 0),
    p_notes, auth.uid(),
    -- 0146: the money given back that day, on credit notes
    (select coalesce(sum(amount), 0) from credit_notes where restaurant_id = rid and (created_at at time zone 'Asia/Kolkata')::date = p_date))
  on conflict (restaurant_id, business_date) do update set
    orders_count = excluded.orders_count, total_sales = excluded.total_sales, cash = excluded.cash,
    upi = excluded.upi, card = excluded.card, other = excluded.other, notes = excluded.notes, closed_at = now(), refunds = excluded.refunds
  returning id into did;
  return did;
end $$;

-- ── the tax invoice: each dish at its own rate and with its own code ─────────────────────────────────────────────────
create or replace function public.generate_dining_invoice(p_bill_id uuid, p_guest_name text default null, p_guest_phone text default null, p_guest_gstin text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); bl bills%rowtype; r restaurants%rowtype; lines jsonb := '[]'; pays jsonb; iid uuid;
        rate numeric; it record; items_taxable numeric; share numeric; gst numeric; total_gst numeric; lr numeric;
        given_tax numeric := 0; given_share numeric := 0; big int; groups int; g jsonb; item_part numeric; extra numeric;
begin
  select * into bl from bills where id = p_bill_id and restaurant_id = rid; if not found then raise exception 'bill not found'; end if;
  if exists (select 1 from invoices where bill_id = bl.id) then select id into iid from invoices where bill_id = bl.id; return iid; end if;
  select * into r from restaurants where id = rid;
  -- 0100: each dish carries its share of the bill's taxable value after the discount; the service charge and
  -- the on-time fee the bill charged (and taxed) are lines of their own; the lines' tax is the bill's tax to
  -- the paisa. A bill that collected no GST (no GSTIN, composition, an operator under 9(5)) shows no rate.
  -- 0146: each dish at its own rate (the bill's tax_lines) with its own HSN, else SAC 996331 (restaurant service).
  total_gst := coalesce(bl.cgst, 0) + coalesce(bl.sgst, 0);
  groups := coalesce(jsonb_array_length(bl.tax_lines), 0);
  rate := case when total_gst <= 0 then 0 when groups = 1 then (bl.tax_lines->0->>'rate')::numeric else r.gst_rate end;
  items_taxable := greatest(0, bl.subtotal - bl.discount_amount - coalesce(bl.promise_waived, 0));
  for it in select name_snapshot, qty, price_snapshot, gst_rate, hsn from order_items where order_id = bl.order_id and status <> 'cancelled' order by created_at, id loop
    lr := case when total_gst <= 0 then 0 when groups > 1 then coalesce(it.gst_rate, r.gst_rate) else rate end;
    share := case when bl.subtotal > 0 then round(it.price_snapshot * it.qty * items_taxable / bl.subtotal, 2) else 0 end;
    gst := round(share * lr/100, 2);
    lines := lines || jsonb_build_object('description', it.name_snapshot, 'qty', it.qty, 'rate', it.price_snapshot, 'amount', it.price_snapshot * it.qty,
                                         'taxable', share, 'gst_rate', lr, 'gst', gst, 'sac', coalesce(it.hsn, '996331'));
    given_tax := given_tax + gst; given_share := given_share + share;
  end loop;
  if groups > 1 and total_gst > 0 then
    -- several rates: the service charge, fee and packing are shared across them as the bill shared them — one line a rate
    for g in select * from jsonb_array_elements(bl.tax_lines) loop
      select coalesce(sum((l->>'taxable')::numeric), 0) into item_part from jsonb_array_elements(lines) l where (l->>'gst_rate')::numeric = (g->>'rate')::numeric;
      extra := round((g->>'base')::numeric - item_part, 2);
      if extra > 0.004 then
        gst := round(extra * (g->>'rate')::numeric / 100, 2);
        lines := lines || jsonb_build_object('description', case when coalesce(bl.charges, 0) = 0 and coalesce(bl.promise_fee, 0) = 0 then 'Service charge' else 'Service charge & charges' end, 'qty', 1, 'rate', extra, 'amount', extra,
                                             'taxable', extra, 'gst_rate', (g->>'rate')::numeric, 'gst', gst, 'sac', '996331');
        given_tax := given_tax + gst;
      end if;
    end loop;
  else
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
    if coalesce(bl.charges, 0) > 0 then
      gst := round(bl.charges * rate/100, 2);
      lines := lines || jsonb_build_object('description', 'Packing & delivery', 'qty', 1, 'rate', bl.charges, 'amount', bl.charges,
                                           'taxable', bl.charges, 'gst_rate', rate, 'gst', gst, 'sac', '996331');
      given_tax := given_tax + gst;
    end if;
  end if;
  -- the paise of rounding go on the largest line, so the lines' taxable value and tax are the bill's exactly
  if jsonb_array_length(lines) > 0 and (given_tax <> total_gst or given_share <> items_taxable) then
    select (x.o - 1)::int into big from jsonb_array_elements(lines) with ordinality as x(l, o) order by (x.l->>'taxable')::numeric desc, x.o limit 1;
    lines := jsonb_set(lines, array[big::text, 'gst'], to_jsonb(round((lines->big->>'gst')::numeric + total_gst - given_tax, 2)));
    if (lines->big->>'description') not in ('Service charge', 'On-time promise fee', 'Packing & delivery', 'Service charge & charges') then
      lines := jsonb_set(lines, array[big::text, 'taxable'], to_jsonb(round((lines->big->>'taxable')::numeric + items_taxable - given_share, 2)));
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', 'Payment · '||upper(method::text)||coalesce(' '||ref,''), 'amount', amount, 'at', created_at)), '[]') into pays from payments where bill_id = bl.id;
  -- the header adds up: (dishes + service charge + fee + packing) − (discount + a waived meal) + CGST + SGST + round-off = total
  insert into invoices(restaurant_id, invoice_no, kind, bill_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'dining', bl.id, p_guest_name, p_guest_phone, p_guest_gstin, lines,
            bl.subtotal + coalesce(bl.service_charge, 0) + coalesce(bl.promise_fee, 0) + coalesce(bl.charges, 0),
            bl.discount_amount + coalesce(bl.promise_waived, 0),
            bl.cgst, bl.sgst, bl.round_off, bl.total, case when bl.status='paid' then bl.total else 0 end, pays, case when bl.status='paid' then 'paid' else 'due' end, auth.uid())
    returning id into iid;
  return iid;
end $$;

-- ── the GST summary: by each rate a bill actually charged; 9(5) sales and credit notes on their own lines ──────────
create or replace function public.gst_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; dining jsonb; stay jsonb; b2b jsonb; dt jsonb; st jsonb; eco jsonb; cn jsonb;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into r from restaurants where id = rid;

  -- 0146: a bill raised since carries its tax per rate (tax_lines); an older one is read as before (its one rate)
  with pb as (
    select * from bills where restaurant_id = rid and status = 'paid' and not gst_by_operator
      and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ), parts as (
    select b.id, (l->>'rate')::numeric rate, (l->>'base')::numeric taxable, (l->>'cgst')::numeric cgst, (l->>'sgst')::numeric sgst
      from pb b, jsonb_array_elements(b.tax_lines) l where b.tax_lines is not null
    union all
    select b.id, round(case when (b.subtotal - b.discount_amount + b.service_charge) > 0 then (b.cgst + b.sgst) / (b.subtotal - b.discount_amount + b.service_charge) * 100 else 0 end, 1),
           b.subtotal - b.discount_amount + b.service_charge, b.cgst, b.sgst
      from pb b where b.tax_lines is null
  )
  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into dining from (
    select jsonb_build_object('sac', '996331', 'kind', 'dining', 'rate', rate, 'count', count(distinct id),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(taxable + cgst + sgst), 2)) as x
    from parts group by rate) q;

  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into stay from (
    select jsonb_build_object('sac', '996311', 'kind', 'stay', 'rate', rate, 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select (subtotal - discount) as taxable, cgst, sgst, total,
                 round(case when (subtotal - discount) > 0 then (cgst + sgst) / (subtotal - discount) * 100 else 0 end, 1) as rate
          from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by rate) q;

  select coalesce(jsonb_agg(x order by x->>'gstin'), '[]'::jsonb) into b2b from (
    select jsonb_build_object('gstin', gstin, 'name', max(name), 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select upper(trim(i.guest_gstin)) as gstin, i.guest_name as name,
                 i.subtotal - i.discount as taxable, i.cgst, i.sgst, i.total
          from invoices i
          where i.restaurant_id = rid and nullif(trim(i.guest_gstin), '') is not null
            and (i.issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by gstin) q;

  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount_amount + service_charge + coalesce(promise_fee, 0) - coalesce(promise_waived, 0) + coalesce(charges, 0)), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into dt from bills where restaurant_id = rid and status = 'paid' and not gst_by_operator and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into st from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  -- 0146: food sold through Swiggy / Zomato / ONDC — the operator paid its GST (section 9(5)); shown, not taxed here
  select jsonb_build_object('count', count(*), 'total', round(coalesce(sum(total), 0), 2))
    into eco from bills where restaurant_id = rid and status = 'paid' and gst_by_operator and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  -- 0146: credit notes issued in the period reduce the tax due
  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(taxable), 0), 2), 'cgst', round(coalesce(sum(cgst), 0), 2),
           'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(amount), 0), 2))
    into cn from credit_notes where restaurant_id = rid and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to;

  return jsonb_build_object('from', p_from, 'to', p_to, 'scheme', r.gst_scheme, 'gstin', r.gstin,
                            'dining', dining, 'stay', stay, 'b2b', b2b, 'dining_totals', dt, 'stay_totals', st, 'eco', eco, 'credit_notes', cn);
end $$;

-- ── the guest's quote: the bill's own sum ────────────────────────────────────────────────────────────────────────────
create or replace function public.dine_order(p_slug text, p_guest jsonb, p_items jsonb, p_mode text DEFAULT 'delivery'::text, p_note text DEFAULT NULL::text, p_offer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r restaurants%rowtype; rid uuid; ch order_channels%rowtype; it jsonb; pl jsonb; sellable boolean; q numeric; t dining_tables%rowtype;
  items jsonb := '[]'; sub numeric := 0; disc numeric := 0; fee numeric := 0; tot numeric; off offers%rowtype; ext text; oid uuid; accepted uuid := null; ono integer := null;
  grp jsonb := '[]'; tx jsonb; mr numeric; ph text; nowl timestamp := (now() at time zone 'Asia/Kolkata'); dow int := extract(dow from (now() at time zone 'Asia/Kolkata'))::int;
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
      if r.online_paused_until = 'infinity' then raise exception 'not taking online orders right now'; end if;
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
    select m.is_active and m.is_available and (p_mode = 'dine_in' or m.online_available) into sellable from menu_items m where m.id = nullif(it->>'id', '')::uuid and m.restaurant_id = rid;
    if not coalesce(sellable, false) then continue; end if;
    pl := price_line(rid, jsonb_build_object('menu_item_id', it->>'id', 'variant_id', it->>'variant_id', 'addon_ids', coalesce(it->'addon_ids', '[]'::jsonb)));
    q := least(99, greatest(1, (it->>'qty')::numeric));                                     -- 0098: at most 99 of a dish
    items := items || jsonb_build_object('menu_item_id', pl->'menu_item_id', 'name', pl->>'name', 'qty', q, 'price', (pl->>'price')::numeric, 'note', left(it->>'note', 200),
                                         'variant_name', pl->>'variant_name', 'addons', pl->'addons', 'components', pl->'components');
    sub := sub + (pl->>'price')::numeric * q;
    -- 0146: each dish's value at its own GST rate (the property's when the dish has none)
    select m.gst_rate into mr from menu_items m where m.id = nullif(pl->>'menu_item_id', '')::uuid;
    grp := grp || jsonb_build_object('rate', coalesce(mr, r.gst_rate), 'amount', (pl->>'price')::numeric * q);
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'your basket is empty'; end if;
  if p_mode <> 'dine_in' and sub < r.min_order then raise exception 'minimum order here is %', r.min_order; end if;

  if p_offer is not null then
    -- 0144: the scope as text (it was enum = text, which failed every order with an offer), money off only for a flat %
    -- or amount, and only on its days and hours
    select * into off from offers where id = p_offer and restaurant_id = rid and is_active
      and scope::text in (case when p_mode = 'dine_in' then 'dining' else 'delivery' end, 'both') and sub >= min_order
      and kind::text in ('flat_pct', 'flat_amount')
      and (starts_on is null or starts_on <= nowl::date) and (ends_on is null or ends_on >= nowl::date)
      and (coalesce(cardinality(days), 0) = 0 or dow = any(days) or (dow = 0 and 7 = any(days)))
      and (from_time is null or to_time is null or nowl::time between from_time and to_time);
    if found then disc := case when off.kind = 'flat_pct' then round(sub * off.value / 100, 2) when off.kind = 'flat_amount' then least(off.value, sub) else 0 end; end if;
  end if;
  -- at the table there is nothing to pack and nothing to deliver
  fee := case when p_mode = 'delivery' then r.delivery_fee else 0 end + case when p_mode = 'dine_in' then 0 else r.packing_charge end;
  -- 0146: the quote is the bill's own sum (bill_tax): each rate on its share, the packing / delivery fee taxed with the food,
  -- and no GST at all for a property that may not collect it
  tx := bill_tax(grp, sub - disc + fee, gst_collectable(r.gst_scheme, r.gstin));
  tot := round(sub - disc + fee + (tx->>'cgst')::numeric + (tx->>'sgst')::numeric);

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
            jsonb_build_object('mode', p_mode, 'note', left(p_note, 500), 'subtotal', sub, 'discount', disc, 'fee', fee, 'offer', off.title, 'table', t.name, 'tax', (tx->>'cgst')::numeric + (tx->>'sgst')::numeric), now(), t.id)
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

notify pgrst, 'reload schema';
