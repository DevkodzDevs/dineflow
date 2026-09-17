-- ═══════════ Fix: one property could see another property's rows ═══════════
--
-- Every table added after the original set carries this policy:
--
--     using (restaurant_id = auth_restaurant_id() or is_platform_admin())
--
-- The second half is always true for a platform admin, so the policy stops filtering at all: while
-- signed in as Master control, every row of that table from every property passes. Opening a brand
-- new property showed another property's tax documents, filings, reservations, offers, reviews,
-- online orders, channels, invoices, rooms, bookings, guests, labour and sealed months.
--
-- The core tables from 0001 (menu, orders, bills, payments, pantry, tables) never had the bypass,
-- which is why those screens looked correctly empty while Tax & GST, Reservations and Online Orders
-- did not. That difference is the whole of the reported symptom.
--
-- The bypass was never needed. auth_restaurant_id() already resolves to admin_context for a platform
-- admin standing inside a property (0011), so Master control keeps seeing exactly the property it
-- opened — and nothing else. Cross-property reads belong in an explicit, guarded RPC, not in a
-- policy that every per-property screen also goes through.
--
-- Found by walking pg_policies rather than by listing tables, so nothing is missed and re-running is
-- harmless: once tightened, no policy matches the search any more.

do $$
declare p record; n int := 0;
begin
  for p in
    select tablename, policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and policyname = 'tenant_all'
       and qual like '%is_platform_admin%'
     order by tablename
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    if p.cmd = 'SELECT' then
      execute format(
        'create policy %I on public.%I for select using (restaurant_id = auth_restaurant_id())',
        p.policyname, p.tablename);
    else
      execute format(
        'create policy %I on public.%I for all using (restaurant_id = auth_restaurant_id()) with check (restaurant_id = auth_restaurant_id())',
        p.policyname, p.tablename);
    end if;
    n := n + 1;
    raise notice 'tenant isolation restored on %', p.tablename;
  end loop;
  raise notice '% policies tightened', n;
end $$;


-- ── the one master screen that genuinely reads across properties ─────────────────────────────
-- /admin/compliance shows every property's filing position side by side. With the policy bypass
-- gone it can no longer select those tables directly, which is the point: the cross-property read
-- is now a single function that checks who is asking, instead of a hole every screen shared.
create or replace function admin_compliance_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  return jsonb_build_object(
    'filings', coalesce((select jsonb_agg(jsonb_build_object(
                  'restaurant_id', restaurant_id, 'form', form, 'period', period, 'filed_on', filed_on))
                from compliance_filings), '[]'::jsonb),
    'docs',    coalesce((select jsonb_agg(jsonb_build_object(
                  'restaurant_id', restaurant_id, 'kind', kind, 'expires_on', expires_on))
                from compliance_docs), '[]'::jsonb));
end $$;
revoke all on function admin_compliance_overview() from public, anon;
grant execute on function admin_compliance_overview() to authenticated;
