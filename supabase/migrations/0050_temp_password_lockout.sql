-- ═══════════ Temporary passwords lock the account 3 days before expiry ═══════════
--
-- A temporary password is valid for 7 days. Before this change the password stayed usable in
-- auth.users even after it expired in the vault — the vault controlled visibility, not access.
-- That meant an owner could keep signing in on a temporary password indefinitely.
--
-- Now the timeline is:
--
--     Day 0 ──────── Day 4 ──────── Day 7
--     issued         LOCKED OUT      vault expires
--     can sign in    cannot sign in  password blanked from vault
--     3 days left    must get a new  Master control can see it
--                    one from Master was expired, generate new
--
-- "Locked out" means the auth.users password is scrambled to a random value that nobody holds. The
-- owner cannot sign in, but Master control can still see the old temp password in the Details dialog
-- (it is still in the vault until day 7) and can issue a new one at any time.
--
-- The lockout is enforced by a function called opportunistically from requireSession's path. It is
-- not a cron job: it runs when someone tries to use the account, which is exactly the moment it
-- matters. Calling it twice is harmless — it only writes once.

/** Lock out accounts whose temp password has been live for more than 4 days without the owner
    changing it. Scrambles the auth.users hash so login fails; the vault row stays readable. */
create or replace function enforce_temp_password_lockout() returns int
language plpgsql security definer set search_path = public, auth, extensions as $$
declare r record; n int := 0;
begin
  for r in
    select tp.user_id
      from temp_passwords tp
      join profiles p on p.id = tp.user_id
     where tp.password is not null                        -- still in the vault (not yet expired/consumed)
       and p.must_change_password = true                  -- owner has not set their own
       and tp.issued_at + interval '4 days' < now()       -- past the 4-day mark
       -- only lock once: check the hash still matches the temp password
       and (select u.encrypted_password = crypt(tp.password, u.encrypted_password)
              from auth.users u where u.id = tp.user_id)
  loop
    -- scramble to a random value nobody holds
    update auth.users set encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
                          updated_at = now()
     where id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function enforce_temp_password_lockout() from public, anon, authenticated;
grant execute on function enforce_temp_password_lockout() to service_role;

-- The detail dialog should show days until lockout, not just days until vault expiry.
-- Add a lockout_at computed column concept into the detail output.
create or replace function admin_property_detail(p_restaurant_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  perform sweep_expired_temp_passwords();
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
        'temp_password', tp.password,
        'temp_password_issued', tp.issued_at,
        'temp_password_expires', tp.expires_at,
        'temp_password_lockout', tp.issued_at + interval '4 days',
        'temp_password_locked_out', case
          when tp.password is null then false
          when p.must_change_password and tp.issued_at + interval '4 days' < now() then true
          else false end,
        'temp_password_expired', case when tp.password is null and tp.id is not null then true
                                      when tp.expires_at < now() then true else false end,
        'last_sign_in_at', u.last_sign_in_at, 'created_at', p.created_at)
        order by case p.role when 'owner' then 0 else 1 end, p.full_name)
      from profiles p
      left join auth.users u on u.id = p.id
      left join lateral (
        select tp2.id, tp2.password, tp2.issued_at, tp2.expires_at
          from temp_passwords tp2
         where tp2.user_id = p.id
         order by tp2.issued_at desc limit 1
      ) tp on true
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
