-- 0161 — Master control → Flow tests (2026-11-02, the owner: "the testing flow as an automatic tool, start to end").
--
-- A flow test runs on throwaway demo properties (create_demo_sandbox) as their own owner and staff, through the same
-- functions the screens call. Four things a demo's owner cannot do are the master's, and only on a demo property
-- (demo_expires_at set) — never on a real one:
--   prepare     every section on (a demo ships with nine), table cleaning on, the 5-minute hand-out on, a name that says
--               what it is; returns the slugs the guest pages need
--   staff       the run's staff sign in without the forced password change (they are made and dropped by the test)
--   free_table  a table in use is free again, as if paid and left: the cleaning job opens (the trigger), returned
--   age_job     a waiting table job is made 6 minutes old and given to nobody, for the automatic hand-out
--   finish      the property is expired and swept at once (its logins go with it, _sweep_expired_demos)
-- A run that is abandoned midway is swept anyway when its demo expires (8 hours).

create or replace function public.flowtest_admin(p_op text, p_rid uuid, p_ref uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare r restaurants; j uuid;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select * into r from restaurants where id = p_rid;
  if not found then raise exception 'no such property'; end if;
  if r.demo_expires_at is null then raise exception 'flow tests run only on a demo property' using errcode = '42501'; end if;
  if p_op = 'prepare' then
    update restaurants set enabled_modules = null, table_cleaning = true, clean_auto_minutes = 5,
           name = 'Flow test · ' || initcap(property_type::text) where id = p_rid;
    return jsonb_build_object('slug', r.slug, 'booking_slug', r.booking_slug, 'type', r.property_type);
  elsif p_op = 'staff' then
    update profiles set must_change_password = false where restaurant_id = p_rid and role <> 'owner' and (p_ref is null or id <> p_ref);
    return jsonb_build_object('ok', true);
  elsif p_op = 'free_table' then
    update dining_tables set status = 'occupied' where id = p_ref and restaurant_id = p_rid;
    update dining_tables set status = 'free' where id = p_ref and restaurant_id = p_rid;
    select id into j from table_cleanings where table_id = p_ref and status = 'pending' order by created_at desc limit 1;
    return jsonb_build_object('job', j);
  elsif p_op = 'age_job' then
    update table_cleanings set created_at = now() - interval '6 minutes', assigned_to = null, assigned_by = null, assigned_at = null
     where id = p_ref and restaurant_id = p_rid and status = 'pending';
    return jsonb_build_object('ok', found);
  elsif p_op = 'finish' then
    update restaurants set demo_expires_at = now() - interval '1 minute' where id = p_rid;
    return jsonb_build_object('swept', _sweep_expired_demos());
  end if;
  raise exception 'unknown flow-test step %', p_op;
end $$;

revoke all on function public.flowtest_admin(text, uuid, uuid) from public, anon;
grant execute on function public.flowtest_admin(text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
