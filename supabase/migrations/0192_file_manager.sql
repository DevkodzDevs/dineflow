-- 0192 — File Manager, and a property is backed up before it is deleted (2026-11-22, the owner: "when Master control deletes
-- a property, take a backup of its important data first, then delete it completely — carefully; put that backup in a folder
-- of a new File Manager in Master control, a real file-manager design: new folder, delete, rename, edit, folders inside
-- folders; and the File Manager in the owner's section too").
--
--   file_nodes                       a folder or a file in one of two kinds of space: Master control's own (restaurant_id null)
--                                    or a property's (owner and managers). Names are unique inside a folder, case blind.
--   storage bucket `files`           private, 50 MB a file, any kind; one top folder per space — master/… and <property id>/…;
--                                    written and read by that space's people only (the browser uploads on a signed address)
--   files_folders(master)            every folder of the space — the tree
--   files_list(master, parent)       a folder's path (the crumbs) and what is in it, with the space's size and its cap
--   files_mkdir / files_rename / files_move / files_put / files_delete
--                                    the writes; each checks the caller and that the node is in the caller's own space
--   files_keep_deleted_property(…)   Master control's locked "Deleted properties" folder gets a subfolder for the property
--                                    with its backup file and an about.md — called by the delete action after the export
--   default_features()               0185's body + 'files': the owner's File Manager is an add-on, on by default
--
-- A property's space holds 500 MB (file_nodes.bytes, counted here); Master control's has no cap. The browser never
-- writes file_nodes: a file is sent to the bucket on a signed address and then registered with files_put. Deleting
-- removes the rows and answers the object paths, which the server action removes from the bucket.

create table if not exists public.file_nodes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,      -- null = Master control's own space
  parent_id     uuid references public.file_nodes(id) on delete cascade,       -- null = the space's top
  kind          text not null check (kind in ('folder', 'file')),
  name          text not null check (length(name) between 1 and 120 and name !~ '[/\\]' and name !~ '[[:cntrl:]]' and name not in ('.', '..') and name = btrim(name)),
  object_path   text,                                                          -- a file: its object in the `files` bucket
  bytes         bigint not null default 0 check (bytes >= 0),
  mime          text,
  locked        boolean not null default false,                                -- kept by DineFlow: no rename, move or delete
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint file_nodes_file_has_object check (kind = 'folder' or object_path is not null),
  constraint file_nodes_folder_has_none check (kind = 'file' or (object_path is null and bytes = 0))
);
comment on table public.file_nodes is 'File Manager (0192): folders and files of Master control''s space (restaurant_id null) and of each property. Written only by the files_* functions.';
create unique index if not exists file_nodes_name_idx on public.file_nodes (
  coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists file_nodes_parent_idx on public.file_nodes (parent_id);
create index if not exists file_nodes_space_idx on public.file_nodes (restaurant_id);

alter table public.file_nodes enable row level security;
drop policy if exists file_nodes_read on public.file_nodes;
create policy file_nodes_read on public.file_nodes for select to authenticated
  using ((restaurant_id is null and is_master()) or (restaurant_id = auth_restaurant_id() and auth_role() in ('owner', 'manager')));
revoke all on public.file_nodes from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.file_nodes from authenticated;
grant select on public.file_nodes to authenticated;

-- ── the bucket ──────────────────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;
drop policy if exists files_select on storage.objects;
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (((storage.foldername(name))[1] = 'master' and public.is_master())
                                 or ((storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))));
drop policy if exists files_insert on storage.objects;
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (((storage.foldername(name))[1] = 'master' and public.is_master())
                                      or ((storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))));
drop policy if exists files_update on storage.objects;
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (((storage.foldername(name))[1] = 'master' and public.is_master())
                                 or ((storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))))
  with check (bucket_id = 'files' and (((storage.foldername(name))[1] = 'master' and public.is_master())
                                      or ((storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))));
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (((storage.foldername(name))[1] = 'master' and public.is_master())
                                 or ((storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))));

-- ── who, and whose space ────────────────────────────────────────────────────────────────────────────────────────────
/** The space the caller is working in: null for Master control's own (the master only), else the caller's property
 *  (its owner or a manager — a master acting for a property counts as its owner). Raises otherwise. */
create or replace function public._files_space(p_master boolean) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare rid uuid;
begin
  if coalesce(p_master, false) then
    if not is_master() then raise exception 'Master control only' using errcode = '42501'; end if;
    return null;
  end if;
  rid := auth_restaurant_id();
  if rid is null then raise exception 'sign in to a property first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager') then raise exception 'only the owner or a manager can use the File Manager' using errcode = '42501'; end if;
  return rid;
end $$;
revoke all on function public._files_space(boolean) from public, anon, authenticated;

/** A tidy name, or an exception that says what is wrong with it. */
create or replace function public._files_name(p text) returns text
language plpgsql immutable set search_path = public as $$
declare n text := btrim(coalesce(p, ''));
begin
  if n = '' then raise exception 'give it a name'; end if;
  if length(n) > 120 then raise exception 'that name is too long (120 letters at most)'; end if;
  if n ~ '[/\\]' or n ~ '[[:cntrl:]]' or n in ('.', '..') then raise exception 'a name cannot hold / or \ '; end if;
  return n;
end $$;
revoke all on function public._files_name(text) from public, anon, authenticated;

/** The node with that id in this space, else an exception. */
create or replace function public._files_node(p_id uuid, p_rid uuid) returns public.file_nodes
language plpgsql stable security definer set search_path = public as $$
declare n file_nodes%rowtype;
begin
  select * into n from file_nodes where id = p_id and restaurant_id is not distinct from p_rid;
  if not found then raise exception 'that folder or file is not here any more'; end if;
  return n;
end $$;
revoke all on function public._files_node(uuid, uuid) from public, anon, authenticated;

create or replace function public._files_json(n public.file_nodes) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', n.id, 'parent_id', n.parent_id, 'kind', n.kind, 'name', n.name, 'bytes', n.bytes, 'mime', n.mime,
                            'locked', n.locked, 'object_path', n.object_path, 'created_at', n.created_at, 'updated_at', n.updated_at);
$$;
revoke all on function public._files_json(public.file_nodes) from public, anon, authenticated;

-- ── reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Every folder of the space, for the tree. */
create or replace function public.files_folders(p_master boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'parent_id', n.parent_id, 'name', n.name, 'locked', n.locked) order by lower(n.name)), '[]'::jsonb)
    from file_nodes n where n.kind = 'folder' and n.restaurant_id is not distinct from _files_space(p_master);
$$;
revoke all on function public.files_folders(boolean) from public, anon;
grant execute on function public.files_folders(boolean) to authenticated;

/** A folder (null = the top): its crumbs, what is in it (folders first, then files, by name), and the space's size. */
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
    'used', (select coalesce(sum(bytes), 0) from file_nodes where restaurant_id is not distinct from rid and kind = 'file'),
    'files', (select count(*) from file_nodes where restaurant_id is not distinct from rid and kind = 'file'),
    'folders', (select count(*) from file_nodes where restaurant_id is not distinct from rid and kind = 'folder'),
    'cap', case when rid is null then null else 524288000 end,
    'space', case when rid is null then 'master' else rid::text end);
end $$;
revoke all on function public.files_list(boolean, uuid) from public, anon;
grant execute on function public.files_list(boolean, uuid) to authenticated;

-- ── writes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.files_mkdir(p_master boolean, p_parent uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); n file_nodes%rowtype; nm text := _files_name(p_name);
begin
  if p_parent is not null and (_files_node(p_parent, rid)).kind <> 'folder' then raise exception 'a folder can only go inside a folder'; end if;
  if exists (select 1 from file_nodes where restaurant_id is not distinct from rid and parent_id is not distinct from p_parent and lower(name) = lower(nm)) then
    raise exception 'there is already a folder or file called "%" here', nm;
  end if;
  insert into file_nodes(restaurant_id, parent_id, kind, name, created_by) values (rid, p_parent, 'folder', nm, auth.uid()) returning * into n;
  return _files_json(n);
end $$;
revoke all on function public.files_mkdir(boolean, uuid, text) from public, anon;
grant execute on function public.files_mkdir(boolean, uuid, text) to authenticated;

create or replace function public.files_rename(p_master boolean, p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); n file_nodes%rowtype := _files_node(p_id, rid); nm text := _files_name(p_name);
begin
  if n.locked then raise exception 'that folder is kept by DineFlow and cannot be renamed'; end if;
  if exists (select 1 from file_nodes where restaurant_id is not distinct from rid and parent_id is not distinct from n.parent_id and lower(name) = lower(nm) and id <> n.id) then
    raise exception 'there is already a folder or file called "%" here', nm;
  end if;
  update file_nodes set name = nm, updated_at = now() where id = n.id returning * into n;
  return _files_json(n);
end $$;
revoke all on function public.files_rename(boolean, uuid, text) from public, anon;
grant execute on function public.files_rename(boolean, uuid, text) to authenticated;

/** Move a folder or file into another folder (null = the top). A folder never goes inside itself. */
create or replace function public.files_move(p_master boolean, p_id uuid, p_parent uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); n file_nodes%rowtype := _files_node(p_id, rid);
begin
  if n.locked then raise exception 'that folder is kept by DineFlow and cannot be moved'; end if;
  if p_parent is not null then
    if (_files_node(p_parent, rid)).kind <> 'folder' then raise exception 'things can only be moved into a folder'; end if;
    if p_parent = n.id or exists (
         with recursive down as (select id from file_nodes where id = n.id union all select c.id from file_nodes c join down on c.parent_id = down.id)
         select 1 from down where id = p_parent) then
      raise exception 'a folder cannot be moved inside itself';
    end if;
  end if;
  if exists (select 1 from file_nodes where restaurant_id is not distinct from rid and parent_id is not distinct from p_parent and lower(name) = lower(n.name) and id <> n.id) then
    raise exception 'there is already a folder or file called "%" there', n.name;
  end if;
  update file_nodes set parent_id = p_parent, updated_at = now() where id = n.id returning * into n;
  return _files_json(n);
end $$;
revoke all on function public.files_move(boolean, uuid, uuid) from public, anon;
grant execute on function public.files_move(boolean, uuid, uuid) to authenticated;

/** Register a file the browser has put in the bucket. The object must be in this space's top folder of the bucket.
 *  A file of the same name in the folder is replaced (its old object path is answered, to be removed); p_replace names
 *  the file to replace outright (an edited text file). The property's space holds 500 MB. */
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
  select coalesce(sum(bytes), 0) into used from file_nodes where restaurant_id is not distinct from rid and kind = 'file' and id is distinct from old.id;
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

/** Delete folders and files (a folder with everything in it). Answers the object paths to remove from the bucket.
 *  A locked node — the "Deleted properties" folder — refuses, and so does anything inside a locked folder's own row. */
create or replace function public.files_delete(p_master boolean, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); paths jsonb; n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'nothing chosen'; end if;
  if exists (select 1 from unnest(p_ids) x where not exists (select 1 from file_nodes f where f.id = x and f.restaurant_id is not distinct from rid)) then
    raise exception 'that folder or file is not here any more';
  end if;
  create temp table if not exists _files_gone (id uuid primary key, object_path text) on commit drop;
  delete from _files_gone;
  insert into _files_gone
    with recursive down as (select id, object_path, locked from file_nodes where id = any(p_ids)
                            union all select c.id, c.object_path, c.locked from file_nodes c join down on c.parent_id = down.id)
    select id, object_path from down where not locked on conflict do nothing;
  if exists (with recursive down as (select id, locked from file_nodes where id = any(p_ids)
                                     union all select c.id, c.locked from file_nodes c join down on c.parent_id = down.id)
             select 1 from down where locked) then
    raise exception 'that folder is kept by DineFlow and cannot be deleted';
  end if;
  select coalesce(jsonb_agg(object_path), '[]'::jsonb), count(*) into paths, n from _files_gone where object_path is not null;
  delete from file_nodes where id in (select id from _files_gone);
  return jsonb_build_object('removed', (select count(*) from _files_gone), 'files', n, 'paths', paths);
end $$;
revoke all on function public.files_delete(boolean, uuid[]) from public, anon;
grant execute on function public.files_delete(boolean, uuid[]) to authenticated;

-- ── the backup of a deleted property ────────────────────────────────────────────────────────────────────────────────
/** Master only, after the property's export was written to the bucket: the locked "Deleted properties" folder (made once)
 *  gets a subfolder named for the property and the moment, holding the backup file and an about.md. Logged. */
create or replace function public.files_keep_deleted_property(p_restaurant_id uuid, p_name text, p_type text, p_backup_path text, p_backup_bytes bigint, p_about_path text, p_about_bytes bigint, p_summary jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare root uuid; sub uuid; subname text; base text; i int := 0; slug text;
begin
  if not is_master() then raise exception 'Master control only' using errcode = '42501'; end if;
  if p_backup_path !~ '^master/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$' or p_about_path !~ '^master/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$' then raise exception 'the backup is not in Master control''s space'; end if;
  select id into root from file_nodes where restaurant_id is null and parent_id is null and kind = 'folder' and lower(name) = 'deleted properties';
  if root is null then
    insert into file_nodes(restaurant_id, parent_id, kind, name, locked, created_by) values (null, null, 'folder', 'Deleted properties', true, auth.uid()) returning id into root;
  else
    update file_nodes set locked = true where id = root;
  end if;
  base := regexp_replace(btrim(coalesce(p_name, 'property')), '[/\\[:cntrl:]]', ' ', 'g') || ' · ' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24.MI');
  subname := left(base, 120);
  while exists (select 1 from file_nodes where restaurant_id is null and parent_id = root and lower(name) = lower(subname)) loop
    i := i + 1; subname := left(base, 110) || ' (' || i || ')';
  end loop;
  insert into file_nodes(restaurant_id, parent_id, kind, name, created_by) values (null, root, 'folder', subname, auth.uid()) returning id into sub;
  slug := coalesce(nullif(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), ''), 'property');
  insert into file_nodes(restaurant_id, parent_id, kind, name, object_path, bytes, mime, created_by)
    values (null, sub, 'file', btrim(slug, '-') || '-backup.json.gz', p_backup_path, greatest(p_backup_bytes, 0), 'application/gzip', auth.uid()),
           (null, sub, 'file', 'about.md', p_about_path, greatest(p_about_bytes, 0), 'text/markdown', auth.uid());
  insert into admin_log(actor, action, target, meta) values (auth.uid(), 'delete_property.backup', p_restaurant_id,
    jsonb_build_object('name', p_name, 'type', p_type, 'folder', subname, 'backup', p_backup_path, 'bytes', p_backup_bytes) || coalesce(p_summary, '{}'::jsonb));
  return jsonb_build_object('root', root, 'folder', sub, 'folder_name', subname);
end $$;
revoke all on function public.files_keep_deleted_property(uuid, text, text, text, bigint, text, bigint, jsonb) from public, anon;
grant execute on function public.files_keep_deleted_property(uuid, text, text, text, bigint, text, bigint, jsonb) to authenticated;

-- ── the add-on: on by default (0185's body + 'files'; features.ts and features.test.ts agree) ────────────────────────
create or replace function public.default_features() returns text[]
language sql immutable set search_path = public as $$
  select array['intelligence','controls','audit','chain','payroll','expenses','tasks','work-records','voice','cleaning','tables',
               'lock','connections','night-audit','promise','till-pairings','receipt-extras','ai','till-voice','scan-vision','whatsapp',
               'website','files']::text[];
$$;
revoke all on function public.default_features() from public;
grant execute on function public.default_features() to authenticated, service_role;

notify pgrst, 'reload schema';
