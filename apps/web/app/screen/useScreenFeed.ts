"use client";
import { useEffect, useRef, useState } from "react";
import { readFeed, viaRoute, paceFor, RELOAD_MS, DIRECT_REST_MS, type FeedFn } from "@/lib/screenFeed";

/**
 * A TV's loop (lib/screenFeed.ts says why): read the feed from the database's API, at the screen's own pace while
 * something is on it and every 15 s while it is empty or unreachable. Twelve hours on, the screen reloads itself for the
 * new build — only once this app's own server answers, so a TV never reloads into an error page. Returns whether the
 * feed is lost (the key was rotated, the place closed, or nothing can be reached).
 */
export function useScreenFeed<T>(o: { fn: FeedFn; k: string; route: string; fast: number; initial: T; busy: (f: T) => boolean; onFeed: (f: T) => void; onTick?: () => void }): boolean {
  const [lost, setLost] = useState(false);
  const ref = useRef(o); ref.current = o;
  const { fn, k, route } = o;
  useEffect(() => {
    const born = Date.now(); let alive = true, timer: ReturnType<typeof setTimeout>, asked = 0;
    const turn = async () => {
      ref.current.onTick?.();
      // the reload check is the one call to this app's own server, so at most one every five minutes
      if (Date.now() - born > RELOAD_MS && Date.now() - asked > DIRECT_REST_MS) { asked = Date.now(); if ((await viaRoute<T>(route)).ok && alive) { location.reload(); return; } }
      const a = await readFeed<T>(fn, k, route);
      if (!alive) return;
      if (a.ok) { setLost(false); ref.current.onFeed(a.feed); } else setLost(true);
      timer = setTimeout(() => void turn(), paceFor(a.ok && ref.current.busy(a.feed), ref.current.fast));
    };
    timer = setTimeout(() => void turn(), paceFor(ref.current.busy(ref.current.initial), ref.current.fast));
    return () => { alive = false; clearTimeout(timer); };
  }, [fn, k, route]);
  return lost;
}
