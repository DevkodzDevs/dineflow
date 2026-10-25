-- 0141 · Display lock (2026-10-25, the owner): pin a device to one page. Two kinds of lock —
--   view : a static screen; nothing on it can be touched, it only scrolls (a TV, a board, a customer display)
--   work : the page and its own steps work (Billing → the till → the bill), but the menu, Back and every other page
--          are gone
-- Which pages may be locked, and how, is the property's setting: restaurants.display_lock, { "<page key>": "view"|"work" }.
-- Only the owner, a general manager or a manager (role owner / manager — a General Manager's position carries the
-- manager role) may change it, lock a device or release one. The lock itself lives on the device (an httpOnly cookie
-- the app sets and the middleware reads); these functions keep the setting and write the audit trail.
--
-- Additive only. No new table, so no new policy: restaurants keeps its own; nothing but display_lock_set writes the column.

alter table public.restaurants add column if not exists display_lock jsonb not null default '{}'::jsonb;

/** Turn a page's display lock on (with its kind) or off (p_mode null). Owner or manager of the property only. */
create or replace function public.display_lock_set(p_key text, p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); before jsonb; after jsonb;
begin
  if rid is null then raise exception 'not signed in to a property' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager') then raise exception 'Only the owner or a manager can set display locks.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9-]{1,40}$' then raise exception 'That page is not one we know.'; end if;
  if p_mode is not null and p_mode not in ('view', 'work') then raise exception 'A display lock is view or work.'; end if;
  select display_lock into before from restaurants where id = rid;
  update restaurants
     set display_lock = case when p_mode is null then coalesce(display_lock, '{}'::jsonb) - p_key
                             else coalesce(display_lock, '{}'::jsonb) || jsonb_build_object(p_key, p_mode) end
   where id = rid
  returning display_lock into after;
  perform audit_log(rid, case when p_mode is null then 'display.disallow' else 'display.allow' end, 'page', null,
    format('Display lock · %s%s', p_key, case when p_mode is null then ' off' else ' · ' || p_mode end), null,
    jsonb_build_object(p_key, before -> p_key), jsonb_build_object(p_key, after -> p_key));
  return after;
end $$;
revoke execute on function public.display_lock_set(text, text) from public, anon;
grant execute on function public.display_lock_set(text, text) to authenticated, service_role;

/** A device was locked or released: a line in the audit trail. Locking is the owner's or a manager's; a release names
 *  who released it (the app checks that person's own sign-in first — the device may be signed in as anyone). */
create or replace function public.display_lock_note(p_action text, p_key text, p_mode text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'not signed in to a property' using errcode = '42501'; end if;
  if p_action not in ('lock', 'release') then raise exception 'lock or release'; end if;
  if p_action = 'lock' and auth_role() not in ('owner', 'manager') then raise exception 'Only the owner or a manager can lock a display.' using errcode = '42501'; end if;
  perform audit_log(rid, 'display.' || p_action, 'page', null,
    left(format('%s · %s%s', case when p_action = 'lock' then 'Display locked' else 'Display released' end, coalesce(p_key, '—'),
      case when p_mode is not null then ' · ' || p_mode else '' end), 120),
    nullif(left(coalesce(p_by, ''), 80), ''), null, jsonb_build_object('key', p_key, 'mode', p_mode), null);
end $$;
revoke execute on function public.display_lock_note(text, text, text, text) from public, anon;
grant execute on function public.display_lock_note(text, text, text, text) to authenticated, service_role;
