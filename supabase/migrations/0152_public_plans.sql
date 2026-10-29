-- 0152 — The prices on the public site (2026-10-29, item 18). The landing page's pricing reads the plans a visitor could buy
-- — the active ones, their names and prices — so what dineflow.cloud says is what /membership charges, set in one place
-- (Master control → Keys → Plans & prices, 0151). Read-only, and only these columns' worth through public_plans().

create or replace function public.public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'monthly', monthly, 'yearly', yearly) order by key desc), '[]'::jsonb)
    from plans where is_active;
$$;
revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;

notify pgrst, 'reload schema';
