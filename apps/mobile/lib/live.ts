import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { cacheGet, cacheSet } from "./cache";

/**
 * Re-run `fn` when any of these tables change, plus a slow poll as a safety net.
 * Two things make it cheap on a phone: bursts of changes are coalesced into one call, and the
 * subscription and poll stop when the app goes to the background — a waiter's phone in a pocket
 * shouldn't hold a socket open or wake the radio.
 */
export function useLive(tables: string[], fn: () => void, pollMs = 30000) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => { if (timer) return; timer = setTimeout(() => { timer = null; f.current(); }, 250); };  // coalesce a burst
    f.current();
    const ch = supabase.channel(`live-${tables.join("-")}-${Math.random()}`);
    tables.forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, run));
    ch.subscribe();
    let iv: ReturnType<typeof setInterval> | null = setInterval(run, pollMs);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { if (!iv) iv = setInterval(run, pollMs); run(); }
      else if (iv) { clearInterval(iv); iv = null; }
    });
    return () => { supabase.removeChannel(ch); if (iv) clearInterval(iv); if (timer) clearTimeout(timer); sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * The same, but the screen opens instantly from what it had last time and is replaced when the
 * fresh answer lands. With no signal the cached copy simply stays.
 */
export function useLiveCached<T>(key: string, tables: string[], load: () => Promise<T>, apply: (v: T) => void, pollMs = 30000) {
  const applied = useRef(apply); applied.current = apply;
  useEffect(() => { void cacheGet<T>(key).then((c) => { if (c) applied.current(c.v); }); }, [key]);
  useLive(tables, () => { void load().then((v) => { applied.current(v); void cacheSet(key, v); }).catch(() => { /* offline: keep what's on screen */ }); }, pollMs);
}

export const mins = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
/** The same age as plain text, for a line of detail rather than a tile. */
export const since = (iso: string) => {
  const m = mins(iso);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
};
/** A ticket's age for a flip tile: minutes up to an hour, then hours, then days. A raw count read
 *  "5656 min" on a ticket left open over a weekend, which tells a cook nothing. */
export const age = (iso: string): { value: string; label: string } => {
  const m = mins(iso);
  if (m < 60) return { value: String(m), label: "min" };
  const h = Math.floor(m / 60);
  return h < 24 ? { value: `${h}h`, label: "ago" } : { value: `${Math.floor(h / 24)}d`, label: "ago" };
};
