"use client";
import { whenSettled } from "@/lib/idle";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actionBusy } from "@/lib/liveRefresh";

/**
 * Starts fetching the next screen the moment a person reaches for it — a finger touching a link, or a
 * mouse resting on one for a moment — instead of when the click lands.
 *
 * Every screen here is rendered per request (it is this property's live data), and there is
 * deliberately no `loading.tsx` (shell-and-nav.md), so Next's own link prefetching fetches nothing
 * useful for them: a tap waited for the whole server render, 0.4–0.8 s on the live site. A mouse
 * rests on a link 100–400 ms before it clicks, and a finger is down ~100 ms before the tap, so asking
 * then hides most of that wait. `router.prefetch()` with the app router's own cache asks for the full
 * screen; the click then takes the answer already in flight instead of starting again.
 *
 * Only the menus (sidebar, rail, tab bar — anything inside `nav` or `aside` — and the More sheet) and links
 * marked `data-prefetch` are watched. A list of order cards dragged to scroll would otherwise
 * fetch a screen for every card a thumb happened to land on. Never: other sites, downloads, new tabs,
 * `/api/*`, `/logout`, files, the page already showing, or a phone saving data.
 *
 * A prefetched screen is reused for 120 s (`staleTimes` in next.config.ts), and any server
 * action that revalidates drops it at once.
 *
 * 2026-10-20 (the owner: "every click opens with a delay"): two more, so a menu tap is answered from the device
 * instead of the server —
 * - **Warm-up.** While someone is using this device (a tap or key in the last 2 minutes, tab visible, not saving
 *   data) the menu's own screens are fetched ahead, one at a time when the browser is idle, at most 8, again every
 *   100 s — so a first visit is already on the device.
 * - **Show, then freshen.** A screen that came from that cache (it appeared within 150 ms of the click) is shown at
 *   once and re-read in the background 250 ms later — never while one of the page's own actions is answering
 *   (`actionBusy`) — so what is on screen is never more than a moment old.
 */
const REST_MS = 70;
const SKIP = /^\/(api|logout|auth)(\/|$)|\.[a-z0-9]{2,5}$/i;

export function IntentPrefetch() {
  const router = useRouter();
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const asked = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let waiting: HTMLAnchorElement | null = null;

    const linkOf = (t: EventTarget | null) => {
      const a = (t as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !(a.closest("nav, aside, [data-more]") || a.hasAttribute("data-prefetch"))) return null;
      if (a.target === "_blank" || a.hasAttribute("download")) return null;
      return a;
    };
    const hrefOf = (a: HTMLAnchorElement) => {
      let u: URL;
      try { u = new URL(a.href, location.href); } catch { return null; }
      if (u.origin !== location.origin || SKIP.test(u.pathname)) return null;
      if (u.pathname === location.pathname && u.search === location.search) return null;
      return u.pathname + u.search;
    };
    const ask = (a: HTMLAnchorElement) => {
      const href = hrefOf(a); if (!href) return;
      const at = asked.get(href);
      if (at && Date.now() - at < 2000) return;   // the router's own cache dedupes too; this spares it a storm of pointer events
      asked.set(href, Date.now());
      router.prefetch(href);
    };

    const down = (e: PointerEvent) => { const a = linkOf(e.target); if (a) ask(a); };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const a = linkOf(e.target);
      if (!a || a === waiting) return;
      if (timer) clearTimeout(timer);
      waiting = a;
      timer = setTimeout(() => { timer = null; waiting = null; ask(a); }, REST_MS);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !waiting) return;
      if (e.relatedTarget instanceof Node && waiting.contains(e.relatedTarget)) return;   // still inside the same link
      if (timer) clearTimeout(timer);
      timer = null; waiting = null;
    };
    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down, { capture: true });
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      if (timer) clearTimeout(timer);
    };
  }, [router]);
  useWarmMenus(router);
  useFreshOnArrival(router);
  return null;
}

type Router = ReturnType<typeof useRouter>;
const WARM_EVERY = 100_000, WARM_MAX = 8, ACTIVE_FOR = 120_000;

/** Fetch the menu's screens ahead while this device is in use (see above). */
function useWarmMenus(router: Router) {
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
    let lastUse = Date.now(), stop = false, timer: ReturnType<typeof setTimeout> | null = null;
    const used = () => { lastUse = Date.now(); };
    const idle = (fn: () => void) => ((window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200)))(fn, { timeout: 2000 });
    const links = () => {
      const seen = new Set<string>(); const out: string[] = [];
      // the phone bar's own tabs first (the screens a phone person actually taps), then the menu in its order
      for (const a of [...document.querySelectorAll<HTMLAnchorElement>("[data-tabbar] a[href]"), ...document.querySelectorAll<HTMLAnchorElement>("aside a[href], nav a[href]")]) {
        let u: URL; try { u = new URL(a.href, location.href); } catch { continue; }
        if (u.origin !== location.origin || SKIP.test(u.pathname) || u.pathname === location.pathname || a.target === "_blank") continue;
        const h = u.pathname + u.search; if (seen.has(h)) continue; seen.add(h); out.push(h);
        if (out.length >= WARM_MAX) break;
      }
      return out;
    };
    const round = () => {
      if (stop) return;
      if (document.visibilityState === "visible" && Date.now() - lastUse < ACTIVE_FOR && !actionBusy()) {
        const list = links(); let i = 0;
        const next = () => { if (stop || i >= list.length || document.visibilityState !== "visible") return; const h = list[i++]; idle(() => { if (!stop && !actionBusy()) router.prefetch(h); setTimeout(next, 350); }); };
        next();
      }
      timer = setTimeout(round, WARM_EVERY);
    };
    window.addEventListener("pointerdown", used, { passive: true }); window.addEventListener("keydown", used);
    // after the screen itself has loaded and the browser is idle, then 3 s (lib/idle.ts, 2026-10-23) — on a slow first
    // visit the old fixed 1.5 s put eight screen fetches beside the first one
    const cancelFirst = whenSettled(round, 3000);
    return () => { stop = true; cancelFirst(); if (timer) clearTimeout(timer); window.removeEventListener("pointerdown", used); window.removeEventListener("keydown", used); };
  }, [router]);
}

/** A screen shown from the device's cache is re-read in the background a moment later (see above). */
function useFreshOnArrival(router: Router) {
  const path = usePathname(); const clickAt = useRef(0); const first = useRef(true);
  useEffect(() => {
    const click = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.("a[href]")) clickAt.current = performance.now(); };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }   // a full load is fresh already
    const fast = clickAt.current > 0 && performance.now() - clickAt.current < 150;
    clickAt.current = 0;
    if (!fast) return;   // it came from the server: nothing to freshen
    let tries = 0;
    const go = () => { if (actionBusy() && tries++ < 10) { t = setTimeout(go, 300); return; } router.refresh(); };
    let t = setTimeout(go, 250);
    return () => clearTimeout(t);
  }, [path, router]);
}

