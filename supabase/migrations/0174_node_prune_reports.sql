-- 0174 — a node's own tidy-up reaches the cloud (2026-11-05). After its nightly, the data node keeps only the newest N files
-- on its disk (its keep count). 0173's gateway cleared the cloud's records only for deletions Master control had asked for
-- (a delete or prune command); files the node removed by itself stayed on the Records screen as "file gone". Now the node
-- names them in its next poll (`deleted`), and their inventory rows and backup records go at once. Nothing else changes.

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
    -- 0174: files the node removed on its own (its nightly keep count) leave the inventory and the records now
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

revoke all on function public.data_node_call(text, text, jsonb) from public;
grant execute on function public.data_node_call(text, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
