"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* One answer shared by the sidebar and the phone's tab bar, both mounted at every width: replies from
   DineFlow this person has not opened yet (support_unread, 0096). Asked again on each screen change,
   at most once per screen in five seconds, after the screen is up — it never holds a render. */
let last: { path: string; at: number; ask: Promise<number> } | null = null;
const ask = (path: string) => {
  if (last && last.path === path && Date.now() - last.at < 5000) return last.ask;
  const p = Promise.resolve(createClient().rpc("support_unread")).then(({ data }) => (typeof data === "number" ? data : 0), () => 0);
  last = { path, at: Date.now(), ask: p };
  return p;
};

export function useSupportUnread(path: string) {
  const [n, setN] = useState(0);
  useEffect(() => { let live = true; void ask(path).then((v) => { if (live) setN(v); }); return () => { live = false; }; }, [path]);
  return n;
}
