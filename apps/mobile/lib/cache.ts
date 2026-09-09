import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { onQueue } from "./queue";

/** The last good answer for a query, kept on the device so a screen opens with real data offline. */
const K = (k: string) => `dineflow.cache.${k}`;
export const cacheSet = async (k: string, v: unknown) => { try { await AsyncStorage.setItem(K(k), JSON.stringify({ v, at: Date.now() })); } catch { /* full disk */ } };
export const cacheGet = async <T>(k: string): Promise<{ v: T; at: number } | null> => { try { const r = await AsyncStorage.getItem(K(k)); return r ? JSON.parse(r) : null; } catch { return null; } };

/**
 * Cache first, then the network — the screen paints instantly from what it had, and quietly
 * replaces it when a fresh answer arrives. It refreshes again after the outbox drains.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, staleAfter = 60_000) {
  const [data, setData] = useState<T | null>(null); const [at, setAt] = useState<number | null>(null); const [loading, setLoading] = useState(true);
  const alive = useRef(true); const f = useRef(fetcher); f.current = fetcher;
  const revalidate = useCallback(async () => {
    try { const fresh = await f.current(); if (!alive.current) return; setData(fresh); setAt(Date.now()); void cacheSet(key, fresh); }
    catch { /* no line — what's on screen stays */ }
    finally { if (alive.current) setLoading(false); }
  }, [key]);
  useEffect(() => {
    alive.current = true;
    void (async () => { const c = await cacheGet<T>(key); if (c && alive.current) { setData(c.v); setAt(c.at); setLoading(false); } await revalidate(); })();
    let was = 0;
    const un = onQueue((q) => { if (q.justSynced && q.justSynced !== was) { was = q.justSynced; void revalidate(); } });
    return () => { alive.current = false; un(); };
  }, [key, revalidate]);
  return { data, loading, at, stale: at != null && Date.now() - at > staleAfter, revalidate };
}
