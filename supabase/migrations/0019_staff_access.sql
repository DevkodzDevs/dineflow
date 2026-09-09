-- DineFlow v20 — the owner decides what each employee can open.
-- Run AFTER 0018.
-- Three layers, each looking only down:
--   master  → property   (restaurants.enabled_modules, v19)
--   owner   → employee   (profiles.allowed_modules, this file)
--   employee → their own screen
-- An employee's set = property type ∩ their role ∩ the master's set ∩ the owner's ticks.
-- Owners always have everything the master allowed; their own row is never restricted.

alter table profiles add column if not exists allowed_modules text[];   -- NULL = the role's default

/**
 * Owner (or manager) sets an employee's role and, optionally, a tighter set of modules.
 *   - only for people in the caller's own property
 *   - a manager may not touch an owner, nor make anyone an owner
 *   - nobody may change their own role
 *   - the last active owner cannot be demoted or deactivated
 *   - p_modules is stored as given (NULL = role default); the app intersects it with everything above
 */
create or replace function owner_set_access(p_user uuid, p_role user_role, p_modules text[], p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; owners int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or me.role not in ('owner','manager') then raise exception 'only an owner or manager can set access'; end if;
  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.id = me.id and (p_role <> me.role or not p_active) then raise exception 'you cannot change your own role'; end if;
  if me.role = 'manager' and (target.role = 'owner' or p_role = 'owner') then raise exception 'a manager cannot change an owner'; end if;
  if target.role = 'owner' and (p_role <> 'owner' or not p_active) then
    select count(*) into owners from profiles where restaurant_id = me.restaurant_id and role = 'owner' and is_active and id <> target.id;
    if owners = 0 then raise exception 'this is the last owner — make someone else an owner first'; end if;
  end if;
  update profiles set role = p_role, allowed_modules = case when p_role = 'owner' then null else p_modules end, is_active = p_active where id = target.id;
end $$;
