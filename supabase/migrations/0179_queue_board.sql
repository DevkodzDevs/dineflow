-- 0179 · The waiting list at the door: a number for every guest, their request, their WhatsApp consent, and the TV
--        board that calls them (2026-11-10).
--
-- The owner compared Pulse with a queue system seen at a restaurant door: a TV showing "Table allocated 268 · Table 26"
-- and "Waiting 604", a join form with a special-requests line and a WhatsApp tick, and a voice calling the number.
-- Four things, all additive:
--
--   1. `walkins.token_no` — 1, 2, 3… per property per business day (India time), whichever path inserts the row (the
--      host on Pulse, the QR page, an offline replay). A number can be read across a room and said aloud; a name
--      cannot be put on a public screen. `walkin_tokens` is the counter (as `order_tokens`, 0103), written only by
--      the trigger `walkins_token`.
--   2. `walkins.note` — "carrying infant", "wheelchair", "birthday": one line, 140 characters, from the join form or
--      the host.
--   3. `walkins.wa_ok` — the guest ticked "message me on WhatsApp" on the queue page; a host add with a phone counts
--      as a yes (the host asked for the number "for the WhatsApp alert"). The server action behind Table ready /
--      Call next queues `dineflow_table_ready` (0177's kind 'table_ready') only when this is true and the add-on,
--      the property's WhatsApp and the switch are on. The database does not send.
--   4. `screen_queue(key)` — the board's feed, keyed like the counter TV (0103 `screen_feed`, the same secret key,
--      anon may call it): the place, its public queue link (slug, when Listed publicly), the guests called (number,
--      party, the table held for them) and the guests waiting (number, party, since when, the minutes they were told). Never a name, never a phone.
--
-- Calls re-created with the new columns, bodies otherwise as live:
--   walkin_add(name, phone, party, client_id default null, note default null)   — replaces 0168's four-argument
--      one (dropped, so a call with four named arguments is not ambiguous). Returns token_no too.
--   queue_join(slug, name, phone, party, note default null, wa_ok default false) — replaces 0164's four-argument
--      one (dropped, same reason). Grants as before: anon, authenticated.
--   queue_status(token) — answers token_no and note as well.
-- walkin_set, walkin_hold, _walkin_fill and the triggers are untouched. walkins' tenant policy (0016) covers the
-- new columns; walkin_tokens has RLS on and no policy — only the trigger (security definer) writes it.

-- ─── 1 · the number of the day ───
alter table public.walkins add column if not exists token_no integer;
alter table public.walkins add column if not exists note text;
alter table public.walkins add column if not exists wa_ok boolean not null default false;
alter table public.walkins drop constraint if exists walkins_note_len;
alter table public.walkins add constraint walkins_note_len check (note is null or length(note) <= 140);

create table if not exists public.walkin_tokens (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day date not null,
  last integer not null default 0,
  primary key (restaurant_id, day)
);
alter table public.walkin_tokens enable row level security;   -- no policy: only the trigger writes it
revoke all on public.walkin_tokens from public, anon, authenticated;

create or replace function public.walkin_token_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; n int;
begin
  if new.token_no is null then
    insert into walkin_tokens (restaurant_id, day, last) values (new.restaurant_id, d, 1)
      on conflict (restaurant_id, day) do update set last = walkin_tokens.last + 1
      returning last into n;
    new.token_no := n;
  end if;
  if new.note is not null then new.note := nullif(left(regexp_replace(new.note, '\s+', ' ', 'g'), 140), ''); end if;
  return new;
end $$;
revoke execute on function public.walkin_token_assign() from public, anon, authenticated;
drop trigger if exists walkins_token on public.walkins;
create trigger walkins_token before insert on public.walkins for each row execute function public.walkin_token_assign();

-- ─── 2 · the host's add, with the request (0168's body) ───
drop function if exists public.walkin_add(text, text, integer, uuid);
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
    'table', (select t.name from dining_tables t where t.id = w.table_id), 'table_id', w.table_id);
end $function$;
revoke all on function public.walkin_add(text, text, integer, uuid, text) from public, anon;
grant execute on function public.walkin_add(text, text, integer, uuid, text) to authenticated, service_role;

-- ─── 3 · the guest's join (0164's body) and what they read back ───
create or replace function public.queue_status(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'token', w.token, 'token_no', w.token_no, 'name', w.name, 'party', w.party, 'status', w.status, 'joined_at', w.joined_at, 'note', w.note,
    'place', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting' and x.joined_at <= w.joined_at),
    'waiting', (select count(*) from walkins x where x.restaurant_id = w.restaurant_id and x.status = 'waiting'),
    -- 0164: a guest holding a table is next to be called — any minute now
    'minutes', case when w.status = 'waiting' and w.table_id is null then quote_wait(w.party, w.restaurant_id) else 0 end,
    'table', (select t.name from dining_tables t where t.id = w.table_id),
    'restaurant', r.name, 'slug', r.booking_slug)
  from walkins w join restaurants r on r.id = w.restaurant_id where w.token = p_token
$function$;

drop function if exists public.queue_join(text, text, text, integer);
create or replace function public.queue_join(p_slug text, p_name text, p_phone text, p_party integer, p_note text default null, p_wa_ok boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare rid uuid; q int; w walkins; ph text;
begin
  select id into rid from restaurants where booking_slug = p_slug and is_listed and membership_state_for(id) in ('trial','active');   -- 0100
  if rid is null then raise exception 'this place is not taking a queue right now'; end if;
  if p_party < 1 or p_party > 20 then raise exception 'party size must be between 1 and 20'; end if;
  if (select count(*) from walkins x where x.restaurant_id = rid and x.status = 'waiting') >= 60 then raise exception 'the queue is full — please ask at the counter'; end if;
  -- 0098: three joins an hour per phone number, a hundred and fifty an hour per place
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if ph <> '' and not _hit('queue:' || rid || ':' || ph, 3, interval '1 hour') then raise exception 'this number has joined a few times already — please ask at the counter'; end if;
  if not _hit('queue:' || rid, 150, interval '1 hour') then raise exception 'the queue is very busy — please ask at the counter'; end if;
  q := quote_wait(p_party, rid);
  insert into walkins(restaurant_id, name, phone, party, quoted_min, source, note, wa_ok)
    values (rid, left(p_name, 60), nullif(left(p_phone, 20), ''), p_party, q, 'qr', nullif(trim(coalesce(p_note, '')), ''),
            coalesce(p_wa_ok, false) and nullif(left(p_phone, 20), '') is not null)
    returning * into w;
  perform _walkin_fill(rid);                                                                  -- 0164
  return queue_status(w.token);
end $function$;
revoke all on function public.queue_join(text, text, text, integer, text, boolean) from public;
grant execute on function public.queue_join(text, text, text, integer, text, boolean) to anon, authenticated, service_role;

-- ─── 4 · the board's feed: numbers only, by the TV's key ───
/** What the waiting-list TV shows, for a screen key (0103's, the same secret as the counter TV): the place, the public
 *  queue link's slug (when Listed publicly — the board draws the join QR from it), the guests called today (number, party,
 *  the table held for them, when they were called) and the guests waiting (number, party, how long). No names, no phones.
 *  Null when the key is wrong, rotated or the place is closed — the page shows 404, the poll says Reconnecting. */
create or replace function public.screen_queue(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', r.name, 'logo', r.logo_url,
    'slug', case when r.is_listed then r.booking_slug end,
    'called', coalesce((select jsonb_agg(jsonb_build_object('no', w.token_no, 'party', w.party, 'table', t.name, 'at', w.called_at) order by w.called_at desc)
        from walkins w left join dining_tables t on t.id = w.table_id
       where w.restaurant_id = r.id and w.status = 'called' and w.token_no is not null and w.joined_at > now() - interval '14 hours'), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('no', w.token_no, 'party', w.party, 'since', w.joined_at, 'held', w.table_id is not null, 'quoted', w.quoted_min) order by w.joined_at)
        from walkins w
       where w.restaurant_id = r.id and w.status = 'waiting' and w.token_no is not null and w.joined_at > now() - interval '14 hours'), '[]'::jsonb),
    'at', now())
    from restaurants r
   where r.screen_key = p_key and p_key is not null and length(p_key) >= 16 and membership_state_for(r.id) in ('trial', 'active')
$$;
revoke execute on function public.screen_queue(text) from public;
grant execute on function public.screen_queue(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
