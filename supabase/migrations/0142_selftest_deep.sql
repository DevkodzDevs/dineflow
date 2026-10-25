-- 0142 — deeper self-tests for Master control → Testing (2026-10-25, the owner: "upgrade all the testing tools — more
-- master-minded test tools").
--
-- Four read-only functions, each master-only, each answering one JSON object the /api/admin/selftest route turns into
-- checks. Nothing here writes a row. Each sets its own statement timeout so a slow catalogue read cannot hold the
-- shared database (development and production are one project).
--
--   selftest_security()   — the database's own defences: SECURITY DEFINER functions without a pinned search_path,
--                           master-only functions anonymous may call, policies that let anyone read a property's
--                           table, views that skip row security, private buckets made public, key-shaped strings in
--                           function bodies, and how many masters there are.
--   selftest_integrity()  — the money and the data: every paid bill adds up (the generate_bill arithmetic), bill and
--                           invoice numbers unique and gap-free per property, no negative or zero lines, lines added
--                           or cancelled after the bill was paid, loyalty points that match their ledger, rooms booked
--                           twice for the same nights, impossible stays, and — over every foreign key between two
--                           property tables — rows that point at another property's row.
--   selftest_ops()        — what is stuck right now: online orders still "new" after 30 minutes, deliveries out for
--                           6 hours, guests past their check-out, reservations never marked no-show, failed OTA syncs
--                           in a day, large cash-up differences this month, expired demos not swept.
--   selftest_dbperf()     — how the database is holding up: cache hit ratios, foreign keys without an index, large
--                           tables read by scanning, dead rows, connections in use, sessions idle in a transaction,
--                           and the slowest statements pg_stat_statements has seen.
--
-- No new table, so no new policy: the functions refuse anyone but a master (is_platform_admin()), run as their owner
-- with search_path pinned, and anonymous is refused execute.

create or replace function selftest_security()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '8000', true);
  select jsonb_build_object(
    'secdef_total', (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prosecdef),
    'secdef_no_path', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), '[]'::jsonb),
    'anon_admin_fns', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.proname ~ '^(admin_|selftest_|staff_set|sweep_|_sweep)' and has_function_privilege('anon', p.oid, 'execute')), '[]'::jsonb),
    -- a policy that is simply "true" for everyone on a table that belongs to a property
    'open_tenant_policies', coalesce((select jsonb_agg(pl.tablename || '.' || pl.policyname order by pl.tablename) from pg_policies pl
        where pl.schemaname = 'public' and (coalesce(pl.qual, '') = 'true' or coalesce(pl.with_check, '') = 'true')
          and (pl.roles && array['anon', 'public']::name[])
          and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = pl.tablename and c.column_name = 'restaurant_id')), '[]'::jsonb),
    'views_without_invoker', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v' and not coalesce(c.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on']), '[]'::jsonb),
    'buckets', coalesce((select jsonb_object_agg(id, public) from storage.buckets), '{}'::jsonb),
    'key_shaped', (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
        and p.prosrc ~ '(rzp_live_[A-Za-z0-9]{10,}|sk_live_[A-Za-z0-9]{10,}|sk-ant-[A-Za-z0-9_-]{20,}|eyJhbGciOi[A-Za-z0-9_-]{20,})'),
    'masters', (select count(*) from platform_admins),
    'master_default_password', coalesce((select master_password_is_default()), false),
    'tables_rls_no_policy', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> '_dineflow_migrations'
          and not exists (select 1 from pg_policies pl where pl.schemaname = 'public' and pl.tablename = c.relname)), '[]'::jsonb)
  ) into out;
  return out;
end $$;

create or replace function selftest_integrity()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb; fk record; n bigint; cross_rows jsonb := '[]'::jsonb; pairs int := 0;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '15000', true);
  -- every single-column foreign key from one property table to another: a row must point at its own property's row
  for fk in
    select ch.relname child, pa.relname parent, a.attname col, pk.attname pcol
      from pg_constraint c
      join pg_class ch on ch.oid = c.conrelid join pg_class pa on pa.oid = c.confrelid
      join pg_namespace ns on ns.oid = ch.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute pk on pk.attrelid = c.confrelid and pk.attnum = c.confkey[1]
     where c.contype = 'f' and ns.nspname = 'public' and array_length(c.conkey, 1) = 1 and pa.relname <> 'restaurants' and a.attname <> 'restaurant_id'
       and exists (select 1 from pg_attribute x where x.attrelid = ch.oid and x.attname = 'restaurant_id' and not x.attisdropped)
       and exists (select 1 from pg_attribute x where x.attrelid = pa.oid and x.attname = 'restaurant_id' and not x.attisdropped)
  loop
    pairs := pairs + 1;
    execute format('select count(*) from %I c join %I p on p.%I = c.%I where c.restaurant_id is not null and p.restaurant_id is not null and c.restaurant_id <> p.restaurant_id',
                   fk.child, fk.parent, fk.pcol, fk.col) into n;
    if n > 0 then cross_rows := cross_rows || jsonb_build_object('link', fk.child || '.' || fk.col || ' → ' || fk.parent, 'rows', n); end if;
  end loop;
  select jsonb_build_object(
    'tenant_pairs', pairs,
    'cross_tenant', cross_rows,
    -- the arithmetic generate_bill writes: total = subtotal − discount − waived + service + promise fee + CGST + SGST + round-off
    'bills_not_adding_up', (select count(*) from bills where status = 'paid' and abs(total - (subtotal - discount_amount - coalesce(promise_waived, 0)
        + service_charge + coalesce(promise_fee, 0) + cgst + sgst + round_off)) > 0.01),
    'bills_paid', (select count(*) from bills where status = 'paid'),
    'gst_halves_differ', (select count(*) from bills where status = 'paid' and abs(cgst - sgst) > 0.01),
    'round_off_wide', (select count(*) from bills where status = 'paid' and abs(round_off) > 0.5),
    'bill_no_dupes', (select count(*) from (select 1 from bills group by restaurant_id, bill_no having count(*) > 1) x),
    'invoice_no_dupes', (select count(*) from (select 1 from invoices group by restaurant_id, invoice_no having count(*) > 1) x),
    'invoice_gaps', (select coalesce(sum(g), 0) from (select max(invoice_no) - min(invoice_no) + 1 - count(distinct invoice_no) g from invoices group by restaurant_id) x),
    'invoices', (select count(*) from invoices),
    'bad_lines', (select count(*) from order_items where qty <= 0 or price_snapshot < 0),
    'lines_after_bill', (select count(*) from order_items oi join bills b on b.order_id = oi.order_id and b.status = 'paid'
        where oi.status <> 'cancelled' and oi.created_at > b.created_at + interval '1 minute'),
    'cancelled_after_paid', (select count(*) from order_items oi join bills b on b.order_id = oi.order_id and b.status = 'paid' where oi.cancelled_at > b.paid_at),
    'payments_not_positive', (select count(*) from payments where amount <= 0),
    'unpaid_but_covered', (select count(*) from bills b where b.status = 'unpaid' and b.total > 0
        and coalesce((select sum(p.amount) from payments p where p.bill_id = b.id), 0) >= b.total),
    'void_with_payments', (select count(*) from bills b where b.status = 'void' and exists (select 1 from payments p where p.bill_id = b.id)),
    'negative_points', (select count(*) from customers where points < 0),
    'points_off_ledger', (select count(*) from customers c where abs(c.points - coalesce((select sum(l.points) from loyalty_ledger l where l.customer_id = c.id), 0)) > 0.01),
    'rooms_double_booked', (select count(*) from bookings a join bookings b on a.room_id = b.room_id and a.id < b.id and a.restaurant_id = b.restaurant_id
        where a.status in ('reserved', 'checked_in') and b.status in ('reserved', 'checked_in') and a.check_in < b.check_out and b.check_in < a.check_out),
    'impossible_stays', (select count(*) from bookings where check_out <= check_in and not coalesce(is_block, false)),
    'negative_rates', (select count(*) from bookings where rate < 0),
    'negative_charges', (select count(*) from booking_charges where amount < 0 and kind not in ('discount')),
    'today', today
  ) into out;
  return out;
end $$;

create or replace function selftest_ops()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '8000', true);
  select jsonb_build_object(
    'online_new_30m', (select count(*) from online_orders where status = 'new' and created_at < now() - interval '30 minutes'),
    'online_cooking_6h', (select count(*) from online_orders where status in ('accepted', 'preparing', 'ready') and created_at < now() - interval '6 hours'),
    'deliveries_out_6h', (select count(*) from deliveries where status in ('assigned', 'picked_up') and created_at < now() - interval '6 hours'),
    'overstays', (select count(*) from bookings where status = 'checked_in' and check_out < today),
    'unmarked_no_shows', (select count(*) from bookings where status = 'reserved' and check_in < today - 1 and not coalesce(is_block, false)),
    'ota_failed_24h', (select count(*) from ota_sync_log where not ok and created_at > now() - interval '24 hours'),
    'ota_runs_24h', (select count(*) from ota_sync_log where created_at > now() - interval '24 hours'),
    'cash_variance_30d', (select count(*) from shift_closes where abs(variance) > 500 and closed_at > now() - interval '30 days'),
    'orders_open_24h', (select count(*) from orders where status = 'open' and created_at < now() - interval '24 hours'),
    'unpaid_bills_24h', (select count(*) from bills where status = 'unpaid' and created_at < now() - interval '24 hours'),
    'demos_expired', (select count(*) from restaurants where demo_expires_at < now()),
    'demos_live', (select count(*) from restaurants where demo_expires_at >= now()),
    'properties', (select count(*) from restaurants where demo_expires_at is null),
    'active_today', (select count(distinct restaurant_id) from orders where created_at > now() - interval '24 hours')
  ) into out;
  return out;
end $$;

create or replace function selftest_dbperf()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb; slow jsonb := '[]'::jsonb;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '8000', true);
  begin
    select coalesce(jsonb_agg(x), '[]'::jsonb) into slow from (
      select left(regexp_replace(query, '\s+', ' ', 'g'), 90) q, calls, round(mean_exec_time::numeric, 1) mean_ms
        from extensions.pg_stat_statements where calls >= 20 and query !~* '^(begin|commit|set |show |select pg_|with f as)'
       order by mean_exec_time desc limit 5) x;
  exception when others then slow := null;   -- the extension or its view not readable: say so, do not fail
  end;
  select jsonb_build_object(
    'heap_hit_pct', (select round(100 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) from pg_statio_user_tables),
    'index_hit_pct', (select round(100 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) from pg_statio_user_indexes),
    'fk_without_index', coalesce((select jsonb_agg(cl.relname || '(' || (select string_agg(a.attname, ',') from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) || ')' order by cl.relname)
        from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
        where c.contype = 'f' and n.nspname = 'public'
          and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                           and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])), '[]'::jsonb),
    'seq_heavy', coalesce((select jsonb_agg(jsonb_build_object('table', relname, 'seq', seq_scan, 'idx', coalesce(idx_scan, 0), 'rows', n_live_tup) order by seq_scan desc)
        from pg_stat_user_tables where n_live_tup > 5000 and seq_scan > 10 * coalesce(idx_scan, 0) + 100), '[]'::jsonb),
    'dead_heavy', coalesce((select jsonb_agg(jsonb_build_object('table', relname, 'dead', n_dead_tup, 'live', n_live_tup))
        from pg_stat_user_tables where n_dead_tup > 10000 and n_dead_tup > 0.2 * greatest(n_live_tup, 1)), '[]'::jsonb),
    'unused_indexes', (select count(*) from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
        where s.idx_scan = 0 and not i.indisunique and not i.indisprimary and pg_relation_size(s.indexrelid) > 1024 * 1024),
    'connections', (select count(*) from pg_stat_activity),
    'max_connections', current_setting('max_connections')::int,
    'idle_in_tx', (select count(*) from pg_stat_activity where state like 'idle in transaction%' and now() - state_change > interval '5 minutes'),
    'largest', coalesce((select jsonb_agg(jsonb_build_object('table', relname, 'size', pg_size_pretty(pg_total_relation_size(relid)))) from
        (select relid, relname from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 5) t), '[]'::jsonb),
    'slow', slow
  ) into out;
  return out;
end $$;

revoke execute on function selftest_security(), selftest_integrity(), selftest_ops(), selftest_dbperf() from public, anon;
grant execute on function selftest_security(), selftest_integrity(), selftest_ops(), selftest_dbperf() to authenticated;
