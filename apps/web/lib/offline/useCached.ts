"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGet, cacheSet } from "./db";

/**
 * Cache first, then the network. A screen paints instantly from the last good answer — even with no
 * connection — and quietly replaces it when a fresh one arrives. `stale` tells the screen to say so.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, opts: { staleAfter?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const staleAfter = opts.staleAfter ?? 60_000;

  const revalidate = useCallback(async () => {
    try {
      const fresh = await fetcher();
      if (!alive.current) return;
      setData(fresh); setAt(Date.now()); void cacheSet(key, fresh);
    } catch { /* offline or server down — the cached copy stays on screen */ }
    finally { if (alive.current) setLoading(false); }
  }, [key, fetcher]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const c = await cacheGet<T>(key);
      if (c && alive.current) { setData(c.v); setAt(c.at); setLoading(false); }
      await revalidate();
    })();
    const onSync = () => void revalidate();
    window.addEventListener("dineflow:synced", onSync); window.addEventListener("online", onSync);
    return () => { alive.current = false; window.removeEventListener("dineflow:synced", onSync); window.removeEventListener("online", onSync); };
  }, [key, revalidate]);

  return { data, loading, at, stale: at != null && Date.now() - at > staleAfter, revalidate };
}
