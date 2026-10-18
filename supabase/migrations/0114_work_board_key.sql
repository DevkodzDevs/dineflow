-- 0114 · work_board: the jobs under their own key (2026-10-18)
-- 0113's work_board put the new jobs under 'jobs', the key clean_board() already uses for the tables and rooms, so the
-- Work board lost the cleaning cards. Same function, same grants; the new jobs are 'work', the cleaning jobs stay 'jobs'.
create or replace function public.work_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); today date := (now() at time zone 'Asia/Kolkata')::date;
        since timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  return clean_board() || jsonb_build_object(                       -- clean_board checks the caller
    'me_dept', (select department from profiles where id = auth.uid()),
    'work', coalesce((select jsonb_agg(x.j order by x.ts) from (
        select j.created_at as ts, jsonb_build_object('kind', 'job', 'id', j.id, 'place', j.place, 'zone', null, 'what', j.category, 'title', j.title, 'details', j.details,
          'category', j.category, 'department', j.department, 'priority', j.priority, 'guest', j.guest_impact, 'due_at', j.due_at, 'repeat_days', j.repeat_days, 'source', j.source,
          'status', j.status, 'note', j.note, 'created_at', j.created_at,
          'created_by', j.created_by, 'created_name', case when j.created_by is not null then _clean_name(j.created_by) end,
          'assigned_to', j.assigned_to, 'assigned_name', case when j.assigned_to is not null then _clean_name(j.assigned_to) end,
          'labourer_id', j.labourer_id, 'labourer_name', l.full_name,
          'assigned_by_name', case when j.assigned_by is not null then _clean_name(j.assigned_by) end, 'assigned_at', j.assigned_at,
          'taken_by', j.taken_by, 'taken_name', case when j.taken_by is not null then _clean_name(j.taken_by) end, 'taken_at', j.taken_at,
          'done_by', j.done_by, 'done_name', case when j.done_by is not null then _clean_name(j.done_by) end, 'done_at', j.done_at) as j
        from jobs j left join labourers l on l.id = j.labourer_id
        where j.restaurant_id = rid and (j.status in ('pending', 'in_progress') or j.done_at >= since)
        union all
        -- a room out of order: its repair task is Engineering's job
        select h.created_at, jsonb_build_object('kind', 'room', 'id', h.id, 'place', 'Room ' || coalesce(h.place, r.number::text), 'zone', 'Floor ' || r.floor, 'what', 'maintenance',
          'title', 'Repair · Room ' || r.number, 'details', h.notes, 'category', 'repair', 'department', 'engineering', 'priority', 2, 'guest', r.status = 'occupied',
          'due_at', h.created_at + interval '2 hours', 'repeat_days', 0, 'source', 'room', 'status', h.status::text, 'note', null, 'created_at', h.created_at,
          'created_by', null, 'created_name', null,
          'assigned_to', h.assigned_to, 'assigned_name', case when h.assigned_to is not null then _clean_name(h.assigned_to) end, 'labourer_id', null, 'labourer_name', null,
          'assigned_by_name', case when h.assigned_by is not null then _clean_name(h.assigned_by) end, 'assigned_at', h.assigned_at,
          'taken_by', h.taken_by, 'taken_name', case when h.taken_by is not null then _clean_name(h.taken_by) end, 'taken_at', h.taken_at,
          'done_by', h.done_by, 'done_name', case when h.done_by is not null then _clean_name(h.done_by) end, 'done_at', h.done_at)
        from housekeeping_tasks h join rooms r on r.id = h.room_id
        where h.restaurant_id = rid and h.kind = 'maintenance' and (h.status <> 'done' or h.done_at >= since)
      ) x), '[]'::jsonb),
    'labourers', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.full_name, 'skill', l.skill,
        'on_duty', exists (select 1 from labour_attendance a where a.labourer_id = l.id and a.work_date = today and a.in_at is not null and a.out_at is null)) order by l.full_name)
        from labourers l where l.restaurant_id = rid and l.status = 'active'), '[]'::jsonb),
    'cooks', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'cooked', c.n, 'ready', c.r)) from (
        select k.started_by, count(*)::int n, (count(*) filter (where k.status in ('ready', 'served')))::int r
        from kots k where k.restaurant_id = rid and k.started_at >= since and k.started_by is not null group by k.started_by) c
        join profiles p on p.id = c.started_by), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number::text) order by sort_order) from rooms where restaurant_id = rid), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order) from dining_tables where restaurant_id = rid), '[]'::jsonb)
  );
end $$;
revoke all on function public.work_board() from public, anon;
grant execute on function public.work_board() to authenticated, service_role;
