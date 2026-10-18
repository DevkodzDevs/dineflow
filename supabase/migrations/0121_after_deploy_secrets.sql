-- (next number) · The two things 0098 left open for the screens that were still running.
--
-- APPLY ONLY AFTER THE APP FROM THE SAME COMMIT IS LIVE. Until then the deployed Channels and Online
-- orders pages select * from ota_channels / order_channels, and the deployed "change password"
-- screen calls request_password_otp — this migration refuses both, and those screens would error.
-- It waits in supabase/pending/, where scripts/migrate.mjs does not look: once the deploy is live,
-- move it into supabase/migrations/ under the next free number (NNNN_after_deploy_secrets.sql) and
-- run the migrator.
--
-- 1 · A partner API key (an OTA's or an aggregator's) is no longer selectable through the API at
--     all. Any staff login could read it, and the Channels page shipped it to the browser. The screens
--     now read has_api_key (0098) and keep a saved key when the field is left blank; push_channel and
--     the OTA sync read the key as its owner / the service role, which this does not touch.
-- 2 · request_password_otp handed the plain code to whoever held the session, so a till left signed
--     in was enough to pass the "emailed code" check. The server now mints it with
--     request_password_otp_for (0098, service role only) for the user the session proves.

do $$
declare t text; cols text;
begin
  foreach t in array array['ota_channels', 'order_channels'] loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
      from pg_attribute where attrelid = ('public.' || t)::regclass and attnum > 0 and not attisdropped and attname <> 'api_key';
    execute format('revoke select on public.%I from anon, authenticated', t);
    execute format('grant select (%s) on public.%I to anon, authenticated', cols, t);
  end loop;
end $$;

revoke execute on function public.request_password_otp() from public, anon, authenticated;
