-- ═══════════ Fix: admin_property_detail could not sweep expired passwords ═══════════
--
-- The function was declared STABLE, which tells Postgres the body does not modify data. The sweep
-- inside it (blanking expired rows) is a write, so it was silently skipped — the password field
-- stayed populated after the 7-day window, and the dialog showed it with "expired: true" next to a
-- still-readable password. That is worse than no sweep at all.
--
-- Changed to VOLATILE (the default). It is called once per dialog open, so the performance
-- difference is zero. The detail query itself stays read-only; only the sweep writes, and only to
-- rows whose expiry has already passed.

alter function admin_property_detail(uuid) volatile;
