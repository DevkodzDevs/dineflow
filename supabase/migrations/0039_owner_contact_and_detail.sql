-- ═══════════ Capture the owner's real address, and show a property's full record ═══════════
--
-- Two separate addresses now, and the difference matters:
--   email          the DineFlow sign-in id, e.g. tan-resort@dineflow.local — typed at the login box
--   contact_email  the owner's real mailbox — where one-time codes are posted, never signed in with
--
-- admin_create_property takes the real address as a new argument. The sign-in id keeps being made
-- from the property name unless one is given explicitly, so the operator hands over a tidy id and a
-- password while the codes go somewhere the owner actually reads.

drop function if exists admin_create_property(text, property_type, boolean, text, text);

create or replace function admin_create_property(
  p_name          text,
  p_type          property_type default 'resort',
  p_demo          boolean       default false,  -- sample content; a new property is empty without it
  p_owner_email   text          default null,   -- sign-in id; generated from the name when blank
  p_owner_name    text          default null,
  p_contact_email text          default null    -- the owner's real mailbox, for password codes
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rid uuid; v_slug text; n int := 0; seeded boolean := false; seed_error text := null;
  login_email text; contact text; temp_pw text; uid uuid; owner_name text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'property'; end if;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop
    n := n + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || n;
  end loop;

  login_email := lower(nullif(trim(coalesce(p_owner_email, '')), ''));
  if login_email is null then login_email := v_slug || '@dineflow.local'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email) then
    raise exception 'The user id % is already taken. Enter a different one.', login_email;
  end if;

  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;

  owner_name := coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), p_name || ' owner');

  insert into restaurants(name, slug, property_type, booking_slug)
    values (p_name, v_slug, p_type, v_slug) returning id into rid;

  temp_pw := gen_temp_password();
  uid := admin_new_login(login_email, temp_pw, owner_name);
  insert into profiles(id, restaurant_id, full_name, email, contact_email, role, must_change_password)
    values (uid, rid, owner_name, login_email, contact, 'owner', true);

  insert into admin_context(user_id, restaurant_id) values (auth.uid(), rid)
    on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();

  if p_demo then
    begin
      insert into categories(restaurant_id, name, sort_order)
        values (rid,'Starters',1),(rid,'Mains',2),(rid,'Breads & Rice',3),(rid,'Drinks',4),(rid,'Desserts',5);
      insert into dining_tables(restaurant_id, name, capacity, zone, sort_order)
        select rid, 'T'||g, 4, 'Main', g from generate_series(1,8) g;
      perform seed_demo_data();
      seeded := true;
    exception when others then seed_error := sqlerrm;
    end;
  end if;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'create_property', rid,
            jsonb_build_object('type', p_type, 'demo_requested', p_demo, 'demo_seeded', seeded,
                               'login', login_email, 'contact', contact)
            || case when seed_error is null then '{}'::jsonb else jsonb_build_object('demo_error', seed_error) end);

  return jsonb_build_object('ok', true, 'id', rid, 'slug', v_slug, 'demo_seeded', seeded,
                            'login_email', login_email, 'temp_password', temp_pw,
                            'owner_name', owner_name, 'contact_email', contact);
end $$;

/** Master control: set or correct the address a property's codes are posted to. */
create or replace function admin_set_contact_email(p_restaurant_id uuid, p_contact_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare contact text; n int;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;
  update profiles set contact_email = contact
   where restaurant_id = p_restaurant_id and role = 'owner';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'that property has no owner login yet'; end if;
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'set_contact_email', p_restaurant_id, jsonb_build_object('contact', contact));
  return jsonb_build_object('ok', true, 'contact_email', contact);
end $$;

/**
 * Everything Master control holds about one property, for the detail dialog: the registration, the
 * people who can sign in, what the property contains, and where its password codes go. Read only.
 * Never returns a password — those exist only as hashes — but it does say whether one is still the
 * temporary one, which is the thing an operator actually needs to know.
 */
create or replace function admin_property_detail(p_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;

  return jsonb_build_object(
    'property', jsonb_build_object(
      'id', r.id, 'name', r.name, 'slug', r.slug, 'type', r.property_type,
      'legal_name', r.legal_name, 'address', r.address, 'phone', r.phone,
      'district', r.district, 'pincode', r.pincode, 'created_at', r.created_at,
      'membership', r.membership, 'plan', r.membership_plan, 'ends_at', r.membership_ends_at,
      'trial_ends_at', r.trial_ends_at, 'booking_slug', r.booking_slug),
    'tax', jsonb_build_object(
      'gstin', r.gstin, 'pan', r.pan, 'scheme', r.gst_scheme, 'state_code', r.gst_state_code,
      'monthly', r.gst_monthly, 'fssai', r.fssai_no, 'gst_rate', r.gst_rate,
      'room_gst_rate', r.room_gst_rate, 'service_charge_pct', r.service_charge_pct,
      'ca_name', r.ca_name, 'ca_firm', r.ca_firm, 'ca_phone', r.ca_phone, 'ca_email', r.ca_email),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.full_name, 'login_id', p.email, 'contact_email', p.contact_email,
        'role', p.role, 'is_active', p.is_active,
        'must_change_password', p.must_change_password,
        'last_sign_in_at', u.last_sign_in_at, 'created_at', p.created_at)
        order by case p.role when 'owner' then 0 else 1 end, p.full_name)
      from profiles p left join auth.users u on u.id = p.id
      where p.restaurant_id = r.id), '[]'::jsonb),
    'contents', jsonb_build_object(
      'menu_items', (select count(*) from menu_items where restaurant_id = r.id),
      'orders',     (select count(*) from orders where restaurant_id = r.id),
      'bills',      (select count(*) from bills where restaurant_id = r.id),
      'invoices',   (select count(*) from invoices where restaurant_id = r.id),
      'rooms',      (select count(*) from rooms where restaurant_id = r.id),
      'bookings',   (select count(*) from bookings where restaurant_id = r.id),
      'guests',     (select count(*) from guests where restaurant_id = r.id),
      'staff',      (select count(*) from labourers where restaurant_id = r.id),
      'tax_docs',   (select count(*) from compliance_docs where restaurant_id = r.id),
      'tax_filings',(select count(*) from compliance_filings where restaurant_id = r.id),
      'sealed_months', (select count(*) from business_periods where restaurant_id = r.id)));
end $$;

revoke all on function admin_set_contact_email(uuid, text) from public, anon;
revoke all on function admin_property_detail(uuid)         from public, anon;
grant execute on function admin_set_contact_email(uuid, text) to authenticated;
grant execute on function admin_property_detail(uuid)         to authenticated;
