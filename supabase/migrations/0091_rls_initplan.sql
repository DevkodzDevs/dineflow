-- 0091 · Row security that asks "which property?" once per query, not once per row.
--
-- Seventy policies read `restaurant_id = auth_restaurant_id()`. Written bare, Postgres calls the
-- function for every row it looks at, and because its value is unknown when the plan is made it
-- cannot use the (restaurant_id, …) indexes: "the last six paid bills" scanned every property's bills
-- and filtered them one call at a time — 60 ms in the database at 2 477 bills, ~450 ms through the
-- API, and growing with every bill any property writes. Wrapped as `(select auth_restaurant_id())`
-- the planner evaluates it once (an InitPlan) and treats it as a constant — Supabase's own guidance
-- for RLS performance. auth_role() and is_platform_admin() get the same treatment.
--
-- The meaning of every policy is unchanged: the same expression, evaluated once. Only policies in
-- `public` that still hold a bare call are touched; running this twice changes nothing. New policies
-- should be written wrapped (see docs/sections/data-and-rls.md).

do $$
declare
  p record;
  q text; c text;
  wrap constant text[] := array['auth_restaurant_id()', 'auth_role()', 'is_platform_admin()'];
  f text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ '(auth_restaurant_id|auth_role|is_platform_admin)\(\)' or with_check ~ '(auth_restaurant_id|auth_role|is_platform_admin)\(\)')
  loop
    q := p.qual; c := p.with_check;
    foreach f in array wrap loop
      -- wrap every bare call; a call already inside "(SELECT f() AS …)" is left alone
      if q is not null then
        q := regexp_replace(q, '(?<!SELECT )' || replace(replace(f, '(', '\('), ')', '\)'), '(SELECT ' || f || ')', 'gi');
      end if;
      if c is not null then
        c := regexp_replace(c, '(?<!SELECT )' || replace(replace(f, '(', '\('), ')', '\)'), '(SELECT ' || f || ')', 'gi');
      end if;
    end loop;
    if q is not distinct from p.qual and c is not distinct from p.with_check then continue; end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;
