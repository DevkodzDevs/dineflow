-- 0149 — The crashes the app showed, recorded (2026-10-29, the owner: Stage 2, item 12 — "error reporting"; the in-app log
-- rather than an outside service, so nothing waits on an account). When a screen falls to "This screen did not load"
-- (components/ErrorRecovery.tsx), the browser reports what broke: the kind (a crash, or a tab older than the deploy), the
-- page (ids folded to :id so one bug is one row), the error's name, message and digest, the browser. The same error on
-- the same page within a day adds to a count instead of a row. Master control → Testing lists them. A network drop is not
-- reported — it is not a bug, and it cannot be sent anyway.
--
-- Who can write: anyone, through report_client_error alone — a guest's page crashes too. It is limited: 30 reports an hour
-- per signed-in person (or for all guests together, per page), 2,000 an hour in all; the text is cut short. Who can read:
-- the master (is_master()). Rows older than 30 days are cleared as new ones come in.

create table if not exists client_errors (
  id bigserial primary key,
  fp text not null,                      -- md5 of kind, page, name, message, digest — the same error is the same row
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  count integer not null default 1,
  kind text not null check (kind in ('crash', 'stale')),
  path text not null,
  name text, message text, digest text, ua text,
  restaurant_id uuid references restaurants(id) on delete set null,
  user_id uuid
);
create index if not exists client_errors_fp_idx on client_errors(fp, last_at desc);
create index if not exists client_errors_last_idx on client_errors(last_at desc);
alter table client_errors enable row level security;
drop policy if exists client_errors_master_read on client_errors;
create policy client_errors_master_read on client_errors for select to authenticated using (public.is_master());
-- no insert / update / delete policy: report_client_error writes, nobody edits

create or replace function public.report_client_error(p_kind text, p_path text, p_name text default null, p_message text default null,
  p_digest text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k text := case when p_kind = 'stale' then 'stale' else 'crash' end;
  pth text := left(regexp_replace(regexp_replace(split_part(coalesce(p_path, '/'), '?', 1),
                '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'), '/[0-9a-f]{20,}', '/:token', 'gi'), 200);
  nm text := left(nullif(trim(coalesce(p_name, '')), ''), 80);
  msg text := left(nullif(trim(coalesce(p_message, '')), ''), 500);
  dg text := left(nullif(trim(coalesce(p_digest, '')), ''), 40);
  f text; who text := coalesce(auth.uid()::text, 'guest:' || pth);
begin
  -- a flood is cut off quietly: the page that reports never hears of it
  if not _hit('crash:' || who, 30, interval '1 hour') or not _hit('crash:all', 2000, interval '1 hour') then return; end if;
  f := md5(k || '|' || pth || '|' || coalesce(nm, '') || '|' || coalesce(left(msg, 200), '') || '|' || coalesce(dg, ''));
  update client_errors set count = count + 1, last_at = now(), ua = coalesce(left(p_ua, 200), ua)
   where id = (select id from client_errors where fp = f and last_at > now() - interval '1 day' order by last_at desc limit 1);
  if not found then
    insert into client_errors(fp, kind, path, name, message, digest, ua, restaurant_id, user_id)
      values (f, k, pth, nm, msg, dg, left(p_ua, 200), auth_restaurant_id(), auth.uid());
  end if;
  if random() < 0.02 then delete from client_errors where last_at < now() - interval '30 days'; end if;
end $$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
