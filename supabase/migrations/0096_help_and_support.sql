-- 0096 · Help & support: a request raised inside a property reaches Master control, and the answer
-- comes back to the person who raised it.
--
-- Anyone signed in to a property raises a request: a complaint, a problem, a question, an idea, billing,
-- or privacy & consent — a grievance under the DPDP Act 2023 and the IT Rules 2021, which DineFlow
-- answers within 15 days (lib/company.ts → grievanceDays), so it carries a due date. A request has a
-- subject, the details, how urgent it is, whether DineFlow may open the property to look (consent, which
-- the person can change later), what the app knew about where they were (page, device, screen, version)
-- and up to three screenshots per message.
--
-- Master control sees every request from every property: it replies, or leaves an internal note the
-- property never sees, and moves a request through open → in progress → waiting on you → resolved →
-- closed and sets its priority. The person sees the replies, answers back, marks it sorted or reopens
-- it, and rates the help. Status and priority changes are kept in the thread as events.
--
-- Nobody writes these tables directly: every write is a definer RPC that checks the caller. A property's
-- owner and manager see all of its requests; anyone else sees the ones they raised; Master control sees
-- every one. Internal notes are Master control's alone.
--
-- Times are clock_timestamp(), not now(): a reply and the status event it causes are written in one
-- call, and now() — the transaction's start — would give them the same instant and no order.

-- ── the requests ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id                uuid primary key default gen_random_uuid(),
  ticket_no         bigint generated always as identity unique,
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  raised_by         uuid references auth.users(id) on delete set null,
  raised_name       text,                       -- as they were called when they raised it
  raised_role       text,                       -- owner, manager, waiter… or 'master' while acting
  kind              text not null check (kind in ('complaint', 'problem', 'question', 'idea', 'billing', 'privacy')),
  topic             text check (topic is null or topic in ('withdraw', 'access', 'correct', 'erase', 'other')),
  priority          text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status            text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  subject           text not null check (char_length(btrim(subject)) between 3 and 140),
  allow_access      boolean not null default false,
  context           jsonb not null default '{}'::jsonb,
  due_by            timestamptz,                -- privacy & consent: the grievance deadline
  rating            smallint check (rating between 1 and 5),
  rating_note       text check (rating_note is null or char_length(rating_note) <= 500),
  last_message_at   timestamptz not null default clock_timestamp(),
  last_message_side text not null default 'user' check (last_message_side in ('user', 'support')),
  user_seen_at      timestamptz not null default clock_timestamp(),
  support_seen_at   timestamptz,
  first_response_at timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz not null default clock_timestamp(),
  updated_at        timestamptz not null default clock_timestamp()
);
create index if not exists support_tickets_property_idx on public.support_tickets(restaurant_id, last_message_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, last_message_at desc);
create index if not exists support_tickets_raised_by_idx on public.support_tickets(raised_by);

-- ── the thread: messages, internal notes, and status/priority events ───────────────────────────
create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author      uuid references auth.users(id) on delete set null,
  author_name text,
  side        text not null check (side in ('user', 'support')),
  internal    boolean not null default false,  -- a note for Master control only
  event       text,                            -- null for a message; 'status:resolved', 'priority:high', 'access:on'… for an event
  body        text not null check (char_length(btrim(body)) between 1 and 5000),
  attachments text[] not null default '{}',    -- paths in the private `support` bucket
  created_at  timestamptz not null default clock_timestamp()
);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);
create index if not exists support_messages_author_idx on public.support_messages(author);

-- ── who reads what ───────────────────────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists support_tickets_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets for select to authenticated using (
  (select public.is_platform_admin())
  or (restaurant_id = (select public.auth_restaurant_id())
      and (raised_by = (select auth.uid()) or (select public.auth_role())::text in ('owner', 'manager'))));
-- a message is readable where its request is (the request's own policy applies inside), internal notes only by Master control
drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = support_messages.ticket_id)
  and (not internal or (select public.is_platform_admin())));
revoke insert, update, delete, truncate, trigger, references on public.support_tickets, public.support_messages from public, anon, authenticated;

-- ── screenshots: a private bucket, one folder per request (<property>/<request>/<file>) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- write and read only into the folder of a request the caller can see (its policy applies inside); no update, no delete
drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'support'
  and exists (select 1 from public.support_tickets t
               where t.restaurant_id::text = (storage.foldername(name))[1] and t.id::text = (storage.foldername(name))[2]));
drop policy if exists support_files_read on storage.objects;
create policy support_files_read on storage.objects for select to authenticated using (
  bucket_id = 'support'
  and exists (select 1 from public.support_tickets t
               where t.restaurant_id::text = (storage.foldername(name))[1] and t.id::text = (storage.foldername(name))[2]));

-- ── internal: the caller as the thread records them ─────────────────────────────────────────
create or replace function public._support_who(out name text, out role text)
  language sql stable security definer
  set search_path = public
as $$
  select coalesce((select p.full_name from profiles p where p.id = auth.uid()), case when is_platform_admin() then 'DineFlow support' end),
         coalesce((select p.role::text from profiles p where p.id = auth.uid()), case when is_platform_admin() then 'master' end)
$$;
revoke all on function public._support_who() from public, anon, authenticated;

-- may this caller act on this request from the property side? (raised it, or owner/manager of it)
create or replace function public._support_mine(p_ticket uuid) returns public.support_tickets
  language plpgsql stable security definer
  set search_path = public
as $$
declare t support_tickets%rowtype;
begin
  select * into t from support_tickets where id = p_ticket;
  if not found or t.restaurant_id is distinct from auth_restaurant_id()
     or not (t.raised_by = auth.uid() or auth_role()::text in ('owner', 'manager')) then
    raise exception 'That request is not one you can see.' using errcode = '42501';
  end if;
  return t;
end $$;
revoke all on function public._support_mine(uuid) from public, anon, authenticated;

-- ── the property side ──────────────────────────────────────────────────────────────────────
-- raise a request: the first message is the details; returns its id, number and the message's id
create or replace function public.support_open(p_kind text, p_subject text, p_body text, p_priority text default 'normal',
  p_allow_access boolean default false, p_context jsonb default '{}'::jsonb, p_topic text default null)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare rid uuid := auth_restaurant_id(); uid uuid := auth.uid(); who record; t support_tickets%rowtype; mid uuid; recent int; ctx jsonb;
begin
  if uid is null or rid is null then raise exception 'Sign in to a property to raise a request.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('complaint', 'problem', 'question', 'idea', 'billing', 'privacy') then raise exception 'Choose what the request is about.'; end if;
  if coalesce(p_priority, 'normal') not in ('low', 'normal', 'high', 'urgent') then raise exception 'Choose how urgent it is.'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) < 3 then raise exception 'Give it a short subject (three characters or more).'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 10 then raise exception 'Tell us a little more — ten characters or more.'; end if;
  select count(*) into recent from support_tickets where raised_by = uid and created_at > clock_timestamp() - interval '1 hour';
  if recent >= 10 then raise exception 'That is ten requests in the last hour. Add to one you have already raised, or try again a little later.'; end if;
  -- what the app knew, kept small: no more than 4 KB of it
  ctx := case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) <= 4096 then p_context else '{}'::jsonb end;
  select * into who from _support_who();
  insert into support_tickets(restaurant_id, raised_by, raised_name, raised_role, kind, topic, priority, subject, allow_access, context, due_by)
  values (rid, uid, who.name, who.role, p_kind, case when p_kind = 'privacy' then coalesce(p_topic, 'other') end, coalesce(p_priority, 'normal'),
          left(btrim(p_subject), 140), coalesce(p_allow_access, false), ctx, case when p_kind = 'privacy' then clock_timestamp() + interval '15 days' end)
  returning * into t;
  insert into support_messages(ticket_id, author, author_name, side, body)
  values (t.id, uid, who.name, 'user', left(btrim(p_body), 5000)) returning id into mid;
  return jsonb_build_object('id', t.id, 'no', t.ticket_no, 'restaurant_id', t.restaurant_id, 'message_id', mid);
end $$;

-- answer on a request; a reply on a resolved or waiting one opens it again
create or replace function public.support_reply(p_ticket uuid, p_body text)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype := _support_mine(p_ticket); who record; mid uuid;
begin
  if t.status = 'closed' then raise exception 'This request is closed. Raise a new one and mention #%.', t.ticket_no; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Write something first.'; end if;
  select * into who from _support_who();
  insert into support_messages(ticket_id, author, author_name, side, body) values (t.id, auth.uid(), who.name, 'user', left(btrim(p_body), 5000)) returning id into mid;
  update support_tickets set last_message_at = clock_timestamp(), last_message_side = 'user', updated_at = clock_timestamp(),
    user_seen_at = case when raised_by = auth.uid() then clock_timestamp() else user_seen_at end,
    status = case when status in ('waiting', 'resolved') then 'open' else status end,
    resolved_at = case when status = 'resolved' then null else resolved_at end
  where id = t.id;
  return jsonb_build_object('message_id', mid);
end $$;

-- the screenshots of a message, once its files are up: only the author's own message, only files in its request's folder
create or replace function public.support_attach(p_message uuid, p_paths text[])
returns void language plpgsql security definer
set search_path = public
as $$
declare m support_messages%rowtype; t support_tickets%rowtype; p text; prefix text; keep text[] := '{}';
begin
  select * into m from support_messages where id = p_message;
  if not found or m.author is distinct from auth.uid() then raise exception 'That message is not yours.' using errcode = '42501'; end if;
  select * into t from support_tickets where id = m.ticket_id;
  if coalesce(array_length(p_paths, 1), 0) > 3 then raise exception 'Up to three pictures per message.'; end if;
  prefix := t.restaurant_id::text || '/' || t.id::text || '/';
  foreach p in array coalesce(p_paths, '{}') loop
    if left(p, char_length(prefix)) <> prefix or position('..' in p) > 0 or position('/' in substr(p, char_length(prefix) + 1)) > 0 then
      raise exception 'That file does not belong to this request.';
    end if;
    if exists (select 1 from storage.objects o where o.bucket_id = 'support' and o.name = p) then keep := keep || p; end if;
  end loop;
  update support_messages set attachments = keep where id = m.id and attachments = '{}';
end $$;

-- "this is sorted" / "reopen", from the property side
create or replace function public.support_set_status(p_ticket uuid, p_status text)
returns void language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype := _support_mine(p_ticket); who record;
begin
  if p_status not in ('resolved', 'open') then raise exception 'You can mark a request sorted, or open it again.'; end if;
  if t.status = 'closed' then raise exception 'This request is closed. Raise a new one and mention #%.', t.ticket_no; end if;
  if t.status = p_status or (p_status = 'open' and t.status <> 'resolved') then return; end if;
  select * into who from _support_who();
  update support_tickets set status = p_status, updated_at = clock_timestamp(), resolved_at = case when p_status = 'resolved' then clock_timestamp() end
  where id = t.id;
  insert into support_messages(ticket_id, author, author_name, side, event, body)
  values (t.id, auth.uid(), who.name, 'user', 'status:' || p_status, case when p_status = 'resolved' then 'Marked as sorted' else 'Opened again' end);
end $$;

-- may DineFlow open the property to look into it — the person's consent, changeable at any time
create or replace function public.support_set_access(p_ticket uuid, p_allow boolean)
returns void language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype := _support_mine(p_ticket); who record;
begin
  if t.allow_access = coalesce(p_allow, false) then return; end if;
  select * into who from _support_who();
  update support_tickets set allow_access = coalesce(p_allow, false), updated_at = clock_timestamp() where id = t.id;
  insert into support_messages(ticket_id, author, author_name, side, event, body)
  values (t.id, auth.uid(), who.name, 'user', case when p_allow then 'access:on' else 'access:off' end,
          case when p_allow then 'Allowed DineFlow to open the property for this request' else 'Took back DineFlow''s access for this request' end);
end $$;

-- how the help was: by the person who raised it, once it is resolved or closed
create or replace function public.support_rate(p_ticket uuid, p_rating int, p_note text default null)
returns void language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype := _support_mine(p_ticket);
begin
  if t.raised_by is distinct from auth.uid() then raise exception 'Only the person who raised it can rate the help.' using errcode = '42501'; end if;
  if t.status not in ('resolved', 'closed') then raise exception 'You can rate it once it is sorted.'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose one to five stars.'; end if;
  update support_tickets set rating = p_rating, rating_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), updated_at = clock_timestamp() where id = t.id;
end $$;

-- the person who raised it has read the replies
create or replace function public.support_seen(p_ticket uuid)
returns void language sql security definer
set search_path = public
as $$
  update support_tickets set user_seen_at = clock_timestamp()
  where id = p_ticket and raised_by = auth.uid() and restaurant_id = auth_restaurant_id()
$$;

-- replies from DineFlow this person has not read yet: the badge on Help & support
create or replace function public.support_unread()
returns int language sql stable security definer
set search_path = public
as $$
  select count(*)::int from support_tickets
  where raised_by = auth.uid() and restaurant_id = auth_restaurant_id()
    and last_message_side = 'support' and last_message_at > user_seen_at
$$;

revoke all on function public.support_open(text, text, text, text, boolean, jsonb, text) from public, anon;
revoke all on function public.support_reply(uuid, text) from public, anon;
revoke all on function public.support_attach(uuid, text[]) from public, anon;
revoke all on function public.support_set_status(uuid, text) from public, anon;
revoke all on function public.support_set_access(uuid, boolean) from public, anon;
revoke all on function public.support_rate(uuid, int, text) from public, anon;
revoke all on function public.support_seen(uuid) from public, anon;
revoke all on function public.support_unread() from public, anon;
grant execute on function public.support_open(text, text, text, text, boolean, jsonb, text), public.support_reply(uuid, text),
  public.support_attach(uuid, text[]), public.support_set_status(uuid, text), public.support_set_access(uuid, boolean),
  public.support_rate(uuid, int, text), public.support_seen(uuid), public.support_unread() to authenticated;

-- ── Master control ─────────────────────────────────────────────────────────────────────────
-- every request, newest activity first, with its property and the person who raised it
create or replace function public.admin_support_list(p_limit int default 500)
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x) order by x.last_message_at desc) from (
    select t.id, t.ticket_no, t.kind, t.topic, t.priority, t.status, t.subject, t.allow_access, t.due_by, t.rating,
           t.last_message_at, t.last_message_side, t.support_seen_at, t.first_response_at, t.resolved_at, t.created_at,
           t.raised_name, t.raised_role, r.id as restaurant_id, r.name as property, r.property_type,
           (t.last_message_side = 'user' and t.last_message_at > coalesce(t.support_seen_at, '-infinity'::timestamptz)) as unread,
           (select count(*) from support_messages m where m.ticket_id = t.id and m.event is null and not m.internal)::int as messages,
           (select left(m.body, 160) from support_messages m where m.ticket_id = t.id and m.event is null order by m.created_at limit 1) as first_line
    from support_tickets t join restaurants r on r.id = t.restaurant_id
    order by t.last_message_at desc limit greatest(1, least(coalesce(p_limit, 500), 2000))) x), '[]'::jsonb);
end $$;

-- one request in full: the property, the person (with how to reach them), every message and note
create or replace function public.admin_support_ticket(p_ticket uuid)
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare t support_tickets%rowtype; out jsonb;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket;
  if not found then return null; end if;
  select jsonb_build_object(
    'ticket', to_jsonb(t),
    'property', (select jsonb_build_object('id', r.id, 'name', r.name, 'type', r.property_type, 'phone', r.phone, 'district', r.district, 'pincode', r.pincode) from restaurants r where r.id = t.restaurant_id),
    'person', (select jsonb_build_object('name', coalesce(p.full_name, t.raised_name), 'role', coalesce(p.role::text, t.raised_role), 'email', coalesce(p.contact_email, p.email, u.email), 'phone', coalesce(p.phone, u.phone), 'active', p.is_active)
               from auth.users u left join profiles p on p.id = u.id where u.id = t.raised_by),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'side', m.side, 'internal', m.internal, 'event', m.event, 'body', m.body,
                  'author_name', m.author_name, 'attachments', m.attachments, 'created_at', m.created_at) order by m.created_at)
                from support_messages m where m.ticket_id = t.id), '[]'::jsonb),
    'others', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'no', o.ticket_no, 'subject', o.subject, 'status', o.status, 'created_at', o.created_at) order by o.created_at desc)
                from (select * from support_tickets o where o.restaurant_id = t.restaurant_id and o.id <> t.id order by o.created_at desc limit 5) o), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- a reply to the customer, or an internal note; a reply can move the status in the same step
create or replace function public.admin_support_reply(p_ticket uuid, p_body text, p_internal boolean default false, p_status text default null)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype; mid uuid; next_status text;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket;
  if not found then raise exception 'No such request.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Write something first.'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting', 'resolved', 'closed') then raise exception 'Unknown status: %', p_status; end if;
  insert into support_messages(ticket_id, author, author_name, side, internal, body)
  values (t.id, auth.uid(), 'DineFlow support', 'support', coalesce(p_internal, false), left(btrim(p_body), 5000)) returning id into mid;
  next_status := coalesce(p_status, t.status);
  if coalesce(p_internal, false) then
    update support_tickets set updated_at = clock_timestamp(), support_seen_at = clock_timestamp(), status = next_status,
      resolved_at = case when next_status = 'resolved' and t.status <> 'resolved' then clock_timestamp() when next_status not in ('resolved', 'closed') then null else resolved_at end
    where id = t.id;
  else
    update support_tickets set last_message_at = clock_timestamp(), last_message_side = 'support', support_seen_at = clock_timestamp(), updated_at = clock_timestamp(),
      first_response_at = coalesce(first_response_at, clock_timestamp()), status = next_status,
      resolved_at = case when next_status = 'resolved' and t.status <> 'resolved' then clock_timestamp() when next_status not in ('resolved', 'closed') then null else resolved_at end
    where id = t.id;
  end if;
  if next_status <> t.status then
    insert into support_messages(ticket_id, author, author_name, side, event, body)
    values (t.id, auth.uid(), 'DineFlow support', 'support', 'status:' || next_status, 'Status: ' || replace(next_status, '_', ' '));
  end if;
  insert into admin_log(actor, action, target, meta) values (auth.uid(), case when coalesce(p_internal, false) then 'support_note' else 'support_reply' end, t.restaurant_id, jsonb_build_object('ticket', t.ticket_no));
  return jsonb_build_object('message_id', mid);
end $$;

-- status and priority on their own
create or replace function public.admin_support_set(p_ticket uuid, p_status text default null, p_priority text default null)
returns void language plpgsql security definer
set search_path = public
as $$
declare t support_tickets%rowtype;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket;
  if not found then raise exception 'No such request.'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting', 'resolved', 'closed') then raise exception 'Unknown status: %', p_status; end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'Unknown priority: %', p_priority; end if;
  if p_status is not null and p_status <> t.status then
    update support_tickets set status = p_status, updated_at = clock_timestamp(), support_seen_at = clock_timestamp(),
      resolved_at = case when p_status = 'resolved' then clock_timestamp() when p_status = 'closed' then coalesce(resolved_at, clock_timestamp()) else null end
    where id = t.id;
    insert into support_messages(ticket_id, author, author_name, side, event, body)
    values (t.id, auth.uid(), 'DineFlow support', 'support', 'status:' || p_status, 'Status: ' || replace(p_status, '_', ' '));
  end if;
  if p_priority is not null and p_priority <> t.priority then
    update support_tickets set priority = p_priority, updated_at = clock_timestamp() where id = t.id;
    insert into support_messages(ticket_id, author, author_name, side, internal, event, body)
    values (t.id, auth.uid(), 'DineFlow support', 'support', true, 'priority:' || p_priority, 'Priority: ' || p_priority);
  end if;
end $$;

-- Master control has read the latest from the property
create or replace function public.admin_support_seen(p_ticket uuid)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  update support_tickets set support_seen_at = clock_timestamp() where id = p_ticket;
end $$;

-- the Support tab's badge: requests whose latest word is the property's and is unread
create or replace function public.admin_support_badge()
returns int language sql stable security definer
set search_path = public
as $$
  select case when is_platform_admin() then (
    select count(*)::int from support_tickets
    where status not in ('resolved', 'closed') and last_message_side = 'user' and last_message_at > coalesce(support_seen_at, '-infinity'::timestamptz))
  else 0 end
$$;

revoke all on function public.admin_support_list(int) from public, anon;
revoke all on function public.admin_support_ticket(uuid) from public, anon;
revoke all on function public.admin_support_reply(uuid, text, boolean, text) from public, anon;
revoke all on function public.admin_support_set(uuid, text, text) from public, anon;
revoke all on function public.admin_support_seen(uuid) from public, anon;
revoke all on function public.admin_support_badge() from public, anon;
grant execute on function public.admin_support_list(int), public.admin_support_ticket(uuid), public.admin_support_reply(uuid, text, boolean, text),
  public.admin_support_set(uuid, text, text), public.admin_support_seen(uuid), public.admin_support_badge() to authenticated;
