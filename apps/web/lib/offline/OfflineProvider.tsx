"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { onQueue } from "./sync";
import { startSync, subscribe, flush } from "./sync";
import { cacheSet } from "./db";
import { getClient } from "@/lib/supabase/lazy";

type S = { online: boolean; pending: number; syncing: boolean; lastError: string | null; lastSyncAt: number | null; justSynced: number };
const Ctx = createContext<S>({ online: true, pending: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 });
export const useOffline = () => useContext(Ctx);

/** Screens worth having on the device when the line drops, in the order they matter to a service. */
const OFFLINE_SCREENS = ["/orders", "/orders/new", "/kitchen", "/billing", "/pulse", "/rooms", "/frontdesk", "/housekeeping", "/inventory", "/tomorrow", "/scan"];

export function OfflineProvider({ children, modules }: { children: React.ReactNode; modules?: string[] }) {
  const [s, setS] = useState<S>({ online: true, pending: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 });
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
   * Warm the offline cache with what the POS and kitchen need, so a screen that was never opened on
   * this device still has menu, tables and rooms when the connection drops.
   *
   * The warming must never compete with the screen someone is waiting for. This used to fire all
   * eleven screens at once the instant the app mounted — and a screen is a whole page render, so the
   * server took eleven sessions, eleven sets of queries and eleven React trees for pages nobody had
   * asked for, while the one that had been asked for queued behind them. That is what made the app
   * feel like it hung on load. Now it waits for the browser to fall idle, skips screens this person
   * cannot open anyway, and walks the rest one at a time with a breath in between, so at most one
   * speculative render is ever in flight.
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

    const warm = async () => {
      if (cancelled || !navigator.onLine || tooSlow()) return;
      try {
        const sb = await getClient();
        const [m, c, t, r, ing, lab] = await Promise.all([
          sb.from("menu_items").select("id, name, price, is_veg, category_id, is_available").eq("is_active", true),
          sb.from("categories").select("id, name, sort_order"),
          sb.from("dining_tables").select("id, name, status, zone"),
          sb.from("rooms").select("id, number, floor, status, room_type_id"),
          sb.from("ingredients").select("id, name, unit, current_stock, reorder_level").eq("is_active", true),
          sb.from("labourers").select("id, code, full_name, skill, daily_wage"),
        ]);
        if (cancelled) return;
        if (m.data) await cacheSet("menu_items", m.data); if (c.data) await cacheSet("categories", c.data);
        if (t.data) await cacheSet("tables", t.data); if (r.data) await cacheSet("rooms", r.data);
        if (ing.data) await cacheSet("ingredients", ing.data); if (lab.data) await cacheSet("labourers", lab.data);
      } catch { /* offline right now — nothing to warm */ }
      // then the screens themselves, one at a time, into the service worker's cache
      for (const u of list) {
        if (cancelled || !navigator.onLine || document.visibilityState !== "visible") return;
        try { await fetch(u, { credentials: "include" }); } catch { return; }
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
  useEffect(() => {
    let soonest = 0;
    const tick = () => setRetryIn(soonest ? Math.max(0, Math.round((soonest - Date.now()) / 1000)) : null);
    const un = onQueue((jobs) => { soonest = jobs.map((j) => j.nextTry ?? 0).filter(Boolean).sort((a, b) => a - b)[0] ?? 0; tick(); });
    const i = setInterval(tick, 1000);
    return () => { un(); clearInterval(i); };
  }, []);
  const show = !s.online || s.pending > 0 || !!s.lastError || s.justSynced > 0;
  return (
    <Ctx.Provider value={s}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="no-print fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50">
            <div className={`glass flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold ${s.online ? "" : "!bg-ink/90 text-white !border-ink"}`}>
              {s.justSynced > 0 && s.online && s.pending === 0 ? <><Check size={16} className="text-mint" /> Back online · {s.justSynced} sent</>
                : !s.online ? <><CloudOff size={16} /> Working offline{s.pending > 0 && <span className="num font-normal opacity-80">· {s.pending} waiting</span>}</>
                : s.syncing ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RefreshCw size={15} /></motion.span> Syncing {s.pending}…</>
                : s.pending > 0 ? <><RefreshCw size={15} /> {s.pending} to send{retryIn ? <span className="num font-normal opacity-80"> · retry in {retryIn}s</span> : null} <button onClick={() => flush()} className="underline">retry</button></>
                : <><Check size={15} className="text-mint" /> All synced</>}
              {s.lastError && <span className="flex items-center gap-1 text-chili font-normal"><AlertTriangle size={13} /> {s.lastError}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
