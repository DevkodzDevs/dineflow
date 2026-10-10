-- 0084 · Role walls inside a property, and internal functions out of public reach.
--
-- Tenant isolation was sound: `tenant_all` keeps every property in its own rows. But inside a
-- property that same policy let ANY active staff login write ANY row straight through the API,
-- skipping the role checks the RPCs and screens make. Proved on 2026-10-10 in a rolled-back
-- transaction, as a housekeeping login:
--   · update profiles set role = 'owner' on itself              → succeeded (self-promotion)
--   · update restaurants set upi_vpa = '…'                      → succeeded (guests pay a stranger)
--   · delete from payments / invoices                           → 1,388 / 40 rows
--   · delete from restaurants                                   → stopped only by an unrelated FK
-- and as an owner: update restaurants set membership = 'active' → succeeded (a free subscription).
-- Separately, internal SECURITY DEFINER functions were executable by anyone holding the public
-- anon key, with no check of the caller: box_apply (writes the first property — membership
-- included), box_export (reads it), demo_user (creates a confirmed login for any e-mail and
-- password, and answers whether an address exists), seed_storefront (lists any property and
-- rewrites its storefront), and others. And v_low_stock was a definer-rights view.
--
-- The app's own direct writes are kept exactly as they are (Settings, Tax, Neighbours, the logo,
-- voiding an unpaid bill, a guest's details on an invoice). Every RPC runs as its owner, so none of
-- the guards below apply to them — they apply to direct API writes only (current_user is
-- 'authenticated' or 'anon'), which is exactly the path that skipped the role checks.

-- ── 1 · the property row: who may change which column ──────────────────────────────────────────
create or replace function public.guard_restaurant_update() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  changed text[];
  r user_role := auth_role();
  -- set only by RPCs (Master control, the Box, sign-up): never through the API
  locked text[] := array['id','created_at','plan','trial_ends_at','membership','membership_plan',
    'membership_ends_at','enabled_modules','code','demo_expires_at','login_domain','box_token',
    'box_last_seen','runs_on_box','is_shadow','rating','rating_count','network_alias'];
  -- the Neighbours screen: anyone who can open it
  place text[] := array['district','pincode','lat','lng'];
  -- the Tax screen: owner, manager, supervisor
  tax text[] := array['gstin','legal_name','pan','gst_scheme','gst_state_code','gst_monthly',
    'fssai_no','ca_name','ca_firm','ca_membership_no','ca_email','ca_phone'];
  k text;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;   -- RPCs, service role
  select array_agg(key) into changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key);
  if changed is null then return new; end if;
  foreach k in array changed loop
    if k = any(locked) then
      raise exception '% can only be changed by DineFlow', k using errcode = '42501';
    elsif k = any(place) then
      null;
    elsif k = any(tax) then
      if r not in ('owner', 'manager', 'supervisor') then
        raise exception 'your role cannot change tax details' using errcode = '42501';
      end if;
    elsif r is distinct from 'owner' then
      raise exception 'only the owner can change the property''s settings' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists guard_restaurant_update on public.restaurants;
create trigger guard_restaurant_update before update on public.restaurants
  for each row execute function public.guard_restaurant_update();

-- a property is created and removed by RPCs only (sign-up, Master control)
drop policy if exists no_direct_insert on public.restaurants;
create policy no_direct_insert on public.restaurants as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_delete on public.restaurants;
create policy no_direct_delete on public.restaurants as restrictive for delete to authenticated, anon using (false);

-- ── 2 · people: roles, access and membership change only through the Staff RPCs ──────────────────
-- (staff_create_login, owner_set_access, create_invite, join_restaurant… check rank themselves;
-- the app never writes these tables directly)
drop policy if exists no_direct_insert on public.profiles;
create policy no_direct_insert on public.profiles as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_update on public.profiles;
create policy no_direct_update on public.profiles as restrictive for update to authenticated, anon using (false);
drop policy if exists no_direct_delete on public.profiles;
create policy no_direct_delete on public.profiles as restrictive for delete to authenticated, anon using (false);

drop policy if exists no_direct_insert on public.invites;
create policy no_direct_insert on public.invites as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_update on public.invites;
create policy no_direct_update on public.invites as restrictive for update to authenticated, anon using (false);
drop policy if exists no_direct_delete on public.invites;
create policy no_direct_delete on public.invites as restrictive for delete to authenticated, anon using (false);

-- ── 3 · money records: written by RPCs; the two direct edits the app makes are allowed, no more ──
drop policy if exists no_direct_insert on public.payments;
create policy no_direct_insert on public.payments as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_update on public.payments;
create policy no_direct_update on public.payments as restrictive for update to authenticated, anon using (false);
drop policy if exists no_direct_delete on public.payments;
create policy no_direct_delete on public.payments as restrictive for delete to authenticated, anon using (false);

drop policy if exists no_direct_insert on public.bills;
create policy no_direct_insert on public.bills as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_delete on public.bills;
create policy no_direct_delete on public.bills as restrictive for delete to authenticated, anon using (false);

drop policy if exists no_direct_insert on public.invoices;
create policy no_direct_insert on public.invoices as restrictive for insert to authenticated, anon with check (false);
drop policy if exists no_direct_delete on public.invoices;
create policy no_direct_delete on public.invoices as restrictive for delete to authenticated, anon using (false);

-- records of a closed day, shift, audit or sealed month are not deleted from a screen
do $$ declare t text; begin
  foreach t in array array['day_closes','shift_closes','business_periods','night_audits'] loop
    execute format('drop policy if exists no_direct_delete on public.%I', t);
    execute format('create policy no_direct_delete on public.%I as restrictive for delete to authenticated, anon using (false)', t);
  end loop;
end $$;

-- a bill, directly: only "void an unpaid bill" (Billing → Void); totals and payments are RPC-only
create or replace function public.guard_bill_update() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')
     or not (old.status = 'unpaid' and new.status = 'void') then
    raise exception 'a bill can only be changed from the till' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_bill_update on public.bills;
create trigger guard_bill_update before update on public.bills
  for each row execute function public.guard_bill_update();

-- an invoice, directly: only the guest's name, phone and GSTIN (Invoices → edit the bill-to)
create or replace function public.guard_invoice_update() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - 'guest_name' - 'guest_phone' - 'guest_gstin' - 'updated_at')
     is distinct from (to_jsonb(old) - 'guest_name' - 'guest_phone' - 'guest_gstin' - 'updated_at') then
    raise exception 'only the guest''s details on an invoice can be edited' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_invoice_update on public.invoices;
create trigger guard_invoice_update before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- ── 4 · internal functions: callable by other functions, not by the public API ──────────────────
-- Every caller of these is itself SECURITY DEFINER (checked against pg_proc), so it runs them as
-- their owner and needs no grant to anon or authenticated.
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'box_export','box_apply','demo_user','seed_storefront','assign_login_domain','next_staff_code',
       'table_pulse_for','membership_state_for','suggest_staff_login','forecast_area_factor',
       'price_line','sweep_expired_temp_passwords','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  -- called by signed-in screens, never by a stranger
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('staff_login_domain','network_demand','next_labour_code')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ── 5 · the low-stock view reads with the caller's rights, so RLS applies to it ─────────────────
alter view public.v_low_stock set (security_invoker = true);
revoke all on public.v_low_stock from anon;

-- ── 6 · nobody truncates a table through the API ──────────────────────────────────────────────────
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 7 · a bug found on the way: Staff → invite by code failed with "gen_random_bytes does not exist"
-- create_invite pinned its search_path to public alone, and pgcrypto lives in `extensions`. Pinned
-- still — just to the two schemas it actually needs.
alter function public.create_invite(user_role) set search_path = public, extensions;
