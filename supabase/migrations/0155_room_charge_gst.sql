-- 0155 — Food charged to a room is taxed like the bill (2026-10-29, found by the interlink pass: "food ordered and room
-- booking sections must work together"). post_order_to_room put GST on the posted amount at the property's one rate, so a
-- dish with its own rate (0146 — say 18%) was taxed 5% on the folio and 18% on a bill: ₹360 of it gave ₹18 instead of ₹64.80.
-- Now it groups the order's lines by their rate (a dish without its own rate is at the property's) and asks bill_tax, the
-- same sum the bill and the guest's quote use. Everything else is as 0100.

CREATE OR REPLACE FUNCTION public.post_order_to_room(p_order_id uuid, p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := auth_restaurant_id(); amt numeric; ono int; r restaurants%rowtype; grp jsonb; tx jsonb; gst numeric;
begin
  if not exists (select 1 from bookings where id = p_booking_id and restaurant_id = rid and status = 'checked_in') then raise exception 'guest not checked in'; end if;
  -- 0098: the order must be this property's and still open (a billed order posted again is charged twice)
  if not exists (select 1 from orders where id = p_order_id and restaurant_id = rid and status = 'open') then raise exception 'order not found or already settled'; end if;
  select * into r from restaurants where id = rid;
  select coalesce(sum(price_snapshot*qty),0), max(o.order_no) into amt, ono from order_items i join orders o on o.id = i.order_id where i.order_id = p_order_id and i.status <> 'cancelled';
  -- 0155: the dishes' value per rate, as generate_bill groups them
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'amount', a)), '[]'::jsonb) into grp
    from (select coalesce(gst_rate, r.gst_rate) rate, sum(price_snapshot * qty) a from order_items
           where order_id = p_order_id and status <> 'cancelled' group by 1) g;
  update orders set booking_id = p_booking_id, status = 'billed' where id = p_order_id and restaurant_id = rid;
  update order_items set status = 'served' where order_id = p_order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = p_order_id;
  insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
    values (rid, p_booking_id, 'restaurant', 'Restaurant order #'||ono, amt, 'order', p_order_id, auth.uid());
  -- restaurant GST on the posted amount — none where the property does not collect it (0100)
  if gst_collectable(r.gst_scheme, r.gstin) and amt > 0 then
    tx := bill_tax(grp, amt, true);
    gst := (tx->>'cgst')::numeric + (tx->>'sgst')::numeric;
    if gst > 0 then
      insert into booking_charges(restaurant_id, booking_id, kind, description, amount, ref_type, ref_id, created_by)
        values (rid, p_booking_id, 'tax', 'GST on order #'||ono, gst, 'order', p_order_id, auth.uid());
    end if;
  end if;
  update dining_tables t set status = 'free' where t.id = (select table_id from orders where id = p_order_id)
    and not exists (select 1 from orders where table_id = t.id and status = 'open');
end $function$;

notify pgrst, 'reload schema';
