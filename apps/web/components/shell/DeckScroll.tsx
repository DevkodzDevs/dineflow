"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const at = new Map<string, number>(); // where the frame was, per address, for this tab
let traversing = false;
const here = () => location.pathname + location.search;
const scroller = () => {
  const d = document.querySelector<HTMLElement>("body .deck"); // <html> carries the class too
  return d && getComputedStyle(d).overflowY === "auto" ? d : null; // only when the frame is the scroller
};

/**
 * Back and forward land where you were. On an iPad-size touch screen the frame (.deck) scrolls instead
 * of the page (globals.css, "the frame scrolls, not the page"), and the browser only restores the
 * page's own scroll position — so going back from an order to the list would have left you wherever
 * the order page was. This remembers the frame's position per address and puts it back on a
 * back/forward step. A new navigation is left to Next.js, which brings the new page's top into view.
 * Elsewhere (phones, mouse screens) the page scrolls and this does nothing.
 */
export function DeckScroll() {
  const path = usePathname();
  useEffect(() => {
    const d = scroller(); if (!d) return;
    let raf = 0;
    const save = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => at.set(here(), d.scrollTop)); };
    const pop = () => { traversing = true; };
    d.addEventListener("scroll", save, { passive: true });
    window.addEventListener("popstate", pop);
    return () => { cancelAnimationFrame(raf); d.removeEventListener("scroll", save); window.removeEventListener("popstate", pop); };
  }, []);
  useEffect(() => {
    if (!traversing) return;
    traversing = false;
    const d = scroller(); const y = at.get(here());
    if (d && y != null) requestAnimationFrame(() => requestAnimationFrame(() => { d.scrollTop = y; }));
  }, [path]);
  return null;
}
