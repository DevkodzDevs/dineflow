-- 0090 · The Control room's money and dishes, counted by the database.
--
-- /dashboard fetched every paid bill of today (with its payments, which nothing read), every paid
-- bill of the last seven days, and every dish line sold today, then added them up in Node. PostgREST
-- returns at most 1000 rows a request: a busy restaurant passes 1000 bills in a week and 1000 dish
-- lines in a day, and from there "Taken today", the week's curve and the top dishes came out short —
-- while the page, the most-opened screen in the app, grew slower with every service. This returns
-- the three figures in one small row.
--
-- Read-only, no new table: nothing to add to RLS. Security definer like wastage_summary, scoped to
-- the caller's own property (auth_restaurant_id()) and to people who hold the Control room.

create or replace function dashboard_figures() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rid uuid := auth_restaurant_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  t0 timestamptz := (today::timestamp at time zone 'Asia/Kolkata');          -- 00:00 IST today
  w0 timestamptz := ((today - 6)::timestamp at time zone 'Asia/Kolkata');    -- 00:00 IST six days ago
  out jsonb;
begin
  if rid is null then raise exception 'not signed in to a property' using errcode = '42501'; end if;
  if not has_module('dashboard') then raise exception 'no access to the control room' using errcode = '42501'; end if;

  select jsonb_build_object(
    'sales_today', coalesce((select sum(total) from bills where restaurant_id = rid and status = 'paid' and paid_at >= t0), 0),
    'bills_today', (select count(*) from bills where restaurant_id = rid and status = 'paid' and paid_at >= t0),
    -- seven days, oldest first, every day present even with no sales
    'week', (select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'total', coalesce(b.total, 0)) order by d)
             from generate_series(today - 6, today, interval '1 day') d
             left join (select (paid_at at time zone 'Asia/Kolkata')::date as day, sum(total) as total
                        from bills where restaurant_id = rid and status = 'paid' and paid_at >= w0 group by 1) b on b.day = d::date),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty) order by qty desc, name)
                     from (select name_snapshot as name, sum(qty) as qty from order_items
                           where restaurant_id = rid and created_at >= t0 and status <> 'cancelled'
                           group by name_snapshot order by sum(qty) desc, name_snapshot limit 5) x), '[]'::jsonb)
  ) into out;
  return out;
end $$;

revoke all on function dashboard_figures() from public, anon;
grant execute on function dashboard_figures() to authenticated;
