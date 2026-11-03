-- 0168 — a walk-in added offline is added once (2026-11-03).
--
-- Pulse's Add, offline, queues a `walkin_add` job; the outbox retries a job whose answer never came back, so a send
-- that reached the database but lost its reply added the same guest twice. As `place_order` / `order_add_items`
-- (0165): the device names the add with a `client_id`, and an add already in returns the same answer at once.
--
--   * `walkins.client_id uuid`, unique per property where set.
--   * `walkin_add(name, phone, party, client_id default null)` replaces the three-argument one (dropped, so a call with
--     three named arguments is not ambiguous). Body as 0164 — the fill and `table` / `table_id` — plus the replay check.
--     Two replays at once: the second insert meets the unique index and returns the first one's row.
--   * Grants as live before: authenticated and service_role, not anon.

alter table public.walkins add column if not exists client_id uuid;
create unique index if not exists walkins_client_uidx on public.walkins(restaurant_id, client_id) where client_id is not null;

drop function if exists public.walkin_add(text, text, integer);

create or replace function public.walkin_add(p_name text, p_phone text, p_party integer, p_client_id uuid default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid := auth_restaurant_id(); q int; w walkins;
begin
  if p_client_id is not null then
    select * into w from walkins where restaurant_id = rid and client_id = p_client_id;
  end if;
  if w.id is null then
    q := quote_wait(p_party, rid);
    begin
      insert into walkins(restaurant_id, name, phone, party, quoted_min, source, client_id)
        values (rid, p_name, nullif(p_phone, ''), p_party, q, 'host', p_client_id) returning * into w;
    exception when unique_violation then
      select * into w from walkins where restaurant_id = rid and client_id = p_client_id;
    end;
    perform _walkin_fill(rid);                                                                -- 0164
    select * into w from walkins where id = w.id;
  end if;
  return jsonb_build_object('id', w.id, 'token', w.token, 'quoted_min', w.quoted_min, 'position', (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'table', (select t.name from dining_tables t where t.id = w.table_id), 'table_id', w.table_id);
end $function$;
revoke all on function public.walkin_add(text, text, integer, uuid) from public, anon;
grant execute on function public.walkin_add(text, text, integer, uuid) to authenticated, service_role;
