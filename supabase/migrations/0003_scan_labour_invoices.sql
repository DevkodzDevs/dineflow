-- DineFlow v3.0 — smart scanning, labour, consolidated invoices. Run AFTER 0002.

-- ───────── products get barcodes / QR so scanning finds them ─────────
alter table ingredients
  add column if not exists barcode text,
  add column if not exists category text,          -- vegetable | grocery | dairy | meat | beverage | other
  add column if not exists brand text,
  add column if not exists pack_qty numeric(12,3),  -- qty one scanned pack adds (e.g. 0.5 kg)
  add column if not exists image_url text;
create unique index if not exists ingredients_barcode_idx on ingredients(restaurant_id, barcode) where barcode is not null;
alter table menu_items add column if not exists barcode text;
create unique index if not exists menu_items_barcode_idx on menu_items(restaurant_id, barcode) where barcode is not null;

-- every scan is logged (what was recognised, what we did with it)
create table if not exists scan_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  source text not null,          -- barcode | qr | photo
  kind text,                     -- ingredient | dish | room | labour | product | unknown
  code text, result jsonb, action text, target_id uuid,
  created_by uuid, created_at timestamptz not null default now()
);

-- ───────── labour: daily-wage / contract workers (not app users) ─────────
do $$ begin
  create type labour_status as enum ('active','inactive');
exception when duplicate_object then null; end $$;
create table if not exists labourers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  code text not null,                    -- short badge code, printed as QR
  full_name text not null,
  phone text, skill text,                -- cook helper | cleaner | gardener | security | driver | other
  daily_wage numeric(12,2) not null default 0,
  id_type text, id_last4 text, address text, emergency_contact text, photo_url text, notes text,
  joined_on date not null default current_date,
  status labour_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (restaurant_id, code)
);
create table if not exists labour_attendance (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  labourer_id uuid not null references labourers(id) on delete cascade,
  work_date date not null default current_date,
  in_at timestamptz, out_at timestamptz,
  hours numeric(5,2), wage numeric(12,2) not null default 0,
  note text, created_by uuid,
  unique (labourer_id, work_date)
);
create table if not exists labour_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  labourer_id uuid not null references labourers(id) on delete cascade,
  amount numeric(12,2) not null, method payment_method not null default 'cash',
  period_from date, period_to date, note text, created_by uuid,
  created_at timestamptz not null default now()
);

-- Scan a labour badge → punch in/out for today
create or replace function labour_punch(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l labourers%rowtype; a labour_attendance%rowtype;
begin
  select * into l from labourers where restaurant_id = auth_restaurant_id() and code = upper(p_code) and status = 'active';
  if not found then raise exception 'labour badge not found'; end if;
  select * into a from labour_attendance where labourer_id = l.id and work_date = current_date;
  if not found then
    insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage, created_by) values (l.restaurant_id, l.id, current_date, now(), l.daily_wage, auth.uid()) returning * into a;
    return jsonb_build_object('name', l.full_name, 'event', 'in', 'at', a.in_at);
  elsif a.out_at is null then
    update labour_attendance set out_at = now(), hours = round(extract(epoch from now() - in_at)/3600, 2) where id = a.id returning * into a;
    return jsonb_build_object('name', l.full_name, 'event', 'out', 'at', a.out_at, 'hours', a.hours);
  else
    return jsonb_build_object('name', l.full_name, 'event', 'done', 'hours', a.hours);
  end if;
end $$;

create or replace function next_labour_code() returns text
language sql security definer set search_path = public as $$
  select 'L' || lpad(next_number('labour')::text, 4, '0')
$$;

-- ───────── consolidated invoices (room + food + facilities + extras, one tax invoice) ─────────
do $$ begin
  create type invoice_kind as enum ('stay','dining','facility');
exception when duplicate_object then null; end $$;
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  invoice_no integer not null,
  kind invoice_kind not null,
  booking_id uuid references bookings(id) on delete set null,
  bill_id uuid references bills(id) on delete set null,
  guest_name text, guest_phone text, guest_gstin text,
  lines jsonb not null default '[]',        -- [{description, qty, rate, amount, gst_rate, gst}]
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  round_off numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  payments jsonb not null default '[]',
  status text not null default 'paid',
  issued_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists invoices_restaurant_idx on invoices(restaurant_id, issued_at);

-- Build the final invoice for a stay: room nights + every folio charge (food, spa, extras, discounts)
create or replace function generate_stay_invoice(p_booking_id uuid, p_guest_gstin text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bookings%rowtype; r restaurants%rowtype; g guests%rowtype; rm rooms%rowtype; rt room_types%rowtype;
        n int; lines jsonb := '[]'; c record; sub numeric := 0; disc numeric := 0; cg numeric := 0; sg numeric := 0; raw numeric; tot numeric; paid numeric := 0; pays jsonb := '[]'; iid uuid; line_gst numeric;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = rid; if not found then raise exception 'booking not found'; end if;
  if exists (select 1 from invoices where booking_id = b.id and kind = 'stay') then select id into iid from invoices where booking_id = b.id and kind = 'stay'; return iid; end if;
  select * into r from restaurants where id = rid; select * into g from guests where id = b.guest_id;
  select * into rm from rooms where id = b.room_id; select * into rt from room_types where id = rm.room_type_id;
  n := greatest(1, b.check_out - b.check_in);
  -- room nights (room GST)
  line_gst := round(n * b.rate * r.room_gst_rate/100, 2);
  lines := lines || jsonb_build_object('description', 'Room '||rm.number||' · '||coalesce(rt.name,'')||' · '||n||' night'||case when n>1 then 's' else '' end, 'qty', n, 'rate', b.rate, 'amount', n*b.rate, 'gst_rate', r.room_gst_rate, 'gst', line_gst);
  sub := sub + n*b.rate; cg := cg + line_gst/2; sg := sg + line_gst/2;
  -- folio charges
  for c in select * from booking_charges where booking_id = b.id order by created_at loop
    if c.kind = 'restaurant' then
      line_gst := round(c.amount * r.gst_rate/100, 2);
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'gst_rate', r.gst_rate, 'gst', line_gst);
      sub := sub + c.amount; cg := cg + line_gst/2; sg := sg + line_gst/2;
    elsif c.kind in ('facility','extra') then
      line_gst := round(c.amount * r.room_gst_rate/100, 2);
      lines := lines || jsonb_build_object('description', c.description, 'qty', 1, 'rate', c.amount, 'amount', c.amount, 'gst_rate', r.room_gst_rate, 'gst', line_gst);
      sub := sub + c.amount; cg := cg + line_gst/2; sg := sg + line_gst/2;
    elsif c.kind = 'discount' and (c.description = 'Advance received' or c.description like 'Payment ·%') then
      paid := paid - c.amount;
      pays := pays || jsonb_build_object('description', c.description, 'amount', -c.amount, 'at', c.created_at);
    elsif c.kind = 'discount' then
      disc := disc - c.amount;
    end if;
    -- kind = 'tax' rows are already represented by per-line GST above
  end loop;
  cg := round(cg, 2); sg := round(sg, 2);
  raw := sub - disc + cg + sg; tot := round(raw);
  insert into invoices(restaurant_id, invoice_no, kind, booking_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'stay', b.id, g.full_name, g.phone, p_guest_gstin, lines, sub, disc, cg, sg, tot - raw, tot, paid, pays, case when paid + 0.01 >= tot then 'paid' else 'due' end, auth.uid())
    returning id into iid;
  return iid;
end $$;

-- Dining invoice from a paid bill (so restaurants also get a numbered tax invoice with lines)
create or replace function generate_dining_invoice(p_bill_id uuid, p_guest_name text default null, p_guest_phone text default null, p_guest_gstin text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); bl bills%rowtype; r restaurants%rowtype; lines jsonb; pays jsonb; iid uuid;
begin
  select * into bl from bills where id = p_bill_id and restaurant_id = rid; if not found then raise exception 'bill not found'; end if;
  if exists (select 1 from invoices where bill_id = bl.id) then select id into iid from invoices where bill_id = bl.id; return iid; end if;
  select * into r from restaurants where id = rid;
  select coalesce(jsonb_agg(jsonb_build_object('description', name_snapshot, 'qty', qty, 'rate', price_snapshot, 'amount', price_snapshot*qty, 'gst_rate', r.gst_rate, 'gst', round(price_snapshot*qty*r.gst_rate/100,2))), '[]') into lines
    from order_items where order_id = bl.order_id and status <> 'cancelled';
  select coalesce(jsonb_agg(jsonb_build_object('description', 'Payment · '||upper(method::text)||coalesce(' '||ref,''), 'amount', amount, 'at', created_at)), '[]') into pays from payments where bill_id = bl.id;
  insert into invoices(restaurant_id, invoice_no, kind, bill_id, guest_name, guest_phone, guest_gstin, lines, subtotal, discount, cgst, sgst, round_off, total, paid, payments, status, created_by)
    values (rid, next_number('invoice'), 'dining', bl.id, p_guest_name, p_guest_phone, p_guest_gstin, lines, bl.subtotal, bl.discount_amount, bl.cgst, bl.sgst, bl.round_off, bl.total, case when bl.status='paid' then bl.total else 0 end, pays, case when bl.status='paid' then 'paid' else 'due' end, auth.uid())
    returning id into iid;
  return iid;
end $$;

-- check-out now also issues the stay invoice (return type changes → drop first)
drop function if exists check_out(uuid, jsonb);
create or replace function check_out(p_booking_id uuid, p_payments jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype; f record; p jsonb; paid numeric := 0; iid uuid;
begin
  select * into b from bookings where id = p_booking_id and restaurant_id = auth_restaurant_id() and status = 'checked_in';
  if not found then raise exception 'guest is not checked in'; end if;
  select * into f from folio_totals(b.id);
  for p in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    insert into booking_charges(restaurant_id, booking_id, kind, description, amount, created_by)
      values (b.restaurant_id, b.id, 'discount', 'Payment · '||upper(p->>'method')||coalesce(' '||(p->>'ref'),''), -(p->>'amount')::numeric, auth.uid());
    paid := paid + (p->>'amount')::numeric;
  end loop;
  if paid + 0.01 < f.balance then raise exception 'balance % remains', f.balance - paid; end if;
  update bookings set status = 'checked_out', checked_out_at = now() where id = b.id;
  update rooms set status = 'cleaning' where id = b.room_id;
  insert into housekeeping_tasks(restaurant_id, room_id, kind, notes) values (b.restaurant_id, b.room_id, 'clean', 'Checkout clean');
  iid := generate_stay_invoice(b.id);
  return iid;
end $$;

-- ───────── RLS + defaults for new tables ─────────
do $$ declare t text; begin
  foreach t in array array['scan_log','labourers','labour_attendance','labour_payments','invoices'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
    execute format('create policy tenant_all on %I for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id())', t);
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table labour_attendance, invoices; exception when others then null; end $$;
