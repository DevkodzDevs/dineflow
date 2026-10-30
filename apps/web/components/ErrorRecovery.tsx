"use client";
import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, LifeBuoy, WifiOff } from "lucide-react";
import { isNetworkError, isSkewError } from "@/lib/reach";
import { isStaleBuild, mayReloadStale, reloadFresh, reportCrash, RETRY } from "@/components/shell/recover";

/**
 * What a screen shows when it fails to render.
 *
 * The common cause is not a bug in the page at all: the tab has been open across a deploy, so the
 * JavaScript it asks for was replaced by files with different names. The browser calls that a
 * missing chunk, and without a boundary the whole screen goes blank with "Application error".
 * Reloading picks up the new build, so do it once, automatically, and clear the cached copies on
 * the way out. Anything else is a real error and is shown with a way to retry.
 */
/* The stale-build test, the reload keys, the fresh reload and the crash report live in components/shell/recover.ts, shared
   with app/global-error.tsx (2026-10-30). The reload key (df-reloaded-after-stale-build) is also the inline guard's in
   <head> (staleBoot.ts), so a page reloads itself for a stale build at most once in 30 s, whichever of the three sees it. */
/* Any other failure gets one quiet retry too (2026-10-24, the owner: "after login the app shows 'This screen did not load'").
   That evening the shared database was briefly overloaded; every screen that asked it in that minute fell to this card and
   stayed there until someone pressed Reload. Now the card waits 1.5 s and reloads once by itself ("Reconnecting…"); a
   second failure inside a minute shows the card as before, so a real bug can never spin (RETRY, df-retried-after-error). */
/* A dropped connection is not a broken screen (2026-10-28, the owner: "sometimes the app crashes like this" — reproduced:
   the guest table page opening while the network drops its requests went Reconnecting… → reload → the reload failed too
   → this card, for good). Now: "Connection lost", and the same screen is drawn again by itself (reset, not a reload — a
   reload with no network is the browser's own dead page) when the phone says it is back online, or after 2, 4, 8, 15,
   then every 30 s; Try now does it at once. A tab older than the deploy (an action the new build does not know) is a
   stale build like a missing chunk: reload to the new one. Shared tests: lib/reach.ts. */
const NET = "df-net-retry";   // { n: attempts so far, t: last attempt } — the back-off survives the boundary remounting
const WAITS = [2000, 4000, 8000, 15000, 30000];

export function ErrorRecovery({ error, reset, inline = false }: { error: Error & { digest?: string }; reset?: () => void; inline?: boolean }) {
  // inside the app shell the card sits in the page column, under the sidebar and above the tab bar;
  // at the root it is the whole screen
  const frame = inline ? "min-h-[60dvh] grid place-items-center p-2" : "min-h-dvh grid place-items-center bg-[var(--color-bg)] p-6";
  const [reloading, setReloading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const offline = isNetworkError(error) && !isSkewError(error);
  const [again, setAgain] = useState(0);   // bumps to try the screen again now

  useEffect(() => {
    if (!offline) return;
    let n = 0;
    try { const v = JSON.parse(sessionStorage.getItem(NET) ?? "null") as { n: number; t: number } | null; if (v && Date.now() - v.t < 120000) n = v.n; } catch { /* none */ }
    const tryNow = () => {
      if (navigator.onLine === false) return;   // the online event will call again
      try { sessionStorage.setItem(NET, JSON.stringify({ n: n + 1, t: Date.now() })); } catch { /* no storage: still try */ }
      if (reset) reset(); else location.reload();
    };
    const t = setTimeout(tryNow, again ? 0 : WAITS[Math.min(n, WAITS.length - 1)]);
    addEventListener("online", tryNow);
    return () => { clearTimeout(t); removeEventListener("online", tryNow); };
  }, [offline, reset, again]);

  /* What broke is recorded (0149, Master control → Testing): once a visit for the same error on the same page, never a
     network drop (not a bug, and it could not be sent). Fire and forget — the card does not wait on it. */
  useEffect(() => {
    if (offline) return;
    reportCrash(isStaleBuild(error) ? "stale" : "crash", error);
  }, [error, offline]);

  useEffect(() => {
    if (offline) return;
    const stale = isStaleBuild(error);
    if (!stale) {
      let tried = 0;
      try { tried = Number(sessionStorage.getItem(RETRY)) || 0; } catch { return; }   // no storage, no rate limit: show the card
      if (Date.now() - tried < 60000) return;
      try { sessionStorage.setItem(RETRY, String(Date.now())); } catch { return; }
      setRetrying(true);
      const t = setTimeout(() => location.reload(), 1500);
      return () => clearTimeout(t);
    }
    // A timestamp rather than a flag: it forgets on its own, so a deploy an hour from now can still
    // recover, while a build that is genuinely broken cannot spin — the second failure inside the
    // window falls through to the card instead of reloading again.
    if (!mayReloadStale()) return;
    setReloading(true);
    // drop the cached build and the worker holding it, or the reload serves the same stale files
    void reloadFresh();
  }, [error, offline]);

  if (offline) return (
    <div className={frame} data-error-screen data-error-offline>
      <div className="card p-6 max-w-sm w-full text-center">
        <span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><WifiOff size={22} /></span>
        <h1 className="text-2xl mt-4">Connection lost</h1>
        <p className="text-sm text-[var(--color-label-2)] mt-2">Waiting for the network — this screen comes back by itself. Nothing is lost.</p>
        <button type="button" onClick={() => setAgain((x) => x + 1)} className="btn btn-gray w-full mt-5"><RefreshCw size={16} /> Try now</button>
      </div>
    </div>
  );

  if (retrying) return (
    <div className={frame} data-error-screen data-error-retrying>
      <div className="text-center">
        <RefreshCw size={22} className="mx-auto animate-spin text-[var(--color-label-2)]" />
        <p className="mt-3 text-sm text-[var(--color-label-2)]">Reconnecting…</p>
      </div>
    </div>
  );

  if (reloading) return (
    <div className={frame} data-error-screen>
      <div className="text-center">
        <RefreshCw size={22} className="mx-auto animate-spin text-[var(--color-label-2)]" />
        <p className="mt-3 text-sm text-[var(--color-label-2)]">A newer version is ready. Loading it…</p>
      </div>
    </div>
  );

  return (
    <div className={frame} data-error-screen>
      <div className="card p-6 max-w-md w-full text-center">
        <span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-red-2)] text-[var(--color-red)]"><AlertTriangle size={22} /></span>
        <h1 className="text-2xl mt-4">This screen did not load</h1>
        <p className="text-sm text-[var(--color-label-2)] mt-2">Nothing is lost. Try again.</p>
        {error?.digest && <p className="footnote mt-2 num">Reference {error.digest}</p>}
        {/* what the browser said, so a screenshot of this card tells us what broke (a server failure carries a reference
            instead; its message is withheld in production) */}
        {!error?.digest && error?.message && <p className="footnote mt-2 break-words" data-error-detail>Details: {`${error.name && error.name !== "Error" ? `${error.name} — ` : ""}${error.message}`.slice(0, 160)}</p>}
        <div className="flex gap-2 mt-5">
          {reset && <button onClick={reset} className="btn btn-gray flex-1">Try again</button>}
          <button onClick={() => location.reload()} className="btn btn-filled flex-1">Reload the page</button>
        </div>
        {/* straight to Help & support with the form set to a problem on this page (a plain link: it works
            even when the page's own scripts are what failed) */}
        <a href={`/help?kind=problem&from=${encodeURIComponent(typeof location === "undefined" ? "" : location.pathname)}`} data-report
          className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl text-[13px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] transition-colors">
          <LifeBuoy size={15} /> Report this problem
        </a>
      </div>
    </div>
  );
}
