-- ═══════════ A DineFlow code for every property ═══════════
--
--     dine-res-mano-00001
--      │    │    │     └── running index, five digits, from a sequence so it is never reused
--      │    │    └──────── the first four letters of the property name, lowercased
--      │    └───────────── res restaurant · htl hotel · rst resort
--      └────────────────── fixed
--
-- The code is the sign-in id: the owner types dine-res-mano-00001@dineflow.local at the login box.
-- Supabase authenticates by email, so the code becomes the local part rather than a second
-- identifier sitting beside one. One thing to read out, one thing to write down.
--
-- The index comes from a sequence, not from counting rows: counting would hand a deleted property's
-- number to the next one created, and two properties sharing a code would be worse than a gap.

alter table restaurants add column if not exists code text;
create unique index if not exists restaurants_code_idx on restaurants(code) where code is not null;
create sequence if not exists dineflow_code_seq as bigint start 1;

comment on column restaurants.code is
  'dine-<res|htl|rst>-<first four letters>-<00001>. Also the local part of the owner sign-in id.';

/** Four letters from the name: letters and digits only, lowercased, padded with x when short. */
create or replace function dineflow_name_part(p_name text) returns text
language sql immutable set search_path = public as $$
  select rpad(left(coalesce(nullif(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g'), ''), 'prop'), 4), 4, 'x')
$$;

/** The next code for a property of this type. Takes a number from the sequence each time. */
create or replace function next_dineflow_code(p_name text, p_type property_type) returns text
language sql volatile set search_path = public as $$
  select 'dine-'
      || case p_type when 'restaurant' then 'res' when 'hotel' then 'htl' else 'rst' end
      || '-' || dineflow_name_part(p_name)
      || '-' || lpad(nextval('dineflow_code_seq')::text, 5, '0')
$$;

revoke all on function next_dineflow_code(text, property_type) from public, anon, authenticated, service_role;

-- ── creation now mints the code and builds the sign-in id from it ────────────────────────────
drop function if exists admin_create_property(text, property_type, boolean, text, text, text);

create or replace function admin_create_property(
  p_name          text,
  p_type          property_type default 'resort',
  p_demo          boolean       default false,
  p_owner_email   text          default null,   -- override the sign-in id; the code is used if blank
  p_owner_name    text          default null,
  p_contact_email text          default null    -- the owner's real mailbox, for password codes
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rid uuid; v_slug text; v_code text; n int := 0; seeded boolean := false; seed_error text := null;
  login_email text; contact text; temp_pw text; uid uuid; owner_name text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'property'; end if;
  while exists (select 1 from restaurants r where r.slug = v_slug) loop
    n := n + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || n;
  end loop;

  v_code := next_dineflow_code(p_name, p_type);

  login_email := lower(nullif(trim(coalesce(p_owner_email, '')), ''));
  if login_email is null then login_email := v_code || '@dineflow.local'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email) then
    raise exception 'The user id % is already taken. Enter a different one.', login_email;
  end if;

  contact := lower(nullif(trim(coalesce(p_contact_email, '')), ''));
  if contact is not null and contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address: %', contact;
  end if;

  owner_name := coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), p_name || ' owner');

  insert into restaurants(name, slug, code, property_type, booking_slug)
    values (p_name, v_slug, v_code, p_type, v_slug) returning id into rid;

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
            jsonb_build_object('type', p_type, 'code', v_code, 'demo_requested', p_demo,
                               'demo_seeded', seeded, 'login', login_email, 'contact', contact)
            || case when seed_error is null then '{}'::jsonb else jsonb_build_object('demo_error', seed_error) end);

  return jsonb_build_object('ok', true, 'id', rid, 'slug', v_slug, 'code', v_code,
                            'demo_seeded', seeded, 'login_email', login_email,
                            'temp_password', temp_pw, 'owner_name', owner_name, 'contact_email', contact);
end $$;

-- ── give the properties that already exist a code, and move their sign-in id onto it ─────────
-- The password is not touched, so anything already handed out still works; only the id changes.
-- Returns the new ids so they can be passed on rather than lost.
create or replace function admin_backfill_dineflow_codes()
returns table (property text, code text, old_login text, new_login text)
language plpgsql security definer set search_path = public, auth as $$
declare r record; c text; new_email text; old_email text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'only master control can do this';
  end if;
  for r in select id, name, property_type from restaurants
            where code is null and not is_shadow order by created_at
  loop
    c := next_dineflow_code(r.name, r.property_type);
    update restaurants set code = c where id = r.id;

    select p.email into old_email from profiles p
     where p.restaurant_id = r.id and p.role = 'owner' order by p.created_at limit 1;

    -- only move a generated .local id across; a real address the operator chose is left alone
    if old_email is not null and old_email like '%@dineflow.local' then
      new_email := c || '@dineflow.local';
      update auth.users set email = new_email, updated_at = now()
       where email = old_email;
      update auth.identities
         set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
       where identity_data->>'email' = old_email;
      update profiles set email = new_email where email = old_email;
    else
      new_email := old_email;
    end if;

    property := r.name; code := c; old_login := old_email; new_login := new_email;
    return next;
  end loop;
end $$;
revoke all on function admin_backfill_dineflow_codes() from public, anon, authenticated, service_role;

-- ── the detail dialog should show the code ───────────────────────────────────────────────────
create or replace function admin_property_detail(p_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;

  return jsonb_build_object(
    'property', jsonb_build_object(
      'dineflow_code', r.code,
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
