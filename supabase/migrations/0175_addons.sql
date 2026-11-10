-- 0175 — Add-ons (2026-11-09, the owner: "everything you called unwanted — make each one an option, switched in Master
-- control, per property, set by the subscription; and tune those sections").
--
-- A module (0018, restaurants.enabled_modules) is a whole screen with a row in role_modules. An add-on is finer: a screen
-- that was never a module (Intelligence, Cash & controls, the Audit trail, Outlets, Payroll, Expenses, Checklists, Work
-- records, Staff feedback, the Cleaning board, the Tables screen, Display lock, Connections, Night audit), a piece inside a
-- screen (the on-time promise, "Goes well with", the receipt's extras, the till's spoken order, photo and ID-card
-- recognition) or a paid thing (the AI, a white-label receipt). The keys live in packages/shared/src/features.ts.
--
-- Who decides, in order:  restaurants.enabled_features (the property's own list, Master control → Access → Add-ons)
--                         else plans.features           (the plan's list, Master control → Keys → Plans & prices)
--                         else default_features()       (below — must agree with DEFAULT_FEATURES in features.ts;
--                                                        apps/web/lib/features.test.ts reads this file and checks)
-- NULL at either level means "follow the next"; a saved list is explicit.
--
-- Also here: run_night_audit no longer marks an imported OTA calendar block (bookings.is_block, 0004) as a no-show — it
-- did, and freed the room for sale while the OTA guest was still coming (the review of 2026-11-09, defect 1).

alter table plans add column if not exists features text[];
alter table restaurants add column if not exists enabled_features text[];

/** The add-ons on for a plan with no saved list, and a property that follows its plan. Keep in step with features.ts. */
create or replace function public.default_features() returns text[]
language sql immutable set search_path = public as $$
  select array['intelligence','controls','audit','chain','payroll','expenses','tasks','work-records','voice','cleaning','tables',
               'lock','connections','night-audit','promise','till-pairings','receipt-extras','ai','till-voice','scan-vision']::text[];
$$;
revoke all on function public.default_features() from public;
grant execute on function public.default_features() to authenticated, service_role;

/** What the signed-in property has on: its own list, else its plan's, else the defaults. */
create or replace function public.effective_features() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(r.enabled_features,
                  (select p.features from plans p where p.is_active and r.property_type::text = any(p.property_types) order by p.key limit 1),
                  default_features())
  from restaurants r where r.id = auth_restaurant_id();
$$;
revoke all on function public.effective_features() from public, anon;
grant execute on function public.effective_features() to authenticated, service_role;

create or replace function public.has_feature(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_key = any(effective_features()), false);
$$;
revoke all on function public.has_feature(text) from public, anon;
grant execute on function public.has_feature(text) to authenticated, service_role;

/** Master only: the property's own add-on list. NULL = follow its plan. Logged like set_modules. */
create or replace function public.master_set_features(p_restaurant_id uuid, p_features text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'master only' using errcode = '42501'; end if;
  if p_features is not null and (cardinality(p_features) > 64 or exists (select 1 from unnest(p_features) x where length(x) > 40)) then
    raise exception 'that list is too long';
  end if;
  update restaurants set enabled_features = p_features where id = p_restaurant_id;
  if not found then raise exception 'no such property'; end if;
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'set_features', p_restaurant_id, jsonb_build_object('features', p_features));
end $$;
revoke all on function public.master_set_features(uuid, text[]) from public, anon;
grant execute on function public.master_set_features(uuid, text[]) to authenticated;

/** Master only: the add-ons a plan includes. NULL = the defaults. */
create or replace function public.admin_set_plan_features(p_key text, p_features text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'only Master control sets plans' using errcode = '42501'; end if;
  if p_features is not null and (cardinality(p_features) > 64 or exists (select 1 from unnest(p_features) x where length(x) > 40)) then
    raise exception 'that list is too long';
  end if;
  update plans set features = p_features, updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then raise exception 'no such plan'; end if;
  insert into admin_log(actor, action, meta) values (auth.uid(), 'plan.features', jsonb_build_object('plan', p_key, 'features', p_features));
end $$;
revoke all on function public.admin_set_plan_features(text, text[]) from public, anon;
grant execute on function public.admin_set_plan_features(text, text[]) to authenticated;

-- ── the property row: enabled_features is the master's column, like enabled_modules (0084's body + one name) ─────────
create or replace function public.guard_restaurant_update() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  changed text[];
  r user_role := auth_role();
  -- set only by RPCs (Master control, the Box, sign-up): never through the API
  locked text[] := array['id','created_at','plan','trial_ends_at','membership','membership_plan',
    'membership_ends_at','enabled_modules','enabled_features','code','demo_expires_at','login_domain','box_token',
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

-- ── the property's audit trail sees a change of add-ons, as it sees a change of modules (0087's body + one name) ─────
create or replace function public.audit_restaurant() returns trigger language plpgsql security definer set search_path = public as $$
declare
  watched text[] := array['name','gstin','gst_rate','gst_scheme','gst_state_code','service_charge_pct','room_gst_rate','room_gst_rate_high','room_gst_threshold','facility_gst_rate',
    'upi_vpa','upi_payee','loyalty_enabled','loyalty_earn_pct','loyalty_point_value','loyalty_min_redeem','attendance_methods','attend_lat','attend_lng','attend_radius_m',
    'kds_stations','kds_warn_minutes','kds_target_minutes','promise_enabled','promise_minutes','promise_pct','prep_buffer_pct','check_in_time','check_out_time',
    'enabled_modules','enabled_features','membership','membership_plan','membership_ends_at','booking_slug','is_listed','hk_inspect_required'];
  o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); b jsonb := '{}'; a jsonb := '{}'; k text;
begin
  foreach k in array watched loop
    if (o ? k or n ? k) and (o -> k) is distinct from (n -> k) then
      b := b || jsonb_build_object(k, o -> k); a := a || jsonb_build_object(k, n -> k);
    end if;
  end loop;
  if a <> '{}'::jsonb then perform audit_log(new.id, 'settings.change', 'restaurant', new.id, new.name, null, b, a, null); end if;
  return new;
end $$;

-- ── the session carries the plan's list, so the shell resolves the add-ons without a second trip (0115's body + one key) ─
CREATE OR REPLACE FUNCTION public.session_bundle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  prof as (
    select p.id, p.full_name, p.role, p.restaurant_id, p.allowed_modules,
           p.must_change_password, p.is_active, p.temp_access_until, p.department, p.position
    from profiles p, me where p.id = me.uid
  ),
  adm as (select 1 from platform_admins a, me where a.user_id = me.uid),
  acting as (select admin_acting_as() as rid),
  cur as (select case when (select is_active from prof) then _outlet_current() end as rid),
  target as (
    select coalesce((select rid from cur), (select restaurant_id from prof), (select rid from acting)) as id
  ),
  rest as (select r.* from restaurants r, target t where r.id = t.id),
  late as (
    select count(*)::int as c
    from kots k, target t
    where k.restaurant_id = t.id and k.status in ('pending', 'preparing')
      and k.created_at < now() - interval '15 minutes'
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'user_id',    (select uid from me),
    'user_name',  (select u.raw_user_meta_data->>'full_name' from auth.users u, me where u.id = me.uid),
    'is_admin',   exists (select 1 from adm),
    'acting_as',  (select rid from acting),
    'profile',    (select to_jsonb(p) || jsonb_build_object('restaurant_id', (select id from target), 'home_restaurant_id', p.restaurant_id) from prof p),
    'restaurant', (select to_jsonb(r) - 'box_token' - 'screen_key' from rest r),
    'membership', coalesce(membership_state_for((select id from target)), 'none'),
    'late_kots',  coalesce((select c from late), 0),
    'theme',      (select up.theme from user_prefs up, me where up.user_id = me.uid),
    'outlets',    case when exists (select 1 from outlet_access oa, me where oa.user_id = me.uid) then my_outlets() else '[]'::jsonb end,
    -- 0175: the plan's add-ons (null: the defaults); the property's own list rides in 'restaurant' as enabled_features
    'plan_features', (select to_jsonb(p.features) from plans p, rest r where p.is_active and r.property_type::text = any(p.property_types) order by p.key limit 1)
  ) end;
$function$;

-- ── the night audit leaves an OTA calendar block alone (the review of 2026-11-09, defect 1) ──────────────────────────
-- An iCal import is a booking with is_block = true and status 'reserved' (0004): a room busy on the OTA's side, not a
-- guest who failed to arrive. The sweep marked it no_show and reopened the room; the next sync only updates rows still
-- 'reserved', so the room stayed for sale under a guest who was coming. 0067's body with `and not is_block`.
create or replace function run_night_audit(p_date date, p_mark_no_shows boolean default true, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n jsonb; ns int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'frontdesk') then
    raise exception 'only an owner, manager, supervisor or front desk can close the day';
  end if;
  if p_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'that day has not happened yet'; end if;
  if p_mark_no_shows then
    -- a reservation that never arrived by the close of its day is a no-show; its room is released. An OTA calendar block
    -- (is_block) is not a reservation that can fail to arrive: it stays, and so does its room.
    with gone as (
      update bookings set status = 'no_show' where restaurant_id = rid and status = 'reserved' and check_in <= p_date and not is_block returning room_id
    )
    update rooms set status = 'available' where id in (select room_id from gone) and status = 'reserved';
  end if;
  select count(*) into ns from bookings where restaurant_id = rid and status = 'no_show' and check_in = p_date;
  n := night_audit_numbers(p_date);
  insert into night_audits(restaurant_id, business_date, rooms_total, rooms_sellable, occupied, arrivals, departures, no_shows, in_house,
                           room_revenue, occupancy_pct, adr, revpar, dirty_rooms, ooo_rooms, discrepancies, notes, closed_by)
  values (rid, p_date, (n->>'rooms_total')::int, (n->>'rooms_sellable')::int, (n->>'occupied')::int, (n->>'arrivals')::int, (n->>'departures')::int,
          ns, (n->>'in_house')::int, (n->>'room_revenue')::numeric, (n->>'occupancy_pct')::numeric, (n->>'adr')::numeric, (n->>'revpar')::numeric,
          (n->>'dirty_rooms')::int, (n->>'ooo_rooms')::int, jsonb_array_length(n->'discrepancies'),
          case when length(trim(p_notes)) > 0 then trim(p_notes) end, auth.uid())
  on conflict (restaurant_id, business_date) do update set
    rooms_total = excluded.rooms_total, rooms_sellable = excluded.rooms_sellable, occupied = excluded.occupied, arrivals = excluded.arrivals,
    departures = excluded.departures, no_shows = excluded.no_shows, in_house = excluded.in_house, room_revenue = excluded.room_revenue,
    occupancy_pct = excluded.occupancy_pct, adr = excluded.adr, revpar = excluded.revpar, dirty_rooms = excluded.dirty_rooms,
    ooo_rooms = excluded.ooo_rooms, discrepancies = excluded.discrepancies, notes = coalesce(excluded.notes, night_audits.notes),
    closed_by = excluded.closed_by, closed_at = now();
  return night_audit_numbers(p_date);
end $$;
revoke all on function run_night_audit(date, boolean, text) from public, anon;
grant execute on function run_night_audit(date, boolean, text) to authenticated;

notify pgrst, 'reload schema';
