-- ═══════════ Repair admin_backfill_dineflow_codes ═══════════
--
--     ERROR: column reference "code" is ambiguous
--
-- The function is declared `returns table (property text, code text, ...)`. Those output names are
-- plpgsql variables for the whole body, so `where code is null` could mean the output variable or
-- restaurants.code, and PL/pgSQL refuses to guess. Aliasing the table and qualifying every column
-- settles it. Nothing else about the function changes.

create or replace function admin_backfill_dineflow_codes()
returns table (property text, code text, old_login text, new_login text)
language plpgsql security definer set search_path = public, auth as $$
declare r record; c text; new_email text; old_email text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'only master control can do this';
  end if;
  for r in select rr.id, rr.name, rr.property_type
             from restaurants rr
            where rr.code is null and not rr.is_shadow
            order by rr.created_at
  loop
    c := next_dineflow_code(r.name, r.property_type);
    update restaurants set code = c where id = r.id;

    select p.email into old_email from profiles p
     where p.restaurant_id = r.id and p.role = 'owner' order by p.created_at limit 1;

    -- only move a generated .local id across; a real address the operator chose is left alone
    if old_email is not null and old_email like '%@dineflow.local' then
      new_email := c || '@dineflow.local';
      update auth.users u set email = new_email, updated_at = now() where u.email = old_email;
      update auth.identities i
         set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
       where i.identity_data->>'email' = old_email;
      update profiles p set email = new_email where p.email = old_email;
    else
      new_email := old_email;
    end if;

    property := r.name; code := c; old_login := old_email; new_login := new_email;
    return next;
  end loop;
end $$;
revoke all on function admin_backfill_dineflow_codes() from public, anon, authenticated, service_role;
