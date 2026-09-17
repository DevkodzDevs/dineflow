-- ═══════════ Lock the demo seeder away from the application roles ═══════════
--
-- 0028 ended with `revoke all on function seed_demo_full(...) from public`, which was not enough.
-- Supabase does not rely on the PUBLIC grant: its default privileges grant EXECUTE explicitly to
-- anon, authenticated and service_role, so revoking PUBLIC left this behind:
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- seed_demo_full is SECURITY DEFINER and takes a restaurant id as an argument, so with that grant in
-- place any signed-in user could have aimed it at any property and rewritten its GSTIN, PAN, tax
-- rates and membership. The guard inside the function (auth.uid() must be null, or the caller must
-- be a platform admin) did block it, but a guard alone is one mistake away from being the only
-- thing standing there. The grant should not exist.
--
-- After this, only the database owner can call it: a migration, or the SQL editor. The app, the
-- anon key and the service-role key cannot reach it. The demo data already loaded is unaffected,
-- and no property other than the two it was pointed at is touched by any of this.

revoke all on function seed_demo_full(uuid, text, text, text, text, boolean, jsonb, int, boolean)
  from public, anon, authenticated, service_role;

-- Same treatment for the two date helpers 0028 added. They are pure and harmless, but they are
-- demo scaffolding and have no business being callable over the API.
revoke all on function demo_fy(date)      from public, anon, authenticated, service_role;
revoke all on function demo_quarter(date) from public, anon, authenticated, service_role;

do $$
declare acl text;
begin
  select coalesce(proacl::text, '(owner only)') into acl from pg_proc where proname = 'seed_demo_full';
  raise notice 'seed_demo_full grants are now: %', acl;
end $$;
