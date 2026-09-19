"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
/**
 * Subscribe to table changes and refresh the screen — but coalesce bursts.
 * A busy kitchen fires dozens of events a second; we refresh at most every 400 ms
 * and only when the tab is visible, so scrolling and typing never stutter.
 */
export function useLive(tables: string[], every = 60000) {
  const router = useRouter(); const t = useRef<ReturnType<typeof setTimeout> | null>(null); const last = useRef(0);
  useEffect(() => {
    const sb = createClient(); const ch = sb.channel(`live-${tables.join("-")}`);
    /**
     * A refresh is a whole server render — session, page queries, HTML — so two of them back to back
     * cost more than the events that asked for them. The 400 ms window coalesces a burst, and the
     * floor below keeps a kitchen that never stops writing from queueing one render after another:
     * a busy service fires on several of these tables at once, and the screen only has to be right,
     * not instantaneous. The timer and the tab-focus refresh still catch anything missed.
     */
    const MIN_GAP = 2000;
    const run = () => { t.current = null; last.current = Date.now(); router.refresh(); };
    const bump = () => {
      if (document.visibilityState !== "visible") return;
      if (t.current) return;
      t.current = setTimeout(run, Math.max(400, MIN_GAP - (Date.now() - last.current)));
    };
    tables.forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, bump));
    ch.subscribe();
    const iv = setInterval(() => { if (document.visibilityState === "visible") run(); }, every);
    const vis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { sb.removeChannel(ch); clearInterval(iv); document.removeEventListener("visibilitychange", vis); if (t.current) clearTimeout(t.current); };
  }, [router, tables.join("-"), every]); // eslint-disable-line react-hooks/exhaustive-deps
}
