-- 0124 · Feedback & complaints — staff speak to the owner (2026-10-20)
--
-- The owner: "Help & support only for the owner; for the manager and the other staff, a feedback or complaints section
-- where they tell the owner, and get updates." Help & support (0096) is the property talking to DineFlow; this is the
-- staff talking to their own owner — a complaint, feedback, an idea, or thanks — and the owner answering.
--
--  1. staff_voice — one item: kind, an optional topic, subject, message, status (new → seen → in_progress → resolved),
--     and the times of the last word on each side (staff_at, owner_at) and when each side last looked (owner_seen_at,
--     author_seen_at) — so each side has an unread count. An item sent **without the name** carries no author_id, no
--     author_name, no author_role: the owner's rows simply do not have them.
--  2. staff_voice_authors — who sent which item, the only place an anonymous item's author is written. Its one read
--     policy is "your own rows" — the owner cannot read it — and staff_voice's read policy uses it to let an author see
--     their own items. So anonymity holds even for an owner who queries the tables directly.
--  3. staff_voice_replies — the thread: side ('owner' | 'staff'), the words, and the name (null for an anonymous author).
--  4. Who reads (RLS): the property's OWNER sees every item and reply; anyone else only their own. **Managers do not see
--     their staff's items** — a complaint may be about them. (A master standing in a property is its owner here.)
--  5. Writes go through definer RPCs that check the caller — voice_send (any active staff except the owner; ten a day),
--     voice_reply (the owner, or the author on their own item), voice_set_status (the owner), voice_seen (either side),
--     voice_unread (the caller's count). Nobody writes the tables directly.
--  6. The bell: staff_voice joins supabase_realtime — the owner hears a new item, the author hears the owner's answer.

create table if not exists public.staff_voice (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('complaint', 'feedback', 'suggestion', 'appreciation')),
  about text check (about is null or about in ('work', 'pay', 'colleague', 'customers', 'equipment', 'safety', 'other')),
  subject text not null check (length(subject) between 3 and 120),
  body text not null check (length(body) between 5 and 2000),
  anonymous boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,   -- null when sent without the name
  author_name text,
  author_role text,
  status text not null default 'new' check (status in ('new', 'seen', 'in_progress', 'resolved')),
  created_at timestamptz not null default clock_timestamp(),
  staff_at timestamptz not null default clock_timestamp(),            -- the author's last word
  owner_at timestamptz,                                               -- the owner's last answer or status change
  owner_seen_at timestamptz,
  author_seen_at timestamptz,
  resolved_at timestamptz
);
create index if not exists staff_voice_restaurant on public.staff_voice (restaurant_id, staff_at desc);

create table if not exists public.staff_voice_authors (
  voice_id uuid primary key references public.staff_voice(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists staff_voice_authors_author on public.staff_voice_authors (author, created_at desc);

create table if not exists public.staff_voice_replies (
  id uuid primary key default gen_random_uuid(),
  voice_id uuid not null references public.staff_voice(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  side text not null check (side in ('owner', 'staff')),
  body text not null check (length(body) between 1 and 2000),
  by_name text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists staff_voice_replies_voice on public.staff_voice_replies (voice_id, created_at);

alter table public.staff_voice enable row level security;
alter table public.staff_voice_authors enable row level security;
alter table public.staff_voice_replies enable row level security;
revoke all on public.staff_voice, public.staff_voice_authors, public.staff_voice_replies from anon;
revoke insert, update, delete on public.staff_voice, public.staff_voice_authors, public.staff_voice_replies from authenticated;
grant select on public.staff_voice, public.staff_voice_authors, public.staff_voice_replies to authenticated;

drop policy if exists staff_voice_authors_own on public.staff_voice_authors;
create policy staff_voice_authors_own on public.staff_voice_authors for select to authenticated using (author = auth.uid());

drop policy if exists staff_voice_read on public.staff_voice;
create policy staff_voice_read on public.staff_voice for select to authenticated
  using (restaurant_id = auth_restaurant_id()
         and (auth_role()::text = 'owner' or exists (select 1 from staff_voice_authors a where a.voice_id = staff_voice.id and a.author = auth.uid())));

drop policy if exists staff_voice_replies_read on public.staff_voice_replies;
create policy staff_voice_replies_read on public.staff_voice_replies for select to authenticated
  using (restaurant_id = auth_restaurant_id() and exists (select 1 from staff_voice v where v.id = staff_voice_replies.voice_id));

/** Am I the author of this item? (The RPCs; RLS does the same through staff_voice_authors.) */
create or replace function public._voice_mine(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_voice_authors where voice_id = p_id and author = auth.uid())
$$;
revoke all on function public._voice_mine(uuid) from public, anon, authenticated;

/** Send an item to the owner. Any active member of the property's staff but the owner; ten a day. */
create or replace function public.voice_send(p_kind text, p_about text, p_subject text, p_body text, p_anonymous boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); me profiles; vid uuid; sent int; subj text := trim(coalesce(p_subject, '')); msg text := trim(coalesce(p_body, ''));
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into me from profiles where id = auth.uid();
  if me.id is null or not coalesce(me.is_active, true) then raise exception 'only the staff of this property can send feedback' using errcode = '42501'; end if;
  if me.role::text = 'owner' then raise exception 'the owner reads these — there is no one above you to send them to'; end if;
  if p_kind not in ('complaint', 'feedback', 'suggestion', 'appreciation') then raise exception 'choose what kind of message this is'; end if;
  if p_about is not null and p_about not in ('work', 'pay', 'colleague', 'customers', 'equipment', 'safety', 'other') then raise exception 'that is not a topic'; end if;
  if length(subj) < 3 or length(subj) > 120 then raise exception 'give it a short title (3 to 120 letters)'; end if;
  if length(msg) < 5 or length(msg) > 2000 then raise exception 'write a little more (5 to 2000 letters)'; end if;
  select count(*) into sent from staff_voice_authors a
   where a.author = auth.uid() and a.created_at >= ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  if sent >= 10 then raise exception 'ten a day is the most — send the rest tomorrow, or add to one you sent today'; end if;
  insert into staff_voice (restaurant_id, kind, about, subject, body, anonymous, author_id, author_name, author_role, author_seen_at)
  values (rid, p_kind, p_about, subj, msg, coalesce(p_anonymous, false),
          case when coalesce(p_anonymous, false) then null else me.id end,
          case when coalesce(p_anonymous, false) then null else me.full_name end,
          case when coalesce(p_anonymous, false) then null else me.role::text end,
          clock_timestamp())
  returning id into vid;
  insert into staff_voice_authors (voice_id, author) values (vid, auth.uid());
  return vid;
end $$;
revoke all on function public.voice_send(text, text, text, text, boolean) from public, anon;
grant execute on function public.voice_send(text, text, text, text, boolean) to authenticated;

/** Add to the thread: the owner answers any item of the property; an author answers on their own. */
create or replace function public.voice_reply(p_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); v staff_voice; msg text := trim(coalesce(p_body, '')); owner boolean; nm text; rep uuid;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into v from staff_voice where id = p_id and restaurant_id = rid for update;
  if v.id is null then raise exception 'that message is not here'; end if;
  owner := auth_role()::text = 'owner';
  if not owner and not _voice_mine(v.id) then raise exception 'only the owner or the person who sent it can answer' using errcode = '42501'; end if;
  if length(msg) < 1 or length(msg) > 2000 then raise exception 'write your answer (up to 2000 letters)'; end if;
  if owner then
    select coalesce(full_name, 'The owner') into nm from profiles where id = auth.uid();
    insert into staff_voice_replies (voice_id, restaurant_id, side, body, by_name) values (v.id, rid, 'owner', msg, coalesce(nm, 'The owner')) returning id into rep;
    update staff_voice set owner_at = clock_timestamp(), owner_seen_at = clock_timestamp(),
           status = case when status = 'new' then 'seen' else status end where id = v.id;
  else
    nm := case when v.anonymous then null else (select full_name from profiles where id = auth.uid()) end;
    insert into staff_voice_replies (voice_id, restaurant_id, side, body, by_name) values (v.id, rid, 'staff', msg, nm) returning id into rep;
    -- an answer on a resolved item opens it again
    update staff_voice set staff_at = clock_timestamp(), author_seen_at = clock_timestamp(),
           status = case when status = 'resolved' then 'seen' else status end,
           resolved_at = case when status = 'resolved' then null else resolved_at end where id = v.id;
  end if;
  return rep;
end $$;
revoke all on function public.voice_reply(uuid, text) from public, anon;
grant execute on function public.voice_reply(uuid, text) to authenticated;

/** The owner moves an item along: seen, working on it, resolved (or back to new). The author is told. */
create or replace function public.voice_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role()::text <> 'owner' then raise exception 'only the owner can change this' using errcode = '42501'; end if;
  if p_status not in ('new', 'seen', 'in_progress', 'resolved') then raise exception 'that is not a status'; end if;
  update staff_voice set status = p_status, owner_at = clock_timestamp(), owner_seen_at = clock_timestamp(),
         resolved_at = case when p_status = 'resolved' then clock_timestamp() else null end
   where id = p_id and restaurant_id = rid and status <> p_status;
  if not found and not exists (select 1 from staff_voice where id = p_id and restaurant_id = rid) then raise exception 'that message is not here'; end if;
end $$;
revoke all on function public.voice_set_status(uuid, text) from public, anon;
grant execute on function public.voice_set_status(uuid, text) to authenticated;

/** I have read it: the owner's look also moves a new item to seen; the author's clears their unread answer. */
create or replace function public.voice_seen(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id();
begin
  if rid is null then return; end if;
  if auth_role()::text = 'owner' then
    update staff_voice set owner_seen_at = clock_timestamp(), status = case when status = 'new' then 'seen' else status end,
           owner_at = case when status = 'new' then clock_timestamp() else owner_at end
     where id = p_id and restaurant_id = rid;
  elsif _voice_mine(p_id) then
    update staff_voice set author_seen_at = clock_timestamp() where id = p_id and restaurant_id = rid;
  end if;
end $$;
revoke all on function public.voice_seen(uuid) from public, anon;
grant execute on function public.voice_seen(uuid) to authenticated;

/** What is new for me: for the owner, items whose last word is the staff's and unread; for anyone else, their own items
 *  the owner has answered or moved since they last looked. */
create or replace function public.voice_unread() returns int
language sql stable security definer set search_path = public as $$
  select case when auth_role()::text = 'owner' then
    (select count(*)::int from staff_voice where restaurant_id = auth_restaurant_id() and staff_at > coalesce(owner_seen_at, '-infinity'))
  else
    (select count(*)::int from staff_voice v join staff_voice_authors a on a.voice_id = v.id
      where a.author = auth.uid() and v.restaurant_id = auth_restaurant_id() and v.owner_at is not null and v.owner_at > coalesce(v.author_seen_at, '-infinity'))
  end
$$;
revoke all on function public.voice_unread() from public, anon;
grant execute on function public.voice_unread() to authenticated;

do $$ begin alter publication supabase_realtime add table public.staff_voice; exception when others then null; end $$;
