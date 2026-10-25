-- 0143 · Fixes from the 2026-10-25 full-app audit. Additive: two functions replaced, no table or policy changed.
--
-- 1. display_lock_note (0141): a 'release' line could be written by any signed-in person naming anyone in p_by — a waiter
--    could put "Released by <the GM>" in the audit trail. A release is now noted only by an owner or a manager signed in
--    themselves (the app writes it on the releasing manager's own sign-in, after checking their password), and the actor
--    the trail records is that person (audit_log takes auth.uid()). p_by stays as the readable name.
-- 2. apply_ledger (0001): the stock trigger updated an ingredient by id alone. 0098's zz_same_property already refuses a
--    stock_ledger row whose ingredient is another property's, so this was not reachable; the update now says so itself.

create or replace function public.display_lock_note(p_action text, p_key text, p_mode text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'not signed in to a property' using errcode = '42501'; end if;
  if p_action not in ('lock', 'release') then raise exception 'lock or release'; end if;
  if auth_role() not in ('owner', 'manager') then
    raise exception 'Only the owner or a manager can lock or release a display.' using errcode = '42501';
  end if;
  perform audit_log(rid, 'display.' || p_action, 'page', null,
    left(format('%s · %s%s', case when p_action = 'lock' then 'Display locked' else 'Display released' end, coalesce(p_key, '—'),
      case when p_mode is not null then ' · ' || p_mode else '' end), 120),
    nullif(left(coalesce(p_by, ''), 80), ''), null, jsonb_build_object('key', p_key, 'mode', p_mode), null);
end $$;
revoke execute on function public.display_lock_note(text, text, text, text) from public, anon;
grant execute on function public.display_lock_note(text, text, text, text) to authenticated, service_role;

create or replace function public.apply_ledger() returns trigger language plpgsql as $$
begin
  update ingredients set current_stock = current_stock + new.qty
   where id = new.ingredient_id and restaurant_id = new.restaurant_id;
  return new;
end $$;
