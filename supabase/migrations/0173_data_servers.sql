-- 0173 — Master control → Data → Servers (2026-11-05, the owner: "three kinds — our own server, my laptop, outside like
-- Supabase; a Server connection button, a dialog with the three, a warning before the change; add, delete, copy and
-- backup must be perfect; a dashboard, menus and controls for each server").
--
-- A server is a machine that runs DineFlow's data node (public/data-node/dineflow-data-node.mjs): your own server or your
-- laptop. The node needs no open port and no database password — it POLLS the cloud through one gateway function,
-- data_node_call(token, fn, args), with a token shown once when the server is added (stored hashed). Master control
-- queues commands for it — backup, verify, delete, prune, restore, report — and the node does them and reports back.
-- The live database stays on Supabase; what moves is where backups are made, kept, checked and restored from.
--
--   data_servers        the list: the one cloud row (Supabase) plus every node added; its token hash, keep count, nightly,
--                       last seen, the machine's last report (disk, memory, uptime)
--   data_node_commands  what Master control asked a node to do, and what came of it
--   data_node_files     what each node says it holds on disk (its inventory, sent with every poll)
--   data_settings.active_server   the Server connection — where Back up now, the nightly and Restore work
--   data_backups.server_id        which server made a backup
-- Nothing here changes a tenant table.

-- ── tables ──
create table if not exists public.data_servers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cloud', 'own', 'laptop')),
  name text not null,
  token_hash text unique,
  token_hint text,
  keep_count int not null default 30 check (keep_count between 1 and 365),
  nightly boolean not null default true,
  paused boolean not null default false,
  note text,
  version text,
  last_seen_at timestamptz,
  last_report jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);
insert into public.data_servers (id, kind, name, keep_count, nightly)
values ('00000000-0000-4000-8000-000000000001', 'cloud', 'Cloud · Supabase', 14, true)
on conflict (id) do nothing;
alter table public.data_servers enable row level security;
revoke all on public.data_servers from anon, authenticated;

create table if not exists public.data_node_commands (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.data_servers(id) on delete cascade,
  op text not null check (op in ('backup', 'verify', 'delete', 'prune', 'restore', 'restore_preview', 'report')),
  args jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'taken', 'done', 'failed')),
  created_at timestamptz not null default now(),
  created_by uuid,
  taken_at timestamptz, done_at timestamptz,
  result jsonb, error text
);
create index if not exists data_node_commands_server on public.data_node_commands (server_id, status, created_at);
alter table public.data_node_commands enable row level security;
revoke all on public.data_node_commands from anon, authenticated;

create table if not exists public.data_node_files (
  server_id uuid not null references public.data_servers(id) on delete cascade,
  name text not null,
  size_bytes bigint, sha256 text,
  stored_at timestamptz,
  verified_at timestamptz, verify_ok boolean, verify_note text,
  backup_id uuid,
  seen_at timestamptz not null default now(),
  primary key (server_id, name)
);
alter table public.data_node_files enable row level security;
revoke all on public.data_node_files from anon, authenticated;

alter table public.data_settings add column if not exists active_server uuid references public.data_servers(id) on delete set null;
alter table public.data_backups add column if not exists server_id uuid references public.data_servers(id) on delete set null;
update public.data_backups set server_id = '00000000-0000-4000-8000-000000000001' where server_id is null;
alter table public.data_backups alter column server_id set default '00000000-0000-4000-8000-000000000001';
create index if not exists data_backups_server on public.data_backups (server_id, started_at desc);

-- ── who may call: the master, the service role, or a node inside data_node_call ──
create or replace function public._data_node_id() returns uuid
language sql stable as $$ select nullif(current_setting('dineflow.node', true), '')::uuid $$;
revoke all on function public._data_node_id() from public, anon, authenticated;

create or replace function public._data_caller() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(is_platform_admin(), false) or coalesce(auth.role(), '') = 'service_role' or _data_node_id() is not null
$$;

-- the actor for the log: the master, or the master who added the node that is working
create or replace function public._data_actor() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.uid(), (select created_by from data_servers where id = _data_node_id()))
$$;
revoke all on function public._data_actor() from public, anon, authenticated;

-- ── a backup now remembers which server made it ──
create or replace function public.data_backup_log(p_op text, p_id uuid default null, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid := p_id; v_server uuid := coalesce(_data_node_id(), '00000000-0000-4000-8000-000000000001');
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  p := coalesce(p, '{}'::jsonb);
  if p_op = 'start' then
    update data_backups set status = 'failed', finished_at = now(), error = coalesce(error, 'did not finish')
     where status = 'running' and started_at < now() - interval '15 minutes' and server_id = v_server;
    insert into data_backups (kind, label, restaurant_id, created_by, server_id)
    values (coalesce(p->>'kind', 'manual'), nullif(p->>'label', ''), nullif(p->>'restaurant_id', '')::uuid, auth.uid(), v_server)
    returning id into v_id;
    return v_id;
  end if;
  if v_id is null or not exists (select 1 from data_backups where id = v_id and (_data_node_id() is null or server_id = _data_node_id())) then
    raise exception 'no such backup';
  end if;
  if p_op = 'done' then
    update data_backups set status = 'done', finished_at = now(), error = null,
      file_path = p->>'file_path', size_bytes = (p->>'size_bytes')::bigint, raw_bytes = (p->>'raw_bytes')::bigint,
      tables = (p->>'tables')::int, rows_total = (p->>'rows_total')::bigint, files = (p->>'files')::int,
      files_bytes = (p->>'files_bytes')::bigint, sha256 = p->>'sha256', manifest = p->'manifest'
     where id = v_id;
  elsif p_op = 'fail' then
    update data_backups set status = 'failed', finished_at = now(), error = left(coalesce(p->>'error', 'failed'), 500) where id = v_id;
  elsif p_op = 'verify' then
    update data_backups set verified_at = now(), verify_ok = (p->>'ok')::boolean, verify_note = left(p->>'note', 500) where id = v_id;
  elsif p_op = 'offsite' then
    update data_backups set offsite_at = now(), offsite_ok = (p->>'ok')::boolean, offsite_note = left(p->>'note', 500) where id = v_id;
  elsif p_op = 'downloaded' then
    update data_settings set last_download_at = now() where id;
  else
    raise exception 'unknown step %', p_op;
  end if;
  return v_id;
end $$;

-- the settings now say which server is connected
create or replace function public.data_settings_get() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare s data_settings;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  select * into s from data_settings where id;
  return jsonb_build_object(
    'keep_count', s.keep_count, 'nightly', s.nightly, 'include_files', s.include_files, 'files_cap_mb', s.files_cap_mb,
    'offsite_on', s.offsite_on, 'offsite_kind', s.offsite_kind, 'offsite_endpoint', s.offsite_endpoint, 'offsite_region', s.offsite_region,
    'offsite_bucket', s.offsite_bucket, 'offsite_prefix', s.offsite_prefix, 'offsite_key_id', s.offsite_key_id,
    'offsite_secret_set', s.offsite_secret is not null, 'offsite_secret_hint', case when s.offsite_secret is null then null else '••••' || right(s.offsite_secret, 4) end,
    'supabase_token_set', s.supabase_token is not null, 'supabase_token_hint', case when s.supabase_token is null then null else '••••' || right(s.supabase_token, 4) end,
    'cleanup', s.cleanup, 'last_download_at', s.last_download_at, 'updated_at', s.updated_at,
    'active_server', coalesce(s.active_server, '00000000-0000-4000-8000-000000000001'));
end $$;

-- restore may also run for a node that was asked to (data_node_call checks the command); the actor on record is the master
create or replace function public.data_restore_rows(p_table text, p_rows jsonb, p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_rel oid; v_pk text[]; v_cols text; v_cond text; v_given int; v_missing int; v_ins int := 0; v_fail int := 0; v_k int; v_err text; v_r jsonb;
  v_trg text[]; v_name text;
begin
  if not (is_platform_admin() or _data_node_id() is not null) then raise exception 'master only' using errcode = '42501'; end if;
  if p_table = any (array['_dineflow_migrations', 'platform_admins', 'admin_context', 'admin_session_context', 'outlet_session',
                          'rate_hits', 'feedback_ip_hits', 'data_backups', 'data_settings', 'storage_snapshots', 'data_servers',
                          'data_node_commands', 'data_node_files', 'temp_passwords', 'password_otps', 'contact_otps', 'sync_state']) then
    raise exception '% is not restored from a backup', p_table;
  end if;
  select cl.oid into v_rel from pg_class cl where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r' and cl.relname = p_table;
  if v_rel is null then raise exception 'no such table: %', p_table; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a list'; end if;
  v_given := jsonb_array_length(p_rows);
  if v_given > 2000 then raise exception 'at most 2000 rows a call'; end if;
  select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) into v_pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey) where i.indrelid = v_rel and i.indisprimary;
  if v_pk is null then raise exception '% has no key, so missing rows cannot be told apart', p_table; end if;
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a';
  select string_agg(format('x.%1$I = r.%1$I', k), ' and ') into v_cond from unnest(v_pk) k;
  execute format('select count(*) from jsonb_populate_recordset(null::public.%I, $1) r where not exists (select 1 from public.%I x where %s)',
                 p_table, p_table, v_cond) into v_missing using p_rows;
  if p_apply and v_missing > 0 then
    select array_agg(t.tgname::text) into v_trg from pg_trigger t where t.tgrelid = v_rel and not t.tgisinternal and t.tgenabled = 'O';
    if v_trg is not null then
      foreach v_name in array v_trg loop execute format('alter table public.%I disable trigger %I', p_table, v_name); end loop;
    end if;
    for v_r in select value from jsonb_array_elements(p_rows) loop
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
                       p_table, v_cols, v_cols, p_table) using v_r;
        get diagnostics v_k = row_count; v_ins := v_ins + v_k;
      exception when others then v_fail := v_fail + 1; v_err := coalesce(v_err, sqlerrm);
      end;
    end loop;
    if v_trg is not null then
      foreach v_name in array v_trg loop execute format('alter table public.%I enable trigger %I', p_table, v_name); end loop;
    end if;
    insert into admin_log (actor, action, target, meta)
    values (_data_actor(), 'data_restore', _data_node_id(), jsonb_build_object('table', p_table, 'given', v_given, 'inserted', v_ins, 'failed', v_fail, 'server', _data_node_id()));
  end if;
  return jsonb_build_object('table', p_table, 'given', v_given, 'missing', v_missing, 'inserted', v_ins, 'failed', v_fail, 'error', v_err);
end $$;

-- ── Master control's side ──
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
      'active', coalesce((select active_server from data_settings where id), '00000000-0000-4000-8000-000000000001') = s.id
    ) order by case s.kind when 'cloud' then 0 when 'own' then 1 else 2 end, s.created_at), '[]'::jsonb) from data_servers s);
end $$;

create or replace function public.data_server_add(p_kind text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_token text; v_id uuid;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if p_kind not in ('own', 'laptop') then raise exception 'a server is your own server or a laptop'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the server a name'; end if;
  if (select count(*) from data_servers) >= 12 then raise exception 'That is enough servers — remove one first'; end if;
  v_token := 'dfn_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into data_servers (kind, name, token_hash, token_hint, created_by)
  values (p_kind, left(trim(p_name), 60), encode(extensions.digest(v_token, 'sha256'), 'hex'), right(v_token, 4), auth.uid())
  returning id into v_id;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_add', v_id, jsonb_build_object('kind', p_kind, 'name', left(trim(p_name), 60)));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

create or replace function public.data_server_rotate(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_token text;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if not exists (select 1 from data_servers where id = p_id and kind <> 'cloud') then raise exception 'no such server'; end if;
  v_token := 'dfn_' || encode(extensions.gen_random_bytes(24), 'hex');
  update data_servers set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), token_hint = right(v_token, 4), last_seen_at = null where id = p_id;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_rotate', p_id, '{}'::jsonb);
  return jsonb_build_object('id', p_id, 'token', v_token);
end $$;

create or replace function public.data_server_set(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  p := coalesce(p, '{}'::jsonb);
  update data_servers set
    name = case when nullif(trim(p->>'name'), '') is not null then left(trim(p->>'name'), 60) else name end,
    keep_count = coalesce((p->>'keep_count')::int, keep_count),
    nightly = coalesce((p->>'nightly')::boolean, nightly),
    paused = case when kind = 'cloud' then false else coalesce((p->>'paused')::boolean, paused) end,
    note = case when p ? 'note' then nullif(left(trim(p->>'note'), 300), '') else note end
  where id = p_id;
  if not found then raise exception 'no such server'; end if;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_set', p_id, p);
  return data_servers_get();
end $$;

create or replace function public.data_server_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_name text;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select name into v_name from data_servers where id = p_id and kind <> 'cloud';
  if v_name is null then raise exception 'The cloud cannot be removed'; end if;
  update data_settings set active_server = null where active_server = p_id;
  delete from data_servers where id = p_id;   -- its commands and inventory go with it; its backup records stay, unlinked
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_delete', p_id, jsonb_build_object('name', v_name));
  return data_servers_get();
end $$;

-- the Server connection: where Back up now, the nightly run and Restore work from now on
create or replace function public.data_active_server_set(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_from uuid; v_to uuid := coalesce(p_id, '00000000-0000-4000-8000-000000000001');
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if not exists (select 1 from data_servers where id = v_to) then raise exception 'no such server'; end if;
  select coalesce(active_server, '00000000-0000-4000-8000-000000000001') into v_from from data_settings where id;
  update data_settings set active_server = v_to, updated_at = now(), updated_by = auth.uid() where id;
  insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_switch', v_to, jsonb_build_object('from', v_from, 'to', v_to));
  return data_servers_get();
end $$;

create or replace function public.data_server_command(p_id uuid, p_op text, p_args jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if not exists (select 1 from data_servers where id = p_id and kind <> 'cloud') then raise exception 'no such server'; end if;
  if p_op not in ('backup', 'verify', 'delete', 'prune', 'restore', 'restore_preview', 'report') then raise exception 'unknown command %', p_op; end if;
  if (select count(*) from data_node_commands where server_id = p_id and status in ('queued', 'taken')) >= 20 then raise exception 'The server has 20 jobs waiting already'; end if;
  insert into data_node_commands (server_id, op, args, created_by) values (p_id, p_op, coalesce(p_args, '{}'::jsonb), auth.uid()) returning id into v_id;
  if p_op in ('restore', 'delete', 'prune') then
    insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_server_' || p_op, p_id, coalesce(p_args, '{}'::jsonb) || jsonb_build_object('command', v_id));
  end if;
  return v_id;
end $$;

create or replace function public.data_server_commands(p_id uuid, p_limit int default 40) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from (
    select id, server_id, op, args, status, created_at, taken_at, done_at, result, error from data_node_commands
     where (p_id is null or server_id = p_id) order by created_at desc limit least(greatest(coalesce(p_limit, 40), 1), 200)) c);
end $$;

create or replace function public.data_command_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select to_jsonb(c) from (select id, server_id, op, args, status, created_at, taken_at, done_at, result, error from data_node_commands where id = p_id) c);
end $$;

create or replace function public.data_server_files(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'name', f.name, 'size_bytes', f.size_bytes, 'sha256', f.sha256, 'stored_at', f.stored_at, 'verified_at', f.verified_at, 'verify_ok', f.verify_ok,
      'verify_note', f.verify_note, 'seen_at', f.seen_at, 'backup_id', coalesce(f.backup_id, b.id), 'kind', b.kind, 'rows_total', b.rows_total,
      'tables', b.tables, 'label', b.label, 'restaurant_id', b.restaurant_id) order by coalesce(f.stored_at, f.seen_at) desc), '[]'::jsonb)
    from data_node_files f left join data_backups b on b.id = f.backup_id or (f.backup_id is null and b.server_id = f.server_id and b.file_path = f.name)
   where f.server_id = p_id);
end $$;

-- every backup, and which servers hold a copy of it (by its name)
create or replace function public.data_records(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'kind', b.kind, 'status', b.status, 'label', b.label, 'restaurant_id', b.restaurant_id,
      'restaurant', (select name from restaurants r where r.id = b.restaurant_id),
      'server_id', b.server_id, 'server', coalesce(s.name, 'removed server'), 'server_kind', coalesce(s.kind, 'own'),
      'started_at', b.started_at, 'finished_at', b.finished_at, 'file_path', b.file_path, 'size_bytes', b.size_bytes, 'raw_bytes', b.raw_bytes,
      'tables', b.tables, 'rows_total', b.rows_total, 'files', b.files, 'sha256', b.sha256,
      'verified_at', b.verified_at, 'verify_ok', b.verify_ok, 'verify_note', b.verify_note,
      'offsite_at', b.offsite_at, 'offsite_ok', b.offsite_ok, 'error', b.error,
      'on_disk', case when s.kind = 'cloud' then null else exists (select 1 from data_node_files f where f.server_id = b.server_id and (f.backup_id = b.id or f.name = b.file_path)) end
    ) order by b.started_at desc), '[]'::jsonb)
    from (select * from data_backups order by started_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) b
    left join data_servers s on s.id = b.server_id);
end $$;

-- what Master control did lately with data (for the Records screen)
create or replace function public.data_activity(p_limit int default 60) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog, auth as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'at', l.created_at, 'action', l.action, 'target', l.target, 'meta', l.meta,
      'by', (select u.email from auth.users u where u.id = l.actor)) order by l.created_at desc), '[]'::jsonb)
    from (select * from admin_log where action like 'data\_%' order by created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 500)) l);
end $$;

-- ── the node's side: one gateway, by token ──
create or replace function public.data_node_call(p_token text, p_fn text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare s data_servers; cmd data_node_commands; v_cmds jsonb; v_id uuid; v_names text[]; v_out jsonb;
begin
  p_args := coalesce(p_args, '{}'::jsonb);
  -- A refusal is RETURNED, not raised: an exception would roll back the hit that counts it. The node treats {error} as a failure.
  if p_token is null or length(p_token) < 20 then return jsonb_build_object('error', 'not allowed'); end if;
  -- a wrong token costs a hit; sixty wrong tries in ten minutes close the door for a while
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
    -- hand out the oldest waiting commands, five at a time; a command taken over an hour ago and never finished is failed
    update data_node_commands set status = 'failed', done_at = now(), error = 'the server did not finish it' where server_id = s.id and status = 'taken' and taken_at < now() - interval '1 hour';
    with c as (select id from data_node_commands where server_id = s.id and status = 'queued' order by created_at limit 5 for update skip locked),
         t as (update data_node_commands d set status = 'taken', taken_at = now() from c where d.id = c.id returning d.id, d.op, d.args, d.created_at)
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'op', t.op, 'args', t.args, 'created_at', t.created_at) order by t.created_at), '[]'::jsonb) into v_cmds from t;
    v_out := jsonb_build_object('server', jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'keep_count', s.keep_count, 'nightly', s.nightly, 'paused', s.paused),
      'settings', (select jsonb_build_object('include_files', include_files, 'files_cap_mb', files_cap_mb) from data_settings where id),
      'commands', v_cmds, 'now', now());

  elsif p_fn = 'done' then
    v_id := (p_args->>'id')::uuid;
    update data_node_commands set status = case when coalesce((p_args->>'ok')::boolean, true) then 'done' else 'failed' end, done_at = now(),
      result = p_args->'result', error = left(p_args->>'error', 500)
     where id = v_id and server_id = s.id and status = 'taken' returning * into cmd;
    if not found then raise exception 'no such job'; end if;
    -- a deleted or pruned file leaves the inventory and its record at once, not at the next poll
    if cmd.op in ('delete', 'prune') and cmd.status = 'done' and jsonb_typeof(cmd.result->'deleted') = 'array' then
      select array_agg(x) into v_names from jsonb_array_elements_text(cmd.result->'deleted') x;
      delete from data_node_files where server_id = s.id and name = any (v_names);
      delete from data_backups where server_id = s.id and file_path = any (v_names);
    end if;
    v_out := jsonb_build_object('ok', true);

  elsif p_fn = 'tables' then v_out := data_tables();
  elsif p_fn = 'rows' then v_out := data_export_rows(p_args->>'table', coalesce((p_args->>'offset')::int, 0), coalesce((p_args->>'limit')::int, 2000), nullif(p_args->>'restaurant', '')::uuid);
  elsif p_fn = 'users' then v_out := data_auth_users();
  elsif p_fn = 'log' then v_out := to_jsonb(data_backup_log(p_args->>'op', nullif(p_args->>'id', '')::uuid, coalesce(p_args->'p', '{}'::jsonb)));

  elsif p_fn = 'restore' then
    -- only what Master control asked this server to restore, table by table
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

-- ── who may run them ──
do $$
declare f text;
begin
  foreach f in array array['data_servers_get()', 'data_server_add(text, text)', 'data_server_rotate(uuid)', 'data_server_set(uuid, jsonb)',
    'data_server_delete(uuid)', 'data_active_server_set(uuid)', 'data_server_command(uuid, text, jsonb)', 'data_server_commands(uuid, int)',
    'data_command_get(uuid)', 'data_server_files(uuid)', 'data_records(int)', 'data_activity(int)',
    'data_backup_log(text, uuid, jsonb)', 'data_settings_get()', 'data_restore_rows(text, jsonb, boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.data_node_call(text, text, jsonb) from public;
grant execute on function public.data_node_call(text, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
