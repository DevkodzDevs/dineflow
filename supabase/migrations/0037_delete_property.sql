-- ═══════════ Master control can delete a property ═══════════
--
-- Two functions: one that says what would be destroyed, and one that destroys it. They are separate
-- so the confirmation screen can show real counts rather than a vague warning, and so the count
-- query carries no risk of deleting anything.
--
-- The delete is irreversible and takes everything with it — trading history, invoices, tax filings,
-- sealed months, guests, staff logins. Two things guard it: the caller must be a platform admin, and
-- must pass the property's own name back. A mis-aimed id alone deletes nothing.
--
-- membership_keys.redeemed_by has no ON DELETE rule, so it would block the delete outright. The key
-- rows are kept — a key having been redeemed is a fact worth keeping — but their pointers to the
-- property are cleared first.

-- ── what would go ────────────────────────────────────────────────────────────────────────────
create or replace function admin_delete_preview(p_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;
  return jsonb_build_object(
    'name', r.name, 'type', r.property_type,
    'logins',      (select count(*) from profiles          where restaurant_id = r.id),
    'menu_items',  (select count(*) from menu_items        where restaurant_id = r.id),
    'orders',      (select count(*) from orders            where restaurant_id = r.id),
    'bills',       (select count(*) from bills             where restaurant_id = r.id),
    'invoices',    (select count(*) from invoices          where restaurant_id = r.id),
    'bookings',    (select count(*) from bookings          where restaurant_id = r.id),
    'guests',      (select count(*) from guests            where restaurant_id = r.id),
    'rooms',       (select count(*) from rooms             where restaurant_id = r.id),
    'staff',       (select count(*) from labourers         where restaurant_id = r.id),
    'tax_docs',    (select count(*) from compliance_docs   where restaurant_id = r.id),
    'tax_filings', (select count(*) from compliance_filings where restaurant_id = r.id),
    'sealed_months',(select count(*) from business_periods where restaurant_id = r.id));
end $$;

-- ── delete it ────────────────────────────────────────────────────────────────────────────────
create or replace function admin_delete_property(p_restaurant_id uuid, p_confirm_name text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r restaurants%rowtype; uids uuid[]; summary jsonb;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(r.name)) then
    raise exception 'Type the property name exactly to confirm. Expected "%".', r.name;
  end if;

  summary := admin_delete_preview(p_restaurant_id);

  -- the people who belong to this property, minus anyone who is also a platform admin: deleting a
  -- master's own account because they happened to hold a profile here would lock them out entirely
  select coalesce(array_agg(p.id), '{}') into uids
    from profiles p
   where p.restaurant_id = r.id
     and not exists (select 1 from platform_admins a where a.user_id = p.id);

  -- membership_keys.redeemed_by is NO ACTION and would refuse the delete
  update membership_keys set redeemed_by = null where redeemed_by = r.id;
  update membership_keys set restaurant_id = null where restaurant_id = r.id;

  -- written before the row disappears, and it names the property because the id is about to be dead
  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'delete_property', r.id, summary || jsonb_build_object('deleted_logins', array_length(uids, 1)));

  delete from restaurants where id = r.id;    -- everything else cascades from here
  if array_length(uids, 1) > 0 then
    delete from auth.users where id = any(uids);
  end if;

  -- if Master control was standing inside it, step back out to the estate list
  delete from admin_context where user_id = auth.uid() and restaurant_id is null;

  return jsonb_build_object('ok', true, 'name', r.name, 'deleted', summary);
end $$;

revoke all on function admin_delete_preview(uuid)        from public, anon;
revoke all on function admin_delete_property(uuid, text) from public, anon;
grant execute on function admin_delete_preview(uuid)        to authenticated;
grant execute on function admin_delete_property(uuid, text) to authenticated;
