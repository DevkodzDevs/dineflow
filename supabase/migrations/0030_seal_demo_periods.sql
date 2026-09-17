-- ═══════════ Proof of business: seal the closed months of the two test properties ═══════════
--
-- 0028 filled the two demo properties but could not seal their trading months. Sealing runs through
-- seal_all_periods → period_figures → auth_restaurant_id(), and neither property has a user of its
-- own, so there was no identity for those helpers to resolve. The migration said so in a notice and
-- moved on.
--
-- Master control reaches a property it has no profile for through admin_context, so that is the
-- identity borrowed here: stand a platform admin in each property in turn, seal, then put the
-- context back exactly where it was. The whole file is one transaction, so a failure anywhere
-- leaves Master control standing where it started.
--
-- Nothing outside the two named properties is touched. Sealing is additive: a month already sealed
-- is returned untouched by seal_period, never rewritten.

set statement_timeout = '15min';

do $$
declare
  admin_uid uuid; saved_rid uuid; had_context boolean; rid uuid; nm text; n int;
begin
  select user_id into admin_uid from platform_admins order by user_id limit 1;
  if admin_uid is null then
    raise notice 'No platform admin — Proof of business left unsealed.';
    return;
  end if;

  -- remember where Master control is standing before borrowing the seat
  select restaurant_id into saved_rid from admin_context where user_id = admin_uid;
  had_context := found;

  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid::text)::text, true);

  for rid, nm in
    select id, name from restaurants
     where not is_shadow
       and (lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) ~ '^tanresort(resort)?$'
         or lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) ~ '^mano{3,}(hotel|hotels)?$')
  loop
    insert into admin_context(user_id, restaurant_id) values (admin_uid, rid)
      on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
    n := seal_all_periods(12);
    raise notice 'Sealed % month(s) for %', n, nm;
  end loop;

  -- put Master control back exactly as it was found
  if had_context then
    insert into admin_context(user_id, restaurant_id) values (admin_uid, saved_rid)
      on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, updated_at = now();
  else
    delete from admin_context where user_id = admin_uid;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
