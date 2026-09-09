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
  const router = useRouter(); const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sb = createClient(); const ch = sb.channel(`live-${tables.join("-")}`);
    const bump = () => { if (document.visibilityState !== "visible") return; if (t.current) return; t.current = setTimeout(() => { t.current = null; router.refresh(); }, 400); };
    tables.forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, bump));
    ch.subscribe();
    const iv = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, every);
    const vis = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { sb.removeChannel(ch); clearInterval(iv); document.removeEventListener("visibilitychange", vis); if (t.current) clearTimeout(t.current); };
  }, [router, tables.join("-"), every]); // eslint-disable-line react-hooks/exhaustive-deps
}
