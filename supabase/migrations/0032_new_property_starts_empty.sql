-- ═══════════ A new property starts empty ═══════════
--
-- Creating a property from Master control always inserted five categories (Starters, Mains,
-- Breads & Rice, Drinks, Desserts) and eight tables (T1–T8), whether or not "Fill it with sample
-- data" was ticked. Those names and table numbers are the same ones the demo seeders use, so a
-- brand-new property looked pre-filled and indistinguishable from a seeded one.
--
-- Two changes:
--   1. p_demo now defaults to false. Creating a property without saying otherwise gives an empty
--      property. Before, the default was true.
--   2. The categories and tables move inside the p_demo branch, so the tick box means what it says:
--      ticked → sample content; unticked → nothing at all, and the owner builds their own menu.
--
-- Nothing already created is altered by this migration; it only changes what happens next. The
-- public sign-up path (create_restaurant) is deliberately left alone — someone signing themselves up
-- has no Master control behind them and the starter categories are the only thing standing between
-- them and an empty Menu screen.

create or replace function admin_create_property(p_name text, p_type property_type default 'resort', p_demo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid; slug text; n int := 0;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  slug := trim(both '-' from slug);
  while exists (select 1 from restaurants r where r.slug = slug) loop n := n + 1; slug := slug || '-' || n; end loop;

  insert into restaurants(name, slug, property_type, booking_slug) values (p_name, slug, p_type, slug) returning id into rid;

  -- act as it straight away, so "Create" lands you inside the property
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'create_property', rid, jsonb_build_object('type', p_type, 'demo', p_demo));

  -- Sample content only when it was actually asked for.
  if p_demo then
    insert into categories(restaurant_id, name, sort_order)
      values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
    insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
      select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
    perform seed_demo_data();
  end if;

  return jsonb_build_object('ok', true, 'id', rid, 'slug', slug);
end $$;
