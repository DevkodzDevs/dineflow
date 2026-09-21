/**
 * The browser client, fetched only when something actually reaches for it.
 *
 * That client carries Supabase's auth and realtime machinery — about 235 kB of JavaScript. Nothing
 * on screen needs it in order to paint: every caller asks for it from inside an effect or an async
 * handler, after the page is already there. Imported the ordinary way it landed in the signed-in
 * layout's bundle, which meant every screen behind the login downloaded and parsed all of it before
 * the first pixel — including the screens that never open a socket at all, like Reports, Menu and
 * Settings.
 *
 * Reached for this way it becomes a chunk of its own: live screens fetch it a moment after they
 * paint, and quiet screens never fetch it. This file must not import the client at the top — the
 * whole point is that nothing is pulled in until the call is made. @supabase/ssr keeps one instance
 * per browser, so asking repeatedly costs one dynamic import and nothing after that.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

let pending: Promise<SupabaseClient> | null = null;

export const getClient = (): Promise<SupabaseClient> => {
  // A chunk that fails to arrive — a flaky connection, or a deploy that renamed it under an open
  // tab — must not be remembered as the answer, or every later call would return that same failure
  // and the screen would stay dead until it was reloaded. Forget it and let the next caller retry.
  pending ??= import("./client")
    .then((m) => m.createClient() as unknown as SupabaseClient)
    .catch((e) => { pending = null; throw e; });
  return pending;
};
