"use client";
/**
 * The one way a live screen refreshes itself (useLive, and the order screen's own channel).
 *
 * A tap that writes — Start cooking, Add a dish, Mark paid — is a server action, and the action's answer already
 * carries the screen re-rendered with the change. The same write also comes back over realtime a moment later,
 * and the listener used to answer it with router.refresh() 400 ms after: a second whole server render, and Next
 * cancels the action's answer in flight when a refresh starts (measured on the kitchen board, 2026-10-18: the
 * action's request ended "net::ERR_ABORTED", the screen waited on the refresh instead, and sometimes that refresh
 * was cancelled by the next). So:
 *
 * - a refresh never starts while one of this page's own actions is answering, nor in the 1.2 s after its answer
 *   arrives (the answer is the refresh) — it waits, then runs, so a change made on another device in that moment
 *   still shows;
 * - events that arrive together are one refresh, and refreshes are at least `minGap` apart;
 * - nothing refreshes while the tab is hidden (the tab coming back refreshes once).
 */
let flying = 0, landed = 0, installed = false;

/** Counts the server actions this page has in flight: Next sends each one with a `next-action` header. */
function watchActions() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const h = init?.headers;
    const isAction = !!h && (h instanceof Headers ? h.has("next-action") : Array.isArray(h) ? h.some(([k]) => k.toLowerCase() === "next-action") : Object.keys(h).some((k) => k.toLowerCase() === "next-action"));
    if (!isAction) return base(input, init);
    flying++;
    const p = base(input, init);
    p.then(() => undefined, () => undefined).finally(() => { flying = Math.max(0, flying - 1); landed = Date.now(); });
    return p;
  }) as typeof fetch;
}

/** True while one of this page's actions is answering, and for a moment after (its answer streams in). */
export const actionBusy = (graceMs = 1200) => flying > 0 || Date.now() - landed < graceMs;

export function calmRefresher(refresh: () => void, minGap = 2000) {
  watchActions();
  let timer: ReturnType<typeof setTimeout> | null = null, last = 0;
  const run = () => {
    timer = null;
    if (actionBusy()) { timer = setTimeout(run, 400); return; }
    last = Date.now(); refresh();
  };
  return {
    /** A change arrived: refresh soon, once, unless one is already on its way. */
    bump: () => {
      if (document.visibilityState !== "visible" || timer) return;
      timer = setTimeout(run, Math.max(400, minGap - (Date.now() - last)));
    },
    /** Refresh now (the timer, the tab coming back) — still never over an action's answer. */
    now: () => { if (timer) clearTimeout(timer); run(); },
    stop: () => { if (timer) clearTimeout(timer); timer = null; },
  };
}
