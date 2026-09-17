-- ═══════════ Repair admin_create_property ═══════════
--
-- 0032 rebuilt this function from the text in 0013 and broke it:
--
--     ERROR: column reference "slug" is ambiguous
--
-- The loop that de-duplicates the slug reads `where r.slug = slug`. The local variable is also
-- called slug, and an aliased table still exposes its columns unqualified, so PL/pgSQL cannot tell
-- which one is meant and refuses to run. 0013 has always carried that fault; the copy actually
-- running on the database had been repaired outside the migration chain, which is why creating a
-- property worked before 0032 and stopped afterwards. The audit rows show the same divergence —
-- the live version logged `demo_requested` and `demo_seed_deferred`, keys 0013 never writes.
--
-- This version renames the local to v_slug so nothing is ambiguous, keeps the behaviour 0032 was
-- after (a new property starts empty unless sample data is asked for), and preserves the richer
-- audit metadata. Seeding runs inside its own block: if it fails, the property is still created and
-- the log says the seed did not run, rather than the whole creation rolling back.

create or replace function admin_create_property(
  p_name text,
  p_type property_type default 'resort',
  p_demo boolean default false          -- was true: a new property now starts empty
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; v_slug text; n int := 0; seeded boolean := false; seed_error text := null;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'property'; end if;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop
    n := n + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || n;
  end loop;

  insert into restaurants(name, slug, property_type, booking_slug)
    values (p_name, v_slug, p_type, v_slug) returning id into rid;

  -- act as it straight away, so "Create" lands you inside the property
  insert into admin_context(user_id, restaurant_id) values (auth.uid(), rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();

  -- Sample content only when it was actually asked for. Unticked means nothing at all: no
  -- categories, no tables, no menu. The owner builds their own.
  if p_demo then
    begin
      insert into categories(restaurant_id, name, sort_order)
        values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
      insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
        select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
      perform seed_demo_data();
      seeded := true;
    exception when others then
      seed_error := sqlerrm;                    -- property stands; only the sample data is missing
    end;
  end if;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'create_property', rid,
            jsonb_build_object('type', p_type, 'demo_requested', p_demo, 'demo_seeded', seeded)
            || case when seed_error is null then '{}'::jsonb else jsonb_build_object('demo_error', seed_error) end);

  return jsonb_build_object('ok', true, 'id', rid, 'slug', v_slug, 'demo_seeded', seeded);
end $$;
