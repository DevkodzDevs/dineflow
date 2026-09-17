-- ═══════════ Two small corrections to sign-in ids ═══════════
--
-- 1. Repeated dots survived the sanitiser: "tan..resort" became tan..resort@dineflow.local. A local
--    part cannot contain two dots in a row, nor start or end with one, so that address is not
--    strictly valid and would only be found wanting when the owner first tried to sign in. Dots are
--    now collapsed the way hyphens already were.
--
-- 2. A property whose generated sign-in id no longer matches its DineFlow code can be realigned.
--    This is deliberately a per-property call rather than an estate-wide sweep: an id the operator
--    chose on purpose should not be rewritten behind their back.

create or replace function sanitise_local_part(p_raw text) returns text
language sql immutable set search_path = public as $$
  select trim(both '-._' from
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(trim(coalesce(p_raw, ''))), '[^a-z0-9._-]+', '-', 'g'),
               '-{2,}', '-', 'g'),
             '\.{2,}', '.', 'g'))
$$;

/**
 * Point a property's owner login at its DineFlow code: dine-htl-mass-00007@dineflow.local.
 * The password is untouched, so anything already handed over still works with the new id. Refuses
 * to touch a login on a real domain, because that is an address someone actually reads.
 */
create or replace function admin_realign_login_to_code(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r restaurants%rowtype; old_email text; new_email text;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;
  if r.code is null then raise exception 'that property has no DineFlow code yet'; end if;

  select p.email into old_email from profiles p
   where p.restaurant_id = r.id and p.role = 'owner' order by p.created_at limit 1;
  if old_email is null then raise exception 'that property has no owner login yet'; end if;

  if old_email not like '%@dineflow.local' then
    raise exception 'That login (%) is on a real domain. Change it deliberately, not with this.', old_email;
  end if;

  new_email := r.code || '@dineflow.local';
  if new_email = old_email then
    return jsonb_build_object('ok', true, 'unchanged', true, 'login_email', old_email);
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = new_email) then
    raise exception 'The id % is already taken.', new_email;
  end if;

  update auth.users u set email = new_email, updated_at = now() where u.email = old_email;
  update auth.identities i
     set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
   where i.identity_data->>'email' = old_email;
  update profiles p set email = new_email where p.email = old_email;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'realign_login', r.id,
            jsonb_build_object('from', old_email, 'to', new_email, 'code', r.code));

  return jsonb_build_object('ok', true, 'from', old_email, 'login_email', new_email, 'code', r.code);
end $$;
revoke all on function admin_realign_login_to_code(uuid) from public, anon;
grant execute on function admin_realign_login_to_code(uuid) to authenticated;
