-- 0093 · The self-test console: what Master control → Testing runs against the database.
--
-- Three things, all master-only (is_platform_admin()):
--   selftest_runs            — one row per suite run, so the page shows the last result of each
--   selftest_db()            — the database's own health: migrations, RLS on every table, no bare
--                              auth_restaurant_id() left in a policy (0091), required functions,
--                              triggers and indexes present, data integrity, size and load
--   selftest_functions(rid)  — every report and screen RPC called for one property, timed, errors
--                              caught per call; the master's acting context is set for the calls
--                              and put back exactly as it was (the whole thing is one transaction)
--
-- Nothing here changes tenant data. The RPCs it calls are the stable, read-only ones the screens use.

create table if not exists selftest_runs (
  id uuid primary key default gen_random_uuid(),
  suite text not null,
  status text not null check (status in ('pass', 'warn', 'fail')),
  ms integer not null default 0,
  checks jsonb not null default '[]'::jsonb,
  ran_by uuid references auth.users(id) on delete set null,
  ran_at timestamptz not null default now()
);
alter table selftest_runs enable row level security;
drop policy if exists admin_only on selftest_runs;
create policy admin_only on selftest_runs for all using ((select is_platform_admin())) with check ((select is_platform_admin()));
create index if not exists selftest_runs_suite_idx on selftest_runs(suite, ran_at desc);

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
    'active_queries', (select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()),
    'longest_query_s', (select coalesce(max(extract(epoch from (now() - query_start))), 0)::int from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()),
    'ms', (extract(epoch from (clock_timestamp() - t0)) * 1000)::int
  ) into out;
  return out;
end $$;
revoke all on function selftest_db() from public, anon;
grant execute on function selftest_db() to authenticated;

create or replace function selftest_functions(p_restaurant uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  prev uuid; had boolean; slug text; stmt text; t0 timestamptz; out jsonb := '[]'::jsonb; err text; ms int;
  calls text[];
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if not exists (select 1 from restaurants where id = p_restaurant) then raise exception 'no such property'; end if;
  select booking_slug into slug from restaurants where id = p_restaurant;
  -- stand inside the property for the calls, and put the context back exactly as it was
  select restaurant_id into prev from admin_context where user_id = auth.uid(); had := found;
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), p_restaurant)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  calls := array[
    'select session_bundle()', 'select dashboard_figures()', 'select menu_stock()', 'select forecast_day((current_date + 1))',
    'select report_summary(7)', 'select sales_breakdown(7)', 'select kitchen_speed(7)', 'select hotel_kpis(7)',
    'select invoice_summary(30, null)', 'select wastage_summary(30)', 'select po_suggest()', 'select leak_report(30)',
    'select menu_engineering(28)', 'select exceptions_summary(28)', 'select day_compare()', 'select shift_expected()',
    'select forecast_scorecard(30)', 'select kots_needs(array[]::uuid[])',
    case when slug is not null then format('select dine_storefront(%L, null)', slug) else 'select 1' end];
  foreach stmt in array calls loop
    t0 := clock_timestamp(); err := null;
    begin
      execute stmt;
    exception when others then err := sqlerrm;
    end;
    ms := (extract(epoch from (clock_timestamp() - t0)) * 1000)::int;
    out := out || jsonb_build_object('name', regexp_replace(stmt, '^select ', ''), 'ok', err is null, 'ms', ms, 'error', err);
  end loop;
  if had then update admin_context set restaurant_id = prev, updated_at = now() where user_id = auth.uid();
  else delete from admin_context where user_id = auth.uid(); end if;
  return out;
end $$;
revoke all on function selftest_functions(uuid) from public, anon;
grant execute on function selftest_functions(uuid) to authenticated;
