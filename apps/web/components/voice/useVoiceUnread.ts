"use client";
import { useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/lazy";

/* Feedback & complaints (0124) — what is new for this person, for the menu row's count: for the owner, staff messages
   (and staff answers) not yet opened; for anyone else, their own items the owner has answered or moved since they last
   looked (voice_unread). One answer shared by the sidebar and the phone's tab bar, asked again on each screen change,
   at most once per screen in five seconds — like components/support/useUnread.ts, and through the lazy client for the
   same reason (a plain import put Supabase back into every screen's first load). */
let last: { path: string; at: number; ask: Promise<number> } | null = null;
const ask = (path: string) => {
  if (last && last.path === path && Date.now() - last.at < 5000) return last.ask;
  const p = getClient().then((c) => c.rpc("voice_unread")).then(({ data }) => (typeof data === "number" ? data : 0), () => 0);
  last = { path, at: Date.now(), ask: p };
  return p;
};

export function useVoiceUnread(path: string) {
  const [n, setN] = useState(0);
  useEffect(() => { let live = true; void ask(path).then((v) => { if (live) setN(v); }); return () => { live = false; }; }, [path]);
  return n;
}
