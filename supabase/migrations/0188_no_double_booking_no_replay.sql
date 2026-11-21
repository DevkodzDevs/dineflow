-- 0188 · Two guarantees the database itself now keeps (2026-11-17, the owner's "security wise best?" review; both were on the
-- 2026-11-09 review's list of open defects):
--
-- 1. **A room is never booked twice for the same night.** `create_booking`, `public_book` (the booking page) and
--    `ingest_ota_booking` each pick a room by reading what is free and then inserting — two of them at once could both win.
--    An exclusion constraint (btree_gist) refuses the second insert or update whose [check_in, check_out) overlaps a live
--    booking on the same room: live = reserved or checked_in; cancelled, no_show and checked_out stays do not hold the room
--    (a guest who left early frees it for a new arrival before the old check_out). The live table had no such overlap on
--    2026-11-17 (48 checked_out, 8 checked_in, 7 reserved), so the constraint attaches cleanly. A caller that loses the race
--    gets the exclusion error instead of a double booking — the screens show the message as they show any refusal.
--
-- 2. **An aggregator's replayed webhook cannot rewrite an order the kitchen has taken.** `ingest_online_order` (0005)
--    upserted on (restaurant_id, external_id) and overwrote items, gross and raw on every delivery of the same id — so a
--    late duplicate, or anyone holding the channel token, could change an accepted order's lines and total. The upsert now
--    updates only while the order is still `new`; after that a repeat is answered with the existing id and leaves the row
--    alone. The body is 0005's otherwise (prices still come from the aggregator's payload — that is what the payload is).
--
-- RLS: unchanged. The constraint and the function body change nothing about who may read or write.

create extension if not exists btree_gist;

alter table bookings drop constraint if exists bookings_no_double_booking;
alter table bookings add constraint bookings_no_double_booking
  exclude using gist (room_id with =, daterange(check_in, check_out, '[)') with &&)
  where (room_id is not null and status in ('reserved', 'checked_in'));

create or replace function ingest_online_order(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ch order_channels%rowtype; ext text; items jsonb := '[]'; unmatched jsonb := '[]';
        it jsonb; mi menu_items%rowtype; gross numeric; comm numeric; oid uuid; nm text; qty numeric; price numeric; ref text;
begin
  select * into ch from order_channels where webhook_token = p_token;
  if not found then raise exception 'unknown channel'; end if;
  ext := coalesce(p_payload->>'id', p_payload->>'external_id', p_payload->'order'->>'id', p_payload->>'order_id', gen_random_uuid()::text);

  -- a repeat of an order the restaurant has already acted on: say which one it is, change nothing (0188)
  select id into oid from online_orders where restaurant_id = ch.restaurant_id and external_id = ext and status <> 'new';
  if found then return jsonb_build_object('ok', true, 'id', oid, 'unmatched', '[]'::jsonb, 'replay', true); end if;

  for it in select * from jsonb_array_elements(coalesce(p_payload->'items', p_payload->'dishes', p_payload->'order'->'items', '[]'::jsonb)) loop
    nm := coalesce(it->>'name', it->>'title');
    qty := coalesce((it->>'qty')::numeric, (it->>'quantity')::numeric, 1);
    price := coalesce((it->>'price')::numeric, (it->>'unit_cost')::numeric, 0);
    ref := coalesce(it->>'ref', it->>'merchant_ref_id', it->>'dish_id', '');
    select * into mi from menu_items where restaurant_id = ch.restaurant_id and is_active
      and (lower(name) = lower(trim(nm)) or (ref <> '' and external_refs->>ch.kind::text = ref)) limit 1;
    if found then
      items := items || jsonb_build_object('menu_item_id', mi.id, 'name', mi.name, 'qty', qty, 'price', case when price > 0 then price else mi.price end, 'note', it->>'note');
    else
      items := items || jsonb_build_object('menu_item_id', null, 'name', nm, 'qty', qty, 'price', price, 'note', it->>'note');
      unmatched := unmatched || to_jsonb(nm);
    end if;
  end loop;

  gross := coalesce((p_payload->>'total')::numeric, (p_payload->>'gross')::numeric, (p_payload->>'net_amount')::numeric,
                    (p_payload->'order'->'details'->>'order_total')::numeric,
                    (select sum((x->>'qty')::numeric * (x->>'price')::numeric) from jsonb_array_elements(items) x), 0);
  comm := round(gross * ch.commission_pct / 100, 2);

  insert into online_orders(restaurant_id, channel_id, external_id, display_id, customer_name, customer_phone, address, items, unmatched, gross, commission, payout, is_prepaid, raw, placed_at)
    values (ch.restaurant_id, ch.id, ext, coalesce(p_payload->>'display_id', ext),
            coalesce(p_payload->>'customer_name', p_payload->'customer'->>'name', p_payload->'order'->'customer'->>'name'),
            coalesce(p_payload->>'customer_phone', p_payload->'customer'->>'phone'),
            coalesce(p_payload->>'address', p_payload->'customer'->>'address'),
            items, unmatched, gross, comm, gross - comm, coalesce((p_payload->>'is_prepaid')::boolean, true), p_payload, now())
    on conflict (restaurant_id, external_id) do update set items = excluded.items, gross = excluded.gross, commission = excluded.commission, payout = excluded.payout, raw = excluded.raw
      where online_orders.status = 'new'
    returning id into oid;
  if oid is null then select id into oid from online_orders where restaurant_id = ch.restaurant_id and external_id = ext; end if;
  update order_channels set last_sync_at = now() where id = ch.id;
  return jsonb_build_object('ok', true, 'id', oid, 'unmatched', unmatched);
end $$;
revoke all on function ingest_online_order(text, jsonb) from public;
grant execute on function ingest_online_order(text, jsonb) to anon, authenticated;
