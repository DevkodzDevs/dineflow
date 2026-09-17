-- ═══════════ Repair join_restaurant ═══════════
--
--     ERROR: column reference "code" is ambiguous
--
-- The local was named `code`, and both invites and restaurants have a column of that name, so a bare
-- `code` in the lookups could mean either. Renamed to v_code, which is the convention the rest of
-- these functions already use. Behaviour is unchanged.

create or replace function join_restaurant(p_code text, p_full_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; r restaurants%rowtype; v_code text; mine profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  v_code := trim(coalesce(p_code, ''));
  if v_code = '' then raise exception 'Enter the code your manager gave you.'; end if;

  select * into mine from profiles where id = auth.uid();
  if found then
    raise exception 'This account already belongs to %.',
      (select name from restaurants where id = mine.restaurant_id);
  end if;

  select * into inv from invites i
   where i.code = upper(v_code) and i.used_by is null and i.expires_at > now();
  if found then
    insert into profiles(id, restaurant_id, full_name, email, role, is_active)
      values (auth.uid(), inv.restaurant_id, p_full_name,
              (select email from auth.users where id = auth.uid()), inv.role, true);
    update invites set used_by = auth.uid() where id = inv.id;
    return jsonb_build_object('ok', true, 'pending', false, 'role', inv.role,
      'property', (select name from restaurants where id = inv.restaurant_id));
  end if;

  select * into r from restaurants rr
   where lower(rr.code) = lower(v_code) and not rr.is_shadow;
  if not found then
    raise exception 'That code does not match any property. Check it with your manager.';
  end if;

  insert into profiles(id, restaurant_id, full_name, email, role, is_active)
    values (auth.uid(), r.id, p_full_name,
            (select email from auth.users where id = auth.uid()), 'waiter', false);
  return jsonb_build_object('ok', true, 'pending', true, 'role', 'waiter', 'property', r.name);
end $$;
