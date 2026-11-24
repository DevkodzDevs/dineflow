-- AFTER the release with Master control's email-code step (0195) is live — not before.
--
-- Takes the old one-call admin_create_property away from signed-in callers, so a property can only be made through
-- admin_create_property_verified (a verified owner-email code). The verified function still calls it inside the database
-- (it runs as the definer). Before the deploy, the live Master control still calls admin_create_property directly, and
-- this would break Create property there.
--
-- Apply: move this file to supabase/migrations/ under the next free number, dry-run it, apply it alone.

revoke execute on function public.admin_create_property(text, property_type, boolean, text, text, text) from public, anon, authenticated;
notify pgrst, 'reload schema';
