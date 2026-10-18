-- 0104 · "New link" for the TV screen works.
--
-- 0103's my_screen_key(true) called gen_random_bytes(), which lives in the `extensions` schema; the function pins
-- search_path = public, so every rotation failed with "function gen_random_bytes(integer) does not exist" and the
-- owner could never switch an old screen off. (The column default is unaffected: it was resolved when 0103 ran.)
-- Same function, same grants, the call schema-qualified. No table changes, so no new policy.

create or replace function public.my_screen_key(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); k text;
begin
  if rid is null then raise exception 'not signed in to a property'; end if;
  if auth_role()::text not in ('owner', 'manager') and not is_platform_admin() then raise exception 'only the owner or a manager can see the screen link'; end if;
  if p_rotate then update restaurants set screen_key = encode(extensions.gen_random_bytes(12), 'hex') where id = rid; end if;
  select screen_key into k from restaurants where id = rid;
  return k;
end $$;
revoke execute on function public.my_screen_key(boolean) from public;
grant execute on function public.my_screen_key(boolean) to authenticated, service_role;
