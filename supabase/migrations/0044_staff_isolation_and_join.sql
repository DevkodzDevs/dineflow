-- ═══════════ Staff lists stop crossing properties, and joining uses the DineFlow code ═══════════
--
-- Two things, both about who belongs to which property.
--
-- 1. profiles carried `admin_read … using (is_platform_admin())`. That is the same bypass 0036 took
--    off every other table, missed because the audit that found those tested owners, and an owner is
--    not a platform admin. Its effect: Master control standing inside a property and opening Staff
--    saw every property's staff, and the Tax screen counted the whole estate when deciding whether
--    the payroll rows apply. Master control keeps seeing the property it opened, through tenant_all,
--    because auth_restaurant_id() already resolves admin_context. The estate-wide user count on the
--    Master screen comes from admin_overview(), which is SECURITY DEFINER and unaffected.
--
--    restaurants keeps its admin_read: listing the estate is what Master control is for, and no
--    per-property screen reads that table unfiltered — every one of them filters by id.
--
-- 2. Joining a team now takes the property's DineFlow code instead of an eight-character invite.
--    An invite code is a secret that expires; a DineFlow code is printed on the sign-in id and is
--    effectively public, so it cannot be allowed to grant access on its own. Someone joining with it
--    lands as a waiter who is switched OFF, and shows in Staff struck through until the owner turns
--    them on. Invite codes still work and still grant their role at once.

drop policy if exists admin_read on profiles;

-- A person may always read their own row, whatever else is true. Without this, someone waiting to be
-- approved cannot be told they are waiting: auth_restaurant_id() is null for them, so tenant_all
-- hides even their own record and the app can only conclude they belong nowhere.
drop policy if exists self_read on profiles;
create policy self_read on profiles for select using (id = auth.uid());

-- Switched off means switched off: no tenant rows resolve for a profile that is not active.
create or replace function auth_restaurant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select restaurant_id from profiles where id = auth.uid() and is_active),
    (select c.restaurant_id from admin_context c
       join platform_admins p on p.user_id = c.user_id
      where c.user_id = auth.uid())
  )
$$;

/**
 * Join a property with either code.
 *
 *   an invite code   → the role the owner chose, active at once
 *   a DineFlow code  → waiter, switched off, waiting for the owner to approve
 *
 * Returns which of the two happened so the screen can say what to expect next. It used to return
 * the restaurant id, and a return type cannot be replaced in place, hence the drop.
 */
drop function if exists join_restaurant(text, text);
create or replace function join_restaurant(p_code text, p_full_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; r restaurants%rowtype; code text; mine profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  code := trim(coalesce(p_code, ''));
  if code = '' then raise exception 'Enter the code your manager gave you.'; end if;

  select * into mine from profiles where id = auth.uid();
  if found then
    raise exception 'This account already belongs to %.',
      (select name from restaurants where id = mine.restaurant_id);
  end if;

  select * into inv from invites
   where invites.code = upper(code) and used_by is null and expires_at > now();
  if found then
    insert into profiles(id, restaurant_id, full_name, email, role, is_active)
      values (auth.uid(), inv.restaurant_id, p_full_name,
              (select email from auth.users where id = auth.uid()), inv.role, true);
    update invites set used_by = auth.uid() where id = inv.id;
    return jsonb_build_object('ok', true, 'pending', false, 'role', inv.role,
      'property', (select name from restaurants where id = inv.restaurant_id));
  end if;

  select * into r from restaurants where lower(restaurants.code) = lower(code) and not is_shadow;
  if not found then
    raise exception 'That code does not match any property. Check it with your manager.';
  end if;

  insert into profiles(id, restaurant_id, full_name, email, role, is_active)
    values (auth.uid(), r.id, p_full_name,
            (select email from auth.users where id = auth.uid()), 'waiter', false);
  return jsonb_build_object('ok', true, 'pending', true, 'role', 'waiter', 'property', r.name);
end $$;
