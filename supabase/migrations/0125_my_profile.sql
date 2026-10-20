-- 0125 · My profile — each person's own details, kept by them (2026-10-20)
--
-- The owner: "a Settings option for the staff's own profile, to control their profile settings and update their
-- profile". /me shows a person what the property knows about them (role, position, team, staff code, joined, who they
-- report to — all the owner's to set, read-only there) and lets them keep their own details:
--
--  1. display_name   — the name they go by. full_name stays the legal name the owner wrote on Staff; nothing here
--                      changes it.
--  2. phone, contact_email — already on profiles (0059/0060). A new contact email clears contact_verified_at, so the
--                      address has to be proved again (staff_request_contact_otp / staff_verify_contact already let a
--                      person send and check their own code).
--  3. emergency_name, emergency_phone — who to ring if something happens to them at work.
--  4. about (short), languages (keys: en ta hi ml te kn ur bn mr gu or pa — what they can serve a guest in), and
--     avatar_tone — the colour of their initials circle.
--
-- profiles has no direct update for the API roles (0084's restrictive no_direct_update), so the only way in is
-- my_profile_save(): security definer, pinned search_path, and it writes ONLY the caller's own row (auth.uid(), an
-- active profile — Master control acting as an owner has none and is refused) and ONLY the columns above. Role,
-- department, position, staff code, reports_to, is_active, restaurant and the legal name are never touched.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists emergency_name text;
alter table public.profiles add column if not exists emergency_phone text;
alter table public.profiles add column if not exists about text;
alter table public.profiles add column if not exists languages text[] not null default '{}';
alter table public.profiles add column if not exists avatar_tone text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_tone_check') then
    alter table public.profiles add constraint profiles_avatar_tone_check
      check (avatar_tone is null or avatar_tone in ('green', 'blue', 'orange', 'violet', 'cyan', 'red', 'gold', 'slate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_self_lengths_check') then
    alter table public.profiles add constraint profiles_self_lengths_check
      check (coalesce(char_length(display_name), 0) <= 40 and coalesce(char_length(emergency_name), 0) <= 60
             and coalesce(char_length(about), 0) <= 200 and coalesce(array_length(languages, 1), 0) <= 12);
  end if;
end $$;

/** Save the caller's own details. Empty strings clear a field. Returns the saved row's self-editable columns and
 *  whether the contact email changed (it then needs verifying again). */
create or replace function public.my_profile_save(p_display_name text, p_phone text, p_contact_email text,
  p_emergency_name text, p_emergency_phone text, p_about text, p_languages text[], p_avatar_tone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles; v_name text; v_phone text; v_email text; v_ename text; v_ephone text; v_about text; v_langs text[]; v_tone text;
  digits text; email_changed boolean; r profiles;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null then raise exception 'only a member of staff can change their own profile' using errcode = '42501'; end if;

  v_name   := nullif(regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), '');
  v_phone  := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g'), '');
  v_email  := nullif(lower(trim(coalesce(p_contact_email, ''))), '');
  v_ename  := nullif(regexp_replace(trim(coalesce(p_emergency_name, '')), '\s+', ' ', 'g'), '');
  v_ephone := nullif(regexp_replace(trim(coalesce(p_emergency_phone, '')), '\s+', ' ', 'g'), '');
  v_about  := nullif(trim(coalesce(p_about, '')), '');
  v_tone   := nullif(lower(trim(coalesce(p_avatar_tone, ''))), '');
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into v_langs from unnest(coalesce(p_languages, '{}'::text[])) x where length(trim(x)) > 0;

  if v_name is not null and char_length(v_name) > 40 then raise exception 'Keep the name you go by to 40 letters.'; end if;
  if v_name is not null and v_name !~ '[[:alpha:]]' then raise exception 'The name you go by needs at least one letter.'; end if;
  if v_phone is not null then
    if v_phone !~ '^\+?[0-9 ()-]+$' then raise exception 'A phone number has only digits, spaces and a leading +.'; end if;
    digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    if length(digits) < 10 or length(digits) > 13 then raise exception 'A phone number has 10 digits (or 12 with 91 in front).'; end if;
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') then
    raise exception 'That email address does not look right.';
  end if;
  if v_ename is not null and char_length(v_ename) > 60 then raise exception 'Keep the emergency contact''s name to 60 letters.'; end if;
  if v_ephone is not null then
    if v_ephone !~ '^\+?[0-9 ()-]+$' then raise exception 'The emergency number has only digits, spaces and a leading +.'; end if;
    digits := regexp_replace(v_ephone, '[^0-9]', '', 'g');
    if length(digits) < 10 or length(digits) > 13 then raise exception 'The emergency number has 10 digits (or 12 with 91 in front).'; end if;
  end if;
  if v_about is not null and char_length(v_about) > 200 then raise exception 'Keep "about me" to 200 letters.'; end if;
  if exists (select 1 from unnest(v_langs) x where x not in ('en', 'ta', 'hi', 'ml', 'te', 'kn', 'ur', 'bn', 'mr', 'gu', 'or', 'pa')) then
    raise exception 'That is not a language on the list.';
  end if;
  if v_tone is not null and v_tone not in ('green', 'blue', 'orange', 'violet', 'cyan', 'red', 'gold', 'slate') then
    raise exception 'That is not one of the colours.';
  end if;

  email_changed := lower(trim(coalesce(me.contact_email, ''))) is distinct from coalesce(v_email, '');
  update profiles set
      display_name = v_name, phone = v_phone, contact_email = v_email,
      contact_verified_at = case when email_changed then null else contact_verified_at end,
      emergency_name = v_ename, emergency_phone = v_ephone, about = v_about, languages = v_langs, avatar_tone = v_tone
    where id = me.id
    returning * into r;
  return jsonb_build_object('display_name', r.display_name, 'phone', r.phone, 'contact_email', r.contact_email,
    'contact_verified', r.contact_verified_at is not null, 'email_changed', email_changed,
    'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone, 'about', r.about,
    'languages', to_jsonb(r.languages), 'avatar_tone', r.avatar_tone);
end $$;
revoke all on function public.my_profile_save(text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.my_profile_save(text, text, text, text, text, text, text[], text) to authenticated;
