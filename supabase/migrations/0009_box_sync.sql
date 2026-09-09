-- DineFlow v9.0 — the on-premise Box talks to your cloud Master control. Run AFTER 0008.
-- (Also harmless on a Box itself; the table just stays empty there.)

alter table restaurants add column if not exists box_token text, add column if not exists box_last_seen timestamptz, add column if not exists runs_on_box boolean not null default false;
create unique index if not exists restaurants_box_token_idx on restaurants(box_token) where box_token is not null;

create table if not exists box_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  reported_at timestamptz not null default now(),
  sales_today numeric(14,2), open_orders int, rooms int, occupied int, users int,
  periods jsonb not null default '[]',
  raw jsonb
);
create index if not exists box_reports_idx on box_reports(restaurant_id, reported_at desc);

/** Owner (or master) issues a token the Box will use to phone home. */
create or replace function box_issue_token(p_restaurant uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(p_restaurant, auth_restaurant_id()); t text;
begin
  if p_restaurant is not null and not is_platform_admin() then raise exception 'not allowed'; end if;
  if p_restaurant is null and auth_role() not in ('owner','manager') then raise exception 'only the owner can do this'; end if;
  t := encode(gen_random_bytes(24), 'hex');
  update restaurants set box_token = t, runs_on_box = true where id = rid;
  return t;
end $$;

/** Called by the Box (anon + token). Stores the report, returns the cloud's view of membership. */
create or replace function box_sync(p_token text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype; t jsonb := p_body->'today';
begin
  select * into r from restaurants where box_token = p_token;
  if not found then raise exception 'unknown box'; end if;
  insert into box_reports(restaurant_id, sales_today, open_orders, rooms, occupied, users, periods, raw)
    values (r.id, (t->>'sales_today')::numeric, (t->>'open_orders')::int, (t->>'rooms')::int, (t->>'occupied')::int, (t->>'users')::int, coalesce(p_body->'periods', '[]'), p_body);
  update restaurants set box_last_seen = now() where id = r.id;
  -- membership is decided in the cloud (by master control); the box mirrors it
  return jsonb_build_object('ok', true, 'membership', membership_state_for(r.id), 'trial_ends_at', r.trial_ends_at,
    'membership_ends_at', r.membership_ends_at, 'membership_plan', r.membership_plan, 'seen', now());
end $$;

create or replace function membership_state_for(p_rid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r restaurants%rowtype;
begin
  select * into r from restaurants where id = p_rid;
  if not found then return 'none'; end if;
  if r.membership = 'suspended' then return 'suspended'; end if;
  if r.membership = 'active' and (r.membership_ends_at is null or r.membership_ends_at > now()) then return 'active'; end if;
  if r.membership = 'trial' and r.trial_ends_at > now() then return 'trial'; end if;
  return 'expired';
end $$;
grant execute on function box_sync(text, jsonb) to anon;

-- master overview learns about boxes
create or replace function admin_box_status() returns table (restaurant_id uuid, runs_on_box boolean, last_seen timestamptz, sales_today numeric, periods int)
language sql stable security definer set search_path = public as $$
  select r.id, r.runs_on_box, r.box_last_seen,
    (select sales_today from box_reports b where b.restaurant_id = r.id order by reported_at desc limit 1),
    (select jsonb_array_length(periods) from box_reports b where b.restaurant_id = r.id order by reported_at desc limit 1)
  from restaurants r where is_platform_admin()
$$;

alter table box_reports enable row level security;
drop policy if exists tenant_all on box_reports;
create policy tenant_all on box_reports for select using (restaurant_id = auth_restaurant_id() or is_platform_admin());
