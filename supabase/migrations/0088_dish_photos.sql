-- 0088 · Dish photos.
--
-- Every dish can carry a photo: found for it (Wikipedia / Wikimedia Commons — freely licensed, the
-- credit kept beside it) or uploaded by the property. menu_items.image_url already existed and the
-- till already showed it; nothing filled it and the guest storefront never sent it.
--
--   · menu_items.image_credit — who took it and under what licence ("Photo: A. Kumar · CC BY-SA 4.0")
--   · menu_items.image_source — the page it came from, so the credit links back
--   · a public bucket `menu`, one folder per property, written by the people who edit the menu
--   · dine_storefront sends image_url with each dish (the body is 0076's, unchanged otherwise)

alter table menu_items add column if not exists image_credit text, add column if not exists image_source text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 1572864, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- the roles that hold the menu: owner (and Master control acting), manager, supervisors, chef
drop policy if exists menu_photo_insert on storage.objects;
create policy menu_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager', 'supervisor', 'supervisor_2', 'chef'));
drop policy if exists menu_photo_update on storage.objects;
create policy menu_photo_update on storage.objects for update to authenticated
  using (bucket_id = 'menu' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager', 'supervisor', 'supervisor_2', 'chef'))
  with check (bucket_id = 'menu' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager', 'supervisor', 'supervisor_2', 'chef'));
drop policy if exists menu_photo_delete on storage.objects;
create policy menu_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager', 'supervisor', 'supervisor_2', 'chef'));
drop policy if exists menu_photo_select on storage.objects;
create policy menu_photo_select on storage.objects for select to authenticated
  using (bucket_id = 'menu' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text);

create or replace function dine_storefront(p_slug text, p_table text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'tagline', r.tagline,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'phone', r.phone, 'district', r.district, 'photos', to_jsonb(r.photos), 'policies', r.policies,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'gst_rate', r.gst_rate, 'room_gst_rate', r.room_gst_rate,
    'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
    'rooms', (select count(*) from rooms rm where rm.restaurant_id = r.id) > 0,
    'min_order', r.min_order, 'delivery_fee', r.delivery_fee, 'packing_charge', r.packing_charge,
    'open_now', (current_time between r.opens_at and r.closes_at),
    'table', (select jsonb_build_object('id', t.id, 'name', t.name, 'zone', t.zone) from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table and p_table is not null),
    -- every add-on group this property offers, once, with only the add-ons that can be sold today
    'addon_groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min', g.min_select, 'max', g.max_select,
               'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_veg', a.is_veg) order by a.sort_order, a.name)
                                   from addons a where a.group_id = g.id and a.is_active and a.is_available), '[]'::jsonb)) order by g.sort_order, g.name)
      from addon_groups g
      where g.restaurant_id = r.id and g.is_active
        and exists (select 1 from menu_item_addon_groups l join menu_items m on m.id = l.menu_item_id
                    where l.group_id = g.id and m.restaurant_id = r.id and m.is_active)), '[]'::jsonb),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description, 'available', m.is_available,
                    'is_combo', m.is_combo, 'image_url', m.image_url,
                    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'is_default', v.is_default) order by v.sort_order, v.name)
                                          from menu_variants v where v.menu_item_id = m.id and v.is_active), '[]'::jsonb),
                    -- just the ids; the groups themselves are above
                    'addon_group_ids', coalesce((select jsonb_agg(l.group_id) from menu_item_addon_groups l join addon_groups g on g.id = l.group_id
                                                 where l.menu_item_id = m.id and g.is_active), '[]'::jsonb),
                    'components', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'qty', ci.qty) order by x.name)
                                            from combo_items ci join menu_items x on x.id = ci.menu_item_id where ci.combo_id = m.id), '[]'::jsonb)
                  ) order by m.name)
                           from menu_items m where m.category_id = c.id and m.is_active), '[]')) order by c.sort_order)
      from categories c where c.restaurant_id = r.id), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'value', o.value, 'scope', o.scope, 'min_order', o.min_order, 'code', o.code, 'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)))
      from offers o where o.restaurant_id = r.id and o.is_active and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
      from (select * from reviews where restaurant_id = r.id order by created_at desc limit 20) v), '[]'))
  from restaurants r
  where r.booking_slug = p_slug and r.membership in ('trial','active')
    and (r.is_listed or exists (select 1 from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table))
$$;
