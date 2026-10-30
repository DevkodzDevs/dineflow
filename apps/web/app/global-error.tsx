"use client";
import { useEffect, useState } from "react";
import { isNetworkError, isSkewError } from "@/lib/reach";
import { isStaleBuild, mayReloadStale, reloadFresh, reportCrash, RETRY } from "@/components/shell/recover";
import "./globals.css";

/**
 * The last resort: a failure in the root layout itself, above every other boundary. React replaces the whole document
 * here, so this file supplies its own html and body.
 *
 * It must work when the page's files are what failed (2026-10-30, the owner's iPhone: Next's bare "Application error" — a
 * home-screen app older than the last deploy). So it brings nothing it could fail to fetch: no icon set, no shared card —
 * plain elements, inline layout, the theme's tokens (if the stylesheet is gone too it is still readable) and the small
 * shared helpers in components/shell/recover.ts. It sorts what it caught as the error card does (components/ErrorRecovery.tsx):
 *   - an old tab (a missing chunk, an action this build does not know) → reload once onto the new build (30 s guard,
 *     shared with the inline guard in <head>);
 *   - a dropped connection → "Connection lost", and the app is drawn again by itself when the phone is back online;
 *   - anything else → one quiet retry a minute, then the card.
 * Everything but a dropped connection goes to the crash log (report_client_error, 0149), even when the browser client's
 * own chunk is missing.
 */
const NET = "df-net-retry";   // the same back-off record as the error card's
const WAITS = [2000, 4000, 8000, 15000, 30000];

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = isNetworkError(error) && !isSkewError(error);
  const [mode, setMode] = useState<"card" | "reloading" | "retrying">("card");
  const [again, setAgain] = useState(0);

  useEffect(() => { if (!offline) reportCrash(isStaleBuild(error) ? "stale" : "crash", error); }, [error, offline]);

  useEffect(() => {
    if (offline) return;
    if (isStaleBuild(error)) {
      if (!mayReloadStale()) return;
      setMode("reloading");
      void reloadFresh();
      return;
    }
    let tried = 0;
    try { tried = Number(sessionStorage.getItem(RETRY)) || 0; } catch { return; }   // no storage, no rate limit: show the card
    if (Date.now() - tried < 60000) return;
    try { sessionStorage.setItem(RETRY, String(Date.now())); } catch { return; }
    setMode("retrying");
    const t = setTimeout(() => location.reload(), 1500);
    return () => clearTimeout(t);
  }, [error, offline]);

  useEffect(() => {
    if (!offline) return;
    let n = 0;
    try { const v = JSON.parse(sessionStorage.getItem(NET) ?? "null") as { n: number; t: number } | null; if (v && Date.now() - v.t < 120000) n = v.n; } catch { /* none */ }
    const tryNow = () => {
      if (navigator.onLine === false) return;   // the online event will call again
      try { sessionStorage.setItem(NET, JSON.stringify({ n: n + 1, t: Date.now() })); } catch { /* still try */ }
      reset();
    };
    const t = setTimeout(tryNow, again ? 0 : WAITS[Math.min(n, WAITS.length - 1)]);
    addEventListener("online", tryNow);
    return () => { clearTimeout(t); removeEventListener("online", tryNow); };
  }, [offline, reset, again]);

  const title = offline ? "Connection lost" : mode === "reloading" ? "Updating DineFlow…" : mode === "retrying" ? "Reconnecting…" : "DineFlow did not load";
  const line = offline ? "Waiting for the network — DineFlow comes back by itself. Nothing is lost."
    : mode === "card" ? "Nothing is lost. Reload to try again." : "One moment.";
  const busy = mode !== "card" && !offline;
  const detail = !offline && mode === "card" ? (error?.digest ? `Reference ${error.digest}` : error?.message ? `Details: ${`${error.name && error.name !== "Error" ? `${error.name} — ` : ""}${error.message}`.slice(0, 160)}` : null) : null;
  const btn = { minHeight: 48, minWidth: 44, padding: "0 20px", borderRadius: 14, border: 0, font: "700 15px/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" } as const;

  return (
    <html lang="en" data-theme="dark">
      <body style={{ margin: 0, background: "var(--color-bg)", color: "var(--color-label)", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <main data-error-screen data-error-root data-error-offline={offline ? "" : undefined} data-error-retrying={mode === "retrying" ? "" : undefined}
          style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
          <div role={busy ? "status" : undefined} style={{ width: "100%", maxWidth: 400, textAlign: "center", padding: 24, borderRadius: 24, background: "var(--color-bg-2)", boxShadow: "0 0 0 1px var(--color-separator)", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: ".02em", color: "var(--color-label-2)" }}>DineFlow</div>
            {busy
              ? <div aria-hidden className="animate-spin" style={{ width: 40, height: 40, margin: "22px auto 18px", borderRadius: "50%", border: "4px solid var(--color-fill)", borderTopColor: "var(--color-tint)" }} />
              : <div aria-hidden style={{ width: 48, height: 48, margin: "18px auto 14px", borderRadius: 16, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24, background: offline ? "var(--color-fill)" : "var(--color-red-2)", color: offline ? "var(--color-label-2)" : "var(--color-red)" }}>!</div>}
            <h1 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: 1.2 }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, color: "var(--color-label-2)" }}>{line}</p>
            {detail && <p data-error-detail style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--color-label-2)", overflowWrap: "anywhere" }}>{detail}</p>}
            {!busy && (
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                {offline
                  ? <button type="button" onClick={() => setAgain((x) => x + 1)} style={{ ...btn, flex: 1, background: "var(--color-fill)", color: "var(--color-label)" }}>Try now</button>
                  : <button type="button" onClick={() => location.reload()} style={{ ...btn, flex: 1, background: "var(--color-tint)", color: "var(--color-on-tint)" }}>Reload</button>}
              </div>
            )}
            {mode === "card" && !offline && (
              /* a plain link: it works even when the page's own scripts are what failed */
              <a href={`/help?kind=problem&from=${encodeURIComponent(typeof location === "undefined" ? "" : location.pathname)}`} data-report
                style={{ ...btn, minHeight: 44, marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--color-label-2)", background: "transparent" }}>Report this problem</a>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
