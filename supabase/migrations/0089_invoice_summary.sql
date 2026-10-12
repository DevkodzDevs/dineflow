-- 0089 · Invoices: the totals counted by the database, not by the page.
--
-- /invoices fetched every invoice in the window (up to 365 days, with its JSON lines) plus every
-- invoice of the last six months, and added them up in Node. PostgREST returns at most 1000 rows a
-- request, so past 1000 invoices the list was cut short silently and "Invoiced", "GST collected",
-- "Outstanding" and the six-month strip all came out too small — and the page grew slower every
-- month on the way there. This returns the figures in one row; the page fetches only the latest
-- invoices to show.
--
-- Read-only, no new table: nothing to add to RLS. Security definer like wastage_summary, scoped to
-- the caller's own property (auth_restaurant_id()) and to people who hold the Invoices module.

create or replace function invoice_summary(p_days integer default 30, p_kind text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id();
  d integer := least(365, greatest(1, coalesce(p_days, 30)));
  k text := nullif(p_kind, '');
  -- the first day of the month five months back, in IST — the strip's left edge
  m0 date := (date_trunc('month', (now() at time zone 'Asia/Kolkata')) - interval '5 months')::date;
  out jsonb;
begin
  if rid is null then raise exception 'not signed in to a property' using errcode = '42501'; end if;
  if not has_module('invoices') then raise exception 'no access to invoices' using errcode = '42501'; end if;

  with w as (
    select total, paid, cgst, sgst, status, kind
    from invoices
    where restaurant_id = rid and issued_at >= now() - make_interval(days => d) and (k is null or kind::text = k)
  ), months as (
    select to_char(gs, 'YYYY-MM') as key, gs as first
    from generate_series(m0, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date, interval '1 month') gs
  ), hist as (
    select to_char(date_trunc('month', issued_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as key, sum(total) as total, count(*) as n
    from invoices
    where restaurant_id = rid and issued_at >= (m0::timestamp at time zone 'Asia/Kolkata')
    group by 1
  )
  select jsonb_build_object(
    'days', d,
    'count', (select count(*) from w),
    'total', coalesce((select sum(total) from w), 0),
    'gst', coalesce((select sum(coalesce(cgst, 0) + coalesce(sgst, 0)) from w), 0),
    'stay', (select count(*) from w where kind = 'stay'),
    'outstanding', coalesce((select sum(total - coalesce(paid, 0)) from w where status = 'due'), 0),
    'months', (select jsonb_agg(jsonb_build_object('key', m.key, 'total', coalesce(h.total, 0), 'count', coalesce(h.n, 0)) order by m.first)
               from months m left join hist h on h.key = m.key)
  ) into out;
  return out;
end $$;

revoke all on function invoice_summary(integer, text) from public, anon;
grant execute on function invoice_summary(integer, text) to authenticated;
