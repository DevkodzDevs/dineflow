-- 0103 · What Petpooja sells as add-ons, batch 1 (owner, 2026-10-17): a guest calls a waiter from the table
-- QR, a parcel gets a token for the day, the property puts its menu and its tokens on a TV, and a guest leaves
-- private feedback that a low score turns into an alert. (The kiosk needs nothing here: it is a signed-in tablet
-- taking parcel orders through place_order, and its token comes from the trigger below.)
--
-- Additive only. Every public entry is a definer function granted to anon on purpose (since 0098 a new
-- function is not anon's by default), takes a slug, a table token or a screen key, checks the property is in
-- trial or membership, and is rate-limited. The tables have read policies for their own property only; nothing
-- but these functions writes them.

-- ─────────────────────────── 1 · a guest calls a waiter from the table QR ───────────────────────────
create table if not exists public.service_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  kind text not null check (kind in ('waiter', 'bill', 'water')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create index if not exists service_calls_open_idx on public.service_calls (restaurant_id, status, created_at desc);
create index if not exists service_calls_table_idx on public.service_calls (table_id, created_at desc);
alter table public.service_calls enable row level security;
drop policy if exists service_calls_read on public.service_calls;
create policy service_calls_read on public.service_calls for select to authenticated using (restaurant_id = auth_restaurant_id());

/** The table's QR asks for a waiter, the bill or water. A second tap on the same request while it is open
 *  answers with the open one (a guest taps twice); twelve an hour from one table, 400 an hour for a place. */
create or replace function public.dine_call(p_slug text, p_table text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants; t dining_tables; c service_calls; n int;
begin
  if p_kind is null or p_kind not in ('waiter', 'bill', 'water') then raise exception 'That request is not one we know.'; end if;
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial', 'active');
  if r.id is null then raise exception 'This place is not taking requests here right now — please wave to a waiter.'; end if;
  select * into t from dining_tables where restaurant_id = r.id and qr_token = p_table and p_table is not null;
  if t.id is null then raise exception 'Scan the QR on your table again.'; end if;
  select * into c from service_calls where table_id = t.id and kind = p_kind and status = 'open' and created_at > now() - interval '30 minutes'
   order by created_at desc limit 1;
  if c.id is not null then return jsonb_build_object('id', c.id, 'kind', c.kind, 'status', c.status, 'at', c.created_at, 'again', true); end if;
  select count(*) into n from service_calls where table_id = t.id and created_at > now() - interval '1 hour';
  if n >= 12 then raise exception 'We have your request — please wave to a waiter.'; end if;
  select count(*) into n from service_calls where restaurant_id = r.id and created_at > now() - interval '1 hour';
  if n >= 400 then raise exception 'Please wave to a waiter.'; end if;
  insert into service_calls (restaurant_id, table_id, kind) values (r.id, t.id, p_kind) returning * into c;
  return jsonb_build_object('id', c.id, 'kind', c.kind, 'status', c.status, 'at', c.created_at);
end $$;
revoke execute on function public.dine_call(text, text, text) from public;
grant execute on function public.dine_call(text, text, text) to anon, authenticated, service_role;

/** What this table has asked for in the last half hour, and whether someone has answered — the guest's page polls it. */
create or replace function public.dine_call_status(p_slug text, p_table text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'status', c.status, 'at', c.created_at, 'done_at', c.done_at) order by c.created_at desc), '[]'::jsonb)
    from service_calls c
    join dining_tables t on t.id = c.table_id
    join restaurants r on r.id = c.restaurant_id
   where r.booking_slug = p_slug and t.qr_token = p_table and p_table is not null
     and c.created_at > now() - interval '30 minutes'
$$;
revoke execute on function public.dine_call_status(text, text) from public;
grant execute on function public.dine_call_status(text, text) to anon, authenticated, service_role;

/** A waiter answers: one call, or every open call of a table. Anyone signed in to the property may. */
create or replace function public.service_call_done(p_id uuid default null, p_table uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n int;
begin
  if rid is null then raise exception 'not signed in to a property'; end if;
  if p_id is null and p_table is null then raise exception 'which call?'; end if;
  update service_calls set status = 'done', done_at = now(), done_by = auth.uid()
   where restaurant_id = rid and status = 'open'
     and ((p_id is not null and id = p_id) or (p_table is not null and table_id = p_table));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.service_call_done(uuid, uuid) from public;
grant execute on function public.service_call_done(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────── 2 · a token for every parcel and delivery, by the day ───────────────────────────
alter table public.orders add column if not exists token_no integer;
create table if not exists public.order_tokens (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day date not null,
  last integer not null default 0,
  primary key (restaurant_id, day)
);
alter table public.order_tokens enable row level security;   -- no policy: only the trigger writes it

/** Takeaway and delivery orders get 1, 2, 3… for the property's business day (India time), whichever path
 *  inserts them — the till, the kiosk, the storefront, an offline sync. Dine-in and room service do not. */
create or replace function public.order_token_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; n int;
begin
  if new.type::text in ('takeaway', 'delivery') and new.token_no is null then
    insert into order_tokens (restaurant_id, day, last) values (new.restaurant_id, d, 1)
      on conflict (restaurant_id, day) do update set last = order_tokens.last + 1
      returning last into n;
    new.token_no := n;
  end if;
  return new;
end $$;
revoke execute on function public.order_token_assign() from public, anon, authenticated;
drop trigger if exists orders_token on public.orders;
create trigger orders_token before insert on public.orders for each row execute function public.order_token_assign();

-- ─────────────────────────── 3 · the TV screen: the menu, the tokens, or both ───────────────────────────
alter table public.restaurants add column if not exists screen_key text;
update public.restaurants set screen_key = encode(gen_random_bytes(12), 'hex') where screen_key is null;
alter table public.restaurants alter column screen_key set default encode(gen_random_bytes(12), 'hex');
create unique index if not exists restaurants_screen_key_idx on public.restaurants (screen_key);

/** The screen's link for this property — owner or manager — and a new one when the old has to stop working. */
create or replace function public.my_screen_key(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); k text;
begin
  if rid is null then raise exception 'not signed in to a property'; end if;
  if auth_role()::text not in ('owner', 'manager') and not is_platform_admin() then raise exception 'only the owner or a manager can see the screen link'; end if;
  if p_rotate then update restaurants set screen_key = encode(gen_random_bytes(12), 'hex') where id = rid; end if;
  select screen_key into k from restaurants where id = rid;
  return k;
end $$;
revoke execute on function public.my_screen_key(boolean) from public;
grant execute on function public.my_screen_key(boolean) to authenticated, service_role;

/** Everything the TV shows, for a screen key: the place's name and logo, the dishes on sale now (photo, price —
 *  from the lowest size — veg mark) by category, and today's parcel tokens: still cooking, and ready to collect.
 *  A token leaves the screen once its food has been handed over (served) or the order is cancelled. */
create or replace function public.screen_feed(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', r.name, 'logo', r.logo_url,
    'menu', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'items', c.items) order by c.sort_order)
        from (select c.name, c.sort_order,
                     (select jsonb_agg(jsonb_build_object('name', m.name, 'is_veg', m.is_veg, 'image', m.image_url, 'description', m.description,
                              'price', coalesce((select min(v.price) from menu_variants v where v.menu_item_id = m.id and v.is_active), m.price),
                              'from', exists (select 1 from menu_variants v where v.menu_item_id = m.id and v.is_active)) order by m.name)
                        from menu_items m where m.category_id = c.id and m.is_active and m.is_available) as items
                from categories c where c.restaurant_id = r.id) c
       where c.items is not null), '[]'::jsonb),
    'tokens', jsonb_build_object(
      'preparing', coalesce((select jsonb_agg(o.token_no order by o.token_no) from orders o
          where o.restaurant_id = r.id and o.token_no is not null and o.status <> 'cancelled'
            and o.created_at > now() - interval '14 hours'
            and exists (select 1 from order_items i where i.order_id = o.id and i.status in ('pending', 'preparing'))), '[]'::jsonb),
      'ready', coalesce((select jsonb_agg(o.token_no order by o.token_no) from orders o
          where o.restaurant_id = r.id and o.token_no is not null and o.status <> 'cancelled'
            and o.created_at > now() - interval '14 hours'
            and exists (select 1 from order_items i where i.order_id = o.id and i.status = 'ready')
            and not exists (select 1 from order_items i where i.order_id = o.id and i.status in ('pending', 'preparing'))), '[]'::jsonb)),
    'at', now())
    from restaurants r
   where r.screen_key = p_key and p_key is not null and length(p_key) >= 16 and membership_state_for(r.id) in ('trial', 'active')
$$;
revoke execute on function public.screen_feed(text) from public;
grant execute on function public.screen_feed(text) to anon, authenticated, service_role;

-- ─────────────────────────── 4 · private feedback from a QR, with an alert for a low score ───────────────────────────
create table if not exists public.guest_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.dining_tables(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text,
  guest_name text,
  guest_phone text,
  status text not null default 'new' check (status in ('new', 'seen')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  seen_by uuid
);
create index if not exists guest_feedback_idx on public.guest_feedback (restaurant_id, created_at desc);
alter table public.guest_feedback enable row level security;
drop policy if exists guest_feedback_read on public.guest_feedback;
create policy guest_feedback_read on public.guest_feedback for select to authenticated using (restaurant_id = auth_restaurant_id());

/** The feedback page's heading: the place's name and logo, for a property that is open for business. */
create or replace function public.feedback_place(p_slug text, p_table text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', r.name, 'logo', r.logo_url,
           'table', (select t.name from dining_tables t where t.restaurant_id = r.id and t.qr_token = p_table and p_table is not null))
    from restaurants r
   where r.booking_slug = p_slug and membership_state_for(r.id) in ('trial', 'active')
$$;
revoke execute on function public.feedback_place(text, text) from public;
grant execute on function public.feedback_place(text, text) to anon, authenticated, service_role;

/** A guest's rating (1–5), what stood out (up to eight short tags), a comment and, if they wish, a name and phone.
 *  Private to the property — never shown on the storefront. Sixty an hour for a place, six an hour from a table,
 *  three a day from one phone. */
create or replace function public.feedback_submit(p_slug text, p_table text, p_rating integer, p_tags text[], p_comment text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants; tid uuid; n int; ph text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''); f guest_feedback;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Tap a star from one to five.'; end if;
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial', 'active');
  if r.id is null then raise exception 'This place is not taking feedback here right now.'; end if;
  select id into tid from dining_tables where restaurant_id = r.id and qr_token = p_table and p_table is not null;
  select count(*) into n from guest_feedback where restaurant_id = r.id and created_at > now() - interval '1 hour';
  if n >= 60 then raise exception 'Thank you — please try again in a little while.'; end if;
  if tid is not null then
    select count(*) into n from guest_feedback where table_id = tid and created_at > now() - interval '1 hour';
    if n >= 6 then raise exception 'Thank you — we already have feedback from this table.'; end if;
  end if;
  if ph is not null then
    select count(*) into n from guest_feedback where restaurant_id = r.id and guest_phone = ph and created_at > now() - interval '1 day';
    if n >= 3 then raise exception 'Thank you — we already have your feedback today.'; end if;
  end if;
  insert into guest_feedback (restaurant_id, table_id, rating, tags, comment, guest_name, guest_phone)
  values (r.id, tid, p_rating,
          coalesce((select array_agg(left(x, 30)) from (select x from unnest(coalesce(p_tags, '{}'::text[])) x where length(trim(x)) > 0 limit 8) s), '{}'),
          nullif(left(trim(coalesce(p_comment, '')), 600), ''), nullif(left(trim(coalesce(p_name, '')), 80), ''), left(ph, 20))
  returning * into f;
  return jsonb_build_object('ok', true, 'id', f.id);
end $$;
revoke execute on function public.feedback_submit(text, text, integer, text[], text, text, text) from public;
grant execute on function public.feedback_submit(text, text, integer, text[], text, text, text) to anon, authenticated, service_role;

/** Staff have read it. */
create or replace function public.feedback_seen(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); n int;
begin
  if rid is null then raise exception 'not signed in to a property'; end if;
  update guest_feedback set status = 'seen', seen_at = now(), seen_by = auth.uid() where id = p_id and restaurant_id = rid and status = 'new';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.feedback_seen(uuid) from public;
grant execute on function public.feedback_seen(uuid) to authenticated, service_role;

-- the floor and the bell hear calls and feedback the moment they arrive
do $$ begin alter publication supabase_realtime add table public.service_calls, public.guest_feedback; exception when others then null; end $$;
