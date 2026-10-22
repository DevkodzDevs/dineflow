-- 0134 — An emergency contact when someone is added (2026-10-23, the owner: "Add staff needs an emergency contact number").
--
-- profiles.emergency_name / emergency_phone exist since 0125, but only the person writes them (my_profile_save, their own
-- row). Whoever adds someone may now fill them in too, so the number is on file from the first day:
-- • staff_set_emergency(p_user, p_name, p_phone) — the rule of staff_set_position: a supervisor or above, the person on the
--   caller's outlet, someone below the caller's level (the owner may do anyone, themselves included). The number is 6–15
--   digits (spaces, +, - and brackets allowed and kept); the name is trimmed to 60. Both empty clears them.
-- The person can still change both on My profile. Additive: a new function, nothing else changes.

create or replace function public.staff_set_emergency(p_user uuid, p_name text, p_phone text)
returns integer
language plpgsql security definer set search_path = public as $$
declare me profiles; target profiles; nm text := nullif(left(trim(coalesce(p_name, '')), 60), ''); ph text := nullif(left(trim(coalesce(p_phone, '')), 20), '');
begin
  me := acting_profile();
  if me.id is null then raise exception 'not a member of this property' using errcode = '42501'; end if;
  if role_rank(me.role) < role_rank('supervisor_2') then raise exception 'your role cannot manage people' using errcode = '42501'; end if;
  select * into target from profiles where id = p_user and restaurant_id = me.restaurant_id;
  if target.id is null then raise exception 'not a member of this property'; end if;
  if target.id = me.id and me.role <> 'owner' then raise exception 'change your own on My profile'; end if;
  if target.id <> me.id and me.role <> 'owner' and role_rank(target.role) >= role_rank(me.role) then
    raise exception 'you cannot change someone at or above your own level' using errcode = '42501';
  end if;
  if ph is not null and (ph !~ '^[0-9 +()-]+$' or length(regexp_replace(ph, '\D', '', 'g')) not between 6 and 15) then
    raise exception 'the emergency number is not right — 6 to 15 digits';
  end if;
  update profiles set emergency_name = nm, emergency_phone = ph where id = target.id;
  return 1;
end $$;
revoke all on function public.staff_set_emergency(uuid, text, text) from public, anon;
grant execute on function public.staff_set_emergency(uuid, text, text) to authenticated;
