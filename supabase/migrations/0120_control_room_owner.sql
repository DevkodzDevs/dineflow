-- 0120 · The control room is the owner's (2026-10-18; applied by hand in the SQL Editor on 2026-10-19, after the deploy)
-- The control room (the dashboard — the day's sales, the money, every department at once) was open to every role: it
-- was where the app landed everyone. Now it is the owner's, a manager's only when the owner ticks it for them in Staff →
-- Access, and nobody else's — whatever their ticks say. effective_modules() keeps its shape; only 'dashboard' is
-- filtered, so has_module('dashboard') — what dashboard_figures checks — answers the same rule, and a waiter calling the
-- figures through the API is refused. A master standing in for an owner acts as the owner (acting_profile) and keeps it.
-- owner_set_access passes an owner's ticks through, so ticking it for a manager needs no change; a supervisor's ticks
-- are clamped to what they hold, so they can never give it.
create or replace function public.effective_modules(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select m from unnest(
      case when p.role = 'owner' then rm.ceiling else coalesce(p.allowed_modules, rm.default_set) end
    ) m
    where m = any(rm.ceiling)
      and (r.enabled_modules is null or m = any(r.enabled_modules) or m in ('dashboard', 'settings'))
      and (m <> 'dashboard' or p.role = 'owner' or (p.role = 'manager' and 'dashboard' = any(coalesce(p.allowed_modules, '{}'::text[]))))
  ), '{}'::text[])
  from acting_profile() p
  join role_modules rm on rm.role = p.role
  join restaurants r on r.id = p.restaurant_id
  where p.id = p_user;
$$;
revoke all on function public.effective_modules(uuid) from public, anon;
grant execute on function public.effective_modules(uuid) to authenticated, service_role;
