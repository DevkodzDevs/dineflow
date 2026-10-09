-- 0080 · Goes well with.
--
-- The till suggests what a property's own guests order together: for each dish, the three dishes
-- most often on the same ticket over the last p_days (default 90), seen together at least twice,
-- and still on sale. Learned from this property's tickets only — no shared model, nothing leaves.
--
-- A read. It is security invoker, so the tenant_all policies on orders and order_items apply as
-- they do to any select; the explicit auth_restaurant_id() filter only keeps the plan small. No new
-- table, so no new policy.
create or replace function menu_pairings(p_days int default 90)
returns table (item uuid, pair uuid, together int)
language sql stable security invoker set search_path = public as $$
  with lines as (
    select distinct i.order_id, i.menu_item_id
    from order_items i
    join orders o on o.id = i.order_id
    where i.restaurant_id = auth_restaurant_id()
      and i.menu_item_id is not null
      and o.status <> 'cancelled'
      and o.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 90), 7), 365))
  ), pairs as (
    select a.menu_item_id as item, b.menu_item_id as pair, count(*)::int as together
    from lines a
    join lines b on b.order_id = a.order_id and b.menu_item_id <> a.menu_item_id
    group by 1, 2
    having count(*) >= 2
  ), ranked as (
    select p.item, p.pair, p.together,
           row_number() over (partition by p.item order by p.together desc, p.pair) as rn
    from pairs p
    join menu_items m on m.id = p.pair and m.is_available
  )
  select item, pair, together from ranked where rn <= 3;
$$;

revoke all on function menu_pairings(int) from public, anon;
grant execute on function menu_pairings(int) to authenticated;
