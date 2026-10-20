-- 0129 · App files by link (2026-10-20)
--
-- Supabase's Free plan caps every Storage upload at 50 MB, and the Windows installer is ~78 MB. The owner chose to
-- keep that file on Cloudflare R2 (free storage, free downloads) and paste its public link into Master control →
-- App files. So a release is now either an upload in the `app-files` bucket (0128: file_path) or a link
-- (external_url) — exactly one of the two. The install screens hand out whichever is current.

alter table public.app_releases add column if not exists external_url text
  check (external_url is null or (external_url ~ '^https://[^\s]+$' and length(external_url) <= 500));
alter table public.app_releases alter column file_path drop not null;
alter table public.app_releases alter column size_bytes drop not null;   -- a link may not say how big it is
alter table public.app_releases drop constraint if exists app_releases_file_or_link;
alter table public.app_releases add constraint app_releases_file_or_link
  check ((file_path is null) <> (external_url is null));

/** Hand out a file kept elsewhere (Cloudflare R2, a GitHub release…) by its public https link. Master control only. */
create or replace function public.app_release_publish_link(p_platform text, p_version text, p_url text,
  p_file_name text default null, p_size_bytes bigint default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; u text := trim(coalesce(p_url, '')); path text; fname text;
begin
  if not is_master() then raise exception 'only Master control can publish app files' using errcode = '42501'; end if;
  if p_platform not in ('android', 'windows') then raise exception 'unknown platform'; end if;
  if coalesce(p_version, '') !~ '^[0-9]+(\.[0-9]+){1,3}$' then raise exception 'a version looks like 1.2.0'; end if;
  if u !~ '^https://[^\s/]+/[^\s]+$' or length(u) > 500 then raise exception 'the link must start with https:// and point at the file'; end if;
  path := split_part(split_part(u, '?', 1), '#', 1);
  if (p_platform = 'android' and path !~* '\.apk$') or (p_platform = 'windows' and path !~* '\.exe$') then
    raise exception 'an Android link ends in .apk and a Windows link in .exe'; end if;
  if p_size_bytes is not null and (p_size_bytes <= 0 or p_size_bytes > 2147483648) then raise exception 'that size does not look right'; end if;
  if exists (select 1 from app_releases where platform = p_platform and version = p_version) then
    raise exception 'version % is already published for %', p_version, p_platform; end if;
  fname := coalesce(nullif(trim(p_file_name), ''), regexp_replace(path, '^.*/', ''));
  fname := left(fname, 120);
  update app_releases set is_current = false where platform = p_platform and is_current;
  insert into app_releases (platform, version, file_path, external_url, file_name, size_bytes, notes, uploaded_by, is_current)
  values (p_platform, p_version, null, u, fname, p_size_bytes, nullif(trim(p_notes), ''), auth.uid(), true)
  returning id into rid;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'app_release_publish_link', rid,
    jsonb_build_object('platform', p_platform, 'version', p_version, 'url', u));
  return rid;
end $$;
revoke all on function public.app_release_publish_link(text, text, text, text, bigint, text) from public, anon;
grant execute on function public.app_release_publish_link(text, text, text, text, bigint, text) to authenticated;
-- app_release_publish (uploads) and app_release_make_current (roll-back, by id) work for both kinds unchanged.
