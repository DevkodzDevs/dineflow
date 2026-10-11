-- 0086 · Attendance, four ways — chosen by the owner.
--
-- Manual (a manager marks someone present), QR (an ID card scanned at /scan), Biometric (the person's
-- fingerprint or Face ID through a passkey on their phone or a shared device) and Selfie + location
-- (a photo and a GPS fix inside the property's radius). For labourers (no login, punched by their
-- code or their personal link) and for staff (logins).
--
-- Which methods are on is the owner's call: restaurants.attendance_methods. The guard trigger from
-- 0084 already refuses any restaurants column outside its lists to every role but owner, and
-- set_attendance_settings checks the owner too. Every punch goes through _attend, which refuses a
-- method that is off — the screens hide them as well, but the database is the wall.

alter table public.restaurants
  add column if not exists attendance_methods text[] not null default '{manual,qr}',
  add column if not exists attend_lat double precision,
  add column if not exists attend_lng double precision,
  add column if not exists attend_radius_m int not null default 150;
do $$ begin
  alter table public.restaurants add constraint attendance_methods_known
    check (attendance_methods <@ array['manual','qr','biometric','selfie']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.restaurants add constraint attend_radius_sane check (attend_radius_m between 25 and 2000);
exception when duplicate_object then null; end $$;

-- a labourer's personal punch link (/attend/<token>): they have no login, so the link is who they are
alter table public.labourers add column if not exists punch_token text;
update public.labourers set punch_token = replace(gen_random_uuid()::text, '-', '') where punch_token is null;
alter table public.labourers alter column punch_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists labourers_punch_token_idx on public.labourers(punch_token);

alter table public.labour_attendance
  add column if not exists method_in text,
  add column if not exists method_out text;

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  in_at timestamptz, out_at timestamptz, hours numeric(5,2),
  method_in text, method_out text, note text, created_by uuid,
  unique (profile_id, work_date)
);
create index if not exists staff_attendance_day_idx on public.staff_attendance(restaurant_id, work_date);

-- every punch, with how it was made — what the owner reads to trust the register
create table if not exists public.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  labourer_id uuid references public.labourers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  direction text not null check (direction in ('in', 'out')),
  method text not null check (method in ('manual', 'qr', 'biometric', 'selfie')),
  lat double precision, lng double precision, distance_m int, accuracy_m int,
  photo_path text, device text, created_by uuid,
  check ((labourer_id is null) <> (profile_id is null))
);
create index if not exists attendance_punches_day_idx on public.attendance_punches(restaurant_id, at desc);

-- a passkey per person per device (the fingerprint / Face ID itself never leaves the device)
create table if not exists public.attendance_passkeys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  labourer_id uuid references public.labourers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check ((labourer_id is null) <> (profile_id is null))
);

-- one-time WebAuthn challenges, five minutes each; only the server (service role) touches these
create table if not exists public.attendance_challenges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  labourer_id uuid, profile_id uuid,
  purpose text not null check (purpose in ('register', 'punch')),
  challenge text not null,
  expires_at timestamptz not null default now() + interval '5 minutes'
);

-- RLS: the property reads its own; nobody writes these tables directly — only the functions below
-- (security definer) and the server (service role) do
alter table public.staff_attendance enable row level security;
alter table public.attendance_punches enable row level security;
alter table public.attendance_passkeys enable row level security;
alter table public.attendance_challenges enable row level security;
drop policy if exists staff_attendance_read on public.staff_attendance;
create policy staff_attendance_read on public.staff_attendance for select to authenticated using (restaurant_id = auth_restaurant_id());
drop policy if exists attendance_punches_read on public.attendance_punches;
create policy attendance_punches_read on public.attendance_punches for select to authenticated using (restaurant_id = auth_restaurant_id());
drop policy if exists attendance_passkeys_read on public.attendance_passkeys;
create policy attendance_passkeys_read on public.attendance_passkeys for select to authenticated using (restaurant_id = auth_restaurant_id());
-- (attendance_challenges: no policy at all — invisible to every client)

-- labour attendance is written only through the punch functions now, so a method that is off stays off
drop policy if exists no_direct_labour_attendance_insert on public.labour_attendance;
create policy no_direct_labour_attendance_insert on public.labour_attendance as restrictive for insert to authenticated with check (false);
drop policy if exists no_direct_labour_attendance_update on public.labour_attendance;
create policy no_direct_labour_attendance_update on public.labour_attendance as restrictive for update to authenticated using (false);
drop policy if exists no_direct_labour_attendance_delete on public.labour_attendance;
create policy no_direct_labour_attendance_delete on public.labour_attendance as restrictive for delete to authenticated using (false);

-- ── the one place a punch is made ───────────────────────────────────────────
create or replace function public._attend(p_restaurant uuid, p_labourer uuid, p_profile uuid, p_method text,
  p_lat double precision default null, p_lng double precision default null, p_distance int default null,
  p_accuracy int default null, p_photo text default null, p_by uuid default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  dir text; who text; a record; wage numeric;
begin
  if not exists (select 1 from restaurants where id = p_restaurant and p_method = any(attendance_methods)) then
    raise exception '% attendance is turned off for this property', p_method using errcode = '42501';
  end if;
  if p_labourer is not null then
    select full_name, daily_wage into who, wage from labourers where id = p_labourer and restaurant_id = p_restaurant and status = 'active';
    if not found then raise exception 'worker not found' using errcode = 'P0002'; end if;
    select * into a from labour_attendance where labourer_id = p_labourer and work_date = today;
    if not found then
      insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage, created_by, method_in)
        values (p_restaurant, p_labourer, today, now(), wage, p_by, p_method);
      dir := 'in';
    elsif a.out_at is null then
      update labour_attendance set out_at = now(), hours = round(extract(epoch from now() - coalesce(in_at, now())) / 3600, 2), method_out = p_method where id = a.id;
      dir := 'out';
    else
      return jsonb_build_object('name', who, 'event', 'done', 'hours', a.hours);
    end if;
  else
    select full_name into who from profiles where id = p_profile and restaurant_id = p_restaurant;
    if not found then raise exception 'staff member not found' using errcode = 'P0002'; end if;
    select * into a from staff_attendance where profile_id = p_profile and work_date = today;
    if not found then
      insert into staff_attendance(restaurant_id, profile_id, work_date, in_at, created_by, method_in)
        values (p_restaurant, p_profile, today, now(), p_by, p_method);
      dir := 'in';
    elsif a.out_at is null then
      update staff_attendance set out_at = now(), hours = round(extract(epoch from now() - coalesce(in_at, now())) / 3600, 2), method_out = p_method where id = a.id;
      dir := 'out';
    else
      return jsonb_build_object('name', who, 'event', 'done', 'hours', a.hours);
    end if;
  end if;
  insert into attendance_punches(restaurant_id, labourer_id, profile_id, direction, method, lat, lng, distance_m, accuracy_m, photo_path, device, created_by)
    values (p_restaurant, p_labourer, p_profile, dir, p_method, p_lat, p_lng, p_distance, p_accuracy, p_photo, p_device, p_by);
  return jsonb_build_object('name', who, 'event', dir, 'at', now(), 'method', p_method);
end $$;
revoke all on function public._attend(uuid, uuid, uuid, text, double precision, double precision, int, int, text, uuid, text) from public, anon, authenticated;
grant execute on function public._attend(uuid, uuid, uuid, text, double precision, double precision, int, int, text, uuid, text) to service_role;

-- QR: a labour badge scanned at /scan (same return shape as before, now through _attend)
create or replace function public.labour_punch(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l uuid; r uuid := auth_restaurant_id();
begin
  select id into l from labourers where restaurant_id = r and code = upper(p_code) and status = 'active';
  if not found then raise exception 'labour badge not found'; end if;
  return _attend(r, l, null, 'qr', null, null, null, null, null, auth.uid(), 'scan');
end $$;

-- QR: a staff card (df:staff:<staff code>) scanned at /scan
create or replace function public.staff_punch_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p uuid; r uuid := auth_restaurant_id();
begin
  if r is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select id into p from profiles where restaurant_id = r and upper(staff_code) = upper(p_code) and is_active;
  if not found then raise exception 'staff card not found'; end if;
  return _attend(r, null, p, 'qr', null, null, null, null, null, auth.uid(), 'scan');
end $$;

-- Manual: a labourer marked present (or not) for a day from the Labour page
create or replace function public.labour_mark(p_labourer uuid, p_date date, p_present boolean, p_wage numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r uuid := auth_restaurant_id();
begin
  if r is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from restaurants where id = r and 'manual' = any(attendance_methods)) then
    raise exception 'manual attendance is turned off for this property' using errcode = '42501';
  end if;
  if not exists (select 1 from labourers where id = p_labourer and restaurant_id = r) then raise exception 'worker not found'; end if;
  if not p_present then
    delete from labour_attendance where labourer_id = p_labourer and work_date = p_date;
    return jsonb_build_object('present', false);
  end if;
  insert into labour_attendance(restaurant_id, labourer_id, work_date, in_at, wage, note, created_by, method_in)
    values (r, p_labourer, p_date, now(), coalesce(p_wage, 0), p_note, auth.uid(), 'manual')
  on conflict (labourer_id, work_date) do update set wage = excluded.wage, note = excluded.note;
  insert into attendance_punches(restaurant_id, labourer_id, direction, method, created_by, device) values (r, p_labourer, 'in', 'manual', auth.uid(), 'labour page');
  return jsonb_build_object('present', true);
end $$;

-- Manual: a staff member marked present (or not) — owner, manager or supervisor
create or replace function public.staff_mark(p_profile uuid, p_date date, p_present boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r uuid := auth_restaurant_id();
begin
  if auth_role() not in ('owner', 'manager', 'supervisor') then raise exception 'your role cannot mark staff attendance' using errcode = '42501'; end if;
  if not exists (select 1 from restaurants where id = r and 'manual' = any(attendance_methods)) then
    raise exception 'manual attendance is turned off for this property' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_profile and restaurant_id = r) then raise exception 'staff member not found'; end if;
  if not p_present then
    delete from staff_attendance where profile_id = p_profile and work_date = p_date;
    return jsonb_build_object('present', false);
  end if;
  insert into staff_attendance(restaurant_id, profile_id, work_date, in_at, created_by, method_in)
    values (r, p_profile, p_date, now(), auth.uid(), 'manual')
  on conflict (profile_id, work_date) do nothing;
  insert into attendance_punches(restaurant_id, profile_id, direction, method, created_by, device) values (r, p_profile, 'in', 'manual', auth.uid(), 'staff page');
  return jsonb_build_object('present', true);
end $$;

-- the owner's switches
create or replace function public.set_attendance_settings(p_methods text[], p_lat double precision, p_lng double precision, p_radius int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'owner' then raise exception 'only the owner can change attendance options' using errcode = '42501'; end if;
  if not (p_methods <@ array['manual','qr','biometric','selfie']::text[]) then raise exception 'unknown attendance method'; end if;
  if 'selfie' = any(p_methods) and (p_lat is null or p_lng is null) then
    raise exception 'set the property location before turning on selfie + location';
  end if;
  update restaurants set attendance_methods = (select coalesce(array_agg(distinct m), '{}') from unnest(p_methods) m),
    attend_lat = p_lat, attend_lng = p_lng, attend_radius_m = greatest(25, least(2000, coalesce(p_radius, 150)))
  where id = auth_restaurant_id();
end $$;

revoke all on function public.labour_mark(uuid, date, boolean, numeric, text) from public, anon;
revoke all on function public.staff_mark(uuid, date, boolean) from public, anon;
revoke all on function public.staff_punch_code(text) from public, anon;
revoke all on function public.set_attendance_settings(text[], double precision, double precision, int) from public, anon;
grant execute on function public.labour_mark(uuid, date, boolean, numeric, text) to authenticated;
grant execute on function public.staff_mark(uuid, date, boolean) to authenticated;
grant execute on function public.staff_punch_code(text) to authenticated;
grant execute on function public.set_attendance_settings(text[], double precision, double precision, int) to authenticated;

-- selfies: a private bucket, one folder per property; read by that property's staff, written only by the server
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance', 'attendance', false, 1572864, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists attendance_photo_read on storage.objects;
create policy attendance_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'attendance' and (storage.foldername(name))[1] = auth_restaurant_id()::text);

do $$ begin alter publication supabase_realtime add table staff_attendance, attendance_punches; exception when others then null; end $$;
