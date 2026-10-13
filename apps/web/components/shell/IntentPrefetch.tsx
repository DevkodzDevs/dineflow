"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
 * A prefetched screen is reused for 30 s (`staleTimes.static` in next.config.ts), and any server
 * action that revalidates drops it at once.
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
  return null;
}
