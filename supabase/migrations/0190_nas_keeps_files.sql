-- 0190 — one yes/no for every signed-in property: is a NAS keeping a copy of the stored documents? (2026-11-22)
--
-- Tax & compliance → Documents says "on the NAS" beside a stored copy when Master control → Data → NAS has a NAS with
-- "Photos & documents" on, the compliance bucket among its buckets, and at least one finished copy. The data_servers table is the
-- master's alone (0172); this function tells a tenant nothing more than that one fact — no name, no address, no token.

create or replace function public.nas_keeps_files() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from data_servers s
     where s.kind = 'nas' and s.mirror_files and 'compliance' = any (s.mirror_buckets) and s.mirror_at is not null
  );
$$;
revoke all on function public.nas_keeps_files() from public;
grant execute on function public.nas_keeps_files() to authenticated;
