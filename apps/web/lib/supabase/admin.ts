import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client holding the service-role key.
 *
 * This key bypasses row level security entirely, so it exists for exactly one job here: the
 * forgotten-password flow, which has no session to act under and must not be reachable from a
 * browser. `server-only` makes importing it from a client component a build error rather than a
 * leak discovered later.
 *
 * Set SUPABASE_SERVICE_ROLE_KEY on the server, from Supabase → Project Settings → API. It is not a
 * NEXT_PUBLIC_ variable and must never become one.
 */
export const serviceRoleConfigured = () =>
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Password reset is not set up on this server. Set SUPABASE_SERVICE_ROLE_KEY, or ask Master control to issue a new temporary password.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
