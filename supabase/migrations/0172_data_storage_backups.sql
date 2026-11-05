-- 0172 — Master control → Data (2026-11-05, the owner: "our own storage, database, file storage, backups and data
-- handling, linked to Master control, a menu in the top bar; mostly free — anything paid finished with a test").
--
-- The live project is on Supabase Free, which keeps no backup of its own. This makes DineFlow keep its own:
--   1. A private Storage bucket `backups` (50 MB a file, Supabase Free's limit), Master control only.
--   2. data_backups      — one row per backup or one-property export (what, how big, its checksum, checked, copied off-site)
--      data_settings     — one row: how many to keep, nightly on/off, files in the backup, the off-site copy, clean-up rules.
--                          Its secrets (the off-site key, a Supabase access token) are never returned to a screen.
--      storage_snapshots — one row a day (database, file and row totals) for the growth chart.
--   3. Functions for Master control (or the service role — the nightly run has no sign-in):
--        data_overview      sizes: database, schemas, tables, each property's share, buckets, largest files, history
--        data_server        the database server's health (connections, cache, uptime, vacuum, slow statements)
--        data_tables        every public table: primary key, restaurant_id, columns, foreign keys; every stored file
--        data_export_rows   a page of one table's rows (optionally one property's) as JSON
--        data_auth_users    the sign-in list — no password hashes
--        data_backup_log    start / done / fail / verify / offsite / downloaded
--        data_backup_forget forget backup rows whose files were deleted
--        data_settings_get / data_settings_set / data_secrets
--        data_restore_rows  "bring back missing rows": only rows whose key is not there; never overwrites; triggers off
--                           (the rows are history — re-running them would, say, take stock twice); logged in admin_log
--        data_cleanup       preview / run the clean-up rules (old print jobs, test runs, used codes, throttle hits…)
-- Nothing here changes an existing table or function.

-- ── who may call: the master, or the service role (the nightly run) ──
create or replace function public._data_caller() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(is_platform_admin(), false) or coalesce(auth.role(), '') = 'service_role'
$$;
revoke all on function public._data_caller() from public, anon, authenticated;

-- ── the bucket ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/gzip', 'application/x-gzip', 'application/octet-stream', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists backups_select on storage.objects;
create policy backups_select on storage.objects for select to authenticated using (bucket_id = 'backups' and public.is_master());
drop policy if exists backups_insert on storage.objects;
create policy backups_insert on storage.objects for insert to authenticated with check (bucket_id = 'backups' and public.is_master());
drop policy if exists backups_update on storage.objects;
create policy backups_update on storage.objects for update to authenticated using (bucket_id = 'backups' and public.is_master()) with check (bucket_id = 'backups' and public.is_master());
drop policy if exists backups_delete on storage.objects;
create policy backups_delete on storage.objects for delete to authenticated using (bucket_id = 'backups' and public.is_master());

-- ── the tables ──
create table if not exists public.data_backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('manual', 'nightly', 'property')),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  label text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  file_path text,
  size_bytes bigint, raw_bytes bigint,
  tables int, rows_total bigint, files int, files_bytes bigint,
  sha256 text,
  manifest jsonb,
  verified_at timestamptz, verify_ok boolean, verify_note text,
  offsite_at timestamptz, offsite_ok boolean, offsite_note text,
  error text,
  created_by uuid
);
create index if not exists data_backups_started on public.data_backups (started_at desc);
create index if not exists data_backups_restaurant on public.data_backups (restaurant_id);
alter table public.data_backups enable row level security;
drop policy if exists data_backups_read on public.data_backups;
create policy data_backups_read on public.data_backups for select to authenticated using (public.is_master());
revoke insert, update, delete, truncate on public.data_backups from anon, authenticated;
revoke all on public.data_backups from anon;

create table if not exists public.data_settings (
  id boolean primary key default true check (id),
  keep_count int not null default 14 check (keep_count between 1 and 60),
  nightly boolean not null default true,
  include_files boolean not null default true,
  files_cap_mb int not null default 25 check (files_cap_mb between 0 and 40),
  offsite_on boolean not null default false,
  offsite_kind text not null default 'none' check (offsite_kind in ('none', 'r2', 'b2', 's3', 'other')),
  offsite_endpoint text, offsite_region text, offsite_bucket text, offsite_prefix text, offsite_key_id text,
  offsite_secret text,
  supabase_token text,
  cleanup jsonb not null default '{}'::jsonb,
  last_download_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.data_settings (id) values (true) on conflict (id) do nothing;
alter table public.data_settings enable row level security;
-- no policy: read and written only through the functions below (the secrets never leave data_secrets)
revoke all on public.data_settings from anon, authenticated;

create table if not exists public.storage_snapshots (
  day date primary key,
  db_bytes bigint, public_bytes bigint, files_bytes bigint, files int, rows_total bigint,
  at timestamptz not null default now()
);
alter table public.storage_snapshots enable row level security;
drop policy if exists storage_snapshots_read on public.storage_snapshots;
create policy storage_snapshots_read on public.storage_snapshots for select to authenticated using (public.is_master());
revoke insert, update, delete, truncate on public.storage_snapshots from anon, authenticated;
revoke all on public.storage_snapshots from anon;

-- ── sizes ──
create or replace function public.data_overview() returns jsonb
language plpgsql security definer set search_path = public, storage, auth, pg_catalog as $$
declare
  v_db bigint; v_pub bigint; v_fb bigint; v_fc int; v_rows bigint;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_t record; v_g record; v_total bigint; v_bytes bigint;
  v_prow jsonb := '{}'::jsonb; v_pbyte jsonb := '{}'::jsonb;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  v_db := pg_database_size(current_database());
  select coalesce(sum(pg_total_relation_size(cl.oid)), 0) into v_pub from pg_class cl where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('r', 'm');
  select count(*)::int, coalesce(sum((o.metadata->>'size')::bigint), 0) into v_fc, v_fb from storage.objects o;
  select coalesce(sum(st.n_live_tup), 0) into v_rows from pg_stat_user_tables st where st.schemaname = 'public';

  insert into storage_snapshots (day, db_bytes, public_bytes, files_bytes, files, rows_total, at)
  values (v_today, v_db, v_pub, v_fb, v_fc, v_rows, now())
  on conflict (day) do update set db_bytes = excluded.db_bytes, public_bytes = excluded.public_bytes, files_bytes = excluded.files_bytes,
    files = excluded.files, rows_total = excluded.rows_total, at = now();

  -- each property's rows, and its share of each table's bytes
  for v_t in
    select cl.relname as name, pg_total_relation_size(cl.oid) as bytes from pg_class cl
     where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = cl.oid and a.attname = 'restaurant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from public.%I', v_t.name) into v_total;
    continue when v_total = 0;
    for v_g in execute format('select restaurant_id::text as k, count(*)::bigint as n from public.%I where restaurant_id is not null group by 1', v_t.name) loop
      v_prow := jsonb_set(v_prow, array[v_g.k], to_jsonb(coalesce((v_prow->>v_g.k)::bigint, 0) + v_g.n));
      v_bytes := (v_t.bytes::numeric * v_g.n / v_total)::bigint;
      v_pbyte := jsonb_set(v_pbyte, array[v_g.k], to_jsonb(coalesce((v_pbyte->>v_g.k)::bigint, 0) + v_bytes));
    end loop;
  end loop;

  return jsonb_build_object(
    'at', now(),
    'version', current_setting('server_version'),
    'db_bytes', v_db, 'public_bytes', v_pub, 'files_bytes', v_fb, 'files', v_fc, 'rows', v_rows,
    'users', (select count(*) from auth.users),
    'schemas', (select coalesce(jsonb_agg(jsonb_build_object('name', s.nspname, 'bytes', s.b) order by s.b desc), '[]'::jsonb) from (
        select n.nspname, sum(pg_total_relation_size(cl.oid))::bigint b from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
         where cl.relkind in ('r', 'm') group by 1) s),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', cl.relname, 'bytes', pg_total_relation_size(cl.oid), 'rows', coalesce(st.n_live_tup, 0),
        'rid', exists (select 1 from pg_attribute a where a.attrelid = cl.oid and a.attname = 'restaurant_id' and not a.attisdropped),
        'pk', exists (select 1 from pg_index i where i.indrelid = cl.oid and i.indisprimary)) order by pg_total_relation_size(cl.oid) desc), '[]'::jsonb)
       from pg_class cl left join pg_stat_user_tables st on st.relid = cl.oid
      where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r'),
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'limit', b.file_size_limit,
        'files', (select count(*) from storage.objects o where o.bucket_id = b.id),
        'bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id)) order by b.id), '[]'::jsonb)
       from storage.buckets b),
    'largest', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select o.bucket_id as bucket, o.name, (o.metadata->>'size')::bigint as bytes, o.updated_at as at
          from storage.objects o order by (o.metadata->>'size')::bigint desc nulls last limit 10) x),
    'properties', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'type', r.property_type,
        'demo', r.demo_expires_at is not null,
        'rows', coalesce((v_prow->>r.id::text)::bigint, 0), 'bytes', coalesce((v_pbyte->>r.id::text)::bigint, 0))
        order by coalesce((v_pbyte->>r.id::text)::bigint, 0) desc), '[]'::jsonb) from restaurants r),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.day), '[]'::jsonb) from (
        select * from storage_snapshots order by day desc limit 120) h)
  );
end $$;

-- ── the server ──
create or replace function public.data_server() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v jsonb; v_slow jsonb := '[]'::jsonb;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  begin
    execute $q$select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select left(regexp_replace(s.query, '\s+', ' ', 'g'), 160) as query, s.calls, round(s.mean_exec_time::numeric, 1) as mean_ms,
               round(s.total_exec_time::numeric / 1000, 1) as total_s
          from extensions.pg_stat_statements s
         where s.dbid = (select oid from pg_database where datname = current_database()) and s.calls >= 20
         order by s.mean_exec_time desc limit 6) x$q$ into v_slow;
  exception when others then v_slow := '[]'::jsonb;
  end;
  select jsonb_build_object(
    'version', current_setting('server_version'),
    'started_at', pg_postmaster_start_time(),
    'now', now(),
    'timezone', current_setting('TimeZone'),
    'statement_timeout', current_setting('statement_timeout'),
    'max_connections', current_setting('max_connections')::int,
    'connections', (select count(*) from pg_stat_activity),
    'active', (select count(*) from pg_stat_activity where state = 'active'),
    'idle_tx', (select count(*) from pg_stat_activity where state like 'idle in transaction%'),
    'by_app', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(a.application_name, ''), a.usename::text, a.backend_type) as app, count(*) as n
          from pg_stat_activity a group by 1 order by 2 desc limit 8) x),
    'longest_s', (select coalesce(round(max(extract(epoch from now() - a.query_start))::numeric, 1), 0) from pg_stat_activity a
                   where a.state = 'active' and a.pid <> pg_backend_pid() and a.backend_type = 'client backend'),
    'cache_heap', (select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) from pg_statio_user_tables),
    'cache_index', (select round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) from pg_statio_user_indexes),
    'db', (select jsonb_build_object('commits', d.xact_commit, 'rollbacks', d.xact_rollback, 'deadlocks', d.deadlocks,
             'temp_bytes', d.temp_bytes, 'conflicts', d.conflicts, 'stats_reset', d.stats_reset)
             from pg_stat_database d where d.datname = current_database()),
    'xid_age', (select age(datfrozenxid) from pg_database where datname = current_database()),
    'vacuum', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select st.relname as name, st.n_live_tup as live, st.n_dead_tup as dead, st.last_autovacuum, st.last_vacuum, st.last_autoanalyze
          from pg_stat_user_tables st where st.schemaname = 'public' and st.n_dead_tup > 0 order by st.n_dead_tup desc limit 8) x),
    'unused_indexes', (select jsonb_build_object('count', count(*), 'bytes', coalesce(sum(pg_relation_size(i.indexrelid)), 0))
        from pg_stat_user_indexes i join pg_index x on x.indexrelid = i.indexrelid
       where i.schemaname = 'public' and i.idx_scan = 0 and not x.indisunique and not x.indisprimary),
    'slow', v_slow
  ) into v;
  return v;
end $$;

-- ── what a backup reads ──
create or replace function public.data_tables() returns jsonb
language plpgsql security definer set search_path = public, storage, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', cl.relname,
        'pk', (select coalesce(jsonb_agg(a.attname order by array_position(i.indkey::int2[], a.attnum)), '[]'::jsonb)
                 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                where i.indrelid = cl.oid and i.indisprimary),
        'rid', exists (select 1 from pg_attribute a where a.attrelid = cl.oid and a.attname = 'restaurant_id' and not a.attisdropped),
        'columns', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) from pg_attribute a
                     where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped),
        'rows', coalesce(st.n_live_tup, 0)) order by cl.relname), '[]'::jsonb)
       from pg_class cl left join pg_stat_user_tables st on st.relid = cl.oid
      where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r'),
    'fks', (select coalesce(jsonb_agg(distinct jsonb_build_object('child', c.conrelid::regclass::text, 'parent', c.confrelid::regclass::text)), '[]'::jsonb)
       from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) and c.conrelid <> c.confrelid),
    'objects', (select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name, 'bytes', (o.metadata->>'size')::bigint,
        'mime', o.metadata->>'mimetype', 'public', b.public) order by o.bucket_id, o.name), '[]'::jsonb)
       from storage.objects o join storage.buckets b on b.id = o.bucket_id where o.bucket_id <> 'backups')
  );
end $$;

create or replace function public.data_export_rows(p_table text, p_offset int default 0, p_limit int default 2000, p_restaurant uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_rel oid; v_pk text; v_where text := ''; v_res jsonb;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  select cl.oid into v_rel from pg_class cl where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r' and cl.relname = p_table;
  if v_rel is null then raise exception 'no such table: %', p_table; end if;
  select string_agg(format('x.%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into v_pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey) where i.indrelid = v_rel and i.indisprimary;
  if p_restaurant is not null then
    if p_table = 'restaurants' then v_where := 'where x.id = $1';
    elsif exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = 'restaurant_id' and not a.attisdropped) then v_where := 'where x.restaurant_id = $1';
    else return '[]'::jsonb;
    end if;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select x.* from public.%I x %s order by %s limit %s offset %s) t',
                 p_table, v_where, coalesce(v_pk, 'x.ctid'), least(greatest(coalesce(p_limit, 2000), 1), 5000), greatest(coalesce(p_offset, 0), 0))
    into v_res using p_restaurant;
  return v_res;
end $$;

create or replace function public.data_auth_users() returns jsonb
language plpgsql security definer set search_path = public, auth, pg_catalog as $$
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'phone', u.phone, 'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
      'app_meta', u.raw_app_meta_data, 'user_meta', u.raw_user_meta_data) order by u.created_at), '[]'::jsonb) from auth.users u);
end $$;

-- ── the backup record ──
create or replace function public.data_backup_log(p_op text, p_id uuid default null, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid := p_id;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  p := coalesce(p, '{}'::jsonb);
  if p_op = 'start' then
    -- a run that never finished (the function was stopped) is a failure, not "running" for ever
    update data_backups set status = 'failed', finished_at = now(), error = coalesce(error, 'did not finish')
     where status = 'running' and started_at < now() - interval '15 minutes';
    insert into data_backups (kind, label, restaurant_id, created_by)
    values (coalesce(p->>'kind', 'manual'), nullif(p->>'label', ''), nullif(p->>'restaurant_id', '')::uuid, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  if v_id is null or not exists (select 1 from data_backups where id = v_id) then raise exception 'no such backup'; end if;
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

create or replace function public.data_backup_forget(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public, pg_catalog as $$
declare n int;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  delete from data_backups where id = any (p_ids);
  get diagnostics n = row_count;
  if n > 0 and auth.uid() is not null then
    insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_backup_delete', null, jsonb_build_object('count', n));
  end if;
  return n;
end $$;

-- ── settings ──
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
    'cleanup', s.cleanup, 'last_download_at', s.last_download_at, 'updated_at', s.updated_at);
end $$;

create or replace function public.data_settings_set(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  p := coalesce(p, '{}'::jsonb);
  if p ? 'offsite_endpoint' and nullif(trim(p->>'offsite_endpoint'), '') is not null and p->>'offsite_endpoint' !~* '^https://[a-z0-9.-]+(:[0-9]+)?/?$' then
    raise exception 'The off-site address must be https://host — nothing after it';
  end if;
  update data_settings set
    keep_count = coalesce((p->>'keep_count')::int, keep_count),
    nightly = coalesce((p->>'nightly')::boolean, nightly),
    include_files = coalesce((p->>'include_files')::boolean, include_files),
    files_cap_mb = coalesce((p->>'files_cap_mb')::int, files_cap_mb),
    offsite_on = coalesce((p->>'offsite_on')::boolean, offsite_on),
    offsite_kind = coalesce(nullif(p->>'offsite_kind', ''), offsite_kind),
    offsite_endpoint = case when p ? 'offsite_endpoint' then nullif(rtrim(trim(p->>'offsite_endpoint'), '/'), '') else offsite_endpoint end,
    offsite_region = case when p ? 'offsite_region' then nullif(trim(p->>'offsite_region'), '') else offsite_region end,
    offsite_bucket = case when p ? 'offsite_bucket' then nullif(trim(p->>'offsite_bucket'), '') else offsite_bucket end,
    offsite_prefix = case when p ? 'offsite_prefix' then nullif(trim(both '/' from trim(p->>'offsite_prefix')), '') else offsite_prefix end,
    offsite_key_id = case when p ? 'offsite_key_id' then nullif(trim(p->>'offsite_key_id'), '') else offsite_key_id end,
    -- a secret is replaced only by a new one, and cleared only when asked; a blank box leaves it as it was
    offsite_secret = case when coalesce((p->>'clear_offsite_secret')::boolean, false) then null
                          when nullif(trim(p->>'offsite_secret'), '') is not null then trim(p->>'offsite_secret') else offsite_secret end,
    supabase_token = case when coalesce((p->>'clear_supabase_token')::boolean, false) then null
                          when nullif(trim(p->>'supabase_token'), '') is not null then trim(p->>'supabase_token') else supabase_token end,
    cleanup = case when jsonb_typeof(p->'cleanup') = 'object' then cleanup || (p->'cleanup') else cleanup end,
    updated_at = now(), updated_by = auth.uid()
  where id;
  insert into admin_log (actor, action, target, meta)
  values (auth.uid(), 'data_settings', null, (p - 'offsite_secret' - 'supabase_token') || jsonb_build_object(
    'offsite_secret', case when nullif(trim(p->>'offsite_secret'), '') is not null then 'replaced' end,
    'supabase_token', case when nullif(trim(p->>'supabase_token'), '') is not null then 'replaced' end));
  return data_settings_get();
end $$;

-- the secrets, for the server only (the off-site copy and the Supabase check); never handed to a screen
create or replace function public.data_secrets() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare s data_settings;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  select * into s from data_settings where id;
  return jsonb_build_object('offsite_on', s.offsite_on, 'kind', s.offsite_kind, 'endpoint', s.offsite_endpoint, 'region', s.offsite_region,
    'bucket', s.offsite_bucket, 'prefix', s.offsite_prefix, 'key_id', s.offsite_key_id, 'secret', s.offsite_secret, 'supabase_token', s.supabase_token);
end $$;

-- ── restore: bring back rows that are missing; never overwrite one that is there ──
create or replace function public.data_restore_rows(p_table text, p_rows jsonb, p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_rel oid; v_pk text[]; v_cols text; v_cond text; v_given int; v_missing int; v_ins int := 0; v_fail int := 0; v_k int; v_err text; v_r jsonb;
  v_trg text[]; v_name text;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  if p_table = any (array['_dineflow_migrations', 'platform_admins', 'admin_context', 'admin_session_context', 'outlet_session',
                          'rate_hits', 'feedback_ip_hits', 'data_backups', 'data_settings', 'storage_snapshots',
                          'temp_passwords', 'password_otps', 'contact_otps', 'sync_state']) then
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
    -- The rows are history: their triggers already ran once (stock, numbering, tickets); running them again would double
    -- it. This table's own enabled triggers are switched off by name for this call and the same ones back on after —
    -- foreign keys stay checked (they are internal triggers), so a row whose parent is missing is refused, not orphaned.
    -- (session_replication_role is not settable from a function here.) ALTER TABLE holds the table for the call.
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
    values (auth.uid(), 'data_restore', null, jsonb_build_object('table', p_table, 'given', v_given, 'inserted', v_ins, 'failed', v_fail));
  end if;
  return jsonb_build_object('table', p_table, 'given', v_given, 'missing', v_missing, 'inserted', v_ins, 'failed', v_fail, 'error', v_err);
end $$;

-- ── clean-up: tables that only grow, and rows nobody will read again ──
create or replace function public.data_cleanup(p_days jsonb default '{}'::jsonb, p_apply boolean default false, p_only text[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_rules jsonb := jsonb_build_object(
    'print_jobs',    jsonb_build_object('days', 30, 'min', 7),
    'selftest_runs', jsonb_build_object('days', 90, 'min', 14),
    'client_errors', jsonb_build_object('days', 90, 'min', 14),
    'scan_log',      jsonb_build_object('days', 90, 'min', 14),
    'ota_sync_log',  jsonb_build_object('days', 60, 'min', 14),
    'codes',         jsonb_build_object('days', 7, 'min', 1),
    'hits',          jsonb_build_object('days', 3, 'min', 2));
  v_key text; v_d int; v_cut timestamptz; v_n bigint; v_k bigint; v_out jsonb := '{}'::jsonb; v_total bigint := 0;
begin
  if not _data_caller() then raise exception 'master only' using errcode = '42501'; end if;
  p_days := coalesce(p_days, '{}'::jsonb);
  for v_key in select jsonb_object_keys(v_rules) loop
    continue when p_only is not null and not (v_key = any (p_only));
    v_d := greatest(coalesce((p_days->>v_key)::int, (v_rules->v_key->>'days')::int), (v_rules->v_key->>'min')::int);
    v_cut := now() - make_interval(days => v_d);
    if v_key = 'print_jobs' then
      if p_apply then delete from print_jobs where created_at < v_cut; get diagnostics v_n = row_count;
      else select count(*) into v_n from print_jobs where created_at < v_cut; end if;
    elsif v_key = 'selftest_runs' then
      if p_apply then delete from selftest_runs where ran_at < v_cut; get diagnostics v_n = row_count;
      else select count(*) into v_n from selftest_runs where ran_at < v_cut; end if;
    elsif v_key = 'client_errors' then
      if p_apply then delete from client_errors where last_at < v_cut; get diagnostics v_n = row_count;
      else select count(*) into v_n from client_errors where last_at < v_cut; end if;
    elsif v_key = 'scan_log' then
      if p_apply then delete from scan_log where created_at < v_cut; get diagnostics v_n = row_count;
      else select count(*) into v_n from scan_log where created_at < v_cut; end if;
    elsif v_key = 'ota_sync_log' then
      if p_apply then delete from ota_sync_log where created_at < v_cut; get diagnostics v_n = row_count;
      else select count(*) into v_n from ota_sync_log where created_at < v_cut; end if;
    elsif v_key = 'codes' then
      -- a sign-in or contact code that was used or has run out, older than the window
      if p_apply then
        delete from password_otps where created_at < v_cut and (consumed_at is not null or expires_at < now()); get diagnostics v_n = row_count;
        delete from contact_otps where created_at < v_cut and (consumed_at is not null or expires_at < now()); get diagnostics v_k = row_count; v_n := v_n + v_k;
      else
        select (select count(*) from password_otps where created_at < v_cut and (consumed_at is not null or expires_at < now()))
             + (select count(*) from contact_otps where created_at < v_cut and (consumed_at is not null or expires_at < now())) into v_n;
      end if;
    elsif v_key = 'hits' then
      -- the throttles count the last hour or day; older hits count for nothing
      if p_apply then
        delete from rate_hits where at < v_cut; get diagnostics v_n = row_count;
        delete from feedback_ip_hits where at < v_cut; get diagnostics v_k = row_count; v_n := v_n + v_k;
      else
        select (select count(*) from rate_hits where at < v_cut) + (select count(*) from feedback_ip_hits where at < v_cut) into v_n;
      end if;
    end if;
    v_out := v_out || jsonb_build_object(v_key, jsonb_build_object('days', v_d, 'min', (v_rules->v_key->>'min')::int, 'rows', v_n));
    v_total := v_total + v_n;
  end loop;
  if p_apply and v_total > 0 and auth.uid() is not null then
    insert into admin_log (actor, action, target, meta) values (auth.uid(), 'data_cleanup', null, v_out);
  end if;
  return jsonb_build_object('applied', p_apply, 'total', v_total, 'rules', v_out);
end $$;

-- ── who may run them ──
do $$
declare f text;
begin
  foreach f in array array[
    'data_overview()', 'data_server()', 'data_tables()', 'data_export_rows(text, int, int, uuid)', 'data_auth_users()',
    'data_backup_log(text, uuid, jsonb)', 'data_backup_forget(uuid[])', 'data_settings_get()', 'data_settings_set(jsonb)',
    'data_secrets()', 'data_restore_rows(text, jsonb, boolean)', 'data_cleanup(jsonb, boolean, text[])']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
