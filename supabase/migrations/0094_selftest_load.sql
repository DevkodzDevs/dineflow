-- 0094 · selftest_db's "Load" counts the app's own connections only.
--
-- 0093 counted every active backend in pg_stat_activity, which on Supabase includes its own
-- long-lived workers (replication, pooler housekeeping) — the "longest query" read as hours and the
-- check warned on a quiet database. Client backends on this database, with this backend left out.
-- Everything else in selftest_db is as 0093 wrote it.

create or replace function selftest_db() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb; t0 timestamptz := clock_timestamp();
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'now', now(),
    'migrations', jsonb_build_object('count', (select count(*) from _dineflow_migrations), 'latest', (select name from _dineflow_migrations order by name desc limit 1)),
    'tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
    'rls_off', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and c.relname not in ('_dineflow_migrations')), '[]'::jsonb),
    'bare_policies', (select count(*) from pg_policies where schemaname = 'public'
                       and (coalesce(qual, '') ~* '(?<!SELECT )(auth_restaurant_id|auth_role|is_platform_admin)\(\)'
                            or coalesce(with_check, '') ~* '(?<!SELECT )(auth_restaurant_id|auth_role|is_platform_admin)\(\)')),
    'missing_functions', coalesce((select jsonb_agg(f) from unnest(array['session_bundle', 'dashboard_figures', 'invoice_summary', 'forecast_day', 'menu_stock',
                             'consume_recipe', 'apply_standard_recipe', 'report_summary', 'po_suggest', 'admin_act_as', 'admin_stop_acting', 'cancel_line',
                             'void_bill', 'cash_move', 'place_order', 'is_master', 'auth_restaurant_id', 'is_platform_admin', 'dine_storefront']) f
                             where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f)), '[]'::jsonb),
    'missing_triggers', coalesce((select jsonb_agg(t) from unnest(array['trg_consume_recipe', 'audit_bills', 'audit_orders', 'audit_order_items', 'audit_payments', 'audit_stock']) t
                             where not exists (select 1 from pg_trigger where tgname = t)), '[]'::jsonb),
    'missing_indexes', coalesce((select jsonb_agg(i) from unnest(array['ledger_ref_idx', 'bills_rid_paid_idx', 'invoices_rid_issued_idx', 'order_items_rid_created_idx']) i
                             where not exists (select 1 from pg_class where relname = i)), '[]'::jsonb),
    'integrity', jsonb_build_object(
      'negative_stock', (select count(*) from ingredients where is_active and current_stock < 0),
      'orders_open_over_24h', (select count(*) from orders where status = 'open' and created_at < now() - interval '24 hours'),
      'paid_bills_payments_off', (select count(*) from bills b where b.status = 'paid'
                                   and abs(coalesce((select sum(p.amount) from payments p where p.bill_id = b.id), 0) - b.total) > 0.01),
      'properties_without_owner', (select count(*) from restaurants r where r.demo_expires_at is null
                                     and not exists (select 1 from profiles p where p.restaurant_id = r.id and p.role = 'owner'))),
    'counts', jsonb_build_object('restaurants', (select count(*) from restaurants), 'profiles', (select count(*) from profiles), 'orders', (select count(*) from orders),
                                 'bills', (select count(*) from bills), 'menu_items', (select count(*) from menu_items), 'ingredients', (select count(*) from ingredients), 'invoices', (select count(*) from invoices)),
    'size', pg_size_pretty(pg_database_size(current_database())),
    'active_queries', (select count(*) from pg_stat_activity where datname = current_database() and backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()),
    'longest_query_s', (select coalesce(max(extract(epoch from (now() - query_start))), 0)::int from pg_stat_activity
                        where datname = current_database() and backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()),
    'ms', (extract(epoch from (clock_timestamp() - t0)) * 1000)::int
  ) into out;
  return out;
end $$;
