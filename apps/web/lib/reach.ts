/**
 * A call to the server that may not arrive (2026-10-28, the owner: "sometimes the app crashes — This screen did not
 * load"). Two ordinary things make a server action throw instead of answering:
 *  - the network dropped it — Safari says "Load failed" (a phone waking, Wi-Fi to 4G, a lift); Chrome "Failed to fetch";
 *  - the tab is older than the last deploy — the action's id is unknown to the new build ("Server Action … was not found
 *    on the server").
 * Thrown inside a transition, either one goes to the nearest error boundary: on a guest page or in the app's frame that is
 * the whole screen. `reach` turns them into the `{ error }` answer every caller already handles; the error card
 * (components/ErrorRecovery.tsx) uses the same two tests for the throws that still reach it.
 */
const NETWORK = /load failed|failed to fetch|networkerror|network ?error|network connection was lost|internet connection appears to be offline|request timed out|network request failed|fetch failed|err_internet_disconnected|err_network/i;
const SKEW = /was not found on the server|failed to find server action|unrecognizedactionerror|an unexpected response was received from the server/i;

const text = (e: unknown) => { const x = e as { name?: string; message?: string } | null; return `${x?.name ?? ""} ${x?.message ?? String(e ?? "")}`; };
export const isNetworkError = (e: unknown) => NETWORK.test(text(e));
/** The tab is older (or newer) than the build that answered: only a reload fixes it. */
export const isSkewError = (e: unknown) => SKEW.test(text(e));

export const NO_CONNECTION = "No connection — check the network and try again.";
export const UPDATED = "DineFlow was just updated — loading the new version…";

const RELOADED = "df-reloaded-for-update";
/** Reload once to pick up the new build; never twice within 30 s, so a server that keeps refusing cannot loop. */
export function reloadForUpdate() {
  try { if (Date.now() - (Number(sessionStorage.getItem(RELOADED)) || 0) < 30000) return false; sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* no storage: reload anyway */ }
  setTimeout(() => location.reload(), 600);
  return true;
}

/** Next's own control flow (a redirect, notFound) travels as a throw too, and must keep travelling. */
const isNextSignal = (e: unknown) => { const d = (e as { digest?: unknown } | null)?.digest; return typeof d === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(d); };

export async function reach<T>(call: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await call();
  } catch (e) {
    if (isNextSignal(e)) throw e;
    if (isSkewError(e)) { reloadForUpdate(); return { error: UPDATED }; }
    if (isNetworkError(e) || (typeof navigator !== "undefined" && navigator.onLine === false)) return { error: NO_CONNECTION };
    const ref = (e as { digest?: string } | null)?.digest;
    return { error: `Something went wrong${ref ? ` (ref ${ref})` : ""} — try again.` };
  }
}
