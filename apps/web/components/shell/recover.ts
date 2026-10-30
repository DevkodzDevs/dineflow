/**
 * What the error card (components/ErrorRecovery.tsx) and the last-resort screen (app/global-error.tsx) share — kept free of
 * React, icons and anything else that could be one more file to fetch, because the last-resort screen runs exactly when
 * the page's files may be gone (a tab or a home-screen app older than the last deploy).
 */
import { isSkewError } from "@/lib/reach";

type Err = (Error & { digest?: string }) | null | undefined;

/** A build file this page asked for is gone — a deploy since the page loaded. */
export const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
/** An old tab: a missing chunk, or a server action this build does not know. Only a reload to the new build fixes it. */
export const isStaleBuild = (e: Err) => STALE.test(`${e?.name} ${e?.message}`) || isSkewError(e);

/** The time of the last automatic reload for a stale build — shared with the inline guard in <head> (staleBoot.ts), so
 *  between them a page reloads itself at most once in 30 s and can never spin. */
export const ONCE = "df-reloaded-after-stale-build";
/** The time of the last quiet retry for any other failure (once a minute). */
export const RETRY = "df-retried-after-error";

/** True (and the time noted) when a stale build may reload now; false inside 30 s of the last one. */
export function mayReloadStale(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(ONCE)) || 0; } catch { /* storage blocked: the reload still helps, it just cannot be rate-limited */ }
  if (Date.now() - last < 30000) return false;
  try { sessionStorage.setItem(ONCE, String(Date.now())); } catch { /* as above */ }
  return true;
}

/** Drop the cached build and the worker holding it, then reload — or the reload could serve the same stale files. */
export async function reloadFresh() {
  try { if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch { /* none */ }
  try { const rs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((rs ?? []).map((r) => r.unregister())); } catch { /* none */ }
  location.reload();
}

/**
 * report_client_error (0149, Master control → Testing): once a visit for the same error on the same page, fire and forget.
 * Through the browser client first — the report then carries who and which property. That client is a chunk of its own
 * (lib/supabase/lazy.ts), and on a stale build it is exactly what cannot load: then straight to the REST endpoint with the
 * public key (the function is granted to anon — a guest's page crashes too), keepalive so a reload straight after does not
 * cancel it. A failure to report is never a second failure.
 */
export function reportCrash(kind: "crash" | "stale", error: Err) {
  const key = `df-crash:${kind}:${location.pathname}:${error?.name}:${String(error?.message ?? "").slice(0, 80)}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* no storage: report anyway */ }
  const args = { p_kind: kind, p_path: location.pathname, p_name: error?.name ?? null, p_message: error?.message ?? null, p_digest: error?.digest ?? null, p_ua: navigator.userAgent };
  const direct = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;
    void fetch(`${url}/rest/v1/rpc/report_client_error`, { method: "POST", keepalive: true, headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" }, body: JSON.stringify(args) }).catch(() => {});
  };
  void import("@/lib/supabase/lazy").then(({ getClient }) => getClient())
    .then((c) => c.rpc("report_client_error", args), direct)   // the client did not load: send it directly
    .catch(() => { /* the log is a help, never a second failure */ });
}
