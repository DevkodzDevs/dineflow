-- DineFlow v13 — let Master control create a property directly.
-- Before this, the only way to get a property was the public sign-up form, which made
-- Master control look broken on a fresh install. Run AFTER 0012.

create or replace function admin_create_property(p_name text, p_type property_type default 'resort', p_demo boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid; slug text; n int := 0;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  slug := trim(both '-' from slug);
  while exists (select 1 from restaurants r where r.slug = slug) loop n := n + 1; slug := slug || '-' || n; end loop;

  insert into restaurants(name, slug, property_type, booking_slug) values (p_name, slug, p_type, slug) returning id into rid;
  insert into categories(restaurant_id, name, sort_order) values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
  insert into dining_tables(restaurant_id, name, capacity, zone, sort_order) select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;

  -- act as it straight away, so "Create" lands you inside the property
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'create_property', rid, jsonb_build_object('type', p_type, 'demo', p_demo));

  if p_demo then perform seed_demo_data(); end if;
  return jsonb_build_object('ok', true, 'id', rid, 'slug', slug);
end $$;
