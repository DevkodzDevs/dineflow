-- ═══════════ Master mode belongs to Master control credentials only ═══════════
-- admin_acting_as() used to return whatever admin_context row existed for the caller,
-- without checking that the caller is still a platform admin. The row outlives removal
-- from platform_admins, so a former master kept resolving to a property here even though
-- auth_restaurant_id() (0011) already refused them at the data layer. This brings the
-- app-facing function in line with that join: no platform_admins row, no master mode.
create or replace function admin_acting_as() returns uuid
language sql stable security definer set search_path = public as $$
  select c.restaurant_id
  from admin_context c
  join platform_admins p on p.user_id = c.user_id
  where c.user_id = auth.uid()
$$;
