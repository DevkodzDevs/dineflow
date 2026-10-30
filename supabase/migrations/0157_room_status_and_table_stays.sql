-- 0157 — Room status is the bosses'; a table booking can name the staying guest's room (2026-10-30, the owner)
--
-- 1. "Change the name — not Housekeeping — and show that menu only to the owner, managers and supervisors." The screen is
--    renamed Room status in the app; its module key stays `housekeeping` (routes, ticks and saved lists keep working).
--    The ceiling of the three staff-level roles that held it — employee, frontdesk, housekeeping — loses it, and so do
--    their defaults. effective_modules() (0120) already keeps a module only while it is inside the role's ceiling, so a
--    person whose ticks still name it simply stops having it; no profile is rewritten. Owner, manager, supervisor and
--    supervisor 2 are untouched. No has_module('housekeeping') check exists anywhere, and the room tasks are written by
--    clean_take / clean_done / inspect_room (security definer) or under housekeeping_tasks' own policy — nobody loses a
--    write. The attendants work from the Cleaning board (open to every role) as before; the app's lists say the same
--    (packages/shared constants.ts ROLE_ACCESS / ROLE_DEFAULT, positionAccess.ts).
--
-- 2. "Compact — and show the Room option too" on New booking: a table booking for someone staying in the hotel names their
--    stay. reservations.booking_id → bookings(id), null when the diner is not staying; on delete set null (a stay deleted
--    leaves the table booking). Written by the Reservations screen's own insert under reservations' existing policy (no
--    new table, no new policy). 0098's zz_same_property trigger is rebuilt for reservations so the new column is checked
--    like its others: a stay of another property is refused.

-- 1 · Room status: the role ceilings and defaults
update public.role_modules
   set ceiling = array_remove(ceiling, 'housekeeping'), default_set = array_remove(default_set, 'housekeeping')
 where role in ('employee', 'frontdesk', 'housekeeping');

-- 2 · a table booking names the staying guest's stay
alter table public.reservations add column if not exists booking_id uuid references public.bookings(id) on delete set null;
create index if not exists reservations_booking_idx on public.reservations(booking_id) where booking_id is not null;

-- the same-property check over every single-column uuid foreign key of reservations (0098 § 8), now with booking_id
do $$
declare t record;
begin
  for t in
    select c.conrelid::regclass as tbl,
           string_agg(format('%L, %L, %L', a.attname, ft.relname, fa.attname), ', ' order by a.attname) as args,
           string_agg(quote_ident(a.attname), ', ' order by a.attname) as cols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ft on ft.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
     where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and c.conrelid = 'public.reservations'::regclass
       and a.attname <> 'restaurant_id' and a.atttypid = 'uuid'::regtype
       and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'restaurant_id' and not x.attisdropped)
     group by c.conrelid
  loop
    execute format('drop trigger if exists zz_same_property on %s', t.tbl);
    execute format('create trigger zz_same_property before insert or update of %s, restaurant_id on %s for each row execute function public._same_property(%s)',
                   t.cols, t.tbl, t.args);
  end loop;
end $$;

notify pgrst, 'reload schema';
