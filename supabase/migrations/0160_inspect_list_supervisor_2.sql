-- 0160 — A 2nd-level supervisor keeps the rooms to inspect (2026-11-01, after 0159).
--
-- 0159 took supervisor_2 out of _clean_may_assign, which is what clean_board asked before it listed the rooms waiting to be
-- signed off ('inspect'). inspect_room (0112) still lets supervisor_2 pass or fail a room, and the owner kept inspection
-- with them — so the list now follows who may sign off, not who gives jobs out, and the board says so in 'can_inspect'.
-- The function is 0158's clean_board with only that changed.

create or replace function public.clean_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
        boss boolean := _clean_may_assign(); req boolean;
        insp boolean := coalesce(auth_role()::text in ('owner', 'manager', 'supervisor', 'supervisor_2'), false);
begin
  if rid is null or _clean_me() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select coalesce(hk_inspect_required, false) into req from restaurants where id = rid;
  return jsonb_build_object(
    'can_assign', boss,
    'tables_on', coalesce((select table_cleaning from restaurants where id = rid), true),
    'inspect_required', req,
    'can_inspect', insp,
    'jobs', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select c.created_at as ts, jsonb_build_object('kind', 'table', 'id', c.id, 'place', coalesce(nullif(c.place, ''), t.name, 'Table'), 'zone', t.zone,
          'what', 'After guests', 'status', c.status, 'note', c.note, 'created_at', c.created_at,
          'assigned_to', c.assigned_to, 'assigned_name', case when c.assigned_to is not null then _clean_name(c.assigned_to) end,
          'assigned_by_name', case when c.assigned_by is not null then _clean_name(c.assigned_by) end, 'assigned_at', c.assigned_at,
          'taken_by', c.taken_by, 'taken_name', case when c.taken_by is not null then _clean_name(c.taken_by) end, 'taken_at', c.taken_at,
          'done_by', c.done_by, 'done_name', case when c.done_by is not null then _clean_name(c.done_by) end, 'done_at', c.done_at) as j
        from table_cleanings c left join dining_tables t on t.id = c.table_id
        where c.restaurant_id = rid and (c.status in ('pending', 'in_progress') or c.done_at >= since)
          and _work_board_sees('table', null, c.assigned_to, null, c.taken_by, c.done_by, c.status)
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
          and _work_board_sees('room', null, h.assigned_to, null, h.taken_by, h.done_by, h.status::text)
      ) x), '[]'::jsonb),
    'inspect', case when insp and req and _work_dept_ok('room', null, null, null, null, null) then coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'place', r.number::text, 'zone', 'Floor ' || r.floor,
        'since', r.condition_at, 'cleaned_name', case when d.done_by is not null then _clean_name(d.done_by) end, 'cleaned_at', d.done_at,
        'arrival', exists (select 1 from bookings b where b.room_id = r.id and b.status = 'reserved' and b.check_in = today))
        order by r.condition_at)
      from rooms r left join lateral (select h.done_by, h.done_at from housekeeping_tasks h where h.room_id = r.id and h.status = 'done' and h.kind <> 'maintenance'
                                       order by h.done_at desc nulls last limit 1) d on true
      where r.restaurant_id = rid and r.condition = 'clean' and r.status <> 'maintenance'), '[]'::jsonb) else '[]'::jsonb end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'title', p.position_title, 'dept', p.department,
        'position', p.position,
        'on_duty', exists (select 1 from staff_attendance a where a.profile_id = p.id and a.work_date = today and a.in_at is not null and a.out_at is null))
        order by p.full_name) from profiles p where p.restaurant_id = rid and p.is_active), '[]'::jsonb)
  );
end $$;

notify pgrst, 'reload schema';
