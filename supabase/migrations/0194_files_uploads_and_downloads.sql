-- 0194 — Every upload is a folder in the File Manager, and every download is kept in one (2026-11-23, the owner: "all
-- images, the uploaded images, must all be in the File Manager as folders, and downloaded files must be saved in folders").
--
-- Until now the File Manager showed only what was put into it by hand. A dish photo went to the `menu` bucket, the logo to
-- `brand`, the website's photos, film and 3D file to `site`, a tax document to `compliance`, a punch photo to `attendance`,
-- a help request's screenshot to `support` — six places, none of them visible in /files; and a report, a payroll sheet or
-- a GST file handed to the browser was kept nowhere.
--
--   file_nodes.bucket                which bucket the file's object is in: 'files' (the File Manager's own) or one of the six
--   files_sync_uploads()             the property's locked **Uploads** folder, one locked folder per kind of upload, and a
--                                    locked row for each object the property has in those buckets (a day folder per day of
--                                    punch photos); rows whose object has gone are removed. Nothing is copied: the row
--                                    points at the object where it already is, so the File Manager can open and download
--                                    it but not rename, move or delete it — that stays with the screen that owns it.
--   files_keep_download(…)           **Downloads** (locked, made once) → a folder for the section → the file, through
--                                    files_put (same name = replaced; counts toward the 500 MB)
--   files_list, files_put            0192's bodies; the size and the cap now count only the File Manager's own files —
--                                    a property's dish photos do not use up its 500 MB
--   _files_json                      + bucket
--
-- Additive. No policy changes: each bucket's own select policy already lets the property read its objects, and the owner
-- and managers are the only people who reach the File Manager (_files_space).

alter table public.file_nodes add column if not exists bucket text not null default 'files';
comment on column public.file_nodes.bucket is 'The storage bucket the object is in. files = the File Manager''s own; any other = an upload made elsewhere in the app, shown here (0194).';
create unique index if not exists file_nodes_upload_idx on public.file_nodes (restaurant_id, bucket, object_path) where bucket <> 'files';

create or replace function public._files_json(n public.file_nodes) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', n.id, 'parent_id', n.parent_id, 'kind', n.kind, 'name', n.name, 'bytes', n.bytes, 'mime', n.mime,
                            'locked', n.locked, 'object_path', n.object_path, 'bucket', n.bucket, 'created_at', n.created_at, 'updated_at', n.updated_at);
$$;
revoke all on function public._files_json(public.file_nodes) from public, anon, authenticated;

-- ── files_list: 0192's body; used / cap count the File Manager's own files only ─────────────────────────────────────
create or replace function public.files_list(p_master boolean default false, p_parent uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); here file_nodes%rowtype;
begin
  if p_parent is not null then
    here := _files_node(p_parent, rid);
    if here.kind <> 'folder' then raise exception 'that is a file, not a folder'; end if;
  end if;
  return jsonb_build_object(
    'parent', p_parent,
    'path', (with recursive up as (
               select n.id, n.parent_id, n.name, 0 as depth from file_nodes n where n.id = p_parent and n.restaurant_id is not distinct from rid
               union all
               select n.id, n.parent_id, n.name, up.depth + 1 from file_nodes n join up on n.id = up.parent_id)
             select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by depth desc), '[]'::jsonb) from up),
    'items', (select coalesce(jsonb_agg(_files_json(n) || jsonb_build_object('children', (select count(*) from file_nodes c where c.parent_id = n.id))
                                        order by (n.kind = 'folder') desc, lower(n.name)), '[]'::jsonb)
                from file_nodes n where n.restaurant_id is not distinct from rid and n.parent_id is not distinct from p_parent),
    'used', (select coalesce(sum(bytes), 0) from file_nodes where restaurant_id is not distinct from rid and kind = 'file' and bucket = 'files'),
    'files', (select count(*) from file_nodes where restaurant_id is not distinct from rid and kind = 'file'),
    'folders', (select count(*) from file_nodes where restaurant_id is not distinct from rid and kind = 'folder'),
    'cap', case when rid is null then null else 524288000 end,
    'space', case when rid is null then 'master' else rid::text end);
end $$;
revoke all on function public.files_list(boolean, uuid) from public, anon;
grant execute on function public.files_list(boolean, uuid) to authenticated;

-- ── files_put: 0192's body; the 500 MB counts the File Manager's own files only ─────────────────────────────────────
create or replace function public.files_put(p_master boolean, p_parent uuid, p_name text, p_object_path text, p_bytes bigint, p_mime text default null, p_replace uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); n file_nodes%rowtype; old file_nodes%rowtype; nm text := _files_name(p_name);
        top text := case when rid is null then 'master' else rid::text end; used bigint; old_path text := null;
begin
  if p_object_path is null or p_object_path !~ ('^' || top || '/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$') then raise exception 'that file is not in this space'; end if;
  if p_bytes is null or p_bytes < 0 or p_bytes > 52428800 then raise exception 'a file is 50 MB at most'; end if;
  if p_parent is not null and (_files_node(p_parent, rid)).kind <> 'folder' then raise exception 'a file can only go inside a folder'; end if;
  if p_replace is not null then
    old := _files_node(p_replace, rid);
    if old.kind <> 'file' then raise exception 'only a file can be replaced'; end if;
  else
    select * into old from file_nodes where restaurant_id is not distinct from rid and parent_id is not distinct from p_parent and lower(name) = lower(nm);
    if found and old.kind <> 'file' then raise exception 'there is already a folder called "%" here', nm; end if;
  end if;
  if old.id is not null and old.locked then raise exception 'that file is kept by DineFlow and cannot be replaced'; end if;
  select coalesce(sum(bytes), 0) into used from file_nodes where restaurant_id is not distinct from rid and kind = 'file' and bucket = 'files' and id is distinct from old.id;
  if rid is not null and used + p_bytes > 524288000 then raise exception 'the File Manager holds 500 MB — remove something first'; end if;
  if old.id is not null then
    old_path := old.object_path;
    update file_nodes set object_path = p_object_path, bytes = p_bytes, mime = p_mime, updated_at = now(),
           name = case when p_replace is not null then old.name else nm end where id = old.id returning * into n;
  else
    insert into file_nodes(restaurant_id, parent_id, kind, name, object_path, bytes, mime, created_by)
      values (rid, p_parent, 'file', nm, p_object_path, p_bytes, p_mime, auth.uid()) returning * into n;
  end if;
  return jsonb_build_object('node', _files_json(n), 'old_path', case when old_path is distinct from p_object_path then old_path end);
end $$;
revoke all on function public.files_put(boolean, uuid, text, text, bigint, text, uuid) from public, anon;
grant execute on function public.files_put(boolean, uuid, text, text, bigint, text, uuid) to authenticated;

-- ── Uploads: what the property has put anywhere in the app, as folders ──────────────────────────────────────────────
/** A locked folder of that name under p_parent in this property's space, made if it is not there. */
create or replace function public._files_kept_folder(p_rid uuid, p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  select id into f from file_nodes where restaurant_id is not distinct from p_rid and parent_id is not distinct from p_parent and lower(name) = lower(p_name) and kind = 'folder';
  if f is null then
    insert into file_nodes(restaurant_id, parent_id, kind, name, locked, created_by) values (p_rid, p_parent, 'folder', p_name, true, auth.uid()) returning id into f;
  else
    update file_nodes set locked = true where id = f and not locked;
  end if;
  return f;
end $$;
revoke all on function public._files_kept_folder(uuid, uuid, text) from public, anon, authenticated;

/** Bring the property's Uploads folder up to date with the six upload buckets. The owner or a manager, their own
 *  property only. Answers how many rows were added and removed. */
create or replace function public.files_sync_uploads() returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare rid uuid := _files_space(false); root uuid; sub uuid; b record; added int := 0; gone int := 0; n int;
begin
  if rid is null then raise exception 'sign in to a property first' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('files-sync:' || rid::text, 0));
  root := _files_kept_folder(rid, null, 'Uploads');
  for b in select * from (values ('menu', 'Menu photos'), ('brand', 'Logo'), ('site', 'Website'), ('compliance', 'Tax documents'),
                                 ('attendance', 'Attendance photos'), ('support', 'Help requests')) v(bucket, label) loop
    sub := _files_kept_folder(rid, root, b.label);
    -- rows whose object has left its bucket
    delete from file_nodes f where f.restaurant_id = rid and f.bucket = b.bucket and f.kind = 'file'
       and not exists (select 1 from storage.objects o where o.bucket_id = b.bucket and o.name = f.object_path);
    get diagnostics n = row_count; gone := gone + n;
    if b.bucket = 'attendance' then
      -- <property>/<day>/<person>-<time>.jpg: a folder for each day
      insert into file_nodes(restaurant_id, parent_id, kind, name, locked)
        select distinct rid, sub, 'folder', (storage.foldername(o.name))[2], true
          from storage.objects o
         where o.bucket_id = b.bucket and (storage.foldername(o.name))[1] = rid::text and array_length(storage.foldername(o.name), 1) = 2
           and (storage.foldername(o.name))[2] ~ '^[A-Za-z0-9._ -]{1,60}$'
        on conflict do nothing;
      insert into file_nodes(restaurant_id, parent_id, kind, name, object_path, bucket, bytes, mime, locked, created_at, updated_at)
        select rid, d.id, 'file', left(storage.filename(o.name), 120), o.name, b.bucket, coalesce((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype', true,
               coalesce(o.created_at, now()), coalesce(o.updated_at, o.created_at, now())
          from storage.objects o
          join file_nodes d on d.restaurant_id = rid and d.parent_id = sub and d.kind = 'folder' and lower(d.name) = lower((storage.foldername(o.name))[2])
         where o.bucket_id = b.bucket and (storage.foldername(o.name))[1] = rid::text and array_length(storage.foldername(o.name), 1) = 2
           and storage.filename(o.name) ~ '^[^/\\[:cntrl:]]+$' and storage.filename(o.name) <> '.emptyFolderPlaceholder'
           and not exists (select 1 from file_nodes f where f.restaurant_id = rid and f.bucket = b.bucket and f.object_path = o.name)
        on conflict do nothing;
      get diagnostics n = row_count; added := added + n;
      -- a day with no photos left
      delete from file_nodes f where f.restaurant_id = rid and f.parent_id = sub and f.kind = 'folder'
         and not exists (select 1 from file_nodes c where c.parent_id = f.id);
    else
      -- <property>/<file>, or <property>/<group>/<file>: the group's first letters go into the name so two files of one
      -- name (two documents called licence.pdf, two requests' 1.jpg) stay apart
      insert into file_nodes(restaurant_id, parent_id, kind, name, object_path, bucket, bytes, mime, locked, created_at, updated_at)
        select rid, sub, 'file',
               left(case when array_length(storage.foldername(o.name), 1) >= 2
                         then regexp_replace(storage.filename(o.name), '(\.[A-Za-z0-9]{1,8})?$', ' · ' || left((storage.foldername(o.name))[2], 8) || '\1')
                         else storage.filename(o.name) end, 120),
               o.name, b.bucket, coalesce((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype', true,
               coalesce(o.created_at, now()), coalesce(o.updated_at, o.created_at, now())
          from storage.objects o
         where o.bucket_id = b.bucket and (storage.foldername(o.name))[1] = rid::text
           and storage.filename(o.name) ~ '^[^/\\[:cntrl:]]+$' and storage.filename(o.name) <> '.emptyFolderPlaceholder'
           and not exists (select 1 from file_nodes f where f.restaurant_id = rid and f.bucket = b.bucket and f.object_path = o.name)
        on conflict do nothing;
      get diagnostics n = row_count; added := added + n;
    end if;
  end loop;
  return jsonb_build_object('folder', root, 'added', added, 'removed', gone);
end $$;
revoke all on function public.files_sync_uploads() from public, anon;
grant execute on function public.files_sync_uploads() to authenticated;

-- ── Downloads: a copy of what the app handed the browser ────────────────────────────────────────────────────────────
/** Downloads (locked, made once) → a folder named for the section → the file. The file was sent to this space's top
 *  folder of the bucket first, like any upload; files_put does the checks (the space, 50 MB, 500 MB, same name = replaced). */
create or replace function public.files_keep_download(p_master boolean, p_section text, p_name text, p_object_path text, p_bytes bigint, p_mime text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); root uuid; sub uuid; sec text := _files_name(left(coalesce(nullif(btrim(p_section), ''), 'Other'), 60));
begin
  perform pg_advisory_xact_lock(hashtextextended('files-dl:' || coalesce(rid::text, 'master'), 0));
  root := _files_kept_folder(rid, null, 'Downloads');
  select id into sub from file_nodes where restaurant_id is not distinct from rid and parent_id = root and lower(name) = lower(sec);
  if sub is null then
    insert into file_nodes(restaurant_id, parent_id, kind, name, created_by) values (rid, root, 'folder', sec, auth.uid()) returning id into sub;
  elsif (select kind from file_nodes where id = sub) <> 'folder' then
    sub := root;                                                              -- a file took the section's name: keep it in Downloads itself
  end if;
  return files_put(p_master, sub, p_name, p_object_path, p_bytes, p_mime, null) || jsonb_build_object('folder', sub);
end $$;
revoke all on function public.files_keep_download(boolean, text, text, text, bigint, text) from public, anon;
grant execute on function public.files_keep_download(boolean, text, text, text, bigint, text) to authenticated;

notify pgrst, 'reload schema';
