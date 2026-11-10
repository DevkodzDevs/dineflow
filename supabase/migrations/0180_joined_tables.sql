-- 0180 · A big party gets two or three tables joined (2026-11-10).
--
-- The owner: "8 to 10 people try to book, but we only have 4- and 6-seat tables — how do you seat all 10?" Until now a
-- walk-in larger than the biggest table read "No table fits · Join two tables", quote_wait answered null, and the fill
-- never held anything for them. Now:
--
--   * `walkins.table_ids uuid[]` — the tables joined to `table_id` (the first one stays in `table_id`, so every reader that
--     knew one table still works). Empty for a party on one table.
--   * `_walkin_pick(rid, party)` — the smallest free table that seats them; else the pair in ONE zone whose seats together
--     are the fewest that fit (ties: nearest in the floor order, then by name); else a triple in one zone the same way.
--     Never more than three. `lib/tables.ts` is the screen's copy of the same rule, tested.
--   * `_walkin_free_tables` — a table held as an extra, or one a walk-in was just seated at as an extra, is not free.
--   * `_walkin_fill` — reads the free tables once and picks from that list (`_walkin_pick_from`), crossing off each hold; a
--     hold lapses when someone else sits at ANY of its tables.
--   * `walkin_hold(id, table, more default '{}')` — the host sets one table or several (replaces the two-argument one).
--   * `walkin_set(id, status, table default null, more default '{}')` — seating marks every table occupied, each checked
--     free first (0166's rule); seated with nothing named sits them at the tables they hold (replaces the three-argument one).
--   * `quote_wait(party, rid)` — a slot is a single table that seats them OR a same-zone pair; a pair frees when its later
--     table frees. The place-in-line rule (0098) is unchanged. 0 for a free pair → Pulse reads "Seat now · T1 + T2".
--   * `table_pulse` / `table_pulse_for` — a table a walk-in was just seated at as an extra reads 'seated', not 'free'.
--   * `_tables_label(table, more)` — "T4 + T5": used by walkin_add, queue_status (the guest's page) and screen_queue (the board).
--
-- Additive. walkins' tenant policy (0016) covers the column. Private helpers stay revoked from every API role; the public
-- calls keep the grants they had (walkin_hold / walkin_set: authenticated; queue_status / screen_queue: anon too).

alter table public.walkins add column if not exists table_ids uuid[] not null default '{}';

-- ─── "T4 + T5" ───
create or replace function public._tables_label(p_table uuid, p_more uuid[] default '{}')
returns text language sql stable security definer set search_path = public as $$
  select string_agg(t.name, ' + ' order by x.ord)
    from unnest(array[p_table] || coalesce(p_more, '{}')) with ordinality as x(id, ord)
    join dining_tables t on t.id = x.id
$$;
revoke all on function public._tables_label(uuid, uuid[]) from public, anon, authenticated;

-- ─── the tables a waiting guest may be given (0164's body; extras count as held and as seated) ───
drop function if exists public._walkin_free_tables(uuid);
create or replace function public._walkin_free_tables(p_rid uuid)
returns table (id uuid, name text, capacity int, zone text, sort_order int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.capacity, t.zone, t.sort_order from dining_tables t
  where t.restaurant_id = p_rid
    and not exists (select 1 from orders o where o.table_id = t.id and o.status = 'open')
    and not exists (select 1 from walkins w where w.restaurant_id = p_rid and (w.table_id = t.id or t.id = any(w.table_ids)) and w.status = 'seated'
                      and w.seated_at > now() - interval '3 hours'
                      and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at))
    and not exists (select 1 from walkins w where w.restaurant_id = p_rid and (w.table_id = t.id or t.id = any(w.table_ids)) and w.status in ('waiting', 'called'))
    and not exists (select 1 from table_cleanings c where c.table_id = t.id and c.status in ('pending', 'in_progress'))
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id
                      and r.status in ('requested', 'confirmed') and r.on_date = (now() at time zone 'Asia/Kolkata')::date
                      and (r.on_date + r.at_time) >= (now() at time zone 'Asia/Kolkata') - interval '30 minutes')
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id
                      and r.held_at is not null and r.status in ('requested', 'confirmed'))
    and not exists (select 1 from reservations r where r.restaurant_id = p_rid and r.table_id = t.id and r.status = 'seated'
                      and r.seated_at > now() - interval '3 hours'
                      and not exists (select 1 from orders o3 where o3.table_id = t.id and o3.created_at >= r.seated_at))
$$;
revoke all on function public._walkin_free_tables(uuid) from public, anon, authenticated;

-- ─── one table, or two or three joined in one zone ───
-- The rule itself, on a list of free tables that was read ONCE (jsonb rows of _walkin_free_tables). The first draft asked
-- _walkin_free_tables again for every step — once for a single, twice for a pair, three times for a triple — and the fill
-- asked for every waiting guest: with 12 waiting, adding a party of 10 cost 71 ms on a 14-table floor and would have grown
-- with the cube of a big floor. The list is small and in memory; reading it is the expensive part.
create or replace function public._walkin_pick_from(p_free jsonb, p_party int)
returns uuid[] language plpgsql immutable set search_path = public as $$
declare ids uuid[];
begin
  if p_party is null or p_party < 1 or p_free is null or jsonb_typeof(p_free) <> 'array' then return '{}'; end if;
  select array[f.id] into ids
    from jsonb_to_recordset(p_free) as f(id uuid, name text, capacity int, zone text, sort_order int)
   where f.capacity >= p_party order by f.capacity, f.sort_order, f.name limit 1;
  if ids is not null then return ids; end if;
  -- no zone seats them even on its three biggest free tables: say so now rather than trying every pair and triple
  -- (74 tables and a line of parties nothing fits cost 0.8 s an add before this check)
  if not exists (select 1 from (select f.zone, f.capacity, row_number() over (partition by f.zone order by f.capacity desc) as rn
                                  from jsonb_to_recordset(p_free) as f(id uuid, name text, capacity int, zone text, sort_order int)
                                 where f.zone is not null) z
                  where z.rn <= 3 group by z.zone having sum(z.capacity) >= p_party) then return '{}'; end if;
  select array[a.id, b.id] into ids
    from jsonb_to_recordset(p_free) as a(id uuid, name text, capacity int, zone text, sort_order int)
    join jsonb_to_recordset(p_free) as b(id uuid, name text, capacity int, zone text, sort_order int) on b.zone = a.zone and b.sort_order > a.sort_order
   where a.capacity + b.capacity >= p_party
   order by a.capacity + b.capacity, b.sort_order - a.sort_order, a.name, b.name limit 1;
  if ids is not null then return ids; end if;
  select array[a.id, b.id, c.id] into ids
    from jsonb_to_recordset(p_free) as a(id uuid, name text, capacity int, zone text, sort_order int)
    join jsonb_to_recordset(p_free) as b(id uuid, name text, capacity int, zone text, sort_order int) on b.zone = a.zone and b.sort_order > a.sort_order
    join jsonb_to_recordset(p_free) as c(id uuid, name text, capacity int, zone text, sort_order int) on c.zone = a.zone and c.sort_order > b.sort_order
   where a.capacity + b.capacity + c.capacity >= p_party
   order by a.capacity + b.capacity + c.capacity, c.sort_order - a.sort_order, a.name, b.name, c.name limit 1;
  return coalesce(ids, '{}');
end $$;
revoke all on function public._walkin_pick_from(jsonb, int) from public, anon, authenticated;

create or replace function public._walkin_pick(p_rid uuid, p_party int)
returns uuid[] language sql stable security definer set search_path = public as $$
  select _walkin_pick_from((select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from _walkin_free_tables(p_rid) f), p_party)
$$;
revoke all on function public._walkin_pick(uuid, int) from public, anon, authenticated;

-- ─── first come, first served (0164's body, with the pick and lapses on any joined table) ───
create or replace function public._walkin_fill(p_rid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare w record; ids uuid[]; n int := 0; free jsonb; nofit int;
begin
  if p_rid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('walkin_fill:' || p_rid));
  -- someone else sat at a held table (any of them): an order opened on it after it was held, or another party seated there
  update walkins x set table_id = null, table_ids = '{}', held_at = null
   where x.restaurant_id = p_rid and x.status in ('waiting', 'called') and x.table_id is not null
     and exists (select 1 from unnest(array[x.table_id] || x.table_ids) as h(tid)
                  where exists (select 1 from orders o where o.table_id = h.tid and o.status = 'open' and o.created_at > coalesce(x.held_at, x.joined_at))
                     or exists (select 1 from walkins y where (y.table_id = h.tid or h.tid = any(y.table_ids)) and y.id <> x.id and y.status = 'seated' and y.seated_at >= coalesce(x.held_at, x.joined_at))
                     or exists (select 1 from reservations r where r.table_id = h.tid and r.status = 'seated' and r.seated_at >= coalesce(x.held_at, x.joined_at)));
  -- the free tables, read once (after the lapses above): under this lock only the holds given below change the list,
  -- so each one is crossed off in memory instead of asking the floor again for every guest in the line
  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into free from _walkin_free_tables(p_rid) f;
  for w in select x.id, x.party from walkins x where x.restaurant_id = p_rid and x.status in ('waiting', 'called') and x.table_id is null order by x.joined_at loop
    exit when jsonb_array_length(free) = 0;
    continue when nofit is not null and w.party >= nofit;   -- the list only shrinks: what did not fit a smaller party will not fit a bigger one
    ids := _walkin_pick_from(free, w.party);
    if coalesce(array_length(ids, 1), 0) = 0 then nofit := least(coalesce(nofit, w.party), w.party); continue; end if;
    update walkins set table_id = ids[1], table_ids = ids[2:], held_at = now() where id = w.id;
    select coalesce(jsonb_agg(e), '[]'::jsonb) into free from jsonb_array_elements(free) e where not ((e->>'id')::uuid = any(ids));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._walkin_fill(uuid) from public, anon, authenticated;

-- ─── the host sets the table(s) by hand ───
drop function if exists public.walkin_hold(uuid, uuid);
create or replace function public.walkin_hold(p_id uuid, p_table uuid, p_more uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); w walkins; tid uuid; tn text; other text; all_ids uuid[] := array[p_table] || coalesce(p_more, '{}');
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if coalesce(array_length(all_ids, 1), 0) > 3 then raise exception 'at most three tables can be joined'; end if;
  perform pg_advisory_xact_lock(hashtext('walkin_fill:' || rid));
  select * into w from walkins where id = p_id and restaurant_id = rid;
  if not found or w.status not in ('waiting', 'called') then raise exception 'that guest is no longer waiting'; end if;
  foreach tid in array all_ids loop
    select name into tn from dining_tables where id = tid and restaurant_id = rid;
    if tn is null then raise exception 'no such table'; end if;
    select x.name into other from walkins x where x.restaurant_id = rid and (x.table_id = tid or tid = any(x.table_ids)) and x.status in ('waiting', 'called') and x.id <> p_id limit 1;
    if other is not null then raise exception '% is held for %', tn, other; end if;
    if exists (select 1 from orders o where o.table_id = tid and o.status = 'open') then raise exception '% is in use', tn; end if;
  end loop;
  update walkins set table_id = p_table, table_ids = coalesce(p_more, '{}'), held_at = now() where id = p_id;
  return jsonb_build_object('table', _tables_label(p_table, p_more));
end $$;
revoke all on function public.walkin_hold(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.walkin_hold(uuid, uuid, uuid[]) to authenticated;

-- ─── called / seated / left (0166's body; every joined table checked and marked) ───
drop function if exists public.walkin_set(uuid, walkin_status, uuid);
create or replace function public.walkin_set(p_id uuid, p_status walkin_status, p_table uuid default null, p_more uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); held uuid; held_more uuid[]; seats uuid[]; tid uuid; why text;
begin
  select table_id, table_ids into held, held_more from walkins where id = p_id and restaurant_id = rid;
  if p_status = 'seated' then
    seats := case when p_table is not null then array[p_table] || coalesce(p_more, '{}') when held is not null then array[held] || coalesce(held_more, '{}') else '{}' end;
    -- 0166: a party is seated only at free tables — every one of them
    foreach tid in array seats loop
      why := _table_busy(tid);
      if why is not null then raise exception '%', replace(why, 'takes an order', 'can be seated') using errcode = 'P0001'; end if;
    end loop;
  end if;
  update walkins set status = p_status,
    table_id = case when p_table is not null then p_table else table_id end,
    table_ids = case when p_table is not null then coalesce(p_more, '{}') else table_ids end,
    called_at = case when p_status = 'called' then now() else called_at end,
    seated_at = case when p_status = 'seated' then now() else seated_at end
  where id = p_id and restaurant_id = rid;
  if p_status = 'seated' and coalesce(array_length(seats, 1), 0) > 0 then
    update dining_tables set status = 'occupied' where id = any(seats) and restaurant_id = rid;
  end if;
  if p_status in ('seated', 'left') then perform _walkin_fill(rid); end if;                -- 0164: their hold goes to the next
end $$;
revoke all on function public.walkin_set(uuid, walkin_status, uuid, uuid[]) from public, anon;
grant execute on function public.walkin_set(uuid, walkin_status, uuid, uuid[]) to authenticated, service_role;

-- ─── how long for a party this size (0098's body; a same-zone pair is a slot too) ───
create or replace function public.quote_wait(p_party integer, p_rid uuid)
 returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare rid uuid := coalesce(p_rid, auth_restaurant_id()); ahead int; pulse jsonb; mins int; n int := 0;
begin
  select count(*) into ahead from walkins w where w.restaurant_id = rid and w.status in ('waiting','called')
    and (case when p_party >= 5 then w.party >= 5 when p_party >= 3 then w.party between 3 and 4 else w.party <= 2 end);
  pulse := table_pulse_for(rid);
  for mins in
    with t as (
      select (value->>'id')::uuid as id, (value->>'capacity')::int as capacity, (value->>'mins_left')::int as mins_left, d.zone, d.sort_order
        from jsonb_array_elements(pulse->'tables') join dining_tables d on d.id = (value->>'id')::uuid),
    slots as (
      select mins_left from t where capacity >= p_party
      union all
      select greatest(a.mins_left, b.mins_left) from t a join t b on b.zone = a.zone and b.sort_order > a.sort_order
       where a.capacity < p_party and b.capacity < p_party and a.capacity + b.capacity >= p_party)
    select mins_left from slots order by mins_left
  loop
    if n = ahead then return mins; end if;
    n := n + 1;
  end loop;
  return null;   -- nothing seats them, even two joined
end $function$;
revoke execute on function public.quote_wait(integer, uuid) from public, anon, authenticated;

-- ─── the floor (0164's bodies; an extra table a walk-in sits at reads 'seated') ───
create or replace function public.table_pulse()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); med jsonb; out jsonb;
begin
  med := dwell_medians(rid);
  with occ as (
    select t.id, t.name, t.capacity, t.status, o.id as order_id, coalesce(o.created_at, sw.seated_at) as created_at, t.capacity as covers,
      sw.seated_at,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, coalesce(o.created_at, sw.seated_at)) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    left join lateral (
      select w.seated_at from walkins w
      where w.restaurant_id = rid and (w.table_id = t.id or t.id = any(w.table_ids)) and w.status = 'seated' and w.seated_at > now() - interval '3 hours'
        and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at)
      order by w.seated_at desc limit 1) sw on o.id is null
    where t.restaurant_id = rid
  ),
  est as (
    select *, extract(epoch from (now() - created_at)) / 60 as age,
      case
        when order_id is null and seated_at is null then 0
        when order_id is null then greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
        when billed then 8
        when items > 0 and done = items then greatest(6, round(dwell * 0.22))
        when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
        else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
      end as mins_left,
      case when order_id is null and seated_at is not null then 'seated' when order_id is null then 'free' when billed then 'billed'
           when items > 0 and done = items then 'served' when done > 0 then 'eating' else 'ordered' end as stage
    from occ
  )
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'stage', stage, 'covers', covers, 'age', coalesce(round(age), 0), 'mins_left', mins_left, 'free_at', to_char((now() + (mins_left || ' minutes')::interval) at time zone 'Asia/Kolkata', 'HH24:MI')) order by mins_left, name) from est), '[]'),
    'free_now', (select count(*) from est where stage = 'free'),
    'seats_free_now', coalesce((select sum(capacity) from est where stage = 'free'), 0),
    'next_free_min', (select min(mins_left) from est where stage <> 'free'),
    'avg_dwell', round(dwell_pick(med, 2, now())),
    'history_days', (select count(distinct (b.paid_at at time zone 'Asia/Kolkata')::date) from bills b where b.restaurant_id = rid and b.status = 'paid' and b.paid_at > now() - interval '90 days'))
  into out;
  return out;
end $function$;

create or replace function public.table_pulse_for(p_rid uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare med jsonb; out jsonb;
begin
  med := dwell_medians(p_rid);
  with occ as (
    select t.id, t.name, t.capacity, o.id as order_id, coalesce(o.created_at, sw.seated_at) as created_at, t.capacity as covers, sw.seated_at,
      (select count(*) from order_items i where i.order_id = o.id and i.status <> 'cancelled') as items,
      (select count(*) from order_items i where i.order_id = o.id and i.status in ('served','ready')) as done,
      exists (select 1 from bills b where b.order_id = o.id and b.status = 'unpaid') as billed,
      dwell_pick(med, t.capacity, coalesce(o.created_at, sw.seated_at)) as dwell
    from dining_tables t
    left join lateral (select * from orders o where o.table_id = t.id and o.status = 'open' order by o.created_at desc limit 1) o on true
    left join lateral (
      select w.seated_at from walkins w
      where w.restaurant_id = p_rid and (w.table_id = t.id or t.id = any(w.table_ids)) and w.status = 'seated' and w.seated_at > now() - interval '3 hours'
        and not exists (select 1 from orders o2 where o2.table_id = t.id and o2.created_at >= w.seated_at)
      order by w.seated_at desc limit 1) sw on o.id is null
    where t.restaurant_id = p_rid
  ),
  est as (select *, case when order_id is null and seated_at is null then 0
                    when order_id is null then greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    when billed then 8 when items > 0 and done = items then greatest(6, round(dwell * 0.22))
                    when items > 0 and done > 0 then greatest(10, round(dwell - extract(epoch from (now() - created_at)) / 60))
                    else greatest(15, round(dwell - extract(epoch from (now() - created_at)) / 60)) end as mins_left from occ)
  select jsonb_build_object('tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'capacity', capacity, 'mins_left', mins_left) order by mins_left) from est), '[]')) into out;
  return out;
end $function$;

-- ─── the names everyone reads: "T4 + T5" (0179's bodies, the label swapped in) ───
create or replace function public.walkin_add(p_name text, p_phone text, p_party integer, p_client_id uuid default null, p_note text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); q int; w walkins;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_client_id is not null then
    select * into w from walkins where restaurant_id = rid and client_id = p_client_id;
  end if;
  if w.id is null then
    q := quote_wait(p_party, rid);
    begin
      insert into walkins(restaurant_id, name, phone, party, quoted_min, source, client_id, note, wa_ok)
        values (rid, p_name, nullif(p_phone, ''), p_party, q, 'host', p_client_id, nullif(trim(coalesce(p_note, '')), ''), nullif(p_phone, '') is not null)
        returning * into w;
    exception when unique_violation then
      select * into w from walkins where restaurant_id = rid and client_id = p_client_id;
    end;
    perform _walkin_fill(rid);                                                                -- 0164
    select * into w from walkins where id = w.id;
  end if;
  return jsonb_build_object('id', w.id, 'token', w.token, 'token_no', w.token_no, 'quoted_min', w.quoted_min,
    'position', (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'table', _tables_label(w.table_id, w.table_ids), 'table_id', w.table_id, 'table_ids', to_jsonb(w.table_ids));
end $function$;

create or replace function public.queue_status(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'token', w.token, 'token_no', w.token_no, 'name', w.name, 'party', w.party, 'status', w.status, 'joined_at', w.joined_at, 'note', w.note,
    'place', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'waiting', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting'),
    'minutes', case when w.status = 'waiting' and w.table_id is null then quote_wait(w.party, w.restaurant_id) else 0 end,
    'table', _tables_label(w.table_id, w.table_ids),
    'restaurant', r.name, 'slug', r.booking_slug)
  from walkins w join restaurants r on r.id = w.restaurant_id where w.token = p_token
$function$;

create or replace function public.screen_queue(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', r.name, 'logo', r.logo_url,
    'slug', case when r.is_listed then r.booking_slug end,
    'called', coalesce((select jsonb_agg(jsonb_build_object('no', w.token_no, 'party', w.party, 'table', _tables_label(w.table_id, w.table_ids), 'at', w.called_at) order by w.called_at desc)
        from walkins w
       where w.restaurant_id = r.id and w.status = 'called' and w.token_no is not null and w.joined_at > now() - interval '14 hours'), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('no', w.token_no, 'party', w.party, 'since', w.joined_at, 'held', w.table_id is not null, 'quoted', w.quoted_min) order by w.joined_at)
        from walkins w
       where w.restaurant_id = r.id and w.status = 'waiting' and w.token_no is not null and w.joined_at > now() - interval '14 hours'), '[]'::jsonb),
    'at', now())
    from restaurants r
   where r.screen_key = p_key and p_key is not null and length(p_key) >= 16 and membership_state_for(r.id) in ('trial', 'active')
$$;

notify pgrst, 'reload schema';
