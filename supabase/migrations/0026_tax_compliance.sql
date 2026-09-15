-- ═══════════ Tax & GST ═══════════
-- The registration profile a property files under, the statutory documents it must hold, the
-- returns it must file, and the summary a CA needs to fill GSTR-1 and GSTR-3B. Every property type
-- gets it; the master sees all of them side by side.

alter table restaurants
  add column if not exists legal_name text,                              -- the name on the GST certificate, when it differs from the trade name
  add column if not exists pan text,
  add column if not exists gst_scheme text not null default 'regular',   -- regular | composition | unregistered
  add column if not exists gst_state_code text,                          -- the first two digits of the GSTIN, e.g. 33 for Tamil Nadu
  add column if not exists gst_monthly boolean not null default true,    -- false when on the quarterly (QRMP) scheme
  add column if not exists fssai_no text,
  add column if not exists ca_name text, add column if not exists ca_firm text, add column if not exists ca_membership_no text,
  add column if not exists ca_email text, add column if not exists ca_phone text;
alter table restaurants drop constraint if exists restaurants_gst_scheme_chk;
alter table restaurants add constraint restaurants_gst_scheme_chk check (gst_scheme in ('regular','composition','unregistered'));

-- A property that already typed a GSTIN gets its state code filled in from it.
update restaurants set gst_state_code = left(gstin, 2) where gst_state_code is null and gstin ~ '^[0-9]{2}[A-Z0-9]{13}$';

create table if not exists compliance_docs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null,                 -- gst_reg | pan | fssai | trade_licence | shop_estab | fire_noc | bar_licence | audit_3cd | itr_ack | gstr_filing | bank_stmt | other
  title text not null,
  number text, issuer text,
  issued_on date, expires_on date,
  period text,                        -- 'FY 2025-26', '2026-08', 'Q1 2026-27' — for returns and yearly filings
  url text,                           -- where the signed copy lives: DigiLocker, Drive, the CA's portal
  notes text,
  created_at timestamptz not null default now(), created_by uuid
);
create index if not exists compliance_docs_rid_idx on compliance_docs(restaurant_id, kind);

create table if not exists compliance_filings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  form text not null,                 -- GSTR-1 | GSTR-3B | CMP-08 | GSTR-4 | GSTR-9 | GSTR-9C | ADV-TAX | TAX-AUDIT | ITR | TDS | PF | ESI | PT
  period text not null,               -- '2026-08' | 'Q1 2026-27' | 'FY 2025-26'
  due_on date not null,
  filed_on date, ack_no text, notes text,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, form, period)
);

do $$ declare t text; begin
  foreach t in array array['compliance_docs','compliance_filings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_all on %I', t);
    execute format('create policy tenant_all on %I for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id())', t);
    execute format('drop trigger if exists trg_set_rid on %I', t);
    execute format('create trigger trg_set_rid before insert on %I for each row execute function set_restaurant_id()', t);
  end loop;
end $$;

-- ── what GSTR-1 and GSTR-3B ask for, from the bills and invoices already in the system ──────────
-- Dining comes from paid bills (their tax invoice, when issued, carries the same figures, so bills
-- are the single source and nothing is counted twice). Accommodation comes from stay invoices.
-- The rate is derived from the tax actually charged, so a bill raised under an older rate still
-- lands in the right row. B2B lists every invoice that carries the guest's GSTIN, which GSTR-1
-- wants invoice by invoice.
create or replace function gst_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; dining jsonb; stay jsonb; b2b jsonb; dt jsonb; st jsonb;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into r from restaurants where id = rid;

  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into dining from (
    select jsonb_build_object('sac', '996331', 'kind', 'dining', 'rate', rate, 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select (subtotal - discount_amount + service_charge) as taxable, cgst, sgst, total,
                 round(case when (subtotal - discount_amount + service_charge) > 0 then (cgst + sgst) / (subtotal - discount_amount + service_charge) * 100 else 0 end, 1) as rate
          from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by rate) q;

  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into stay from (
    select jsonb_build_object('sac', '996311', 'kind', 'stay', 'rate', rate, 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select (subtotal - discount) as taxable, cgst, sgst, total,
                 round(case when (subtotal - discount) > 0 then (cgst + sgst) / (subtotal - discount) * 100 else 0 end, 1) as rate
          from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by rate) q;

  select coalesce(jsonb_agg(x order by x->>'gstin'), '[]'::jsonb) into b2b from (
    select jsonb_build_object('gstin', guest_gstin, 'name', max(guest_name), 'count', count(*),
             'taxable', round(sum(subtotal - discount), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from invoices where restaurant_id = rid and nullif(trim(guest_gstin), '') is not null
      and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    group by guest_gstin) q;

  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount_amount + service_charge), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into dt from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into st from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to;

  return jsonb_build_object('from', p_from, 'to', p_to, 'scheme', r.gst_scheme, 'gstin', r.gstin,
                            'dining', dining, 'stay', stay, 'b2b', b2b, 'dining_totals', dt, 'stay_totals', st);
end $$;

-- Master control reads every property's registration, filings and documents through the
-- is_platform_admin() clause in the policies above; the overview is assembled in the app.
