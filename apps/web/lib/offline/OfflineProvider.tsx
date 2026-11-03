"use client";
import { ask } from "@/components/ui/Confirm";
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RefreshCw, Check, AlertTriangle, RotateCcw, Trash2, ChevronUp } from "lucide-react";
import { onQueue } from "./sync";
import { startSync, subscribe, flush, retryJob, discardJob, setOfflineOutlet } from "./sync";
import type { Job } from "./db";

type S = { online: boolean; pending: number; held: number; syncing: boolean; lastError: string | null; lastSyncAt: number | null; justSynced: number };
const Ctx = createContext<S>({ online: true, pending: 0, held: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 });
export const useOffline = () => useContext(Ctx);

/** Screens worth having on the device when the line drops, in the order they matter to a service. */
const OFFLINE_SCREENS = ["/orders", "/orders/new", "/kitchen", "/billing", "/pulse", "/rooms", "/frontdesk", "/housekeeping", "/inventory", "/tomorrow", "/scan"];

export function OfflineProvider({ children, modules, outlet = null }: { children: React.ReactNode; modules?: string[]; outlet?: string | null }) {
  // queued writes remember the outlet they were made in (0106)
  useEffect(() => { setOfflineOutlet(outlet); }, [outlet]);
  const [s, setS] = useState<S>({ online: true, pending: 0, held: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 });
  useEffect(() => { const stop = startSync(); const un = subscribe(setS); return () => { stop?.(); un(); }; }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      // ask the browser to wake us and send the outbox the moment a connection returns, even if the tab is closed
      const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }).sync;
      sync?.register("dineflow-outbox").catch(() => {});
    }).catch(() => {});
    const onMsg = (e: MessageEvent) => { if ((e.data as { type?: string })?.type === "flush") void flush(); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
  /**
   * Warm the offline cache with the screens this person can open, so one never opened on this device still
   * shows when the connection drops.
   *
   * It no longer copies six whole tables to the device first (2026-10-21): menu items, categories, tables, rooms,
   * ingredients and labourers were written to IndexedDB for every login — a housekeeper's phone fetched the menu and
   * the pantry, and the master's, inside one property, every property's rows — and nothing ever read them back
   * (no screen used `useCached`). The screens above carry their own data.
   *
   * The warming must never compete with the screen someone is waiting for. This used to fire all
   * eleven screens at once the instant the app mounted — and a screen is a whole page render, so the
   * server took eleven sessions, eleven sets of queries and eleven React trees for pages nobody had
   * asked for, while the one that had been asked for queued behind them. That is what made the app
   * feel like it hung on load. Now it waits for the browser to fall idle, skips screens this person
   * cannot open anyway, and walks the rest one at a time with a breath in between, so at most one
   * speculative render is ever in flight.
   *
   * And it runs at most every half hour per device (`df-warmed` in localStorage), not on every opening of
   * the app: a phone opened ten times a lunch service warmed eleven screens ten times, and those renders
   * sat in front of the person's own first taps — on a serverless host a request that arrives while
   * another is running can land on a fresh instance that has to start cold.
   */
  const screens = (modules ?? []).length
    ? OFFLINE_SCREENS.filter((u) => modules!.includes(u.split("/")[1]))
    : OFFLINE_SCREENS;
  const screenKey = screens.join(",");
  useEffect(() => {
    let cancelled = false;
    const list = screenKey ? screenKey.split(",") : [];
    type Idle = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const whenIdle = (fn: () => void) => {
      const w = window as Window & Idle;
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 8000 });
      else setTimeout(fn, 3000);
    };
    // on a metered or 2G connection, warming costs the user more than it saves them
    const tooSlow = () => {
      const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      return Boolean(c?.saveData) || /(^|-)2g$/.test(c?.effectiveType ?? "");
    };
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const WARMED = "df-warmed", EVERY = 30 * 60 * 1000;
    const due = () => { try { return Date.now() - Number(localStorage.getItem(WARMED) || 0) > EVERY; } catch { return true; } };
    /* A screen's copy opens offline only with its build files (sw.js `whole`). The warm-up's fetch saved the HTML alone, so a
       screen never opened on this device had none of its scripts and showed the reconnect page offline (2026-11-03). Now
       the files the page names are fetched too — the worker keeps them, cache first. And a worker update empties the cache,
       so "warmed in the last half hour" is only believed while the first screen's copy is really there. */
    const files = (html: string) => [...new Set([
      ...(html.match(/\/_next\/static\/[^"'\s<>()\\]+\.(?:js|css)/g) ?? []),
      ...(html.match(/static\/chunks\/[^"'\s<>()\\]+\.js/g) ?? []).map((f) => `/_next/${f}`),
    ])];
    const kept = async (u: string) => { try { return typeof caches !== "undefined" && !!(await caches.match(u)); } catch { return false; } };
    const warm = async () => {
      if (cancelled || !list.length || !navigator.onLine || tooSlow()) return;   // a role with no offline screen warms nothing
      if (!due() && (await kept(list[0]))) return;
      try { localStorage.setItem(WARMED, String(Date.now())); } catch { /* private window: warm anyway */ }
      // the screens, one at a time, into the service worker's cache — each with its scripts and styles
      for (const u of list) {
        if (cancelled || !navigator.onLine || document.visibilityState !== "visible") return;
        try {
          const r = await fetch(u, { credentials: "include" });
          if (r.ok && !r.redirected) for (const f of files(await r.text())) { if (cancelled) return; if (!(await kept(f))) await fetch(f).catch(() => {}); }
        } catch { return; }
        await pause(800);
      }
    };

    whenIdle(() => { void warm(); });
    const t = setInterval(() => whenIdle(() => { void warm(); }), 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [screenKey]);
  /* How long until the outbox tries again. The queue only tells us when it changes, so the seconds
     are ticked here — a number frozen at "45s" for a minute is worse than no number at all. The sort
     needs its comparator: Array.sort() compares timestamps as strings, which picks the wrong job the
     moment two of them straddle a digit boundary. */
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [heldJobs, setHeldJobs] = useState<Job[]>([]);
  /* everything still on this device, not only what is stuck (2026-11-03: an order taken offline was invisible until it sent) */
  const [waiting, setWaiting] = useState<Job[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  useEffect(() => {
    let soonest = 0;
    const tick = () => setRetryIn(soonest ? Math.max(0, Math.round((soonest - Date.now()) / 1000)) : null);
    const un = onQueue((jobs) => {
      soonest = jobs.filter((j) => !j.held).map((j) => j.nextTry ?? 0).filter(Boolean).sort((a, b) => a - b)[0] ?? 0; tick();
      setHeldJobs(jobs.filter((j) => j.held).sort((a, b) => (b.heldAt ?? 0) - (a.heldAt ?? 0)));
      setWaiting(jobs.filter((j) => !j.held).sort((a, b) => a.at - b.at));
    });
    const i = setInterval(tick, 1000);
    return () => { un(); clearInterval(i); };
  }, []);
  const show = !s.online || s.pending > 0 || s.held > 0 || !!s.lastError || s.justSynced > 0;
  return (
    <Ctx.Provider value={s}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="no-print fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,32rem)]">
            {/* Writes the outbox has stopped retrying. They are kept, not dropped, so the person who
                took the order decides what happens to it — send it again, or throw it away knowing. */}
            <AnimatePresence>
              {showHeld && heldJobs.length + waiting.length > 0 && (
                <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
                  className="glass mb-2 p-3 max-h-[50dvh] overflow-y-auto">
                  {waiting.length > 0 && (
                    <div data-offline-waiting>
                      <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1.5"><CloudOff size={13} /> On this device · {waiting.length}</div>
                      <ul className="space-y-1.5 mb-3">
                        {waiting.map((j) => (
                          <li key={j.id} className="flex items-center gap-2 rounded-xl bg-[var(--color-fill)] px-2.5 py-2 text-sm" data-offline-job>
                            <span className="flex-1 min-w-0 truncate font-semibold">{j.label}</span>
                            <span className="num text-[11px] text-steel shrink-0">{new Date(j.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {heldJobs.length > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-chili mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> Waiting on you · {heldJobs.length}
                  </div>}
                  <ul className="space-y-2">
                    {heldJobs.map((j) => (
                      <li key={j.id} className="rounded-xl border border-[var(--color-separator)] p-2.5">
                        <div className="text-sm font-semibold">{j.label}</div>
                        <div className="text-[11px] text-steel mt-0.5">
                          taken {new Date(j.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · tried {j.tries} time{j.tries === 1 ? "" : "s"}
                        </div>
                        {j.error && <div className="text-[11px] text-chili mt-1 break-words">{j.error}</div>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => void retryJob(j.id)} className="btn btn-gray !h-8 !px-3 !text-[12px] !rounded-[10px] flex-1"><RotateCcw size={13} /> Send again</button>
                          <button onClick={async () => { if (await ask({ title: "Throw this away?", body: `"${j.label}" will not reach the till or the kitchen.`, ok: "Throw away", tone: "danger", icon: "trash" })) void discardJob(j.id); }}
                            className="btn btn-danger !h-8 !px-3 !text-[12px] !rounded-[10px]"><Trash2 size={13} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
            <div className={`glass flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold ${s.online ? "" : "!bg-[var(--color-label)] !text-[var(--color-on-label)] !border-transparent"}`}>
              {s.held > 0 && (
                <button onClick={() => setShowHeld((v) => !v)} className="flex items-center gap-1.5 text-chili">
                  <AlertTriangle size={14} /> {s.held} waiting on you
                  <ChevronUp size={13} className={showHeld ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
              )}
              {s.justSynced > 0 && s.online && s.pending === 0 ? <><Check size={16} className="text-mint" /> Back online · {s.justSynced} sent</>
                : !s.online ? <><CloudOff size={16} /> Working offline{s.pending > 0 && <button type="button" onClick={() => setShowHeld((v) => !v)} className="num font-normal opacity-80 underline underline-offset-2 min-h-11 -my-2.5" data-offline-list>· {s.pending} saved here</button>}</>
                : s.syncing ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RefreshCw size={15} /></motion.span> Syncing {s.pending}…</>
                : s.pending > 0 ? <><RefreshCw size={15} /> <button type="button" onClick={() => setShowHeld((v) => !v)} className="underline-offset-2 hover:underline" data-offline-list>{s.pending} to send</button>{retryIn ? <span className="num font-normal opacity-80"> · retry in {retryIn}s</span> : null} <button onClick={() => flush()} className="underline">retry</button></>
                /* nothing queued, but something is parked: saying "all synced" beside it would be a lie */
                : s.held > 0 ? null
                : <><Check size={15} className="text-mint" /> All synced</>}
              {s.lastError && <span className="flex items-center gap-1 text-chili font-normal"><AlertTriangle size={13} /> {s.lastError}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
