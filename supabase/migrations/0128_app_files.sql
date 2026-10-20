-- 0128 · App files: the Android .apk and the Windows .exe, uploaded from Master control (2026-10-20)
--
-- The owner: "I need simple and easy options to update" the one-click app files. Until now a new file meant hosting
-- it somewhere, setting NEXT_PUBLIC_APK_URL / NEXT_PUBLIC_EXE_URL on Vercel and deploying. Now Master control →
-- App files takes the file, the browser sends it straight to this bucket, and the install screens offer it within
-- a minute — no env var, no deploy.
--
--  1. A public Storage bucket `app-files` (`android/DineFlow-1.0.1.apk`, `windows/DineFlow-Setup-1.1.0.exe`).
--     Public, because a new waiter downloads the app before they have an account. 100 MB a file, .apk / .exe
--     types only. Supabase's own project-wide "Upload file size limit" (Storage → Settings) caps this too: it is
--     50 MB by default and the Windows installer is ~78 MB, so the owner raises it once to 100 MB.
--  2. Only Master control writes there (`is_master()`, 0018: a row in platform_admins) — insert, update, delete.
--  3. `app_releases`: one row per upload; `is_current` marks the file the install screens hand out, one per
--     platform. Anyone may read the current rows (the install screens are public); earlier rows only Master
--     control. Rows change only through `app_release_publish` and `app_release_make_current`, which check the
--     caller is Master control themselves.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-files', 'app-files', true, 104857600, array[
  'application/vnd.android.package-archive', 'application/x-msdownload', 'application/octet-stream',
  'application/vnd.microsoft.portable-executable', 'application/x-msdos-program', 'application/x-dosexec'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists app_files_insert on storage.objects;
create policy app_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-files' and public.is_master()
    and (storage.foldername(name))[1] in ('android', 'windows'));

drop policy if exists app_files_update on storage.objects;
create policy app_files_update on storage.objects for update to authenticated
  using (bucket_id = 'app-files' and public.is_master())
  with check (bucket_id = 'app-files' and public.is_master() and (storage.foldername(name))[1] in ('android', 'windows'));

drop policy if exists app_files_delete on storage.objects;
create policy app_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-files' and public.is_master());

-- the files are served by the public bucket either way; listing the folders is Master control's
drop policy if exists app_files_select on storage.objects;
create policy app_files_select on storage.objects for select to authenticated
  using (bucket_id = 'app-files' and public.is_master());

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android', 'windows')),
  version text not null check (version ~ '^[0-9]+(\.[0-9]+){1,3}$'),
  file_path text not null check (file_path ~ '^(android|windows)/[A-Za-z0-9._-]{1,120}$'),
  file_name text not null check (length(file_name) between 1 and 120),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  notes text check (notes is null or length(notes) <= 500),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  is_current boolean not null default false,
  unique (platform, version)
);
create unique index if not exists app_releases_one_current on public.app_releases (platform) where is_current;
alter table public.app_releases enable row level security;

-- two policies, so a signed-out visitor never needs to call is_master() at all
drop policy if exists app_releases_read on public.app_releases;
drop policy if exists app_releases_read_anon on public.app_releases;
create policy app_releases_read_anon on public.app_releases for select to anon using (is_current);
create policy app_releases_read on public.app_releases for select to authenticated
  using (is_current or public.is_master());
revoke insert, update, delete on public.app_releases from anon, authenticated;
grant select on public.app_releases to anon, authenticated;

/** Record a file Master control has just put in the bucket, and make it the one handed out. */
create or replace function public.app_release_publish(p_platform text, p_version text, p_path text, p_name text,
  p_size bigint, p_notes text default null, p_sha256 text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not is_master() then raise exception 'only Master control can publish app files' using errcode = '42501'; end if;
  if p_platform not in ('android', 'windows') then raise exception 'unknown platform'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_platform then raise exception 'the file is in the wrong folder'; end if;
  if (p_platform = 'android' and p_name !~* '\.apk$') or (p_platform = 'windows' and p_name !~* '\.exe$') then
    raise exception 'an Android file ends in .apk and a Windows file in .exe'; end if;
  if exists (select 1 from app_releases where platform = p_platform and version = p_version) then
    raise exception 'version % is already uploaded for %', p_version, p_platform; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'app-files' and name = p_path) then
    raise exception 'the file is not in storage yet — upload it first'; end if;
  update app_releases set is_current = false where platform = p_platform and is_current;
  insert into app_releases (platform, version, file_path, file_name, size_bytes, sha256, notes, uploaded_by, is_current)
  values (p_platform, p_version, p_path, p_name, p_size, nullif(lower(p_sha256), ''), nullif(trim(p_notes), ''), auth.uid(), true)
  returning id into rid;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'app_release_publish', rid,
    jsonb_build_object('platform', p_platform, 'version', p_version, 'size', p_size));
  return rid;
end $$;
revoke all on function public.app_release_publish(text, text, text, text, bigint, text, text) from public, anon;
grant execute on function public.app_release_publish(text, text, text, text, bigint, text, text) to authenticated;

/** Hand out an earlier upload again (a roll-back). */
create or replace function public.app_release_make_current(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if not is_master() then raise exception 'only Master control can change app files' using errcode = '42501'; end if;
  select platform into p from app_releases where id = p_id;
  if p is null then raise exception 'no such upload'; end if;
  update app_releases set is_current = false where platform = p and is_current and id <> p_id;
  update app_releases set is_current = true where id = p_id;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'app_release_make_current', p_id, jsonb_build_object('platform', p));
end $$;
revoke all on function public.app_release_make_current(uuid) from public, anon;
grant execute on function public.app_release_make_current(uuid) to authenticated;
