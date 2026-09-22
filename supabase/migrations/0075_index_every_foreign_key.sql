-- 0075 · An index behind every foreign key, and a search_path on every function.
--
-- Postgres does not index a foreign key for you. Without one, every delete on the parent has to
-- read the whole child table to prove nothing still points at the row — and a few of these sit on
-- paths the new screens use constantly:
--
--   order_items.variant_id  · editing a dish's sizes deletes the ones that were removed, and each
--                             deletion scanned all 8,669 order lines to check none referred to it.
--   bills.customer_id       · the Customers screen reads a guest's history by exactly this column.
--   kots.order_id           · merging two tables moves their tickets by exactly this column.
--
-- The rest are older and mostly small, but an index on a table this size costs a few kilobytes and
-- a few bytes per row written, while the missing one costs more every week the table grows. So:
-- all of them, found by asking the catalogue rather than by listing them here, which means this
-- also covers any a later migration adds before someone runs it again.
do $$
declare r record; idx text;
begin
  for r in
    select cl.relname as rel, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and c.conkey[1] = any(i.indkey::int[]))
    order by cl.relname, a.attname
  loop
    idx := left(r.rel || '_' || r.col || '_fk_idx', 63);
    execute format('create index if not exists %I on public.%I (%I)', idx, r.rel, r.col);
  end loop;
end $$;

-- ───────── a search_path on every last function ─────────
-- The security-definer ones have pinned theirs since 0069, because those are the ones that run with
-- the owner's rights and so are worth attacking. The handful left are plain helpers and triggers —
-- arithmetic, a role's rank, a stock update — that nobody could gain anything from. Pinning them
-- too costs nothing and means the rule has no exceptions to remember, which is the only kind of
-- rule that stays true. ALTER rather than CREATE OR REPLACE: the bodies are not touched at all.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proconfig is null or not array_to_string(p.proconfig, ',') like '%search_path%')
      -- never touch anything an extension owns
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- ───────── one place_order ─────────
-- The five-argument version from 0001 was superseded in 0004, 0023, 0065, 0070 and 0071. Nothing
-- has called it in a long time — it takes p_customer_name where every caller since sends p_customer
-- — and leaving two functions of the same name is a trap for whoever reads this next.
drop function if exists place_order(order_type, uuid, text, text, jsonb);

analyze order_items;
analyze bills;
analyze kots;
analyze orders;
