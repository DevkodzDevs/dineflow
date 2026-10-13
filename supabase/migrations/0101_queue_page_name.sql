-- 0101 · The public queue page could never find its property.
--
-- /queue/<slug> read `restaurants` directly with the visitor's (anonymous) key. RLS gives a stranger no row
-- of that table — rightly — so every guest who scanned the walk-in QR was told "This place isn't taking a
-- queue right now", on the live site as well (checked 2026-10-13); it only ever worked for someone signed in
-- to that property. Found by the readiness sweep reading the page as a stranger.
--
-- queue_place(slug) answers the one thing the page needs, for the places queue_join accepts: listed, with a
-- trial or membership that has not ended. Since 0098 a new function is not executable by anon until granted.

create or replace function public.queue_place(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', r.name)
    from restaurants r
   where r.booking_slug = p_slug and r.is_listed and membership_state_for(r.id) in ('trial', 'active')
$$;
revoke execute on function public.queue_place(text) from public;
grant execute on function public.queue_place(text) to anon, authenticated, service_role;
