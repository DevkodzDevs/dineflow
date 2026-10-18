-- 0112 · The cleaning loop, from the housekeeper's side (2026-10-18)
--
--  1. An inspection is written on the clean it inspects: housekeeping_tasks.inspected_by / inspected_at / inspection
--     ('passed' | 'failed'). inspect_room does everything it did before, and also stamps the room's last finished clean;
--     a failed room's fresh task goes straight back to whoever cleaned it, given by the inspector (and their phone says so).
--  2. clean_board also returns: the rooms waiting for a supervisor's inspection (to whoever may inspect, when the
--     property inspects), each room job's arrival today and VIP, and each finished room's inspection.
-- Additive: one column set, two functions replaced with the same signatures and grants.

alter table public.housekeeping_tasks
  add column if not exists inspected_by uuid,
  add column if not exists inspected_at timestamptz,
  add column if not exists inspection text check (inspection in ('passed', 'failed'));

create or replace function public.inspect_room(p_room_id uuid, p_pass boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r rooms%rowtype; me uuid := _clean_me(); last_id uuid; cleaner uuid;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() not in ('owner', 'manager', 'supervisor', 'supervisor_2') then
    raise exception 'only an owner, manager or supervisor can sign off an inspection';
  end if;
  select * into r from rooms where id = p_room_id and restaurant_id = rid;
  if not found then raise exception 'room not found'; end if;
  -- the clean this inspection is about: the room's latest finished one not yet inspected
  select h.id, h.done_by into last_id, cleaner from housekeeping_tasks h
   where h.room_id = r.id and h.status = 'done' and h.kind <> 'maintenance' and h.inspected_at is null
   order by h.done_at desc nulls last limit 1;
  if last_id is not null then
    update housekeeping_tasks set inspected_by = me, inspected_at = now(), inspection = case when p_pass then 'passed' else 'failed' end
     where id = last_id;
  end if;
  if cleaner is not null and not exists (select 1 from profiles where id = cleaner and is_active) then cleaner := null; end if;
  if p_pass then
    update rooms set condition = 'inspected', condition_at = now(), inspected_by = auth.uid(),
      status = case when status = 'cleaning' then 'available' else status end
    where id = r.id;
  else
    update rooms set condition = 'dirty', condition_at = now(), inspected_by = null,
      status = case when status = 'available' then 'cleaning' else status end
    where id = r.id;
    -- back to whoever cleaned it (the trigger stamps when, and by whom)
    insert into housekeeping_tasks(restaurant_id, room_id, kind, notes, assigned_to, assigned_by)
      values (rid, r.id, 'clean', concat('Failed inspection', case when length(trim(p_note)) > 0 then ': ' || trim(p_note) end),
              cleaner, case when cleaner is not null then me end);
  end if;
end $$;
revoke all on function public.inspect_room(uuid, boolean, text) from public, anon;
grant execute on function public.inspect_room(uuid, boolean, text) to authenticated;

create or replace function public.clean_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
        boss boolean := _clean_may_assign(); req boolean;
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select coalesce(hk_inspect_required, false) into req from restaurants where id = rid;
  return jsonb_build_object(
    'can_assign', boss,
    'tables_on', coalesce((select table_cleaning from restaurants where id = rid), true),
    'inspect_required', req,
    'jobs', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select c.created_at as ts, jsonb_build_object('kind', 'table', 'id', c.id, 'place', coalesce(nullif(c.place, ''), t.name, 'Table'), 'zone', t.zone,
          'what', 'After guests', 'status', c.status, 'note', c.note, 'created_at', c.created_at,
          'assigned_to', c.assigned_to, 'assigned_name', case when c.assigned_to is not null then _clean_name(c.assigned_to) end,
          'assigned_by_name', case when c.assigned_by is not null then _clean_name(c.assigned_by) end, 'assigned_at', c.assigned_at,
          'taken_by', c.taken_by, 'taken_name', case when c.taken_by is not null then _clean_name(c.taken_by) end, 'taken_at', c.taken_at,
          'done_by', c.done_by, 'done_name', case when c.done_by is not null then _clean_name(c.done_by) end, 'done_at', c.done_at) as j
        from table_cleanings c left join dining_tables t on t.id = c.table_id
        where c.restaurant_id = rid and (c.status in ('pending', 'in_progress') or c.done_at >= since)
        union all
        select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'place', coalesce(h.place, r.number::text), 'zone', 'Floor ' || r.floor,
          'what', h.kind, 'status', h.status::text, 'note', h.notes, 'created_at', h.created_at,
          'assigned_to', h.assigned_to, 'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end,
          'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
          'taken_by', h.taken_by, 'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_at', h.taken_at,
          'done_by', h.done_by, 'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_at', h.done_at,
          'arrival', exists (select 1 from bookings b where b.room_id = h.room_id and b.status = 'reserved' and b.check_in = today),
          'vip', exists (select 1 from bookings b join guests g on g.id = b.guest_id where b.room_id = h.room_id and b.status in ('reserved', 'checked_in')
                           and b.check_in <= today and b.check_out >= today and g.vip),
          'inspection', h.inspection, 'inspected_name', case when h.inspected_by is not null then _clean_name(h.inspected_by) end, 'inspected_at', h.inspected_at)
        from housekeeping_tasks h join rooms r on r.id = h.room_id
        where h.restaurant_id = rid and h.kind <> 'maintenance' and (h.status <> 'done' or h.done_at >= since)
      ) x), '[]'::jsonb),
    -- cleaned, not yet signed off: only for whoever may sign off, and only where the property inspects
    'inspect', case when boss and req then coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'place', r.number::text, 'zone', 'Floor ' || r.floor,
        'since', r.condition_at, 'cleaned_name', case when d.done_by is not null then _clean_name(d.done_by) end, 'cleaned_at', d.done_at,
        'arrival', exists (select 1 from bookings b where b.room_id = r.id and b.status = 'reserved' and b.check_in = today))
        order by r.condition_at)
      from rooms r left join lateral (select h.done_by, h.done_at from housekeeping_tasks h where h.room_id = r.id and h.status = 'done' and h.kind <> 'maintenance'
                                       order by h.done_at desc nulls last limit 1) d on true
      where r.restaurant_id = rid and r.condition = 'clean' and r.status <> 'maintenance'), '[]'::jsonb) else '[]'::jsonb end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'title', p.position_title, 'dept', p.department,
        'on_duty', exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
        order by p.full_name) from profiles p where p.restaurant_id = rid and p.is_active), '[]'::jsonb)
  );
end $$;
revoke all on function public.clean_board() from public, anon;
grant execute on function public.clean_board() to authenticated, service_role;
