"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "../ui";
import { parentOf, step, type Trail } from "@/lib/back";

/**
 * Back, on every screen, in one place (2026-10-22 — the owner: "a proper back button on every page, in a place that
 * disturbs no one, at every size"). It sits at the left end of the top bar, which is sticky, so it is always in reach and
 * never covers the page; on the person's home screen there is nowhere to go back to, and it is not drawn.
 *
 * It goes back the way a browser does — to the screen you came from — but never out of the app. The app keeps its own
 * trail of the screens this tab has shown (`df-trail` in sessionStorage, so a reload keeps it): a new screen is added, a
 * step back to the one before takes the last off (`step`, lib/back.ts). Back takes the browser's own step only when the
 * entry behind is that screen (the Navigation API says so, where there is one); otherwise it opens that screen. With
 * nothing on the trail — a page opened straight from a link or a notification — it goes one level up: /orders/new →
 * /orders, /billing/<id> → /billing, a section → home.
 *
 * Not `history.state`: Next rewrites the current entry's state on its own refreshes and drops anything else kept there
 * (tried first — the numbers drifted after a screen refreshed on arrival, and Back left the app).
 */
const KEY = "df-trail";
const load = (): Trail => { try { const t = JSON.parse(sessionStorage.getItem(KEY) || "[]"); return Array.isArray(t) ? t : []; } catch { return []; } };
const save = (t: Trail) => { try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-50))); } catch { /* private window: Back goes up a level */ } };
type Nav = { entries?: () => { url: string | null }[]; currentEntry?: { index: number } | null };
const browserNav = () => (window as unknown as { navigation?: Nav }).navigation;
let fresh = true;   // the first screen this page load shows
let stepping = false;   // the next screen comes from a step back (the browser's, or ours)
let upping = false;   // …or from Back going up a level, with nothing on the trail behind
if (typeof window !== "undefined") window.addEventListener("popstate", () => { stepping = true; });

export function BackButton({ home, tone = "bar", className }: { home: string; tone?: "bar" | "dark"; className?: string }) {
  const path = usePathname(); const search = useSearchParams()?.toString() ?? ""; const router = useRouter();
  const url = path + (search ? `?${search}` : "");
  useEffect(() => {
    let t = load();
    // a tab that starts here (nothing before it in this tab) starts a new trail — a new tab can inherit its opener's
    const n = browserNav(); if (fresh && n?.currentEntry && n.currentEntry.index === 0) t = [];
    fresh = false;
    save(step(t, url, stepping, upping)); stepping = false; upping = false;
  }, [url]);
  if (path === home || path === "/") return null;
  const back = () => {
    const t = load(); const prev = t.length > 1 ? t[t.length - 2] : null;
    if (!prev) { upping = true; router.push(parentOf(path, home)); return; }
    const n = browserNav(); const i = n?.currentEntry?.index;
    const behind = n?.entries && typeof i === "number" && i > 0 ? n.entries()[i - 1]?.url : null;
    const same = behind ? (() => { const u = new URL(behind); return u.origin === location.origin && u.pathname + u.search === prev; })() : !n;   // no Navigation API: trust the trail
    stepping = true;
    if (same) router.back(); else router.push(prev);
  };
  return (
    /* Icon only at every width (2026-10-23, the owner: "no 'Back' word — just the icon, modern and compact"): a 36px round
       key with a fine ring and a top highlight; the arrow leans left on hover and the key presses in. The word is the
       label and the tooltip. 44px to a finger (an invisible ring, ::before, round it). */
    <button type="button" onClick={back} aria-label="Back" title="Back" data-back
      className={cn("group/back relative h-9 w-9 !min-h-0 !min-w-0 shrink-0 rounded-full grid place-items-center transition-[background-color,transform,box-shadow] duration-150 active:scale-[.92] before:absolute before:-inset-1 pointer-coarse:before:-inset-1 before:content-[''] before:rounded-full",
        tone === "dark"
          ? "bg-white/[.06] text-white/80 hover:text-white hover:bg-white/[.11] shadow-[inset_0_0_0_1px_rgb(255_255_255/.09),inset_0_1px_0_rgb(255_255_255/.08)]"
          : "bg-[var(--color-fill)] text-[var(--color-label)] hover:bg-[var(--color-fill-2)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-label)_9%,transparent),inset_0_1px_0_rgb(255_255_255/.06),0_1px_2px_rgb(0_0_0/.18)]",
        className)}>
      <ChevronLeft size={19} strokeWidth={2.6} aria-hidden className="shrink-0 -ml-px transition-transform duration-150 group-hover/back:-translate-x-0.5" />
    </button>
  );
}
