-- ═══════════ Tax & GST: B2B taxable value ═══════════
-- A dining invoice is raised from its bill and carries the bill's subtotal and discount, but not
-- the service charge — which is part of the taxable value the bill's GST was computed on. The B2B
-- block therefore understated taxable value for a company guest's dining invoice by exactly the
-- service charge, while the outward table (built from bills) had it right. The B2B block now reads
-- the service charge back from the bill. GSTINs are also normalised (trim + upper) so one recipient
-- typed two ways is not listed twice.

create or replace function gst_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; dining jsonb; stay jsonb; b2b jsonb; dt jsonb; st jsonb;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into r from restaurants where id = rid;

  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into dining from (
    select jsonb_build_object('sac', '996331', 'kind', 'dining', 'rate', rate, 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select (subtotal - discount_amount + service_charge) as taxable, cgst, sgst, total,
                 round(case when (subtotal - discount_amount + service_charge) > 0 then (cgst + sgst) / (subtotal - discount_amount + service_charge) * 100 else 0 end, 1) as rate
          from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by rate) q;

  select coalesce(jsonb_agg(x order by (x->>'rate')::numeric), '[]'::jsonb) into stay from (
    select jsonb_build_object('sac', '996311', 'kind', 'stay', 'rate', rate, 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select (subtotal - discount) as taxable, cgst, sgst, total,
                 round(case when (subtotal - discount) > 0 then (cgst + sgst) / (subtotal - discount) * 100 else 0 end, 1) as rate
          from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by rate) q;

  select coalesce(jsonb_agg(x order by x->>'gstin'), '[]'::jsonb) into b2b from (
    select jsonb_build_object('gstin', gstin, 'name', max(name), 'count', count(*),
             'taxable', round(sum(taxable), 2), 'cgst', round(sum(cgst), 2), 'sgst', round(sum(sgst), 2), 'total', round(sum(total), 2)) as x
    from (select upper(trim(i.guest_gstin)) as gstin, i.guest_name as name,
                 i.subtotal - i.discount + coalesce(b.service_charge, 0) as taxable, i.cgst, i.sgst, i.total
          from invoices i left join bills b on b.id = i.bill_id
          where i.restaurant_id = rid and nullif(trim(i.guest_gstin), '') is not null
            and (i.issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to) s
    group by gstin) q;

  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount_amount + service_charge), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into dt from bills where restaurant_id = rid and status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  select jsonb_build_object('count', count(*), 'taxable', round(coalesce(sum(subtotal - discount), 0), 2),
           'cgst', round(coalesce(sum(cgst), 0), 2), 'sgst', round(coalesce(sum(sgst), 0), 2), 'total', round(coalesce(sum(total), 0), 2))
    into st from invoices where restaurant_id = rid and kind = 'stay' and (issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to;

  return jsonb_build_object('from', p_from, 'to', p_to, 'scheme', r.gst_scheme, 'gstin', r.gstin,
                            'dining', dining, 'stay', stay, 'b2b', b2b, 'dining_totals', dt, 'stay_totals', st);
end $$;
