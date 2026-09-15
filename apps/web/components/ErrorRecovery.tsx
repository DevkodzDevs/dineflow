"use client";
import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * What a screen shows when it fails to render.
 *
 * The common cause is not a bug in the page at all: the tab has been open across a deploy, so the
 * JavaScript it asks for was replaced by files with different names. The browser calls that a
 * missing chunk, and without a boundary the whole screen goes blank with "Application error".
 * Reloading picks up the new build, so do it once, automatically, and clear the cached copies on
 * the way out. Anything else is a real error and is shown with a way to retry.
 */
const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const ONCE = "df-reloaded-after-stale-build";   // holds the time of the last automatic reload

export function ErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const stale = STALE.test(`${error?.name} ${error?.message}`);
    if (!stale) return;
    // A timestamp rather than a flag: it forgets on its own, so a deploy an hour from now can still
    // recover, while a build that is genuinely broken cannot spin — the second failure inside the
    // window falls through to the card instead of reloading again.
    let last = 0;
    try { last = Number(sessionStorage.getItem(ONCE)) || 0; } catch { /* storage blocked: the reload below still helps, it just cannot be rate-limited */ }
    if (Date.now() - last < 30000) return;
    setReloading(true);
    void (async () => {
      try { sessionStorage.setItem(ONCE, String(Date.now())); } catch {}
      // drop the cached build and the worker holding it, or the reload serves the same stale files
      try { if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch {}
      try { const rs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((rs ?? []).map((r) => r.unregister())); } catch {}
      location.reload();
    })();
  }, [error]);

  if (reloading) return (
    <div className="min-h-dvh grid place-items-center bg-[var(--color-bg)] p-6">
      <div className="text-center">
        <RefreshCw size={22} className="mx-auto animate-spin text-[var(--color-label-2)]" />
        <p className="mt-3 text-sm text-[var(--color-label-2)]">A newer version is ready. Loading it…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh grid place-items-center bg-[var(--color-bg)] p-6">
      <div className="card p-6 max-w-md w-full text-center">
        <span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-red-2)] text-[var(--color-red)]"><AlertTriangle size={22} /></span>
        <h1 className="text-2xl mt-4">This screen did not load</h1>
        <p className="text-sm text-[var(--color-label-2)] mt-2">Nothing you entered has been lost. Try again, and if it keeps happening tell us what you were doing.</p>
        {error?.digest && <p className="footnote mt-2 num">Reference {error.digest}</p>}
        <div className="flex gap-2 mt-5">
          {reset && <button onClick={reset} className="btn btn-gray flex-1">Try again</button>}
          <button onClick={() => location.reload()} className="btn btn-filled flex-1">Reload the page</button>
        </div>
      </div>
    </div>
  );
}
