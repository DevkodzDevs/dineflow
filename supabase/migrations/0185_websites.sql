-- 0185 — A website for every property (2026-11-14, the owner: "in Settings a Create website button; a checklist opens for
-- that client's restaurant, hotel or resort; from what is ticked, the website is made").
--
-- The website is not a second copy of anything. It is one row per property — which sections the owner ticked, a headline and
-- an About text — and the page (/site/<booking_slug>) is drawn from what the property already keeps: its menu, room types,
-- facilities, offers, photos, hours. A price changed in Menu is the price on the website.
--
--   websites                  one row per property; read by its own staff, written only by website_save
--   _website_sections(type)   the sections a kind of property can have — packages/shared/src/website.ts says the same
--                             (apps/web/lib/website.test.ts reads this file and checks)
--   _features_of(rid)         a property's add-ons by id (effective_features() answers only for the signed-in one)
--   _website_links(jsonb)     the links a website may carry (Instagram, Facebook, YouTube, the Google profile, a WhatsApp number),
--                             each checked against its own host — anything else is dropped
--   _website_options(jsonb)   the extras a client switched on for its website (an enquiry form, a review button, an announcement,
--                             the visitor count…): short keys, each a yes/no, a number or a short plain line — nothing else is kept
--   website_hits              how many times the page was opened and its buttons used, a day at a time — a count, never who
--   website_hit(slug, kind)   one more (anon; only where the client switched the count on)
--   website_stats(days)       the count, for the owner and managers
--   storage bucket `site`     the website's own files — gallery and room photos, a first-screen video, a 3D dish — one folder
--                             per property, written by its owner and managers only (the `brand` bucket is the logo's: saving
--                             a logo clears that folder)
--   _site_file(url, rid, …)   is this address a file in that property's own folder of the bucket?
--   room_types.photos         a room type's own photos (up to six), set by website_media_save
--   website_media_save(…)     the gallery (restaurants.photos) and each room type's photos, in one call (owner, manager)
--   websites.domain           the client's own web address (www.anjappar.com); website_by_domain(host) answers its slug
--   website_index()           the published websites, for the sitemap (anon): an address and a date, nothing else
--   website_setup()           the checklist: what is ready, what is switched off, and the saved website (owner, manager)
--   website_save(…)           create or change it (the owner; the add-on must be on); also the public email and the links
--   website_public(slug)      what a stranger may read (anon): published, a trial or membership that has not ended (0100),
--                             the add-on on; only the ticked sections; never an id, a key or a guest's phone. For search
--                             and the map it also carries the pincode, the food licence number and the property's pin
--                             (restaurants.lat/lng, else the point the owner set in Settings → Attendance)
--   default_features()        0177's body + 'website' — on by default; Master control switches it per plan and per property
--
-- Ordering, table booking, the queue and room booking are not rebuilt: the website's buttons open the pages that already
-- take them (/dine/<slug>, /queue/<slug>, /book/<slug>), and website_public says which of those will answer today (`can`).

create table if not exists public.websites (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  sections      text[]      not null default '{}',
  headline      text,
  about         text,
  published     boolean     not null default true,
  email         text,                                     -- a public address for guests; never the owner's sign-in email
  links         jsonb       not null default '{}'::jsonb, -- instagram, facebook, youtube, google (https), whatsapp (digits)
  options       jsonb       not null default '{}'::jsonb, -- the extras this client chose (packages/shared/src/website.ts, WEBSITE_EXTRAS)
  domain        text,                                     -- the client's own address, lower case, no scheme: www.anjappar.com
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint websites_headline_len check (headline is null or length(headline) <= 120),
  constraint websites_about_len    check (about is null or length(about) <= 1500),
  constraint websites_domain_ok    check (domain is null or (length(domain) between 4 and 120 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$')),
  constraint websites_email_ok     check (email is null or (length(email) <= 120 and email ~ '^[^@[:space:]<>"'']+@[^@[:space:]<>"'']+[.][a-z]{2,}$'))
);
create unique index if not exists websites_domain_idx on public.websites(domain) where domain is not null;
comment on table public.websites is 'One public website per property (0185): the sections ticked, a headline, an About. Written only by website_save().';

alter table public.websites enable row level security;
drop policy if exists websites_read on public.websites;
create policy websites_read on public.websites for select to authenticated using (restaurant_id = auth_restaurant_id());
-- no insert / update / delete policy: the browser does not write this table
revoke all on public.websites from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.websites from authenticated;
grant select on public.websites to authenticated;

/** The sections a kind of property can have, in the order the page shows them. Keep in step with website.ts. */
create or replace function public._website_sections(p_type text) returns text[]
language sql immutable set search_path = public as $$
  select case p_type
    when 'restaurant' then array['about','menu','order','reserve','queue','offers','gallery','reviews','contact']
    when 'hotel'      then array['about','rooms','book','menu','order','reserve','offers','gallery','reviews','contact']
    else                   array['about','rooms','book','facilities','menu','order','reserve','offers','gallery','reviews','contact']
  end::text[];
$$;
revoke all on function public._website_sections(text) from public, anon, authenticated;

/** The links a website may carry. Each must be an https address on its own service (a WhatsApp number is digits only);
 *  anything else — another host, a script address, an unknown key — is dropped. packages/shared/src/website.ts tidies
 *  what the owner typed before it gets here; this is the wall. */
create or replace function public._website_links(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select e.key k, btrim(e.value) v from jsonb_each_text(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e   -- a list or a bare string is nothing
    where length(btrim(e.value)) between 8 and 200 and btrim(e.value) ~ '^[A-Za-z0-9:/._?=&%@,+!~-]+$' and case e.key
      when 'instagram' then btrim(e.value) ~ '^https://(www[.])?instagram[.]com/.+'
      when 'facebook'  then btrim(e.value) ~ '^https://(www[.]|m[.])?facebook[.]com/.+'
      when 'youtube'   then btrim(e.value) ~ '^https://((www[.]|m[.])?youtube[.]com|youtu[.]be)/.+'
      when 'google'    then btrim(e.value) ~ '^https://(maps[.]app[.]goo[.]gl|goo[.]gl|g[.]page|g[.]co|share[.]google|maps[.]google[.]com|(www[.])?google[.](com|co[.]in))/.+'
      when 'whatsapp'  then btrim(e.value) ~ '^[0-9]{10,15}$'
      else false end) x;
$$;
revoke all on function public._website_links(jsonb) from public, anon, authenticated;

/** The extras a client chose for its website. The list of extras grows in the app, not here: this keeps any short key
 *  whose value is a yes/no, a number, or one short line of plain text (no markup, no quotes) — at most 40 of them. What
 *  a value means, and whether an address in it is one the page will link to, is checked where it is used. */
create or replace function public._website_options(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(x.key, x.value), '{}'::jsonb) from (
    select e.key, e.value from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
    where e.key ~ '^[a-z][a-z0-9_]{0,23}$'
      and (jsonb_typeof(e.value) in ('boolean', 'number')
           or (jsonb_typeof(e.value) = 'string' and length(e.value #>> '{}') between 1 and 240 and (e.value #>> '{}') !~ '[<>"`\\]' and (e.value #>> '{}') !~ '[[:cntrl:]]'))
    order by e.key limit 40) x;
$$;
revoke all on function public._website_options(jsonb) from public, anon, authenticated;

/** A property's add-ons by id: its own list, else its plan's, else the defaults (effective_features(), for any property). */
create or replace function public._features_of(p_rid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(r.enabled_features,
                  (select p.features from plans p where p.is_active and r.property_type::text = any(p.property_types) order by p.key limit 1),
                  default_features())
  from restaurants r where r.id = p_rid;
$$;
revoke all on function public._features_of(uuid) from public, anon, authenticated;

-- ── the website's own files ──────────────────────────────────────────────────────────────────────────────────────
-- Public, because a website's photos are public; 12 MB, because a short first-screen video and a 3D dish live here too.
-- The policies are the logo bucket's (0083): the owner and managers, in their own property's folder, and nowhere else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 12582912, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'model/gltf-binary'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists site_insert on storage.objects;
create policy site_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists site_update on storage.objects;
create policy site_update on storage.objects for update to authenticated
  using (bucket_id = 'site' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'))
  with check (bucket_id = 'site' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists site_delete on storage.objects;
create policy site_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text and public.auth_role() in ('owner', 'manager'));
drop policy if exists site_select on storage.objects;
create policy site_select on storage.objects for select to authenticated
  using (bucket_id = 'site' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text);

/** Is this address a file in that property's own folder of the `site` bucket, with one of these endings? */
create or replace function public._site_file(p_url text, p_rid uuid, p_ext text) returns boolean
language sql immutable set search_path = public as $$
  select p_url is not null and length(p_url) <= 300
     and p_url ~ ('^https://[a-z0-9.-]+/storage/v1/object/public/site/' || p_rid::text || '/[a-z0-9][a-z0-9._-]{0,80}[.](' || p_ext || ')$');
$$;
revoke all on function public._site_file(text, uuid, text) from public, anon, authenticated;

-- a room type's own photos: empty for every existing room type, so nothing changes until an owner adds one
alter table public.room_types add column if not exists photos text[] not null default '{}';

/** The gallery and the room photos, in one call. The gallery keeps addresses already in it (an owner may have typed
 *  one in Storefront) and takes new ones only from this property's own folder; a room's photos are from that folder
 *  only. Twelve in the gallery, six to a room. p_rooms: { "<room type id>": ["https://…", …], … } */
create or replace function public.website_media_save(p_photos text[] default null, p_rooms jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); had text[]; keep text[]; k text; v jsonb; list text[];
begin
  if rid is null then raise exception 'sign in to a property first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager') then raise exception 'only the owner or a manager can change the website''s photos' using errcode = '42501'; end if;
  if p_photos is not null then
    select coalesce(photos, '{}'::text[]) into had from restaurants where id = rid;
    select coalesce(array_agg(x.u order by x.ord), '{}'::text[]) into keep from (
      select u, min(ord) ord from unnest(p_photos) with ordinality a(u, ord)
       where u = any(had) or _site_file(u, rid, 'png|jpg|jpeg|webp') group by u order by min(ord) limit 12) x;
    update restaurants set photos = keep where id = rid;
  end if;
  if p_rooms is not null and jsonb_typeof(p_rooms) = 'object' then
    for k, v in select * from jsonb_each(p_rooms) loop
      continue when k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(v) <> 'array';
      select coalesce(array_agg(x.u order by x.ord), '{}'::text[]) into list from (
        select u, min(ord) ord from jsonb_array_elements_text(v) with ordinality a(u, ord) where _site_file(u, rid, 'png|jpg|jpeg|webp') group by u order by min(ord) limit 6) x;
      update room_types set photos = list where id = k::uuid and restaurant_id = rid;
    end loop;
  end if;
  update websites set updated_at = now() where restaurant_id = rid;
  return jsonb_build_object('photos', (select to_jsonb(coalesce(photos, '{}'::text[])) from restaurants where id = rid));
end $$;
revoke all on function public.website_media_save(text[], jsonb) from public, anon;
grant execute on function public.website_media_save(text[], jsonb) to authenticated;

/** Which website answers on this address? The client's own domain, with or without www. Published, alive, add-on on. */
create or replace function public.website_by_domain(p_host text) returns text
language sql stable security definer set search_path = public as $$
  select r.booking_slug from websites w join restaurants r on r.id = w.restaurant_id
   where w.domain is not null and w.published and r.booking_slug is not null
     and regexp_replace(w.domain, '^www[.]', '') = regexp_replace(lower(btrim(coalesce(p_host, ''))), '^www[.]', '')
     and membership_state_for(r.id) in ('trial', 'active') and coalesce('website' = any(_features_of(r.id)), false)
   limit 1;
$$;
revoke all on function public.website_by_domain(text) from public;
grant execute on function public.website_by_domain(text) to anon, authenticated, service_role;

/** The checklist behind Settings → Create website: what this property has ready, what is switched off, and its website. */
create or replace function public.website_setup() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role() in ('owner', 'manager') then (
    select jsonb_build_object(
      'type', r.property_type, 'slug', r.booking_slug, 'name', r.name,
      'feature', coalesce('website' = any(_features_of(r.id)), false),
      'allowed', to_jsonb(_website_sections(r.property_type::text)),
      'listed', r.is_listed, 'dining', r.dining_enabled, 'delivery', r.delivery_enabled, 'takeaway', r.takeaway_enabled,
      'booking_engine', r.booking_engine,
      'has_tagline', coalesce(btrim(r.tagline) <> '', false), 'has_address', coalesce(btrim(r.address) <> '', false),
      'has_phone', coalesce(btrim(r.phone) <> '', false), 'has_logo', r.logo_url is not null,
      -- what search and sharing lean on (Settings → Website → Reach): the town, the pincode, the pin, the hours, the licence
      'district', nullif(btrim(r.district), ''), 'cuisines', to_jsonb(coalesce(r.cuisines, '{}'::text[])),
      'has_pincode', coalesce(btrim(r.pincode) <> '', false),
      'has_pin', coalesce(r.lat, r.attend_lat) is not null and coalesce(r.lng, r.attend_lng) is not null,
      'has_hours', r.opens_at is not null and r.closes_at is not null,
      'has_stay_times', r.check_in_time is not null and r.check_out_time is not null,
      'has_fssai', coalesce(btrim(r.fssai_no) <> '', false),
      'photos', coalesce(cardinality(r.photos), 0), 'photo_list', to_jsonb(coalesce(r.photos, '{}'::text[])),
      'room_list', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'photos', to_jsonb(t.photos)) order by t.base_rate, t.name)
                               from room_types t where t.restaurant_id = r.id and t.is_active), '[]'::jsonb),
      'dishes', (select count(*) from menu_items m where m.restaurant_id = r.id and m.is_active),
      'room_types', (select count(*) from room_types t where t.restaurant_id = r.id and t.is_active),
      'facilities', (select count(*) from facilities f where f.restaurant_id = r.id and f.is_active),
      'offers', (select count(*) from offers o where o.restaurant_id = r.id and o.is_active
                   and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)),
      'reviews', (select count(*) from reviews v where v.restaurant_id = r.id),
      'site', (select jsonb_build_object('sections', to_jsonb(w.sections), 'headline', w.headline, 'about', w.about,
                                         'email', w.email, 'links', w.links, 'options', w.options, 'domain', w.domain,
                                         'published', w.published, 'created_at', w.created_at, 'updated_at', w.updated_at)
                 from websites w where w.restaurant_id = r.id))
    from restaurants r where r.id = auth_restaurant_id()) end;
$$;
revoke all on function public.website_setup() from public, anon;
grant execute on function public.website_setup() to authenticated;

/** Create or change the website. The owner only; the sections must be ones this kind of property can have. */
create or replace function public.website_save(p_sections text[], p_headline text default null, p_about text default null, p_published boolean default true,
                                               p_email text default null, p_links jsonb default null, p_options jsonb default null,
                                               p_domain text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); r restaurants%rowtype; secs text[]; base text; s text; n int := 1;
  head text := nullif(btrim(left(coalesce(p_headline, ''), 120)), ''); body text := nullif(btrim(left(coalesce(p_about, ''), 1500)), '');
  mail text := nullif(lower(btrim(coalesce(p_email, ''))), ''); lnk jsonb := _website_links(p_links); opt jsonb := _website_options(p_options);
  dom text := nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(p_domain, ''))), '^https?://', ''), '[/:].*$', ''), '');
begin
  if rid is null then raise exception 'sign in to a property first' using errcode = '42501'; end if;
  if auth_role() is distinct from 'owner' then raise exception 'only the owner can create or change the website' using errcode = '42501'; end if;
  select * into r from restaurants where id = rid;
  if not found then raise exception 'no such property'; end if;
  if not coalesce('website' = any(_features_of(rid)), false) then
    raise exception 'the website is not switched on for this property — ask DineFlow support';
  end if;
  if p_sections is null or cardinality(p_sections) = 0 then raise exception 'tick at least one section'; end if;
  if mail is not null and (length(mail) > 120 or mail !~ '^[^@[:space:]<>"'']+@[^@[:space:]<>"'']+[.][a-z]{2,}$') then
    raise exception 'that email address does not look right';
  end if;
  if dom is not null then
    if length(dom) > 120 or dom !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$' then raise exception 'that web address does not look right — type it like www.yourplace.com'; end if;
    if dom ~ '(^|[.])(dineflow[.]cloud|dineflow[.]in|vercel[.]app|localhost)$' then raise exception 'that address is ours, not yours — type the domain you bought'; end if;
    if exists (select 1 from websites w where w.domain = dom and w.restaurant_id <> rid) then raise exception 'that web address is already used by another website'; end if;
  end if;
  if not (p_sections <@ _website_sections(r.property_type::text)) then raise exception 'that section is not part of this kind of website'; end if;
  -- the page's own order, each section once, whatever order the ticks arrived in
  select array_agg(a.x order by a.ord) into secs
    from unnest(_website_sections(r.property_type::text)) with ordinality a(x, ord) where a.x = any(p_sections);

  -- the address: the property's public name in links (booking_slug); a property that never had one gets it from its name
  s := nullif(btrim(r.booking_slug), '');
  if s is null then
    base := left(coalesce(nullif(btrim(regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'place'), 40);
    s := base;
    while exists (select 1 from restaurants where booking_slug = s) loop n := n + 1; s := base || '-' || n; end loop;
    update restaurants set booking_slug = s where id = rid;
  end if;

  insert into websites(restaurant_id, sections, headline, about, published, email, links, options, domain, created_by)
       values (rid, secs, head, body, coalesce(p_published, true), mail, lnk, opt, dom, auth.uid())
  on conflict (restaurant_id) do update
     set sections = excluded.sections, headline = excluded.headline, about = excluded.about,
         published = excluded.published, email = excluded.email, links = excluded.links, options = excluded.options, domain = excluded.domain, updated_at = now();
  return jsonb_build_object('slug', s, 'sections', to_jsonb(secs), 'published', coalesce(p_published, true), 'email', mail, 'links', lnk, 'options', opt, 'domain', dom);
end $$;
revoke all on function public.website_save(text[], text, text, boolean, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.website_save(text[], text, text, boolean, text, jsonb, jsonb, text) to authenticated;

/** What a stranger may read. Nothing unless the website is published, the property's trial or membership has not ended
 *  and the add-on is on. Only the ticked sections are filled; `can` says which of the existing public pages will answer. */
create or replace function public.website_public(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', r.booking_slug, 'name', r.name, 'type', r.property_type, 'demo', r.demo_expires_at is not null,
    'tagline', r.tagline, 'headline', w.headline, 'about', w.about, 'logo_url', r.logo_url,
    'cuisines', to_jsonb(r.cuisines), 'price_for_two', r.price_for_two, 'rating', r.rating, 'rating_count', r.rating_count,
    'address', r.address, 'district', r.district, 'phone', r.phone, 'photos', to_jsonb(r.photos),
    'pincode', nullif(btrim(r.pincode), ''), 'lat', coalesce(r.lat, r.attend_lat), 'lng', coalesce(r.lng, r.attend_lng),
    'fssai_no', nullif(btrim(r.fssai_no), ''), 'email', w.email, 'links', w.links, 'options', w.options, 'domain', w.domain,
    'opens_at', r.opens_at, 'closes_at', r.closes_at, 'check_in_time', r.check_in_time, 'check_out_time', r.check_out_time,
    'sections', to_jsonb(w.sections), 'updated_at', w.updated_at,
    'can', jsonb_build_object(
      'order',   'order'   = any(w.sections) and r.is_listed and (r.delivery_enabled or r.takeaway_enabled),
      'reserve', 'reserve' = any(w.sections) and r.is_listed and r.dining_enabled,
      'queue',   'queue'   = any(w.sections) and r.is_listed,
      'book',    'book'    = any(w.sections) and r.booking_engine
                 and exists (select 1 from room_types t where t.restaurant_id = r.id and t.is_active)),
    'menu', case when 'menu' = any(w.sections) then coalesce((
        select jsonb_agg(jsonb_build_object('name', c.name, 'items', c.items) order by c.sort_order, c.name)
        from (select c.name, c.sort_order,
                     (select jsonb_agg(jsonb_build_object('name', m.name, 'price', m.price, 'is_veg', m.is_veg, 'description', m.description,
                                                          'image_url', m.image_url, 'image_credit', m.image_credit,
                                                          'from', (select min(v.price) from menu_variants v where v.menu_item_id = m.id and v.is_active))
                                       order by m.name)
                        from menu_items m where m.category_id = c.id and m.restaurant_id = r.id and m.is_active) as items
                from categories c where c.restaurant_id = r.id) c
        where c.items is not null), '[]'::jsonb) else '[]'::jsonb end,
    'rooms', case when 'rooms' = any(w.sections) then coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'base_rate', t.base_rate, 'capacity', t.capacity, 'amenities', t.amenities, 'photos', to_jsonb(t.photos)) order by t.base_rate, t.name)
        from room_types t where t.restaurant_id = r.id and t.is_active), '[]'::jsonb) else '[]'::jsonb end,
    'facilities', case when 'facilities' = any(w.sections) then coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'kind', f.kind, 'rate', f.rate, 'minutes', f.duration_minutes) order by f.name)
        from facilities f where f.restaurant_id = r.id and f.is_active), '[]'::jsonb) else '[]'::jsonb end,
    'offers', case when 'offers' = any(w.sections) then coalesce((
        select jsonb_agg(jsonb_build_object('title', o.title, 'kind', o.kind, 'value', o.value, 'min_order', o.min_order, 'code', o.code,
                                            'from_time', o.from_time, 'to_time', o.to_time, 'days', to_jsonb(o.days)) order by o.created_at desc)
        from offers o where o.restaurant_id = r.id and o.is_active
          and (o.starts_on is null or o.starts_on <= current_date) and (o.ends_on is null or o.ends_on >= current_date)), '[]'::jsonb) else '[]'::jsonb end,
    'reviews', case when 'reviews' = any(w.sections) then coalesce((
        select jsonb_agg(jsonb_build_object('guest', v.guest_name, 'rating', v.rating, 'body', v.body, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
        from (select * from reviews where restaurant_id = r.id order by created_at desc limit 12) v), '[]'::jsonb) else '[]'::jsonb end)
  from restaurants r join websites w on w.restaurant_id = r.id
  where r.booking_slug = p_slug and w.published
    and membership_state_for(r.id) in ('trial', 'active')
    and coalesce('website' = any(_features_of(r.id)), false);
$$;
revoke all on function public.website_public(text) from public;
grant execute on function public.website_public(text) to anon, authenticated, service_role;

/** The published websites, for the sitemap: an address and the day it last changed. A demo is somebody trying the app,
 *  not a business to find in a search, so it is left out — as its page is noindex. */
create or replace function public.website_index() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', x.booking_slug, 'at', x.updated_at) order by x.updated_at desc), '[]'::jsonb)
  from (select r.booking_slug, w.updated_at from restaurants r join websites w on w.restaurant_id = r.id
         where w.published and r.booking_slug is not null and r.demo_expires_at is null
           and membership_state_for(r.id) in ('trial', 'active') and coalesce('website' = any(_features_of(r.id)), false)
         order by w.updated_at desc limit 5000) x;
$$;
revoke all on function public.website_index() from public;
grant execute on function public.website_index() to anon, authenticated, service_role;

-- ── the visitor count: how many, never who ─────────────────────────────────────────────────────────────────────────
-- One row per property, day (India's) and kind of thing done. No address, no device, no cookie is kept: it is a tally.
-- Anyone can open a page many times, so the number is a guide, not an audit; a day's tally of one kind stops at 20,000.
create table if not exists public.website_hits (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day           date not null,
  kind          text not null,
  n             integer not null default 0,
  primary key (restaurant_id, day, kind),
  constraint website_hits_kind check (kind in ('view', 'order', 'reserve', 'queue', 'book', 'call', 'whatsapp', 'directions', 'map', 'share', 'enquiry', 'review', 'dish'))
);
comment on table public.website_hits is 'A website''s visitor count (0185): opens and button taps per day. Written only by website_hit().';
alter table public.website_hits enable row level security;
drop policy if exists website_hits_read on public.website_hits;
create policy website_hits_read on public.website_hits for select to authenticated using (restaurant_id = auth_restaurant_id());
revoke all on public.website_hits from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.website_hits from authenticated;
grant select on public.website_hits to authenticated;

/** One more. Counted only for a published website whose client switched the count on; an unknown kind or place is nothing. */
create or replace function public.website_hit(p_slug text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_kind is null or p_kind not in ('view', 'order', 'reserve', 'queue', 'book', 'call', 'whatsapp', 'directions', 'map', 'share', 'enquiry', 'review', 'dish') then return; end if;
  select r.id into rid from restaurants r join websites w on w.restaurant_id = r.id
   where r.booking_slug = p_slug and w.published and coalesce((w.options ->> 'stats')::boolean, false)
     and coalesce('website' = any(_features_of(r.id)), false);
  if rid is null then return; end if;
  insert into website_hits(restaurant_id, day, kind, n) values (rid, today, p_kind, 1)
  on conflict (restaurant_id, day, kind) do update set n = website_hits.n + 1 where website_hits.n < 20000;
end $$;
revoke all on function public.website_hit(text, text) from public;
grant execute on function public.website_hit(text, text) to anon, authenticated, service_role;

/** The count for the last p_days days (India's), by kind, and the opens day by day. The owner and managers. */
create or replace function public.website_stats(p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth_role() in ('owner', 'manager') then (
    with span as (select (now() at time zone 'Asia/Kolkata')::date - (greatest(1, least(coalesce(p_days, 30), 90)) - 1) as since),
         h as (select h.day, h.kind, h.n from website_hits h, span where h.restaurant_id = auth_restaurant_id() and h.day >= span.since)
    select jsonb_build_object('days', greatest(1, least(coalesce(p_days, 30), 90)),
      'total', coalesce((select jsonb_object_agg(t.kind, t.n) from (select kind, sum(n)::int n from h group by kind) t), '{}'::jsonb),
      'views', coalesce((select jsonb_agg(jsonb_build_object('day', v.day, 'n', v.n) order by v.day) from (select day, n from h where kind = 'view') v), '[]'::jsonb))) end;
$$;
revoke all on function public.website_stats(int) from public, anon;
grant execute on function public.website_stats(int) to authenticated;

-- ── the add-on: on by default (0177's body + 'website'; features.ts and features.test.ts agree) ─────────────────────
create or replace function public.default_features() returns text[]
language sql immutable set search_path = public as $$
  select array['intelligence','controls','audit','chain','payroll','expenses','tasks','work-records','voice','cleaning','tables',
               'lock','connections','night-audit','promise','till-pairings','receipt-extras','ai','till-voice','scan-vision','whatsapp',
               'website']::text[];
$$;
revoke all on function public.default_features() from public;
grant execute on function public.default_features() to authenticated, service_role;

notify pgrst, 'reload schema';
