"use client";
import { useEffect } from "react";

/**
 * The website's only JavaScript of its own (2026-11-16): three small things the page is complete without.
 *  · reveals — what is still below the screen when this starts gets `rv-wait`, and one IntersectionObserver takes it off
 *    as it arrives. Nothing in the first screen is ever hidden, and with reduced motion nothing is hidden at all;
 *  · the floating menu marks the section being read;
 *  · on a mouse, a tile's light follows the pointer, a signature card tips toward it, the first screen's plates shift with
 *    depth and a ring follows the cursor (one listener, one frame at a time);
 *  · a whole number counts up once, when it comes on screen (the server already wrote the finished figure);
 *  · a part of the page that is well off screen is marked `data-away`, and site.css stops its endless animations there;
 *  · where the client switched the visitor count on (`data-site-stats`), one open and each tap on a thing to do is
 *    tallied (POST /site/<slug>/hit — how many, never who; nothing is sent where the count is off).
 * No scroll listener anywhere: parallax is CSS (`animation-timeline`, site.css).
 */
export function SiteFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-site]");
    if (!root || !("IntersectionObserver" in window)) return;
    const undo: (() => void)[] = [];
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!calm) {
      // only what is below the screen waits: a card off to the side of a rail would never "arrive" by scrolling down
      const waiting = [...root.querySelectorAll<HTMLElement>("[data-rv]")].filter((e) => { const r = e.getBoundingClientRect(); return r.top > innerHeight * 0.94 && r.left < innerWidth && r.right > 0; });
      for (const e of waiting) e.classList.add("rv-wait");
      const show = new IntersectionObserver((seen) => {
        for (const s of seen) if (s.isIntersecting || s.boundingClientRect.top < 0) { s.target.classList.remove("rv-wait"); show.unobserve(s.target); }
      }, { rootMargin: "0px 0px -7% 0px" });
      for (const e of waiting) show.observe(e);
      undo.push(() => { show.disconnect(); for (const e of waiting) e.classList.remove("rv-wait"); });
    }

    if (!calm) {
      const fmt = new Intl.NumberFormat("en-IN");
      const count = new IntersectionObserver((seen) => {
        for (const s of seen) {
          if (!s.isIntersecting) continue; count.unobserve(s.target);
          const el = s.target as HTMLElement, to = Number(el.dataset.count), pre = el.dataset.prefix ?? "", done = el.textContent ?? "";
          if (!(to > 1)) continue;
          const t0 = performance.now(), ms = 1100;
          const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4); el.textContent = k < 1 ? pre + fmt.format(Math.round(to * e)) : done; if (k < 1) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        }
      }, { rootMargin: "0px 0px -10% 0px" });
      for (const el of root.querySelectorAll("[data-count]")) count.observe(el);
      undo.push(() => count.disconnect());
    }

    if (!calm) {
      const parts = [...root.querySelectorAll<HTMLElement>(":scope > header, :scope > .site-marquee, :scope > .site-show, :scope > main > *, :scope > footer")];
      const rest = new IntersectionObserver((seen) => { for (const s of seen) s.target.toggleAttribute("data-away", !s.isIntersecting); }, { rootMargin: "25% 0px 25% 0px" });
      for (const p of parts) rest.observe(p);
      undo.push(() => { rest.disconnect(); for (const p of parts) p.removeAttribute("data-away"); });
    }

    /* the first screen's film (an extra): only on a wide screen, never on a saving connection or with reduced motion,
       and only once the page has settled — it is never part of the first paint. It rests with the first screen. */
    const film = root.querySelector<HTMLVideoElement>("[data-site-video]");
    if (film && !calm && matchMedia("(min-width: 768px)").matches && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
      const start = window.setTimeout(() => { film.src = film.dataset.src ?? ""; film.addEventListener("playing", () => film.setAttribute("data-on", ""), { once: true }); void film.play().catch(() => { /* a browser that will not play: the photo stays */ }); }, 1500);
      const hero = root.querySelector(".site-hero");
      const seen = hero ? new IntersectionObserver(([e]) => { if (!film.src) return; if (e.isIntersecting) void film.play().catch(() => {}); else film.pause(); }) : null;
      if (hero && seen) seen.observe(hero);
      undo.push(() => { clearTimeout(start); seen?.disconnect(); film.pause(); });
    }

    const counted = root.dataset.siteStats;
    if (counted) {
      const last = new Map<string, number>();
      const say = (k: string) => { const now = Date.now(); if (now - (last.get(k) ?? 0) < 2500) return; last.set(k, now);
        try { void fetch(`/site/${counted}/hit`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ k }) }); } catch { /* never the visitor's problem */ } };
      const idle = window.setTimeout(() => say("view"), 1800);
      const tap = (e: MouseEvent) => {
        const t = (e.target as Element | null)?.closest?.<HTMLElement>("a, button, [data-dish]"); if (!t) return;
        const href = t.getAttribute("href") ?? "";
        const k = t.dataset.siteAction ?? (t.hasAttribute("data-site-rate") ? "review" : t.hasAttribute("data-site-share") ? "share" : t.hasAttribute("data-site-map-live") ? "map" : t.hasAttribute("data-dish") ? "dish"
          : href.startsWith("tel:") ? "call" : href.startsWith("https://wa.me/") ? "whatsapp" : /google\.com\/maps\/dir/.test(href) ? "directions"
          : /\/dine\/[^?]+\?tab=order/.test(href) ? "order" : /\/dine\/[^?]+\?tab=book/.test(href) ? "reserve" : href.startsWith("/queue/") ? "queue" : href.startsWith("/book/") ? "book" : null);
        if (k) say(k);
      };
      root.addEventListener("click", tap, { capture: true, passive: true });
      undo.push(() => { clearTimeout(idle); root.removeEventListener("click", tap, { capture: true }); });
    }

    const rail = root.querySelector<HTMLElement>("[data-site-nav] .site-nav-rail");
    const links = new Map([...root.querySelectorAll<HTMLAnchorElement>("[data-site-nav] .site-nav-links a")].map((a) => [a.hash.slice(1), a]));
    if (rail && links.size) {
      const spy = new IntersectionObserver((seen) => {
        for (const s of seen) {
          if (!s.isIntersecting) continue;
          const on = links.get(s.target.id); if (!on) continue;
          for (const a of links.values()) if (a === on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
          // the rail only: scrollIntoView would move the page too
          rail.scrollTo({ left: on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2, behavior: calm ? "auto" : "smooth" });
        }
      }, { rootMargin: "-45% 0px -50% 0px" });
      for (const id of links.keys()) { const el = document.getElementById(id); if (el) spy.observe(el); }
      undo.push(() => spy.disconnect());
    }

    if (!calm && matchMedia("(hover: hover) and (pointer: fine)").matches) {
      let frame = 0, last: PointerEvent | null = null;
      const ring = document.createElement("div"); ring.className = "site-cursor"; ring.setAttribute("aria-hidden", "true"); root.appendChild(ring);
      const float = root.querySelector<HTMLElement>(".site-float");
      const move = (e: PointerEvent) => {
        last = e; if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0; if (!last) return;
          const at = last.target as Element | null;
          ring.style.transform = `translate3d(${last.clientX}px, ${last.clientY}px, 0)`; ring.dataset.on = "";
          if (at?.closest?.("a, summary, [data-glow='tilt']")) ring.dataset.big = ""; else delete ring.dataset.big;
          if (float && at?.closest?.(".site-hero")) { float.style.setProperty("--px", ((last.clientX / innerWidth - 0.5) * 2).toFixed(3)); float.style.setProperty("--py", ((last.clientY / innerHeight - 0.5) * 2).toFixed(3)); }
          const t = at?.closest?.<HTMLElement>("[data-glow]"); if (!t) return;
          const r = t.getBoundingClientRect(), x = (last.clientX - r.left) / r.width, y = (last.clientY - r.top) / r.height;
          t.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`); t.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
          if (t.dataset.glow === "tilt") { t.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`); t.style.setProperty("--rx", `${((0.5 - y) * 10).toFixed(2)}deg`); }
        });
      };
      root.addEventListener("pointermove", move, { passive: true });
      const gone = () => { delete ring.dataset.on; };
      document.documentElement.addEventListener("pointerleave", gone);
      undo.push(() => { root.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", gone); cancelAnimationFrame(frame); ring.remove(); });
    }
    return () => { for (const u of undo) u(); };
  }, []);
  return null;
}
