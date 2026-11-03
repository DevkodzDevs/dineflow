-- 0169 — A stock count sent later keeps the sales made since (2026-11-03, the owner: "offline should work perfectly — store the
-- data and sync it properly when the internet comes back").
--
-- stock_count (0017) set each ingredient to the counted figure *when the call arrived*: delta = counted − current stock. A count
-- taken offline at 3 pm and synced at 6 pm therefore erased every sale, purchase and wastage of those three hours. Now the
-- device sends when it counted (`p_counted_at`); the adjustment is worked out against the stock as it stood then:
--   delta = counted + (every non-count movement since p_counted_at) − current stock
-- and an ingredient counted again after p_counted_at (a newer count — or this same count already applied, which makes a replay
-- harmless) is left alone. With p_counted_at null it is 0017's rule, unchanged (the online path).
--
-- The one-argument stock_count is dropped and replaced by a two-argument one with a default, so a call naming only p_counts
-- still resolves (one function, no ambiguous overload). Security definer, search_path pinned, the caller's property only, as
-- 0017; granted to authenticated as before. No new table, column or policy.

drop function if exists public.stock_count(jsonb);
create or replace function public.stock_count(p_counts jsonb, p_counted_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); c jsonb; ing ingredients; since numeric; expected numeric; delta numeric;
        n int := 0; total_gap numeric := 0; at timestamptz := least(coalesce(p_counted_at, now()), now());
begin
  if rid is null then raise exception 'not signed in'; end if;
  for c in select * from jsonb_array_elements(p_counts) loop
    select * into ing from ingredients where id = (c->>'ingredient_id')::uuid and restaurant_id = rid;
    if not found then continue; end if;
    if p_counted_at is not null then
      -- counted again since (or this very count already applied): the newer figure stands
      if exists (select 1 from stock_ledger l where l.ingredient_id = ing.id and l.restaurant_id = rid and l.ref_type = 'count' and l.created_at > at) then continue; end if;
      select coalesce(sum(l.qty), 0) into since from stock_ledger l
       where l.ingredient_id = ing.id and l.restaurant_id = rid and l.created_at > at and l.ref_type is distinct from 'count';
    else
      since := 0;
    end if;
    expected := ing.current_stock - since;                       -- what the shelf held when it was counted
    delta := (c->>'counted')::numeric - expected;
    insert into stock_ledger(restaurant_id, ingredient_id, qty, reason, ref_type, note, created_by)
      values (rid, ing.id, delta, 'adjustment', 'count',
              jsonb_build_object('counted', (c->>'counted')::numeric, 'expected', expected, 'counted_at', p_counted_at)::text, auth.uid());
    n := n + 1; total_gap := total_gap + abs(delta) * coalesce(ing.cost_per_unit, 0);
  end loop;
  return jsonb_build_object('counted', n, 'gap_value', round(total_gap, 0));
end $$;
revoke all on function public.stock_count(jsonb, timestamptz) from public, anon;
grant execute on function public.stock_count(jsonb, timestamptz) to authenticated;

notify pgrst, 'reload schema';
