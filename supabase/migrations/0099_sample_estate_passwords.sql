-- 0099 · The sample estate's owner logins get passwords of their own.
--
-- install_sample_estate (Master control → Sample estate) made six owner logins that all signed in with
-- one fixed password written in this repository (0014). Run on a live database, anyone who had seen the
-- code could sign in as those owners: properties with active yearly memberships and Neighbours sharing
-- switched on, so the network's prices, surplus and standby labour of the real properties nearby. On
-- 2026-10-13 no account on the live database used it; a Box that loaded the estate may have six.
--
-- Now each new owner gets gen_temp_password() (0098: the cryptographic generator), shown once in the
-- sheet that made it. A login that already existed keeps its password and comes back as null. Any
-- account still signing in with the old shared password gets a random one nobody holds — Master
-- control → Reset password issues a new one.
--
-- install_sample_estate is the live pg_get_functiondef body of 2026-10-13 (0095's) with only the
-- lines marked "0099" changed.

CREATE OR REPLACE FUNCTION public.install_sample_estate()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record; rid uuid; uid uuid; made jsonb := '[]'; slug text; pw text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  for v in select * from (values
    ('Annapoorna Mess','restaurant','owner@annapoorna.in','Senthil Kumar','Nagercoil','629001',8.1780,77.4310,'A mess in Nagercoil'),
    ('Marina Grill House','restaurant','owner@marina.in','Fathima Beevi','Kanyakumari','629702',8.0883,77.5385,'A grill house near the beach'),
    ('Hotel Tamizh Residency','hotel','owner@tamizh.in','Rajesh Iyer','Nagercoil','629002',8.1900,77.4200,'A hotel in Nagercoil'),
    ('Pearl City Hotel','hotel','owner@pearl.in','Anitha Raman','Kanyakumari','629701',8.0780,77.5500,'A city hotel'),
    ('Kanyakumari Bay Resort','resort','owner@bayresort.in','Priya Kumar','Kanyakumari','629702',8.0700,77.5560,'A resort near the beach'),
    ('Ooty Pine Hill Resort','resort','owner@pinehill.in','Vikram Shah','Kanyakumari','629703',8.0500,77.5300,'A hill resort')
  ) x(name, ptype, email, owner, district, pincode, lat, lng, alias) loop
    select id into rid from restaurants where name = v.name;
    if rid is null then
      slug := regexp_replace(lower(v.name), '[^a-z0-9]+', '-', 'g');
      insert into restaurants(name, slug, property_type, booking_slug, district, pincode, lat, lng, network_alias,
        address, phone, gstin, tagline, policies, membership, membership_plan, membership_ends_at)
        values (v.name, slug, v.ptype::property_type, slug, v.district, v.pincode, v.lat, v.lng, v.alias,
          v.district || ', Tamil Nadu ' || v.pincode, '+91 98765 ' || lpad((random()*99999)::int::text, 5, '0'),
          '33' || upper(substr(md5(v.name), 1, 5)) || '1234F1Z5', 'Honest food, comfortable rooms',
          'Free cancellation up to 48 hours before arrival. Government ID required at check-in.',
          'active', 'yearly', now() + interval '300 days')
        returning id into rid;
    end if;
    -- 0099: a password of its own for a new owner; an existing login keeps whatever it has
    select id into uid from auth.users where email = v.email;
    if uid is null then pw := gen_temp_password(); uid := demo_user(v.email, pw, v.owner); else pw := null; end if;
    insert into profiles(id, restaurant_id, full_name, email, role) values (uid, rid, v.owner, v.email, 'owner')
      on conflict (id) do update set restaurant_id = excluded.restaurant_id, full_name = excluded.full_name;
    insert into network_settings(restaurant_id, share_prices, share_surplus, share_labour, share_demand, radius_km, joined_at)
      values (rid, true, true, true, true, 40, now())
      on conflict (restaurant_id) do update set share_prices = true, share_surplus = true, share_labour = true, share_demand = true;
    perform seed_property(rid, 60);
    perform seed_storefront(rid);
    made := made || jsonb_build_object('name', v.name, 'type', v.ptype, 'email', v.email, 'password', pw, 'id', rid);   -- 0099
  end loop;
  perform _acting_clear();
  return jsonb_build_object('ok', true, 'properties', made);
end $function$;

-- any sample owner still signing in with the old shared password: a random one nobody holds
update auth.users u
   set encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')), updated_at = now()
 where u.email in ('owner@annapoorna.in', 'owner@marina.in', 'owner@tamizh.in', 'owner@pearl.in', 'owner@bayresort.in', 'owner@pinehill.in')
   and u.encrypted_password = crypt('Dine@1234', u.encrypted_password);
