-- DineFlow v19 — the master decides what each owner can open.
-- Run AFTER 0017.
-- `restaurants.enabled_modules` is the set of modules the master has switched on for that property.
-- NULL means "everything the property type allows" (the default for every property so far).
-- The app intersects this with the property type and the person's role; the (app) layout enforces
-- it on the server for every route, so a module that is off cannot be reached by typing its URL.

alter table restaurants add column if not exists enabled_modules text[];

/** Master only. Sets the modules an owner's control page shows. Pass NULL to allow everything again. */
create or replace function master_set_modules(p_restaurant_id uuid, p_modules text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where user_id = auth.uid()) then raise exception 'master only'; end if;
  update restaurants set enabled_modules = p_modules where id = p_restaurant_id;
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'set_modules', p_restaurant_id, jsonb_build_object('modules', p_modules));
end $$;

-- The master's own sign-in must never resolve to a property on its own. It lands on Master control,
-- and opens a property only through "Act as". This function answers "is this the master?" for the app.
create or replace function is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
grant execute on function is_master() to authenticated;
