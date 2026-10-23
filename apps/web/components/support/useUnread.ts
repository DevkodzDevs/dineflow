"use client";
import { useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/lazy";
import { whenSettled } from "@/lib/idle";

/* One answer shared by the sidebar and the phone's tab bar, both mounted at every width: replies from
   DineFlow this person has not opened yet (support_unread, 0096). Asked again on each screen change,
   at most once per screen in five seconds, after the screen is up — it never holds a render. */
let last: { path: string; at: number; ask: Promise<number> } | null = null;
const ask = (path: string) => {
  if (last && last.path === path && Date.now() - last.at < 5000) return last.ask;
  // the client through lib/supabase/lazy.ts, never imported here: this hook is in the menu on every screen, and a
  // plain import put Supabase's ~235 kB back into the signed-in shell's first load (measured 2026-10-18)
  const p = getClient().then((c) => c.rpc("support_unread")).then(({ data }) => (typeof data === "number" ? data : 0), () => 0);
  last = { path, at: Date.now(), ask: p };
  return p;
};

/** `on` is false for everyone but the owner (2026-10-21): only the owner has Help & support, and asking anyway cost every
 *  other login a database call on every screen change — and loaded the Supabase client into screens that needed none. */
export function useSupportUnread(path: string, on = true) {
  const [n, setN] = useState(0);
  // once the screen has settled (lib/idle.ts) — a red dot can wait a second; the screen cannot
  useEffect(() => { if (!on) return; let live = true; const cancel = whenSettled(() => void ask(path).then((v) => { if (live) setN(v); }), 1200); return () => { live = false; cancel(); }; }, [path, on]);
  return n;
}
