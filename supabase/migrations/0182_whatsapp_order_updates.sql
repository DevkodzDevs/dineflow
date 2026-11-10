-- 0182 — WhatsApp updates for the guest's own online order (2026-11-10): accepted, ready, out for delivery.
--
-- The owner's storefront ('website' channel) now tells the guest where their order is, through the 0177 outbox and the
-- property's own WhatsApp number — the same rail as a reservation or a bill. Three templates (dineflow_order_accepted,
-- _order_ready, _order_out) and one switch (wa_settings.on_order). The app queues them from the counter's own actions
-- (accept → accepted; Food ready → ready; Send out / assign a rider → out for delivery) with queueWhatsApp, which already
-- says no when the add-on, the number or the switch is off and never fails the action. Aggregator orders are left to the
-- aggregator's own app (the enqueue is only for the 'website' channel, checked in the action).
--
-- Additive: a column, and wa_queue / wa_settings_set / wa_settings_get recreated with on_order. 0177 must be applied first.
-- NOT here: a message when a takeaway is collected (the guest is already there); storefront loyalty / coupon code (0183).

-- 1 · the switch (default on). A property that set WhatsApp up before this gets order updates unless it turns them off.
alter table wa_settings add column if not exists on_order boolean not null default true;

-- the outbox kind check must allow the three new kinds (named constraint, dropped and re-added)
alter table wa_outbox drop constraint if exists wa_outbox_kind_check;
alter table wa_outbox add constraint wa_outbox_kind_check check (kind in ('reservation', 'booking', 'bill', 'day_close', 'alert', 'shift_reminder', 'table_ready', 'order_accepted', 'order_ready', 'order_out', 'test'));

-- 2 · wa_queue: the three order kinds, gated on on_order
create or replace function public.wa_queue(
  p_kind text, p_to text, p_template text, p_params jsonb default '[]'::jsonb, p_document_url text default null, p_dedupe text default null,
  p_amount numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); w wa_settings%rowtype; digits text; oid uuid;
begin
  if rid is null or auth.uid() is null then return null; end if;
  if p_kind not in ('reservation', 'booking', 'bill', 'day_close', 'alert', 'shift_reminder', 'table_ready', 'order_accepted', 'order_ready', 'order_out', 'test') then return null; end if;
  if p_template !~ '^dineflow_[a-z_]{2,40}$' then return null; end if;
  if p_kind = 'test' and auth_role() is distinct from 'owner' then return null; end if;
  if not has_feature('whatsapp') then return null; end if;
  select * into w from wa_settings where restaurant_id = rid;
  if not found or nullif(w.access_token, '') is null then return null; end if;
  if (p_kind = 'reservation' and not w.on_reservation) or (p_kind = 'booking' and not w.on_booking) or (p_kind = 'bill' and not w.on_bill)
     or (p_kind = 'day_close' and not w.on_day_close) or (p_kind = 'alert' and not w.on_alert) or (p_kind = 'shift_reminder' and not w.on_shift_reminder)
     or (p_kind = 'table_ready' and not w.on_table_ready)
     or (p_kind in ('order_accepted', 'order_ready', 'order_out') and not w.on_order) then   -- 0182: the storefront order updates, one switch
    return null;
  end if;
  if p_kind = 'alert' and p_amount is not null and p_amount < w.alert_discount_over then return null; end if;
  digits := ltrim(regexp_replace(coalesce(p_to, ''), '\D', '', 'g'), '0');
  if length(digits) = 10 then digits := '91' || digits; end if;
  if length(digits) < 11 or length(digits) > 15 then return null; end if;
  if p_document_url is not null and p_document_url !~ '^https://' then return null; end if;
  if jsonb_typeof(coalesce(p_params, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_params, '[]'::jsonb)) > 12 then return null; end if;
  if (select count(*) from wa_outbox o where o.restaurant_id = rid and o.created_at > now() - interval '1 hour') >= 300 then return null; end if;
  insert into wa_outbox(restaurant_id, to_phone, kind, template, lang, params, document_url, dedupe_key)
  values (rid, digits, p_kind, p_template, w.lang, coalesce(p_params, '[]'::jsonb), p_document_url, nullif(left(trim(p_dedupe), 120), ''))
  on conflict (restaurant_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into oid;
  return oid;
end $$;
revoke all on function public.wa_queue(text, text, text, jsonb, text, text, numeric) from public, anon;
grant execute on function public.wa_queue(text, text, text, jsonb, text, text, numeric) to authenticated;

-- 3 · wa_settings_set: carry on_order (new signature; the old one is dropped so there is no ambiguous overload)
drop function if exists public.wa_settings_set(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, numeric, boolean);
create or replace function public.wa_settings_set(
  p_phone_number_id text, p_access_token text, p_lang text,
  p_on_reservation boolean, p_on_booking boolean, p_on_bill boolean, p_on_day_close boolean, p_on_alert boolean, p_on_shift_reminder boolean,
  p_alert_discount_over numeric default 500, p_on_table_ready boolean default true, p_on_order boolean default true   -- 0182
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); pid text := nullif(trim(coalesce(p_phone_number_id, '')), ''); tok text := trim(coalesce(p_access_token, ''));
        cur wa_settings%rowtype;
begin
  if rid is null then raise exception 'not signed in'; end if;
  if auth_role() is distinct from 'owner' then raise exception 'only the owner can set up WhatsApp' using errcode = '42501'; end if;
  if not has_feature('whatsapp') then raise exception 'WhatsApp messages is not on for this property — Master control switches it on'; end if;
  if p_lang not in ('en', 'ta', 'hi') then raise exception 'language must be en, ta or hi'; end if;
  if pid is null then
    delete from wa_settings where restaurant_id = rid;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  if pid !~ '^[0-9]{6,20}$' then raise exception 'the phone number id is the number Meta shows under the phone, digits only'; end if;
  if length(tok) > 4096 then raise exception 'that token is too long'; end if;
  select * into cur from wa_settings where restaurant_id = rid;
  insert into wa_settings(restaurant_id, phone_number_id, access_token, lang, on_reservation, on_booking, on_bill, on_day_close, on_alert, on_shift_reminder,
                          on_table_ready, on_order, alert_discount_over, updated_at, updated_by)
  values (rid, pid,
          case when lower(tok) = 'clear' then null when tok = '' then cur.access_token else tok end,   -- blank keeps the saved one
          p_lang, coalesce(p_on_reservation, true), coalesce(p_on_booking, true), coalesce(p_on_bill, true), coalesce(p_on_day_close, true),
          coalesce(p_on_alert, true), coalesce(p_on_shift_reminder, false), coalesce(p_on_table_ready, true), coalesce(p_on_order, true), greatest(0, coalesce(p_alert_discount_over, 500)), now(), auth.uid())
  on conflict (restaurant_id) do update set
    phone_number_id = excluded.phone_number_id, access_token = excluded.access_token, lang = excluded.lang,
    on_reservation = excluded.on_reservation, on_booking = excluded.on_booking, on_bill = excluded.on_bill, on_day_close = excluded.on_day_close,
    on_alert = excluded.on_alert, on_shift_reminder = excluded.on_shift_reminder, on_table_ready = excluded.on_table_ready, on_order = excluded.on_order, alert_discount_over = excluded.alert_discount_over,
    updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'has_token', exists (select 1 from wa_settings w where w.restaurant_id = rid and nullif(w.access_token, '') is not null));
end $$;
revoke all on function public.wa_settings_set(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, numeric, boolean, boolean) from public, anon;
grant execute on function public.wa_settings_set(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, numeric, boolean, boolean) to authenticated;

-- 4 · wa_settings_get: report on_order too
create or replace function public.wa_settings_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role() in ('owner', 'manager') then (
    select jsonb_build_object(
      'phone_number_id', w.phone_number_id, 'has_token', nullif(w.access_token, '') is not null, 'lang', w.lang,
      'on_reservation', w.on_reservation, 'on_booking', w.on_booking, 'on_bill', w.on_bill, 'on_day_close', w.on_day_close,
      'on_alert', w.on_alert, 'on_shift_reminder', w.on_shift_reminder, 'on_table_ready', w.on_table_ready, 'on_order', w.on_order, 'alert_discount_over', w.alert_discount_over, 'updated_at', w.updated_at)
    from wa_settings w where w.restaurant_id = auth_restaurant_id()
  ) end;
$$;
revoke all on function public.wa_settings_get() from public, anon;
grant execute on function public.wa_settings_get() to authenticated;

notify pgrst, 'reload schema';
