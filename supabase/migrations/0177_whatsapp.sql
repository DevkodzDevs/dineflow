-- 0177 — WhatsApp as the nervous system, first tier (2026-11-09).
--
-- Until now WhatsApp was a wa.me link somebody pressed (lib/wa.ts) and the owner's number for Tomorrow's brief
-- (restaurants.brief_whatsapp, 0006). This adds real sending through the Meta WhatsApp Business Cloud API, from the
-- property's OWN number: DineFlow holds nothing but the property's credentials, server-side, and never pays for a message.
--
--   wa_settings   one row per property — the phone number id, the access token (write-only through the API, like a
--                 partner key after 0121), the template language and the per-event switches.
--   wa_outbox     every message the app wants sent: queued → sent (the API accepted it; provider_id is Meta's wamid)
--                 → delivered / read (Meta's status webhook) or failed. Nothing is sent inline: a server action queues,
--                 the sender (/api/cron/whatsapp, the service role) drains. One dedupe key per property stops a retry
--                 from sending twice.
--
-- Functions (all definer, pinned search_path, anon has none):
--   wa_settings_set(...)       the owner; a blank token keeps the saved one, the word 'clear' removes it; blank phone id
--                              removes the row. Refused when the add-on is off.
--   wa_settings_get()          owner and manager; never the token — only has_token.
--   wa_queue(...)              any signed-in person of the property (the events happen at the till, the desk, the
--                              reservation book): refuses when the add-on is off, there are no settings, the event's switch
--                              is off, the number is unusable, the template is not one the app knows, or 300 have been
--                              queued this hour. Returns the row's id, or null when nothing was queued. Never raises for
--                              "not now" — the write that caused it has already happened.
--   wa_outbox_take(limit)      the service role (the sender): claims queued rows and hands them back WITH the property's
--                              credentials. wa_outbox_done(id, provider_id, error) records the answer; an error is retried
--                              up to 3 times, then failed. wa_outbox_status(provider_id, status, error) is the webhook's.
--   wa_outbox_list(limit)      owner and manager: the last rows, newest first (Settings → WhatsApp).
--   (2026-11-10, before this file was applied: the kind 'table_ready' and the switch on_table_ready — a waiting guest who
--   ticked WhatsApp on the queue page is told their table is ready when the host calls them; 0179 holds the queue side.)
--   default_features()         re-created with 'whatsapp' among the 21 defaults (features.ts must agree; features.test.ts
--                              reads this file).

-- ── settings ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists wa_settings (
  restaurant_id       uuid primary key references restaurants(id) on delete cascade,
  phone_number_id     text not null,
  access_token        text,                                   -- Meta's permanent system-user token; never selectable through the API
  lang                text not null default 'en' check (lang in ('en', 'ta', 'hi')),
  on_reservation      boolean not null default true,          -- a table reservation confirmed → the guest
  on_booking          boolean not null default true,          -- a room booked at the desk → the guest
  on_bill             boolean not null default true,          -- a bill paid with a customer phone → the e-bill link
  on_day_close        boolean not null default true,          -- the day close → the owner's brief_whatsapp number
  on_alert            boolean not null default true,          -- a void, or a discount over the line → the owner
  on_shift_reminder   boolean not null default false,         -- a template and a switch; nothing queues it in this tier
  on_table_ready      boolean not null default true,          -- a waiting guest called from Pulse / Join by QR, who ticked WhatsApp → their table is ready
  alert_discount_over numeric(12,2) not null default 500 check (alert_discount_over >= 0),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
alter table wa_settings enable row level security;
drop policy if exists wa_settings_owner_read on wa_settings;
create policy wa_settings_owner_read on wa_settings for select
  using (restaurant_id = auth_restaurant_id() and auth_role() = 'owner');
-- no insert / update / delete policy: the row changes only through wa_settings_set
revoke all on wa_settings from public, anon, authenticated;
grant select (restaurant_id, phone_number_id, lang, on_reservation, on_booking, on_bill, on_day_close, on_alert, on_shift_reminder, on_table_ready,
              alert_discount_over, updated_at) on wa_settings to authenticated;   -- every column but access_token (0121's rule)
grant all on wa_settings to service_role;

-- ── outbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists wa_outbox (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  to_phone      text not null,                                 -- digits only, country code first (91…): what the API takes
  kind          text not null check (kind in ('reservation', 'booking', 'bill', 'day_close', 'alert', 'shift_reminder', 'table_ready', 'test')),
  template      text not null,                                 -- the Meta template's name (lib/whatsapp-templates.ts)
  lang          text not null default 'en',
  params        jsonb not null default '[]'::jsonb,            -- the body's {{1}}…{{n}}, in order, as text
  document_url  text,                                          -- when set, a document message follows the template
  status        text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  attempts      int not null default 0,
  provider_id   text,                                          -- Meta's message id (wamid.…)
  error         text,
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  taken_at      timestamptz,
  sent_at       timestamptz,
  delivered_at  timestamptz
);
create unique index if not exists wa_outbox_dedupe_idx   on wa_outbox(restaurant_id, dedupe_key) where dedupe_key is not null;
create unique index if not exists wa_outbox_provider_idx on wa_outbox(provider_id) where provider_id is not null;
create index        if not exists wa_outbox_queued_idx   on wa_outbox(created_at) where status = 'queued';
create index        if not exists wa_outbox_rid_idx      on wa_outbox(restaurant_id, created_at desc);
alter table wa_outbox enable row level security;
drop policy if exists wa_outbox_read on wa_outbox;
create policy wa_outbox_read on wa_outbox for select
  using (restaurant_id = auth_restaurant_id() and auth_role() in ('owner', 'manager'));
-- no insert / update / delete policy: rows come from wa_queue and change through the sender's functions
revoke all on wa_outbox from public, anon, authenticated;
grant select on wa_outbox to authenticated;
grant all on wa_outbox to service_role;

-- ── the owner's settings ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.wa_settings_set(
  p_phone_number_id text, p_access_token text, p_lang text,
  p_on_reservation boolean, p_on_booking boolean, p_on_bill boolean, p_on_day_close boolean, p_on_alert boolean, p_on_shift_reminder boolean,
  p_alert_discount_over numeric default 500, p_on_table_ready boolean default true
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
                          on_table_ready, alert_discount_over, updated_at, updated_by)
  values (rid, pid,
          case when lower(tok) = 'clear' then null when tok = '' then cur.access_token else tok end,   -- blank keeps the saved one
          p_lang, coalesce(p_on_reservation, true), coalesce(p_on_booking, true), coalesce(p_on_bill, true), coalesce(p_on_day_close, true),
          coalesce(p_on_alert, true), coalesce(p_on_shift_reminder, false), coalesce(p_on_table_ready, true), greatest(0, coalesce(p_alert_discount_over, 500)), now(), auth.uid())
  on conflict (restaurant_id) do update set
    phone_number_id = excluded.phone_number_id, access_token = excluded.access_token, lang = excluded.lang,
    on_reservation = excluded.on_reservation, on_booking = excluded.on_booking, on_bill = excluded.on_bill, on_day_close = excluded.on_day_close,
    on_alert = excluded.on_alert, on_shift_reminder = excluded.on_shift_reminder, on_table_ready = excluded.on_table_ready, alert_discount_over = excluded.alert_discount_over,
    updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'has_token', exists (select 1 from wa_settings w where w.restaurant_id = rid and nullif(w.access_token, '') is not null));
end $$;
revoke all on function public.wa_settings_set(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, numeric, boolean) from public, anon;
grant execute on function public.wa_settings_set(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, numeric, boolean) to authenticated;

/** Owner and manager. Never the token: has_token says whether one is saved. Null when WhatsApp is not set up. */
create or replace function public.wa_settings_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role() in ('owner', 'manager') then (
    select jsonb_build_object(
      'phone_number_id', w.phone_number_id, 'has_token', nullif(w.access_token, '') is not null, 'lang', w.lang,
      'on_reservation', w.on_reservation, 'on_booking', w.on_booking, 'on_bill', w.on_bill, 'on_day_close', w.on_day_close,
      'on_alert', w.on_alert, 'on_shift_reminder', w.on_shift_reminder, 'on_table_ready', w.on_table_ready, 'alert_discount_over', w.alert_discount_over, 'updated_at', w.updated_at)
    from wa_settings w where w.restaurant_id = auth_restaurant_id()
  ) end;
$$;
revoke all on function public.wa_settings_get() from public, anon;
grant execute on function public.wa_settings_get() to authenticated;

-- ── queueing ────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Queue one message for the signed-in property. Returns the row's id, or null when nothing was queued: the add-on off, no
 * settings or no token, the event's switch off, an unusable number, a template the app does not know, a duplicate (dedupe),
 * an alert under the owner's line (p_amount against alert_discount_over), or 300 already queued this hour. A 'test' is the
 * owner's alone. Ten digits are an Indian mobile: 91 goes in front (lib/wa.ts's rule).
 */
create or replace function public.wa_queue(
  p_kind text, p_to text, p_template text, p_params jsonb default '[]'::jsonb, p_document_url text default null, p_dedupe text default null,
  p_amount numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); w wa_settings%rowtype; digits text; oid uuid;
begin
  if rid is null or auth.uid() is null then return null; end if;
  if p_kind not in ('reservation', 'booking', 'bill', 'day_close', 'alert', 'shift_reminder', 'table_ready', 'test') then return null; end if;
  if p_template !~ '^dineflow_[a-z_]{2,40}$' then return null; end if;
  if p_kind = 'test' and auth_role() is distinct from 'owner' then return null; end if;
  if not has_feature('whatsapp') then return null; end if;
  select * into w from wa_settings where restaurant_id = rid;
  if not found or nullif(w.access_token, '') is null then return null; end if;
  if (p_kind = 'reservation' and not w.on_reservation) or (p_kind = 'booking' and not w.on_booking) or (p_kind = 'bill' and not w.on_bill)
     or (p_kind = 'day_close' and not w.on_day_close) or (p_kind = 'alert' and not w.on_alert) or (p_kind = 'shift_reminder' and not w.on_shift_reminder)
     or (p_kind = 'table_ready' and not w.on_table_ready) then
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

-- ── the sender (service role only) ──────────────────────────────────────────────────────────────────────────────────
/** Claim up to p_limit queued rows (a row taken over 2 minutes ago and not answered is claimed again) with the credentials to send them. */
create or replace function public.wa_outbox_take(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  -- a row whose property lost its settings or token can never go: say so once and stop
  update wa_outbox o set status = 'failed', error = 'WhatsApp is no longer set up for this property'
   where o.status = 'queued' and not exists (select 1 from wa_settings w where w.restaurant_id = o.restaurant_id and nullif(w.access_token, '') is not null);
  with pick as (
    select id from wa_outbox
     where status = 'queued' and (taken_at is null or taken_at < now() - interval '2 minutes')
     order by created_at limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update skip locked
  ), taken as (
    update wa_outbox o set taken_at = now(), attempts = o.attempts + 1 from pick where o.id = pick.id
    returning o.id, o.restaurant_id, o.to_phone, o.kind, o.template, o.lang, o.params, o.document_url, o.attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'to', t.to_phone, 'kind', t.kind, 'template', t.template, 'lang', t.lang, 'params', t.params,
           'document_url', t.document_url, 'attempts', t.attempts, 'name', r.name,
           'phone_number_id', w.phone_number_id, 'access_token', w.access_token) order by t.attempts, t.id), '[]'::jsonb)
    into out
    from taken t join wa_settings w on w.restaurant_id = t.restaurant_id join restaurants r on r.id = t.restaurant_id;
  return out;
end $$;
revoke all on function public.wa_outbox_take(int) from public, anon, authenticated;
grant execute on function public.wa_outbox_take(int) to service_role;

/** The API's answer for one row: a provider id → sent; an error → queued again (up to 3 tries), then failed. */
create or replace function public.wa_outbox_done(p_id uuid, p_provider_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_provider_id, '')), '') is not null then
    update wa_outbox set status = 'sent', provider_id = left(trim(p_provider_id), 120), sent_at = now(), error = null
     where id = p_id and status = 'queued';
  else
    update wa_outbox set status = case when attempts >= 3 then 'failed' else 'queued' end, error = left(coalesce(p_error, 'not sent'), 400)
     where id = p_id and status = 'queued';
  end if;
end $$;
revoke all on function public.wa_outbox_done(uuid, text, text) from public, anon, authenticated;
grant execute on function public.wa_outbox_done(uuid, text, text) to service_role;

/** Meta's status webhook: sent / delivered / read / failed for a message id. Idempotent — a status never moves backwards. */
create or replace function public.wa_outbox_status(p_provider_id text, p_status text, p_error text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return false; end if;
  update wa_outbox set
    status = case when p_status = 'failed' then 'failed'
                  when p_status = 'read' then 'read'
                  when p_status = 'delivered' and status <> 'read' then 'delivered'
                  else status end,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, now()) else delivered_at end,
    error = case when p_status = 'failed' then left(coalesce(p_error, 'failed'), 400) else error end
   where provider_id = p_provider_id and status <> 'failed';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.wa_outbox_status(text, text, text) from public, anon, authenticated;
grant execute on function public.wa_outbox_status(text, text, text) to service_role;

-- ── the owner's log ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.wa_outbox_list(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role() in ('owner', 'manager') then coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'to', o.to_phone, 'kind', o.kind, 'template', o.template, 'status', o.status,
                                        'error', o.error, 'attempts', o.attempts, 'created_at', o.created_at, 'sent_at', o.sent_at, 'delivered_at', o.delivered_at)
                     order by o.created_at desc)
    from (select * from wa_outbox where restaurant_id = auth_restaurant_id() order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) o
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.wa_outbox_list(int) from public, anon;
grant execute on function public.wa_outbox_list(int) to authenticated;

-- ── the add-on: on by default (0175's body + 'whatsapp'; features.ts and features.test.ts agree) ────────────────────
create or replace function public.default_features() returns text[]
language sql immutable set search_path = public as $$
  select array['intelligence','controls','audit','chain','payroll','expenses','tasks','work-records','voice','cleaning','tables',
               'lock','connections','night-audit','promise','till-pairings','receipt-extras','ai','till-voice','scan-vision','whatsapp']::text[];
$$;
revoke all on function public.default_features() from public;
grant execute on function public.default_features() to authenticated, service_role;

notify pgrst, 'reload schema';
