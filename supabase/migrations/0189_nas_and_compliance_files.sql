-- 0189 · A NAS as a data server, with two switches, and the files behind Tax & compliance (2026-11-22, the owner: "a NAS section —
-- all three options separately choosable; 1 (backups on the NAS) and 2 (photos & documents on the NAS, tax documents too) now,
-- 3 (run on the NAS when the internet is down) next phase; everything in Master control; when the NAS arrives only the connection
-- should be left").
--
-- What changes:
--   data_servers      — kind 'nas' joins cloud / own / laptop; a brand (synology · qnap · docker · linux · windows); the second switch
--                       (mirror_files) and which buckets it copies (mirror_buckets); the node's last mirror report and when.
--   data_node_commands — a 'mirror' job: copy every file of the chosen buckets that the NAS does not have yet.
--   data_node_call    — 'poll' now tells the node its brand and switches; 'done' of a mirror keeps its report; 'auth' lets the cloud's
--                       own route recognise a node's token (the private-file download); 'mirror_list' pages the objects of one bucket.
--   data_server_add   — takes the brand (3 arguments; the 2-argument form is dropped so PostgREST has one to choose);
--   data_server_set   — accepts brand, mirror_files, mirror_buckets; data_servers_get carries them; data_server_command allows 'mirror'.
--   storage           — a private bucket 'compliance' (PDF and photos, 20 MB) for the filing paperwork, each property's folder its own:
--                       owners and managers read, add, replace and remove inside their folder (as the brand bucket, 0083);
--   compliance_docs   — the file's path, name, size and type, beside the link a document could already carry.
--
-- RLS: data_servers / data_node_commands / data_node_files stay as 0173 left them (master and the node's own functions only); the
-- compliance bucket's policies are the brand bucket's pattern; compliance_docs keeps 0026's tenant_all.

-- ── a NAS is a server ──
alter table public.data_servers drop constraint if exists data_servers_kind_check;
alter table public.data_servers add constraint data_servers_kind_check check (kind in ('cloud', 'own', 'laptop', 'nas'));
alter table public.data_servers add column if not exists brand text check (brand is null or brand in ('synology', 'qnap', 'docker', 'linux', 'windows'));
alter table public.data_servers add column if not exists mirror_files boolean not null default false;
alter table public.data_servers add column if not exists mirror_buckets text[] not null default array['brand', 'menu', 'site', 'compliance'];
alter table public.data_servers add column if not exists mirror_at timestamptz;
alter table public.data_servers add column if not exists mirror_report jsonb;

alter table public.data_node_commands drop constraint if exists data_node_commands_op_check;
alter table public.data_node_commands add constraint data_node_commands_op_check
  check (op in ('backup', 'verify', 'delete', 'prune', 'restore', 'restore_preview', 'report', 'mirror'));

-- the buckets a NAS may copy, and whether each is public (public files the node fetches straight from storage; private ones through
-- the cloud's own route, which needs the service-role key on Vercel)
create or replace function public._mirror_buckets() returns text[]
language sql immutable as $$ select array['brand', 'menu', 'site', 'compliance', 'attendance', 'support'] $$;
revoke all on function public._mirror_buckets() from public, anon, authenticated;

-- ── add: with a brand ──
drop function if exists public.data_server_add(text, text);
create or replace function public.data_server_add(p_kind text, p_name text, p_brand text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_token text; v_id uuid;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if p_kind not in ('own', 'laptop', 'nas') then raise exception 'a server is your own server, a laptop or a NAS'; end if;
  if p_kind = 'nas' and (p_brand is null or p_brand not in ('synology', 'qnap', 'docker', 'linux', 'windows')) then raise exception 'Which NAS is it?'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the server a name'; end if;
  if (select count(*) from data_servers) >= 12 then raise exception 'That is enough servers — remove one first'; end if;
  v_token := 'dfn_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into data_servers (kind, name, brand, token_hash, token_hint, created_by)
  values (p_kind, left(trim(p_name), 60), case when p_kind = 'nas' then p_brand end, encode(extensions.digest(v_token, 'sha256'), 'hex'), right(v_token, 4), auth.uid())
  returning id into v_id;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_add', v_id, jsonb_build_object('kind', p_kind, 'name', left(trim(p_name), 60), 'brand', p_brand));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;
revoke all on function public.data_server_add(text, text, text) from public, anon;
grant execute on function public.data_server_add(text, text, text) to authenticated;

-- ── get: with the NAS fields ──
create or replace function public.data_servers_get() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'name', s.name, 'token_hint', s.token_hint, 'keep_count', s.keep_count, 'nightly', s.nightly, 'paused', s.paused,
      'note', s.note, 'version', s.version, 'created_at', s.created_at, 'last_seen_at', s.last_seen_at, 'last_report', s.last_report,
      'online', s.kind = 'cloud' or (s.last_seen_at is not null and s.last_seen_at > now() - interval '3 minutes'),
      'files', (select count(*) from data_node_files f where f.server_id = s.id),
      'files_bytes', (select coalesce(sum(f.size_bytes), 0) from data_node_files f where f.server_id = s.id),
      'queued', (select count(*) from data_node_commands c where c.server_id = s.id and c.status in ('queued', 'taken')),
      'failed_24h', (select count(*) from data_node_commands c where c.server_id = s.id and c.status = 'failed' and c.created_at > now() - interval '24 hours'),
      'backups', (select count(*) from data_backups b where b.server_id = s.id and b.status = 'done' and b.kind <> 'property'),
      'last_backup', (select jsonb_build_object('id', b.id, 'at', coalesce(b.finished_at, b.started_at), 'size_bytes', b.size_bytes, 'rows_total', b.rows_total, 'verify_ok', b.verify_ok, 'kind', b.kind)
                        from data_backups b where b.server_id = s.id and b.status = 'done' and b.kind <> 'property' order by b.started_at desc limit 1),
      'active', coalesce((select active_server from data_settings where id), '00000000-0000-4000-8000-000000000001') = s.id,
      'brand', s.brand, 'mirror_files', s.mirror_files, 'mirror_buckets', to_jsonb(s.mirror_buckets), 'mirror_at', s.mirror_at, 'mirror_report', s.mirror_report
    ) order by case s.kind when 'cloud' then 0 when 'own' then 1 when 'nas' then 2 else 3 end, s.created_at), '[]'::jsonb) from data_servers s);
end $$;

-- ── set: the switches ──
create or replace function public.data_server_set(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_buckets text[];
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  p := coalesce(p, '{}'::jsonb);
  if jsonb_typeof(p->'mirror_buckets') = 'array' then
    select coalesce(array_agg(x), '{}') into v_buckets from jsonb_array_elements_text(p->'mirror_buckets') x where x = any (_mirror_buckets());
  end if;
  update data_servers set
    name = case when nullif(trim(p->>'name'), '') is not null then left(trim(p->>'name'), 60) else name end,
    keep_count = coalesce((p->>'keep_count')::int, keep_count),
    nightly = coalesce((p->>'nightly')::boolean, nightly),
    paused = case when kind = 'cloud' then false else coalesce((p->>'paused')::boolean, paused) end,
    note = case when p ? 'note' then nullif(left(trim(p->>'note'), 300), '') else note end,
    brand = case when kind = 'nas' and p->>'brand' in ('synology', 'qnap', 'docker', 'linux', 'windows') then p->>'brand' else brand end,
    mirror_files = case when kind = 'cloud' then false else coalesce((p->>'mirror_files')::boolean, mirror_files) end,
    mirror_buckets = coalesce(v_buckets, mirror_buckets)
  where id = p_id;
  if not found then raise exception 'no such server'; end if;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_set', p_id, p);
  return data_servers_get();
end $$;

-- ── command: 'mirror' joins the list ──
create or replace function public.data_server_command(p_id uuid, p_op text, p_args jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if not exists (select 1 from data_servers where id = p_id and kind <> 'cloud') then raise exception 'no such server'; end if;
  if p_op not in ('backup', 'verify', 'delete', 'prune', 'restore', 'restore_preview', 'report', 'mirror') then raise exception 'unknown command %', p_op; end if;
  if p_op = 'mirror' and not exists (select 1 from data_servers where id = p_id and mirror_files) then raise exception 'Switch on Photos & documents on this NAS first'; end if;
  if (select count(*) from data_node_commands where server_id = p_id and status in ('queued', 'taken')) >= 20 then raise exception 'The server has 20 jobs waiting already'; end if;
  insert into data_node_commands (server_id, op, args, created_by) values (p_id, p_op, coalesce(p_args, '{}'::jsonb), auth.uid()) returning id into v_id;
  if p_op in ('restore', 'delete', 'prune') then
    insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_' || p_op, p_id, coalesce(p_args, '{}'::jsonb) || jsonb_build_object('command', v_id));
  end if;
  return v_id;
end $$;

-- ── the node's gateway: brand and switches on poll, the mirror report on done, 'auth' and 'mirror_list' ──
create or replace function public.data_node_call(p_token text, p_fn text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare s data_servers; cmd data_node_commands; v_cmds jsonb; v_id uuid; v_names text[]; v_out jsonb; v_bucket text;
begin
  p_args := coalesce(p_args, '{}'::jsonb);
  if p_token is null or length(p_token) < 20 then return jsonb_build_object('error', 'not allowed'); end if;
  if (select count(*) from rate_hits where bucket = 'data_node_bad' and at > now() - interval '10 minutes') >= 60 then
    return jsonb_build_object('error', 'too many tries — wait ten minutes');
  end if;
  select * into s from data_servers where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and kind <> 'cloud';
  if not found then
    insert into rate_hits (bucket, at) values ('data_node_bad', now());
    return jsonb_build_object('error', 'not allowed');
  end if;
  perform set_config('dineflow.node', s.id::text, true);
  update data_servers set last_seen_at = now() where id = s.id;

  if p_fn = 'poll' then
    update data_servers set last_report = coalesce(p_args->'report', last_report), version = coalesce(p_args->>'version', version) where id = s.id;
    if jsonb_typeof(p_args->'deleted') = 'array' and jsonb_array_length(p_args->'deleted') > 0 then
      select array_agg(x) into v_names from jsonb_array_elements_text(p_args->'deleted') x;
      delete from data_node_files where server_id = s.id and name = any (v_names);
      delete from data_backups where server_id = s.id and file_path = any (v_names);
    end if;
    if jsonb_typeof(p_args->'files') = 'array' then
      delete from data_node_files f where f.server_id = s.id and not exists (select 1 from jsonb_array_elements(p_args->'files') x where x->>'name' = f.name);
      insert into data_node_files (server_id, name, size_bytes, sha256, stored_at, verified_at, verify_ok, verify_note, backup_id, seen_at)
      select s.id, x->>'name', (x->>'size_bytes')::bigint, x->>'sha256', (x->>'stored_at')::timestamptz, (x->>'verified_at')::timestamptz,
             (x->>'verify_ok')::boolean, left(x->>'verify_note', 300), nullif(x->>'backup_id', '')::uuid, now()
        from jsonb_array_elements(p_args->'files') x where (x->>'name') is not null
      on conflict (server_id, name) do update set size_bytes = excluded.size_bytes, sha256 = excluded.sha256, stored_at = coalesce(excluded.stored_at, data_node_files.stored_at),
        verified_at = excluded.verified_at, verify_ok = excluded.verify_ok, verify_note = excluded.verify_note,
        backup_id = coalesce(excluded.backup_id, data_node_files.backup_id), seen_at = now();
    end if;
    update data_node_commands set status = 'failed', done_at = now(), error = 'the server did not finish it' where server_id = s.id and status = 'taken' and taken_at < now() - interval '1 hour';
    with c as (select id from data_node_commands where server_id = s.id and status = 'queued' order by created_at limit 5 for update skip locked),
         t as (update data_node_commands d set status = 'taken', taken_at = now() from c where d.id = c.id returning d.id, d.op, d.args, d.created_at)
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'op', t.op, 'args', t.args, 'created_at', t.created_at) order by t.created_at), '[]'::jsonb) into v_cmds from t;
    v_out := jsonb_build_object('server', jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'keep_count', s.keep_count, 'nightly', s.nightly, 'paused', s.paused,
        'brand', s.brand, 'mirror_files', s.mirror_files, 'mirror_buckets', to_jsonb(s.mirror_buckets)),
      'settings', (select jsonb_build_object('include_files', include_files, 'files_cap_mb', files_cap_mb) from data_settings where id),
      'commands', v_cmds, 'now', now());

  elsif p_fn = 'done' then
    v_id := (p_args->>'id')::uuid;
    update data_node_commands set status = case when coalesce((p_args->>'ok')::boolean, true) then 'done' else 'failed' end, done_at = now(),
      result = p_args->'result', error = left(p_args->>'error', 500)
     where id = v_id and server_id = s.id and status = 'taken' returning * into cmd;
    if not found then raise exception 'no such job'; end if;
    if cmd.op in ('delete', 'prune') and cmd.status = 'done' and jsonb_typeof(cmd.result->'deleted') = 'array' then
      select array_agg(x) into v_names from jsonb_array_elements_text(cmd.result->'deleted') x;
      delete from data_node_files where server_id = s.id and name = any (v_names);
      delete from data_backups where server_id = s.id and file_path = any (v_names);
    end if;
    -- 0189: a finished mirror is the NAS's word on its copy of the files — kept on the server row, shown on the NAS page
    if cmd.op = 'mirror' and cmd.status = 'done' then
      update data_servers set mirror_report = cmd.result, mirror_at = now() where id = s.id;
    end if;
    v_out := jsonb_build_object('ok', true);

  elsif p_fn = 'auth' then
    -- the cloud's own route asks "whose token is this?" before it hands a private file to a node
    v_out := jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'mirror_files', s.mirror_files, 'mirror_buckets', to_jsonb(s.mirror_buckets));

  elsif p_fn = 'mirror_list' then
    -- one bucket's objects, a page of up to 1000 by name after `after`; only a bucket this server was set to copy
    v_bucket := p_args->>'bucket';
    if v_bucket is null or not (v_bucket = any (s.mirror_buckets)) or not (v_bucket = any (_mirror_buckets())) then raise exception 'that bucket is not for this server' using errcode = '42501'; end if;
    v_out := jsonb_build_object('bucket', v_bucket,
      'public', coalesce((select b.public from storage.buckets b where b.id = v_bucket), false),
      'exists', exists (select 1 from storage.buckets b where b.id = v_bucket),
      'files', coalesce((select jsonb_agg(jsonb_build_object('name', o.name, 'size', (o.metadata->>'size')::bigint, 'updated_at', o.updated_at, 'etag', o.metadata->>'eTag') order by o.name)
        from (select * from storage.objects o where o.bucket_id = v_bucket and o.name > coalesce(p_args->>'after', '') and o.name not like '%/.emptyFolderPlaceholder' order by o.name limit 1000) o), '[]'::jsonb));

  elsif p_fn = 'tables' then v_out := data_tables();
  elsif p_fn = 'rows' then v_out := data_export_rows(p_args->>'table', coalesce((p_args->>'offset')::int, 0), coalesce((p_args->>'limit')::int, 2000), nullif(p_args->>'restaurant', '')::uuid);
  elsif p_fn = 'users' then v_out := data_auth_users();
  elsif p_fn = 'log' then v_out := to_jsonb(data_backup_log(p_args->>'op', nullif(p_args->>'id', '')::uuid, coalesce(p_args->'p', '{}'::jsonb)));

  elsif p_fn = 'restore' then
    select * into cmd from data_node_commands where id = (p_args->>'command')::uuid and server_id = s.id and op in ('restore', 'restore_preview') and status = 'taken';
    if not found then raise exception 'no restore was asked for' using errcode = '42501'; end if;
    if not (cmd.args->'tables') ? (p_args->>'table') then raise exception 'that table was not asked for' using errcode = '42501'; end if;
    v_out := data_restore_rows(p_args->>'table', p_args->'rows', cmd.op = 'restore' and coalesce((p_args->>'apply')::boolean, false));
  else
    raise exception 'unknown call %', p_fn;
  end if;
  perform set_config('dineflow.node', '', true);
  return v_out;
end $$;
revoke all on function public.data_node_call(text, text, jsonb) from public;
grant execute on function public.data_node_call(text, text, jsonb) to anon, authenticated, service_role;

-- ── the filing paperwork: a private bucket, each property its own folder ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compliance', 'compliance', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compliance_select on storage.objects;
create policy compliance_select on storage.objects for select to authenticated
  using (bucket_id = 'compliance' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists compliance_insert on storage.objects;
create policy compliance_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'compliance' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists compliance_update on storage.objects;
create policy compliance_update on storage.objects for update to authenticated
  using (bucket_id = 'compliance' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))
  with check (bucket_id = 'compliance' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists compliance_delete on storage.objects;
create policy compliance_delete on storage.objects for delete to authenticated
  using (bucket_id = 'compliance' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));

alter table public.compliance_docs add column if not exists file_path text;
alter table public.compliance_docs add column if not exists file_name text;
alter table public.compliance_docs add column if not exists file_bytes bigint;
alter table public.compliance_docs add column if not exists file_mime text;
