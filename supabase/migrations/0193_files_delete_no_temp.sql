-- 0193 — files_delete without the temp table (2026-11-23). 0192's files_delete cleared a temp table with a bare `delete from
-- _files_gone`, which Supabase refuses ("DELETE requires a WHERE clause" — the safeupdate guard on the API roles), so every
-- delete from the File Manager failed. The same walk, as one statement: the subtree is collected, a locked node anywhere in
-- it refuses, the rows go in a single DELETE … RETURNING, and the object paths are answered for the bucket.
create or replace function public.files_delete(p_master boolean, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := _files_space(p_master); paths jsonb; n_files int; n_all int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'nothing chosen'; end if;
  if exists (select 1 from unnest(p_ids) x where not exists (select 1 from file_nodes f where f.id = x and f.restaurant_id is not distinct from rid)) then
    raise exception 'that folder or file is not here any more';
  end if;
  if exists (with recursive down as (select id, locked from file_nodes where id = any(p_ids)
                                     union all select c.id, c.locked from file_nodes c join down on c.parent_id = down.id)
             select 1 from down where locked) then
    raise exception 'that folder is kept by DineFlow and cannot be deleted';
  end if;
  with recursive down as (select id from file_nodes where id = any(p_ids)
                          union all select c.id from file_nodes c join down on c.parent_id = down.id),
       gone as (delete from file_nodes f where f.id in (select id from down) returning f.object_path)
  select coalesce(jsonb_agg(object_path) filter (where object_path is not null), '[]'::jsonb), count(object_path), count(*)
    into paths, n_files, n_all from gone;
  return jsonb_build_object('removed', n_all, 'files', n_files, 'paths', paths);
end $$;
revoke all on function public.files_delete(boolean, uuid[]) from public, anon;
grant execute on function public.files_delete(boolean, uuid[]) to authenticated;

notify pgrst, 'reload schema';
