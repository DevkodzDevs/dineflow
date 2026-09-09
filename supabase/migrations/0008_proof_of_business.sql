-- DineFlow v8.0 — Proof of Business.
-- Turns two years of honest trading into a record the owner owns and a bank will read:
-- month-by-month figures, hash-chained so tampering is visible, shared by an expiring link
-- that the owner controls and can revoke. Run AFTER 0007.

create extension if not exists pgcrypto;

create table if not exists business_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  period date not null,                                  -- first day of the month
  rooms_revenue numeric(14,2) not null default 0,
  dining_revenue numeric(14,2) not null default 0,
  delivery_revenue numeric(14,2) not null default 0,
  total_revenue numeric(14,2) not null default 0,
  gst_collected numeric(14,2) not null default 0,
  supplier_paid numeric(14,2) not null default 0,
  wages_paid numeric(14,2) not null default 0,
  covers integer not null default 0,
  invoices_issued integer not null default 0,
  room_nights_sold integer not null default 0,
  room_nights_available integer not null default 0,
  occupancy_pct numeric(5,2),
  avg_ticket numeric(12,2),
  days_traded integer not null default 0,
  prev_hash text, hash text not null,
  sealed_at timestamptz not null default now(),
  unique (restaurant_id, period)
);
create index if not exists business_period_idx on business_periods(restaurant_id, period);

/** The numbers for one month, straight from the ledgers. Read-only, so it can be re-run to verify. */
create or replace function period_figures(p_period date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); a date := date_trunc('month', p_period)::date; b date := (date_trunc('month', p_period) + interval '1 month')::date;
  rooms numeric := 0; dining numeric := 0; delivery numeric := 0; gst numeric := 0; sup numeric := 0; wag numeric := 0;
  cov int := 0; inv int := 0; rn int := 0; ra int := 0; dt int := 0; nrooms int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;

  -- rooms: nights actually stayed, plus facilities and extras posted to the folio
  select coalesce(sum(greatest(1, bk.check_out - bk.check_in) * bk.rate), 0), coalesce(sum(greatest(1, bk.check_out - bk.check_in)), 0)
    into rooms, rn from bookings bk where bk.restaurant_id = rid and bk.status = 'checked_out' and bk.checked_out_at >= a and bk.checked_out_at < b and not bk.is_block;
  rooms := rooms + coalesce((select sum(c.amount) from booking_charges c join bookings bk on bk.id = c.booking_id
    where c.restaurant_id = rid and c.kind in ('facility','extra') and bk.status = 'checked_out' and bk.checked_out_at >= a and bk.checked_out_at < b), 0);

  -- dining: paid restaurant bills. Orders charged to a room never create a bill, so nothing double counts.
  select coalesce(sum(total), 0), coalesce(sum(cgst + sgst), 0) into dining, gst
    from bills where restaurant_id = rid and status = 'paid' and paid_at >= a and paid_at < b;
  gst := gst + coalesce((select sum(cgst + sgst) from invoices where restaurant_id = rid and kind = 'stay' and issued_at >= a and issued_at < b), 0);

  select coalesce(sum(gross), 0) into delivery from online_orders where restaurant_id = rid and status not in ('rejected','cancelled') and placed_at >= a and placed_at < b;
  select coalesce(sum(sl.qty * coalesce(sl.unit_cost, i.cost_per_unit)), 0) into sup
    from stock_ledger sl join ingredients i on i.id = sl.ingredient_id
    where sl.restaurant_id = rid and sl.reason = 'purchase' and sl.qty > 0 and sl.created_at >= a and sl.created_at < b;
  select coalesce(sum(amount), 0) into wag from labour_payments where restaurant_id = rid and created_at >= a and created_at < b;
  select count(*) into cov from orders where restaurant_id = rid and status <> 'cancelled' and created_at >= a and created_at < b;
  select count(*) into inv from invoices where restaurant_id = rid and issued_at >= a and issued_at < b;
  select count(*) into nrooms from rooms where restaurant_id = rid;
  ra := nrooms * (b - a);
  select count(distinct x.d) into dt from (
    select (created_at at time zone 'Asia/Kolkata')::date d from orders where restaurant_id = rid and status <> 'cancelled' and created_at >= a and created_at < b
    union select check_in as d from bookings where restaurant_id = rid and status in ('checked_in','checked_out') and check_in >= a and check_in < b) x;

  return jsonb_build_object(
    'period', a, 'rooms_revenue', round(rooms, 2), 'dining_revenue', round(dining, 2), 'delivery_revenue', round(delivery, 2),
    'total_revenue', round(rooms + dining + delivery, 2), 'gst_collected', round(gst, 2),
    'supplier_paid', round(sup, 2), 'wages_paid', round(wag, 2), 'covers', cov, 'invoices_issued', inv,
    'room_nights_sold', rn, 'room_nights_available', ra,
    'occupancy_pct', case when ra > 0 then round(rn::numeric / ra * 100, 2) else null end,
    'avg_ticket', case when cov > 0 then round((dining + delivery) / cov, 2) else null end,
    'days_traded', dt);
end $$;

/** The fingerprint of a month, chained to the month before it. */
create or replace function period_hash(p jsonb, p_prev text, p_rid uuid) returns text
language sql immutable as $$
  select encode(digest(
    coalesce(p_prev, 'genesis') || '|' || p_rid::text || '|' || (p->>'period') || '|' ||
    (p->>'total_revenue') || '|' || (p->>'rooms_revenue') || '|' || (p->>'dining_revenue') || '|' || (p->>'delivery_revenue') || '|' ||
    (p->>'gst_collected') || '|' || (p->>'supplier_paid') || '|' || (p->>'wages_paid') || '|' ||
    (p->>'covers') || '|' || (p->>'invoices_issued') || '|' || (p->>'room_nights_sold') || '|' || (p->>'days_traded')
  , 'sha256'), 'hex')
$$;

/** Seal a closed month. Only past months, and only once — a sealed month is never rewritten. */
create or replace function seal_period(p_period date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); a date := date_trunc('month', p_period)::date; f jsonb; prev text; h text;
begin
  if a >= date_trunc('month', current_date)::date then raise exception 'the current month is still trading — seal it after it ends'; end if;
  if exists (select 1 from business_periods where restaurant_id = rid and period = a) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  f := period_figures(a);
  select hash into prev from business_periods where restaurant_id = rid and period < a order by period desc limit 1;
  h := period_hash(f, prev, rid);   -- stored_figures(row) reproduces exactly this shape
  insert into business_periods(restaurant_id, period, rooms_revenue, dining_revenue, delivery_revenue, total_revenue, gst_collected,
    supplier_paid, wages_paid, covers, invoices_issued, room_nights_sold, room_nights_available, occupancy_pct, avg_ticket, days_traded, prev_hash, hash)
  values (rid, a, (f->>'rooms_revenue')::numeric, (f->>'dining_revenue')::numeric, (f->>'delivery_revenue')::numeric, (f->>'total_revenue')::numeric,
    (f->>'gst_collected')::numeric, (f->>'supplier_paid')::numeric, (f->>'wages_paid')::numeric, (f->>'covers')::int, (f->>'invoices_issued')::int,
    (f->>'room_nights_sold')::int, (f->>'room_nights_available')::int, nullif(f->>'occupancy_pct','')::numeric, nullif(f->>'avg_ticket','')::numeric,
    (f->>'days_traded')::int, prev, h);
  return jsonb_build_object('ok', true, 'period', a, 'hash', h);
end $$;

/** Seal every closed month that has not been sealed yet — the button the owner presses. */
create or replace function seal_all_periods(p_months int default 24) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); g date; n int := 0; first_day date;
begin
  select date_trunc('month', least(coalesce(min(created_at), now()), now()))::date into first_day from orders where restaurant_id = rid;
  first_day := greatest(coalesce(first_day, current_date), (date_trunc('month', current_date) - make_interval(months => p_months))::date);
  for g in select generate_series(first_day, (date_trunc('month', current_date) - interval '1 month')::date, interval '1 month')::date loop
    if not exists (select 1 from business_periods where restaurant_id = rid and period = g) then
      perform seal_period(g); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

/** The figures exactly as they were sealed, in the same shape period_figures returns. */
create or replace function stored_figures(r business_periods) returns jsonb
language sql immutable as $$
  select jsonb_build_object('period', r.period, 'rooms_revenue', r.rooms_revenue, 'dining_revenue', r.dining_revenue,
    'delivery_revenue', r.delivery_revenue, 'total_revenue', r.total_revenue, 'gst_collected', r.gst_collected,
    'supplier_paid', r.supplier_paid, 'wages_paid', r.wages_paid, 'covers', r.covers, 'invoices_issued', r.invoices_issued,
    'room_nights_sold', r.room_nights_sold, 'days_traded', r.days_traded)
$$;

/**
 * Verify every sealed month, two ways:
 *   1. the stored row against its own fingerprint — catches anyone editing the sealed figures
 *   2. the stored row against a fresh recompute from the ledgers — catches back-dated edits to orders or bills
 * Either failure breaks the chain, and the public record says so.
 */
create or replace function verify_chain() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r business_periods%rowtype; prev text := null; broken jsonb := '[]'; n int := 0;
  stored_hash text; source_hash text;
begin
  for r in select * from business_periods where restaurant_id = rid order by period loop
    n := n + 1;
    stored_hash := period_hash(stored_figures(r), prev, rid);
    source_hash := period_hash(period_figures(r.period), prev, rid);
    if coalesce(r.prev_hash, '') <> coalesce(prev, '') then
      broken := broken || jsonb_build_object('period', r.period, 'reason', 'chain link does not match the previous month');
    elsif stored_hash <> r.hash then
      broken := broken || jsonb_build_object('period', r.period, 'reason', 'the sealed figures have been edited');
    elsif source_hash <> r.hash then
      broken := broken || jsonb_build_object('period', r.period, 'reason', 'the underlying orders or bills changed after this month was sealed');
    end if;
    prev := r.hash;
  end loop;
  return jsonb_build_object('periods', n, 'intact', jsonb_array_length(broken) = 0, 'broken', broken,
    'head', (select hash from business_periods where restaurant_id = rid order by period desc limit 1));
end $$;

-- ═══════════ the shareable record ═══════════
create table if not exists proof_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  label text not null default 'Business record',
  purpose text not null default 'bank',                 -- bank | supplier | landlord | investor | other
  from_period date not null, to_period date not null,
  show_costs boolean not null default true,             -- some owners share revenue only
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists proof_views (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references proof_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  viewer_hint text                                       -- coarse only: browser + country if the caller passes it
);

create or replace function proof_create(p_label text, p_purpose text, p_from date, p_to date, p_days int default 30, p_show_costs boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); l proof_links%rowtype;
begin
  if auth_role() not in ('owner','manager') then raise exception 'only the owner can share the business record'; end if;
  insert into proof_links(restaurant_id, label, purpose, from_period, to_period, show_costs, expires_at, created_by)
    values (rid, coalesce(p_label, 'Business record'), coalesce(p_purpose, 'bank'), date_trunc('month', p_from)::date, date_trunc('month', p_to)::date,
            coalesce(p_show_costs, true), now() + make_interval(days => greatest(1, least(365, p_days))), auth.uid())
    returning * into l;
  return to_jsonb(l);
end $$;

create or replace function proof_revoke(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update proof_links set revoked = true where id = p_id and restaurant_id = auth_restaurant_id()
$$;

create or replace function proof_links_list() returns table (
  id uuid, token text, label text, purpose text, from_period date, to_period date, show_costs boolean,
  expires_at timestamptz, revoked boolean, created_at timestamptz, views int, last_viewed timestamptz
) language sql stable security definer set search_path = public as $$
  select l.id, l.token, l.label, l.purpose, l.from_period, l.to_period, l.show_costs, l.expires_at, l.revoked, l.created_at,
    (select count(*)::int from proof_views v where v.link_id = l.id), (select max(viewed_at) from proof_views v where v.link_id = l.id)
  from proof_links l where l.restaurant_id = auth_restaurant_id() order by l.created_at desc
$$;

/** The record itself, for the owner's own screen. */
create or replace function business_record(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); a date; b date; rows jsonb; sum_rev numeric; sum_gst numeric; months int;
begin
  a := coalesce(date_trunc('month', p_from)::date, (date_trunc('month', current_date) - interval '24 months')::date);
  b := coalesce(date_trunc('month', p_to)::date, (date_trunc('month', current_date) - interval '1 month')::date);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.period), '[]'), coalesce(sum(x.total_revenue), 0), coalesce(sum(x.gst_collected), 0), count(*)
    into rows, sum_rev, sum_gst, months
    from (select * from business_periods where restaurant_id = rid and period between a and b) x;
  return jsonb_build_object(
    'property', (select jsonb_build_object('name', name, 'address', address, 'phone', phone, 'gstin', gstin, 'type', property_type, 'since', created_at) from restaurants where id = rid),
    'from', a, 'to', b, 'months', months, 'periods', rows,
    'total_revenue', sum_rev, 'gst_collected', sum_gst,
    'avg_monthly', case when months > 0 then round(sum_rev / months, 2) else 0 end,
    'verification', verify_chain(), 'generated_at', now());
end $$;

/** What a bank or supplier sees when they open the link. No login, token only, and every open is logged. */
create or replace function proof_open(p_token text, p_hint text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l proof_links%rowtype; rows jsonb; sum_rev numeric; sum_gst numeric; months int; prop jsonb; prev text := null; r business_periods%rowtype; broken int := 0;
begin
  select * into l from proof_links where token = p_token;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if l.revoked then return jsonb_build_object('error', 'revoked'); end if;
  if l.expires_at < now() then return jsonb_build_object('error', 'expired', 'expired_at', l.expires_at); end if;
  insert into proof_views(link_id, viewer_hint) values (l.id, left(coalesce(p_hint, ''), 120));

  select jsonb_build_object('name', name, 'address', address, 'phone', phone, 'gstin', gstin, 'type', property_type, 'since', created_at)
    into prop from restaurants where id = l.restaurant_id;

  -- verify from the reader's side: the figures on this page must match their own fingerprints
  for r in select * from business_periods where restaurant_id = l.restaurant_id order by period loop
    if coalesce(r.prev_hash, '') <> coalesce(prev, '') or period_hash(stored_figures(r), prev, l.restaurant_id) <> r.hash then
      broken := broken + 1;
    end if;
    prev := r.hash;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'period', x.period, 'rooms_revenue', x.rooms_revenue, 'dining_revenue', x.dining_revenue, 'delivery_revenue', x.delivery_revenue,
      'total_revenue', x.total_revenue, 'gst_collected', x.gst_collected, 'covers', x.covers, 'invoices_issued', x.invoices_issued,
      'occupancy_pct', x.occupancy_pct, 'avg_ticket', x.avg_ticket, 'days_traded', x.days_traded,
      'supplier_paid', case when l.show_costs then x.supplier_paid else null end,
      'wages_paid', case when l.show_costs then x.wages_paid else null end,
      'hash', left(x.hash, 12)) order by x.period), '[]'),
    coalesce(sum(x.total_revenue), 0), coalesce(sum(x.gst_collected), 0), count(*)
    into rows, sum_rev, sum_gst, months
    from (select * from business_periods where restaurant_id = l.restaurant_id and period between l.from_period and l.to_period) x;

  return jsonb_build_object('ok', true, 'label', l.label, 'purpose', l.purpose, 'property', prop,
    'from', l.from_period, 'to', l.to_period, 'months', months, 'periods', rows, 'show_costs', l.show_costs,
    'total_revenue', sum_rev, 'gst_collected', sum_gst,
    'avg_monthly', case when months > 0 then round(sum_rev / months, 2) else 0 end,
    'chain_intact', broken = 0, 'head', (select left(hash, 16) from business_periods where restaurant_id = l.restaurant_id order by period desc limit 1),
    'expires_at', l.expires_at, 'opened_at', now());
end $$;
grant execute on function proof_open(text, text) to anon;

alter table business_periods enable row level security;
alter table proof_links enable row level security;
alter table proof_views enable row level security;
drop policy if exists tenant_all on business_periods;
create policy tenant_all on business_periods for all using (restaurant_id = auth_restaurant_id() or is_platform_admin()) with check (restaurant_id = auth_restaurant_id());
drop policy if exists tenant_all on proof_links;
create policy tenant_all on proof_links for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id());
drop policy if exists tenant_read on proof_views;
create policy tenant_read on proof_views for select using (exists (select 1 from proof_links l where l.id = link_id and l.restaurant_id = auth_restaurant_id()));
drop trigger if exists trg_set_rid on business_periods;
create trigger trg_set_rid before insert on business_periods for each row execute function set_restaurant_id();
