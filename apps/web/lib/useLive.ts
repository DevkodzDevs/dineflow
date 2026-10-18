"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getClient } from "@/lib/supabase/lazy";
import { calmRefresher } from "@/lib/liveRefresh";
/**
 * Subscribe to table changes and refresh the screen — but coalesce bursts.
 * A busy kitchen fires dozens of events a second; we refresh at most every 2 s, only when the tab is visible, and
 * never over the answer of an action this screen just sent (lib/liveRefresh.ts) — so a tap's result is never thrown
 * away for a second render, and scrolling and typing never stutter.
 */
export function useLive(tables: string[], every = 60000) {
  const router = useRouter();
  useEffect(() => {
    /**
     * A refresh is a whole server render — session, page queries, HTML — so two of them back to back
     * cost more than the events that asked for them. The 400 ms window coalesces a burst, and the
     * 2 s floor keeps a kitchen that never stops writing from queueing one render after another:
     * a busy service fires on several of these tables at once, and the screen only has to be right,
     * not instantaneous. The timer and the tab-focus refresh still catch anything missed.
     */
    const r = calmRefresher(() => router.refresh(), 2000);

    /* The socket is opened just after the screen paints rather than as part of loading it: the
       realtime client is the single heaviest thing the browser would otherwise have to parse before
       showing anything. The timer below covers the gap, so the screen is never stale while it
       arrives, and a screen closed in that moment tears the subscription down on arrival. */
    let sb: SupabaseClient | null = null, ch: RealtimeChannel | null = null, gone = false;
    void (async () => {
      const c = await getClient();
      // the socket must carry the signed-in token before it joins: joined first, it joined as anon, the server answered
      // every change with "401 Unauthorized" or not at all, and the screen only caught up on its timer (0116)
      try { const { data } = await c.auth.getSession(); if (data.session) c.realtime.setAuth(data.session.access_token); } catch { /* the timer still covers it */ }
      if (gone) return;
      sb = c; ch = c.channel(`live-${tables.join("-")}`);
      tables.forEach((table) => ch!.on("postgres_changes", { event: "*", schema: "public", table }, r.bump));
      ch.subscribe();
    })();

    const iv = setInterval(() => { if (document.visibilityState === "visible") r.now(); }, every);
    const vis = () => { if (document.visibilityState === "visible") r.now(); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      gone = true;
      if (sb && ch) sb.removeChannel(ch);
      clearInterval(iv); document.removeEventListener("visibilitychange", vis); r.stop();
    };
  }, [router, tables.join("-"), every]); // eslint-disable-line react-hooks/exhaustive-deps
}
