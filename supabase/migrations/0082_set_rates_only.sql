-- 0082 · Change nightly rates and nothing else.
--
-- "Use suggested rates" on the rate calendar writes a different rate per night. set_rate_inventory
-- cannot carry that: it takes one rate for a range, and it also overwrites stop_sell and resets
-- min_nights to 1 on every night it touches — so accepting a rate suggestion would quietly undo a
-- minimum-stay rule. This one sets the rate on the given nights and leaves every other column as it
-- was (a night with no row yet gets the same defaults set_rate_inventory would give it).
--
-- No new table; rate_inventory's existing policy applies to direct reads. Security definer, checks
-- the caller's property and that the room type is theirs.
create or replace function set_rates_only(p_room_type_id uuid, p_dates date[], p_rates numeric[]) returns int
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n int := 0;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from room_types where id = p_room_type_id and restaurant_id = rid) then raise exception 'room type not found'; end if;
  if coalesce(array_length(p_dates, 1), 0) <> coalesce(array_length(p_rates, 1), 0) then raise exception 'one rate per night'; end if;
  if coalesce(array_length(p_dates, 1), 0) > 400 then raise exception 'too many nights at once'; end if;
  if exists (select 1 from unnest(p_rates) r where r is null or r <= 0 or r > 10000000) then raise exception 'a rate must be above zero'; end if;
  insert into rate_inventory(restaurant_id, room_type_id, stay_date, rate, open_rooms, stop_sell, min_nights, updated_at)
  select rid, p_room_type_id, d, r, null, false, 1, now() from unnest(p_dates, p_rates) as x(d, r)
  on conflict (restaurant_id, room_type_id, stay_date) do update set rate = excluded.rate, updated_at = now();
  get diagnostics n = row_count; return n;
end $$;

revoke all on function set_rates_only(uuid, date[], numeric[]) from public, anon;
grant execute on function set_rates_only(uuid, date[], numeric[]) to authenticated;
