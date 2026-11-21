-- 0187 · No table may be truncated through the API roles (2026-11-17, the owner's "security wise best?" review).
--
-- Supabase's default privileges hand anon and authenticated ALL on every new table — SELECT/INSERT/UPDATE/DELETE, which RLS
-- then fences, but also TRUNCATE, REFERENCES and TRIGGER, which RLS does not touch. The sweep on 2026-11-17 found eight
-- tables still carrying them for anon and authenticated: attendance_challenges, attendance_passkeys, attendance_punches,
-- audit_events, cash_movements, selftest_runs, staff_attendance (and the view v_low_stock). PostgREST issues no TRUNCATE,
-- so nothing reached them through the app; this closes the door anyway, for every table in public at once, and sets the
-- default so a table made tomorrow does not reopen it. Nothing in the app truncates (grep: no caller).
--
-- RLS: unchanged — this only takes away privileges that RLS never governed.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
