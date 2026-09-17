-- ═══════════ Every function that needs pgcrypto can now see it ═══════════
--
-- Third time this has bitten, so this time it is swept rather than patched one at a time.
--
-- Supabase installs pgcrypto into the `extensions` schema. A function declared
-- `security definer set search_path = public` cannot see anything in it, so the moment such a
-- function calls crypt(), gen_salt(), digest() or gen_random_bytes() it fails with
-- "function … does not exist". Already found this way:
--
--   period_hash     Proof of business could never seal a month        (fixed in 0029)
--   demo_user       the sample estate could never create a login      (fixed in 0035)
--   create_invite   Staff could never issue an invite code            (this migration)
--
-- The pass below finds every function in public whose body uses one of those four and whose
-- search_path does not already include extensions, and appends it. Column defaults are untouched and
-- do not need this: their function reference was resolved when the column was defined.

do $$
declare f record; current_path text; n int := 0;
begin
  for f in
    select p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.proconfig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind = 'f'
       and p.prosrc ~ '(gen_random_bytes|gen_salt|crypt\s*\(|digest\s*\()'
       and p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) c
                    where c like 'search_path=%' and c not like '%extensions%')
  loop
    select replace(c, 'search_path=', '') into current_path
      from unnest(f.proconfig) c where c like 'search_path=%' limit 1;
    execute format('alter function public.%I(%s) set search_path = %s, extensions',
                   f.proname, f.args, current_path);
    n := n + 1;
    raise notice 'pgcrypto reachable from %(%): %  ->  %, extensions', f.proname, f.args, current_path, current_path;
  end loop;
  raise notice '% function(s) widened', n;
end $$;
