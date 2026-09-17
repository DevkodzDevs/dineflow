-- ═══════════ Demo sandboxes are invisible to Master control ═══════════
--
-- Demo properties were showing up in the estate list, the compliance overview, and the property
-- count. They are throwaway sandboxes that self-destruct in 8 hours and should never appear
-- alongside real properties. This also prevents someone from joining a demo with a DineFlow code.

-- ── the estate list ──────────────────────────────────────────────────────────────────────────
create or replace function admin_overview() returns table (
  id uuid, name text, property_type property_type, membership membership_status, trial_ends_at timestamptz, membership_ends_at timestamptz,
  plan text, users integer, sales_today numeric, sales_30d numeric, open_orders integer, rooms integer, occupied_rooms integer, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.property_type, r.membership, r.trial_ends_at, r.membership_ends_at, r.membership_plan,
    (select count(*) from profiles p where p.restaurant_id = r.id)::int,
    coalesce((select sum(total) from bills b where b.restaurant_id = r.id and b.status='paid' and b.paid_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),0),
    coalesce((select sum(total) from bills b where b.restaurant_id = r.id and b.status='paid' and b.paid_at > now() - interval '30 days'),0),
    (select count(*) from orders o where o.restaurant_id = r.id and o.status='open')::int,
    (select count(*) from rooms x where x.restaurant_id = r.id)::int,
    (select count(*) from rooms x where x.restaurant_id = r.id and x.status='occupied')::int,
    r.created_at
  from restaurants r
  where is_platform_admin()
    and r.demo_expires_at is null         -- hide demos
  order by r.created_at desc
$$;

-- ── the compliance overview ──────────────────────────────────────────────────────────────────
create or replace function admin_compliance_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  return jsonb_build_object(
    'filings', coalesce((select jsonb_agg(jsonb_build_object(
                  'restaurant_id', f.restaurant_id, 'form', f.form, 'period', f.period, 'filed_on', f.filed_on))
                from compliance_filings f
                join restaurants r on r.id = f.restaurant_id and r.demo_expires_at is null), '[]'::jsonb),
    'docs',    coalesce((select jsonb_agg(jsonb_build_object(
                  'restaurant_id', d.restaurant_id, 'kind', d.kind, 'expires_on', d.expires_on))
                from compliance_docs d
                join restaurants r on r.id = d.restaurant_id and r.demo_expires_at is null), '[]'::jsonb));
end $$;

-- ── joining: a demo code must not let someone join a real account ─────────────────────────────
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

  -- only real properties, not demos
  select * into r from restaurants rr
   where lower(rr.code) = lower(v_code) and not rr.is_shadow and rr.demo_expires_at is null;
  if not found then
    raise exception 'That code does not match any property. Check it with your manager.';
  end if;

  insert into profiles(id, restaurant_id, full_name, email, role, is_active)
    values (auth.uid(), r.id, p_full_name,
            (select email from auth.users where id = auth.uid()), 'waiter', false);
  return jsonb_build_object('ok', true, 'pending', true, 'role', 'waiter', 'property', r.name);
end $$;

-- ── also sweep expired demos whenever Master opens the estate list ────────────────────────────
-- admin_overview is stable so it cannot call the volatile sweep. A separate call is better anyway
-- because the sweep deletes rows.
