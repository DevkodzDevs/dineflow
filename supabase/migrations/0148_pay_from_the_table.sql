-- 0148 — The guest pays from the table (2026-10-29, the owner: Stage 3, item 13 — "the guest taps Pay, pays, the table closes").
-- The card payment itself was built (pay_link, /pay/[token], /api/pay/[token]/order|verify, the Razorpay webhook — the
-- property's own Razorpay account, its money straight to it). What was missing was the way there: dine_table_orders now
-- hands the guest's live order card its bill's pay link while the bill is unpaid (only to whoever holds the table's code
-- and their own order ids — the bill is theirs). pay_link also says the bill's packing & delivery and 9(5), 0146's parts.

create or replace function public.dine_table_orders(p_slug text, p_table text, p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'ref', o.display_id, 'at', o.created_at, 'total', o.gross, 'order_no', ord.order_no,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', (i->>'qty')::numeric)), '[]'::jsonb) from jsonb_array_elements(o.items) i),
      'n', coalesce(s.n, 0), 'ready', coalesce(s.ready, 0) + coalesce(s.served, 0), 'served', coalesce(s.served, 0), 'bill', bl.total, 'pay', bl.pay,
      'stage', case
        when o.status::text in ('rejected', 'cancelled') or ord.status::text = 'cancelled' then 'rejected'
        when o.order_id is null then 'sent'
        when bl.paid then 'paid'
        when bl.total is not null then 'bill'
        when coalesce(s.n, 0) = 0 then 'accepted'
        when s.served = s.n then 'served'
        when s.ready + s.served = s.n then 'ready'
        when s.cooking + s.ready + s.served > 0 then 'cooking'
        else 'accepted' end) as x
    from online_orders o
    join dining_tables t on t.id = o.table_id and t.qr_token = p_table
    join restaurants r on r.id = o.restaurant_id and r.booking_slug = p_slug
    left join orders ord on ord.id = o.order_id
    left join lateral (
      select count(*) filter (where i.status <> 'cancelled') as n, count(*) filter (where i.status = 'preparing') as cooking,
             count(*) filter (where i.status = 'ready') as ready, count(*) filter (where i.status = 'served') as served
        from order_items i where i.order_id = o.order_id) s on true
    left join lateral (
      select bool_or(b.status = 'paid') as paid, sum(b.total) filter (where b.status <> 'void') as total,
             -- 0148: the bill's own pay link while it is unpaid, so the guest can pay from the table
             max(b.pay_token) filter (where b.status = 'unpaid') as pay
        from bills b where b.order_id = o.order_id and b.status <> 'void') bl on true
    where p_table is not null and o.id = any(p_ids[1:10]) and o.created_at > now() - interval '12 hours'
  ) q
$$;
revoke all on function public.dine_table_orders(text, text, uuid[]) from public;
grant execute on function public.dine_table_orders(text, text, uuid[]) to anon, authenticated;

create or replace function public.pay_link(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'bill_no', b.bill_no, 'status', b.status, 'total', b.total, 'subtotal', b.subtotal,
    'discount', b.discount_amount, 'service', b.service_charge, 'cgst', b.cgst, 'sgst', b.sgst, 'round_off', b.round_off,
    -- 0148: packing & delivery, and whether an operator paid the GST (section 9(5)) — so the page adds up like the bill
    'charges', b.charges, 'eco', b.gst_by_operator,
    'created_at', b.created_at, 'paid_at', b.paid_at, 'claim_ref', b.pay_claim_ref,
    'where', case when t.name is not null then 'Table ' || t.name else initcap(replace(o.type::text, '_', ' ')) end,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.name_snapshot || case when jsonb_array_length(coalesce(i.addons, '[]'::jsonb)) > 0
                                                then ' + ' || (select string_agg(e->>'name', ', ') from jsonb_array_elements(i.addons) e) else '' end,
                'qty', i.qty, 'price', i.price_snapshot) order by i.created_at), '[]'::jsonb)
              from order_items i where i.order_id = o.id and i.status <> 'cancelled'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'ref', p.ref) order by p.created_at), '[]'::jsonb)
                 from payments p where p.bill_id = b.id),
    'restaurant', jsonb_build_object('name', r.name, 'address', r.address, 'phone', r.phone, 'gstin', r.gstin, 'logo_url', r.logo_url, 'brand_colour', r.brand_colour),
    'upi', case when nullif(trim(r.upi_vpa), '') is not null
                then jsonb_build_object('vpa', trim(r.upi_vpa), 'payee', coalesce(nullif(trim(r.upi_payee), ''), r.name)) end,
    'gateway', case when g.key_id is not null and nullif(g.key_secret, '') is not null
                    then jsonb_build_object('kind', g.provider, 'key_id', g.key_id) end
  )
  from bills b
  join orders o on o.id = b.order_id
  join restaurants r on r.id = b.restaurant_id
  left join dining_tables t on t.id = o.table_id
  left join payment_gateways g on g.restaurant_id = r.id
  where b.pay_token = p_token and b.status <> 'void'
$function$;

notify pgrst, 'reload schema';
