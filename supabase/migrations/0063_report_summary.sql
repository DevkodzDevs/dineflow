-- 0063 · Reports counts in the database instead of in the browser.
--
-- The page fetched every raw row inside the window and added them up in JavaScript: every paid bill,
-- every order_item, every stock_ledger line. For a week on a quiet property that is fine. For ninety
-- days on a busy one it is not, and it fails in the worst way — PostgREST caps a request at 1000 rows
-- by default and says nothing, so the totals simply stop counting partway through. A restaurant doing
-- 150 covers a day writes roughly 450 order_items and 3,600 ledger rows a day; at ninety days the
-- report was showing about two days of data while the heading said ninety.
--
-- So the numbers are computed here, where the rows already live, and the page receives a few dozen
-- summary rows instead of hundreds of thousands. The window stops mattering: ninety days costs the
-- browser exactly what one day costs.

create or replace function report_summary(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with rid as (select auth_restaurant_id() as id),
  win as (select (now() - (greatest(1, least(365, p_days)) || ' days')::interval) as since),
  -- paid bills: the headline, and the by-day series behind the chart
  b as (
    select b.id, b.total, b.paid_at
    from bills b, rid, win
    where b.restaurant_id = rid.id and b.status = 'paid' and b.paid_at >= win.since
  ),
  by_day as (
    select to_char((paid_at at time zone 'Asia/Kolkata')::date, 'DD Mon') as day,
           (paid_at at time zone 'Asia/Kolkata')::date as d,
           sum(total) as total
    from b group by 1, 2
  ),
  pay as (
    select p.method, sum(p.amount) as amount
    from payments p join b on b.id = p.bill_id group by p.method
  ),
  -- what sold, for the top-dishes chart
  top as (
    select oi.name_snapshot as name, sum(oi.qty)::numeric as qty,
           sum(oi.qty * oi.price_snapshot) as rev
    from order_items oi join orders o on o.id = oi.order_id, rid, win
    where oi.restaurant_id = rid.id and oi.created_at >= win.since
      and oi.status <> 'cancelled' and o.status = 'billed'
    group by 1 order by 2 desc limit 12
  ),
  -- what it cost, from the ledger the kitchen actually drew down
  cons as (
    select i.name, i.unit, coalesce(i.cost_per_unit, 0) as cost,
           sum(case when l.reason = 'sale'    then -l.qty else 0 end) as used,
           sum(case when l.reason = 'wastage' then -l.qty else 0 end) as waste
    from stock_ledger l join ingredients i on i.id = l.ingredient_id, rid, win
    where l.restaurant_id = rid.id and l.created_at >= win.since and l.reason in ('sale', 'wastage')
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'sales',      coalesce((select sum(total) from b), 0),
    'bills',      (select count(*) from b),
    'by_day',     coalesce((select jsonb_agg(jsonb_build_object('day', day, 'total', total) order by d) from by_day), '[]'::jsonb),
    'payments',   coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount)) from pay), '[]'::jsonb),
    'top',        coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'rev', rev)) from top), '[]'::jsonb),
    'consumption',coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'cost', cost, 'used', used, 'waste', waste)
                                             order by used * cost desc) from cons where used <> 0 or waste <> 0), '[]'::jsonb),
    'cogs',       coalesce((select sum(used  * cost) from cons), 0),
    'waste_cost', coalesce((select sum(waste * cost) from cons), 0)
  );
$$;
revoke all on function report_summary(int) from public, anon;
grant execute on function report_summary(int) to authenticated;

-- The kitchen board reads the same three statuses with no time bound, so a ticket nobody ever marked
-- ready is fetched and rendered for the rest of the property's life — and the board slows a little
-- more every week. This counts what is older than the board's window, so the screen can say "3 older
-- tickets are still open" rather than either carrying them forever or hiding them without a word.
create or replace function stale_kot_count(p_hours int default 24) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from kots k
  where k.restaurant_id = auth_restaurant_id()
    and k.status in ('pending', 'preparing')
    and k.created_at < now() - (greatest(1, p_hours) || ' hours')::interval;
$$;

create index if not exists kots_rid_status_created_idx on kots(restaurant_id, status, created_at desc);
create index if not exists order_items_rid_status_created_idx on order_items(restaurant_id, status, created_at desc);
