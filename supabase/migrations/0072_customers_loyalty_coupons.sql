-- 0072 · Customers, loyalty and coupons at the till.
--
-- A restaurant knew its guests only as a name typed on a takeaway; a hotel knew its guests as stay
-- records. Now a phone number is a customer: visits, spend, last seen, birthday, notes — built up
-- from the bills the till already raises, without anybody keying anything twice. On top of it:
--
--   loyalty  · a percentage of what a guest spends comes back as points (one point = ₹1 by default),
--              earned when the bill is paid and redeemed as a discount on a later one. Switched on
--              per property, with a floor below which points cannot be redeemed.
--   coupons  · an offer's code, typed at the till, applies its discount to a dine-in bill — the
--              same offers the storefront already honours, with the same day, time and minimum.
--   feedback · the pay page asks for a rating once the bill is paid, tied to the order, so a guest
--              who paid by scanning can say how it was without the property being listed.
--
-- Everything is remembered on the bill: who, what code, how many points went out and came back.

-- ───────── 1. customers ─────────
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  phone text not null,                              -- digits only; the key a guest is found by
  name text,
  email text,
  birthday date, anniversary date,
  tags text[] not null default '{}',
  notes text,
  visits integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  points numeric(12,2) not null default 0,
  first_visit_at timestamptz not null default now(),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index if not exists customers_name_idx on customers(restaurant_id, lower(name));
alter table customers enable row level security;
drop policy if exists tenant_all on customers;
create policy tenant_all on customers for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on customers;
create trigger trg_set_rid before insert on customers for each row execute function set_restaurant_id();

create table if not exists loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  bill_id uuid references bills(id) on delete set null,
  points numeric(12,2) not null,                    -- + earned or given, − redeemed or taken back
  kind text not null check (kind in ('earn', 'redeem', 'adjust', 'reversal')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_ledger_customer_idx on loyalty_ledger(restaurant_id, customer_id, created_at desc);
alter table loyalty_ledger enable row level security;
drop policy if exists tenant_all on loyalty_ledger;
create policy tenant_all on loyalty_ledger for all
  using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop trigger if exists trg_set_rid on loyalty_ledger;
create trigger trg_set_rid before insert on loyalty_ledger for each row execute function set_restaurant_id();

alter table restaurants
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_earn_pct numeric(5,2) not null default 5,     -- % of the food value that comes back as points
  add column if not exists loyalty_point_value numeric(8,2) not null default 1,  -- ₹ one point is worth when redeemed
  add column if not exists loyalty_min_redeem numeric(8,2) not null default 50;  -- points a guest must hold before redeeming
alter table bills
  add column if not exists customer_id uuid references customers(id) on delete set null,
  add column if not exists points_redeemed numeric(12,2) not null default 0,
  add column if not exists points_earned numeric(12,2) not null default 0,
  add column if not exists offer_id uuid references offers(id) on delete set null,
  add column if not exists coupon_code text;
alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;

-- ───────── 2. finding and keeping a customer ─────────
/** Digits only, and the last ten of them: +91 98765 43210, 098765-43210 and 9876543210 are one guest. */
create or replace function norm_phone(p text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(p, '\D', '', 'g'), 10)
              else nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') end
$$;

/** The customer behind a phone number, created on first sight. A name given later fills a blank one. */
create or replace function customer_upsert(p_phone text, p_name text default null, p_email text default null, p_birthday date default null,
                                           p_anniversary date default null, p_tags text[] default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); ph text := norm_phone(p_phone); cid uuid;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if ph is null then raise exception 'a phone number is needed'; end if;
  insert into customers(restaurant_id, phone, name, email, birthday, anniversary, tags, notes)
    values (rid, ph, nullif(trim(p_name), ''), nullif(trim(p_email), ''), p_birthday, p_anniversary, coalesce(p_tags, '{}'), nullif(trim(p_notes), ''))
  on conflict (restaurant_id, phone) do update set
    name = coalesce(nullif(trim(excluded.name), ''), customers.name),
    email = coalesce(excluded.email, customers.email),
    birthday = coalesce(excluded.birthday, customers.birthday),
    anniversary = coalesce(excluded.anniversary, customers.anniversary),
    tags = case when p_tags is null then customers.tags else excluded.tags end,
    notes = coalesce(excluded.notes, customers.notes)
  returning id into cid;
  return cid;
end $$;
grant execute on function customer_upsert(text, text, text, date, date, text[], text) to authenticated;

/** What the till shows when a phone is typed: who this is and what they hold. Null when unknown. */
create or replace function customer_lookup(p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'visits', c.visits, 'total_spend', c.total_spend,
                            'points', c.points, 'last_visit_at', c.last_visit_at, 'tags', to_jsonb(c.tags), 'notes', c.notes,
                            'birthday', c.birthday, 'anniversary', c.anniversary,
                            'point_value', r.loyalty_point_value, 'min_redeem', r.loyalty_min_redeem, 'loyalty', r.loyalty_enabled)
  from customers c join restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = auth_restaurant_id() and c.phone = norm_phone(p_phone)
$$;
grant execute on function customer_lookup(text) to authenticated;

/** Points given or taken by hand — a goodwill gesture, a correction — with a reason. */
create or replace function loyalty_adjust(p_customer_id uuid, p_points numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); bal numeric;
begin
  if not has_module('customers') then raise exception 'you do not have the customers section'; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'say how many points'; end if;
  update customers set points = greatest(0, points + p_points) where id = p_customer_id and restaurant_id = rid returning points into bal;
  if not found then raise exception 'customer not found'; end if;
  insert into loyalty_ledger(restaurant_id, customer_id, points, kind, note, created_by) values (rid, p_customer_id, p_points, 'adjust', p_note, auth.uid());
  return bal;
end $$;
grant execute on function loyalty_adjust(uuid, numeric, text) to authenticated;

-- ───────── 3. a coupon at the till ─────────
/** The offer behind a code, if it applies to dining today at this hour and this subtotal. */
create or replace function coupon_check(p_code text, p_subtotal numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); o offers%rowtype; nowk time := (now() at time zone 'Asia/Kolkata')::time; dow int := extract(isodow from (now() at time zone 'Asia/Kolkata'))::int;
begin
  select * into o from offers where restaurant_id = rid and code is not null and upper(code) = upper(trim(p_code));
  if not found then raise exception 'no offer with that code'; end if;
  if not o.is_active then raise exception 'that offer is switched off'; end if;
  if o.scope not in ('dining', 'both') then raise exception 'that code is for online orders only'; end if;
  if o.starts_on is not null and o.starts_on > current_date then raise exception 'that offer has not started yet'; end if;
  if o.ends_on is not null and o.ends_on < current_date then raise exception 'that offer has ended'; end if;
  if o.days is not null and not (dow = any(o.days)) then raise exception 'that offer is not on today'; end if;
  if o.from_time is not null and o.to_time is not null and not (nowk between o.from_time and o.to_time) then raise exception 'that offer runs %–% only', to_char(o.from_time, 'HH24:MI'), to_char(o.to_time, 'HH24:MI'); end if;
  if coalesce(p_subtotal, 0) < o.min_order then raise exception 'that offer needs a bill of at least ₹%', o.min_order; end if;
  if o.kind not in ('flat_pct', 'flat_amount') then raise exception 'that offer cannot be applied at the till'; end if;
  return jsonb_build_object('id', o.id, 'title', o.title, 'code', o.code, 'kind', o.kind, 'value', o.value,
    'pct', case when o.kind = 'flat_pct' then o.value else 0 end,
    'amount', case when o.kind = 'flat_amount' then least(o.value, coalesce(p_subtotal, 0)) else 0 end);
end $$;
grant execute on function coupon_check(text, numeric) to authenticated;

-- ───────── 4. the bill: who, which code, how many points ─────────
-- The four earlier parameters keep their places and defaults, so the offline outbox's queued bills
-- and every existing call still work. The old signature goes so PostgREST has one candidate.
drop function if exists generate_bill(uuid, numeric, numeric, boolean);
create or replace function generate_bill(
  p_order_id uuid,
  p_discount_pct numeric default 0,
  p_discount_amount numeric default 0,
  p_promise_kept boolean default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_redeem_points numeric default 0,
  p_coupon text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id(); r restaurants%rowtype; o orders%rowtype; c customers%rowtype;
  sub numeric; disc numeric; taxable numeric; sc numeric; half numeric;
  cg numeric; sg numeric; raw numeric; tot numeric; bid uuid;
  fee numeric := 0; waived numeric := 0; kept boolean := null;
  cid uuid := null; cp jsonb := null; pct numeric := coalesce(p_discount_pct, 0); amt numeric := coalesce(p_discount_amount, 0);
  redeem numeric := 0; redeem_amt numeric := 0; other numeric;
begin
  select * into r from restaurants where id = rid;
  select * into o from orders where id = p_order_id and restaurant_id = rid and status = 'open';
  if not found then raise exception 'order not open'; end if;
  if exists (select 1 from bills where order_id = p_order_id and status <> 'void') then raise exception 'bill already exists'; end if;

  select coalesce(sum(price_snapshot * qty),0) into sub from order_items where order_id = p_order_id and status <> 'cancelled';

  -- who: the phone typed at the till, else the one taken with the order
  if norm_phone(p_customer_phone) is not null then cid := customer_upsert(p_customer_phone, coalesce(p_customer_name, o.customer_name));
  elsif norm_phone(o.customer_phone) is not null then cid := customer_upsert(o.customer_phone, o.customer_name);
  else cid := o.customer_id; end if;
  if cid is not null then
    update orders set customer_id = cid, customer_phone = coalesce(customer_phone, p_customer_phone), customer_name = coalesce(customer_name, p_customer_name) where id = o.id;
  end if;

  -- a coupon: its discount joins whatever the cashier typed
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    cp := coupon_check(p_coupon, sub);
    pct := pct + (cp->>'pct')::numeric; amt := amt + (cp->>'amount')::numeric;
  end if;
  other := least(sub, round(sub * pct/100, 2) + amt);

  -- points: only with loyalty on, only for a known guest, only what they hold, never past the food
  if coalesce(p_redeem_points, 0) > 0 then
    if not r.loyalty_enabled then raise exception 'loyalty points are not switched on'; end if;
    if cid is null then raise exception 'a phone number is needed to redeem points'; end if;
    select * into c from customers where id = cid;
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
end $$;
grant execute on function generate_bill(uuid, numeric, numeric, boolean, text, text, numeric, text) to authenticated;

-- A voided bill gives redeemed points back, and takes back any it had earned.
create or replace function bill_void_loyalty() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status <> 'void' and new.customer_id is not null then
    if new.points_redeemed > 0 then
      update customers set points = points + new.points_redeemed where id = new.customer_id;
      insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (new.restaurant_id, new.customer_id, new.id, new.points_redeemed, 'reversal', 'Bill voided', auth.uid());
    end if;
    if new.points_earned > 0 then
      update customers set points = greatest(0, points - new.points_earned) where id = new.customer_id;
      insert into loyalty_ledger(restaurant_id, customer_id, bill_id, points, kind, note, created_by) values (new.restaurant_id, new.customer_id, new.id, -new.points_earned, 'reversal', 'Bill voided', auth.uid());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bill_void_loyalty on bills;
create trigger trg_bill_void_loyalty after update of status on bills for each row execute function bill_void_loyalty();

-- Paying the bill is the visit: the customer's count, spend and points move here. The two-argument
-- overload from 0001 goes: with p_client_id defaulted, one function answers both call shapes.
drop function if exists settle_bill(uuid, jsonb);
create or replace function settle_bill(p_bill_id uuid, p_payments jsonb, p_client_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bills%rowtype; r restaurants%rowtype; p jsonb; paid numeric := 0; earned numeric := 0;
begin
  select * into b from bills where id = p_bill_id and restaurant_id = rid;
  if not found then raise exception 'bill not found'; end if;
  if b.status = 'paid' then return; end if;                -- replay-safe
  for p in select * from jsonb_array_elements(p_payments) loop
    insert into payments(restaurant_id, bill_id, method, amount, ref, client_id)
      values (rid, b.id, (p->>'method')::payment_method, (p->>'amount')::numeric, p->>'ref', nullif(p->>'client_id','')::uuid)
      on conflict do nothing;
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < b.total then raise exception 'short by %', b.total - paid; end if;
  if b.customer_id is not null then
    select * into r from restaurants where id = rid;
    -- points on the food value after discounts: what was actually spent on the meal
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
end $$;
grant execute on function settle_bill(uuid, jsonb, uuid) to authenticated;

-- ───────── 5. the customers screen ─────────
create or replace function customers_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from customers where restaurant_id = auth_restaurant_id()),
  soon as (
    -- a birthday or anniversary in the next 14 days, whatever the year it was first written in
    select id, name, phone, 'birthday' as what, birthday as on_date from c where birthday is not null
      and (make_date(extract(year from current_date)::int, extract(month from birthday)::int, extract(day from birthday)::int) between current_date and current_date + 14
        or make_date(extract(year from current_date)::int + 1, extract(month from birthday)::int, extract(day from birthday)::int) between current_date and current_date + 14)
    union all
    select id, name, phone, 'anniversary', anniversary from c where anniversary is not null
      and (make_date(extract(year from current_date)::int, extract(month from anniversary)::int, extract(day from anniversary)::int) between current_date and current_date + 14
        or make_date(extract(year from current_date)::int + 1, extract(month from anniversary)::int, extract(day from anniversary)::int) between current_date and current_date + 14)
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'new_30d', (select count(*) from c where first_visit_at >= now() - interval '30 days'),
    'returning', (select count(*) from c where visits >= 2),
    'lapsed_60d', (select count(*) from c where visits >= 2 and last_visit_at < now() - interval '60 days'),
    'points_out', coalesce((select sum(points) from c), 0),
    'spend_30d', coalesce((select sum(b.total) from bills b where b.restaurant_id = auth_restaurant_id() and b.status = 'paid' and b.customer_id is not null and b.paid_at >= now() - interval '30 days'), 0),
    'soon', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'what', what, 'on', to_char(on_date, 'DD Mon')) order by extract(month from on_date), extract(day from on_date)) from soon), '[]'::jsonb)
  )
$$;
grant execute on function customers_overview() to authenticated;

-- ───────── 6. a word from the guest, on the pay page ─────────
create or replace function pay_link_review(p_token text, p_rating int, p_body text default null, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bills%rowtype; o orders%rowtype;
begin
  select * into b from bills where pay_token = p_token and status = 'paid';
  if not found then raise exception 'the bill has not been paid yet'; end if;
  select * into o from orders where id = b.order_id;
  if exists (select 1 from reviews where order_id = o.id) then return jsonb_build_object('ok', true, 'again', true); end if;
  insert into reviews(restaurant_id, guest_name, rating, body, order_id)
    values (b.restaurant_id, coalesce(nullif(trim(p_name), ''), o.customer_name, 'Guest'), greatest(1, least(5, p_rating)), nullif(trim(p_body), ''), o.id);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function pay_link_review(text, int, text, text) to anon, authenticated;

-- ───────── 7. the section, and who may open it ─────────
-- Mirrors MODULES_BY_TYPE / ROLE_ACCESS / ROLE_DEFAULT in packages/shared/src/constants.ts; the two must agree.
update role_modules set ceiling = array_append(ceiling, 'customers') where role in ('owner','manager','supervisor','supervisor_2','employee','cashier','waiter','frontdesk') and not ('customers' = any(ceiling));
update role_modules set default_set = array_append(default_set, 'customers') where role in ('owner','manager','cashier','waiter','frontdesk') and not ('customers' = any(default_set));
