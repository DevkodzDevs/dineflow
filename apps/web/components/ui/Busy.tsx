"use client";
/**
 * Every tap that has to wait says so (2026-10-27, the owner: "when I click any option and it takes time to open,
 * show a loader for the waiting time").
 *
 * One layer for the whole app, guest pages included — no screen has to remember. A tap is a button, a link, a tab,
 * a switch. What counts as its wait:
 *  - a button: the requests it starts (a server action, a screen fetched by router.push, a read) — any request that
 *    begins within 150 ms of the tap, and any that begins within 150 ms of the last one ending (an action, then its
 *    follow-up). The wait ends when the last answer has been read to its end.
 *  - a link to another screen in the app: until the address changes. A link whose own handler kept it from going
 *    (it opened a sheet) ends after a second with no screen on its way.
 * Under 300 ms nothing shows — a spinner that flashes reads as a glitch. After that a ring spins on the tapped thing
 * itself (a solid button: in its own colours, over its label; a tab, a link, a card: in a round chip in its middle,
 * the rest lightly frosted), for at least
 * 350 ms once shown. If the tapped thing is hidden — the menu sheet closed, a sheet covers it, it scrolled away —
 * the ring floats at the top of the screen instead. The bar along the top runs with any of it.
 * A control that draws its own spinner (`.loader`, `.animate-spin`, `[data-loading]`) is left alone, and anything
 * inside `[data-no-busy]` is never covered. The ring is drawn outside React (a fixed layer on <body>), so no screen's
 * markup changes; the tapped element only gains `aria-busy` while it waits.
 */
import { clsx as cn } from "clsx";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SHOW_AFTER = 300, KEEP = 350, WINDOW = 150, NAV_IDLE = 1000, GIVE_UP = 15000;
const TARGET = "button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], [role=radio], summary, input[type=submit], input[type=button], input[type=checkbox], input[type=radio]";

type Job = { el: HTMLElement; t0: number; n: number; lastEnd: number; from?: string; shown?: number; done?: number; cover?: HTMLDivElement; aria?: boolean };
const jobs: Job[] = [];
let tapped: { el: HTMLElement; t: number } | null = null;
let rsc = 0, raf = 0, installed = false;
let layer: HTMLDivElement | null = null, float: HTMLDivElement | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
const here = () => location.pathname + location.search;
const barOn = () => jobs.some((j) => !j.done && (j.from !== undefined || j.shown !== undefined));

function targetOf(t: EventTarget | null): HTMLElement | null {
  const el = (t as Element | null)?.closest?.(TARGET) as HTMLElement | null;
  if (!el || el.closest("[data-no-busy]")) return null;
  // a switch or a tick box is usually a hidden input inside its label — the label is what was seen
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return (el.closest("label") as HTMLElement | null) ?? el;
  return el;
}

function has(input: RequestInfo | URL, init: RequestInit | undefined, name: string) {
  const h = init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  if (!h) return false;
  if (h instanceof Headers) return h.has(name);
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === name);
  return Object.keys(h).some((k) => k.toLowerCase() === name);
}

/** Could a tap have asked for this? A server action, a screen being opened, a database read or one of our /api calls.
 *  Not the offline warm-up's whole pages (OfflineProvider), images, scripts — nor the assistant, whose insights load
 *  on their own and whose answer streams in front of the person anyway. */
function byTap(input: RequestInfo | URL, init: RequestInit | undefined, isRsc: boolean) {
  if (has(input, init, "next-action")) return true;
  if (isRsc) return true;
  let u: URL;
  try { u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href); } catch { return false; }
  if (u.origin === location.origin) return u.pathname.startsWith("/api/") && u.pathname !== "/api/assist";
  return /\/(rest|functions|storage)\/v1\//.test(u.pathname);
}

function open(el: HTMLElement) {
  const live = jobs.find((j) => j.el === el && !j.done);
  if (live) return live;
  const j: Job = { el, t0: performance.now(), n: 0, lastEnd: 0 };
  jobs.push(j);
  return j;
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const p = base(input, init);
    const now = performance.now();
    const isRsc = has(input, init, "rsc");
    // a screen fetched ahead (IntentPrefetch's warm-up, Next's own) is nobody's tap: Next sends those at low priority.
    // It still counts in `rsc` — a link's tap may be waiting on one already in flight.
    const prefetch = has(input, init, "next-router-prefetch") || init?.priority === "low";
    let job: Job | undefined;
    if (!prefetch && byTap(input, init, isRsc)) {
      if (tapped && now - tapped.t < WINDOW && !(tapped.el instanceof HTMLAnchorElement)) job = open(tapped.el);
      else job = jobs.find((j) => j.from === undefined && !j.done && j.n === 0 && j.lastEnd > 0 && now - j.lastEnd < WINDOW);
    }
    if (!job && !isRsc) return p;
    if (job) job.n++;
    if (isRsc) rsc++;
    const end = () => {
      if (isRsc) rsc = Math.max(0, rsc - 1);
      if (job) { job.n = Math.max(0, job.n - 1); job.lastEnd = performance.now(); }
      kick();
    };
    // the answer has arrived when its body has been read through, not when its headers have — a copy is read
    // alongside, so the screen's own reader is untouched
    p.then((r) => { let c: Response | null = null; try { c = r.clone(); } catch { /* already read */ } if (c) c.arrayBuffer().then(end, end); else end(); }, end);
    kick();
    return p;
  }) as typeof fetch;

  document.addEventListener("click", (e) => {
    const el = targetOf(e.target);
    if (!el) return;
    tapped = { el, t: performance.now() };
    if (!(el instanceof HTMLAnchorElement)) return;
    if (el.target === "_blank" || el.hasAttribute("download") || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const u = new URL(el.href, location.href);
    if (u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname + u.search === here()) return;
    open(el).from = here();
    kick(); ping();
  }, true);
  // back from another site through the browser's page cache: nothing is waiting any more
  window.addEventListener("pageshow", (e) => { if (e.persisted) { jobs.forEach((j) => clear(j)); jobs.length = 0; ping(); } });
}

function kick() { if (!raf && jobs.length) raf = requestAnimationFrame(loop); }

function alpha(c: string) {
  if (!c || c === "transparent") return 0;
  const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return slash[2] ? Number(slash[1]) / 100 : Number(slash[1]);
  const rgba = c.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
  return rgba ? Number(rgba[1]) : 1;
}

/** Where the tapped thing is, if a person can still see it: on screen, laid out, and on top at its centre. */
function seen(el: HTMLElement) {
  if (!el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 12 || r.height < 12) return null;
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
  const hit = document.elementFromPoint(x, y);
  return hit && (el.contains(hit) || hit.contains(el)) ? r : null;
}

const ownSpinner = (el: HTMLElement) => !!el.querySelector(".loader, .animate-spin, [data-loading]") || (el.getAttribute("aria-busy") === "true" && !el.hasAttribute("data-df-busy"));

function clear(j: Job) {
  j.cover?.remove(); j.cover = undefined;
  if (j.aria) { j.el.removeAttribute("aria-busy"); j.el.removeAttribute("data-df-busy"); j.aria = false; }
}

function cover(j: Job, r: DOMRect) {
  if (!layer) { layer = document.createElement("div"); layer.className = "busy-layer"; layer.setAttribute("aria-hidden", "true"); document.body.appendChild(layer); }
  if (!j.cover) {
    const cs = getComputedStyle(j.el);
    const big = r.width >= 140 && r.height >= 80;
    const solid = !big && alpha(cs.backgroundColor) >= 0.6;
    const c = document.createElement("div");
    // a wide, short row (a menu item, a list line): the ring at its end, where a chevron would sit, not on its words
    c.className = cn("busy-cover", solid && "solid", big && "big", !solid && !big && r.width > r.height * 2.5 && "row");
    c.style.borderRadius = cs.borderRadius;
    if (solid) { c.style.background = cs.backgroundColor; c.style.color = cs.color; }
    // a solid button: the ring alone, about half its height; anything else: the ring in a round chip of its own
    const chip = big ? 48 : Math.round(Math.max(28, Math.min(40, Math.min(r.width, r.height) - 6)));
    if (!solid) c.style.setProperty("--c", `${chip}px`);
    c.style.setProperty("--s", `${solid ? Math.round(Math.max(14, Math.min(22, r.height * 0.45))) : Math.round(chip * 0.46)}px`);
    c.innerHTML = `<span class="busy-ring"></span>`;
    layer.appendChild(c);
    j.cover = c;
    if (!j.el.hasAttribute("aria-busy")) { j.el.setAttribute("aria-busy", "true"); j.el.setAttribute("data-df-busy", ""); j.aria = true; }
  }
  const s = j.cover.style;
  s.left = `${r.left}px`; s.top = `${r.top}px`; s.width = `${r.width}px`; s.height = `${r.height}px`;
}

function loop(now: number) {
  raf = 0;
  let floats = false, changed = false;
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i], age = now - j.t0;
    if (!j.done) {
      const over = j.from !== undefined
        ? here() !== j.from || (rsc === 0 && age > NAV_IDLE) || age > GIVE_UP
        : (j.n === 0 && now - j.lastEnd > WINDOW) || age > GIVE_UP;
      if (over) { j.done = now; changed = true; }
      else if (j.shown === undefined && age >= SHOW_AFTER && (j.from === undefined || rsc > 0)) { j.shown = now; changed = true; }
    }
    if (j.done && (j.shown === undefined || now - j.shown >= KEEP)) { clear(j); jobs.splice(i, 1); changed = true; continue; }
    if (j.shown === undefined) continue;
    if (ownSpinner(j.el)) { clear(j); continue; }
    const r = seen(j.el);
    if (r) cover(j, r);
    else { j.cover?.remove(); j.cover = undefined; floats = true; }
  }
  if (floats && !float) {
    if (!layer) { layer = document.createElement("div"); layer.className = "busy-layer"; layer.setAttribute("aria-hidden", "true"); document.body.appendChild(layer); }
    float = document.createElement("div"); float.className = "busy-float"; float.innerHTML = `<span class="busy-ring"></span>`; layer.appendChild(float);
  } else if (!floats && float) { float.remove(); float = null; }
  if (changed) ping();
  if (jobs.length) raf = requestAnimationFrame(loop);
}

/** The bar along the top of the page, and the layer that shows a tap is waiting. Mounted once, in the root layout. */
export function NavProgress() {
  const path = usePathname();
  const [on, setOn] = useState(false);
  useEffect(() => {
    install();
    const f = () => setOn(barOn());
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  useEffect(() => { kick(); }, [path]);
  return <div className={cn("nav-progress", on && "on")} aria-hidden />;
}
