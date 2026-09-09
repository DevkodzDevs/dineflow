"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { onQueue } from "./sync";
import { Countdown } from "@/components/ui";
import { startSync, subscribe, flush } from "./sync";
import { cacheSet } from "./db";
import { createClient } from "@/lib/supabase/client";

type S = { online: boolean; pending: number; syncing: boolean; lastError: string | null; lastSyncAt: number | null; justSynced: number };
const Ctx = createContext<S>({ online: true, pending: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 });
export const useOffline = () => useContext(Ctx);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
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
  // Warm the offline cache with what the POS and kitchen need, so a screen that was never
  // opened on this device still has menu, tables and rooms when the connection drops.
  useEffect(() => {
    const warmCache = async () => {
      try {
        const sb = createClient();
        const [m, c, t, r, ing, lab] = await Promise.all([
          sb.from("menu_items").select("id, name, price, is_veg, category_id, is_available").eq("is_active", true),
          sb.from("categories").select("id, name, sort_order"),
          sb.from("dining_tables").select("id, name, status, zone"),
          sb.from("rooms").select("id, number, floor, status, room_type_id"),
          sb.from("ingredients").select("id, name, unit, current_stock, reorder_level").eq("is_active", true),
          sb.from("labourers").select("id, code, full_name, skill, daily_wage"),
        ]);
        if (m.data) await cacheSet("menu_items", m.data); if (c.data) await cacheSet("categories", c.data);
        if (t.data) await cacheSet("tables", t.data); if (r.data) await cacheSet("rooms", r.data);
        if (ing.data) await cacheSet("ingredients", ing.data); if (lab.data) await cacheSet("labourers", lab.data);
        // and pre-load the key screens into the service-worker cache
        ["/orders", "/orders/new", "/kitchen", "/billing", "/pulse", "/rooms", "/frontdesk", "/housekeeping", "/inventory", "/tomorrow", "/scan"].forEach((u) => fetch(u, { credentials: "include" }).catch(() => {}));
      } catch { /* offline right now — nothing to warm */ }
    };
    void warmCache(); const t = setInterval(warmCache, 10 * 60 * 1000); return () => clearInterval(t);
  }, []);
  const [retryIn, setRetryIn] = useState<number | null>(null);
  useEffect(() => { const un = onQueue((jobs) => { const soonest = jobs.map((j) => j.nextTry ?? 0).filter(Boolean).sort()[0]; setRetryIn(soonest ? Math.max(1, Math.round((soonest - Date.now()) / 1000)) : null); }); return () => { un(); }; }, []);
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
                : s.pending > 0 ? <><RefreshCw size={15} /> {s.pending} to send <button onClick={() => flush()} className="underline">retry</button></>
                : <><Check size={15} className="text-mint" /> All synced</>}
              {s.lastError && <span className="flex items-center gap-1 text-chili font-normal"><AlertTriangle size={13} /> {s.lastError}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
