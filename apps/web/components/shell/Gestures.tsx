"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/components/ui";

const PULL = 72;   // px of (damped) pull that commits a refresh
const SWIPE = 84;  // px of horizontal travel that commits back / forward
const EDGE = 28;   // a swipe must start this close to the screen's side

/** Where a touch must not start a gesture: a field being typed in, an open sheet or dialog, or
 *  anything that asked to be left alone (`data-no-gesture`). */
const blocked = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-no-gesture]');

/** True when an element between the touch and the page can still scroll up — then a downward drag
 *  belongs to it, not to pull-to-refresh. */
const innerCanScrollUp = (t: EventTarget | null) => {
  for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
  }
  return false;
};

/**
 * Touch gestures for the app (mounted once in the (app) layout, touch screens only).
 *
 * Pull to refresh — at the top of a screen, drag down and let go past the ring: the screen's data is
 * fetched again with router.refresh(). Not a page reload, so a half-typed ticket or form keeps what
 * is in it; html/body keep `overscroll-behavior: none`, so the browser's own reload never fires.
 *
 * Swipe back / forward — from the left edge to go back, from the right edge to go forward. Only in
 * the installed app (display-mode: standalone): a phone browser already has these gestures (Safari's
 * edge swipe, Android's system back) and doing it twice would skip a screen.
 */
export function Gestures() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pull, setPull] = useState(0);
  const [swipe, setSwipe] = useState<{ dir: "back" | "fwd"; dx: number; y: number } | null>(null);
  const g = useRef<{ x: number; y: number; mode: "pull" | "back" | "fwd" | null; armed: boolean } | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target) || document.body.style.overflow === "hidden") { g.current = null; return; }
      const t = e.touches[0];
      const mode = standalone && t.clientX <= EDGE ? "back"
        : standalone && t.clientX >= window.innerWidth - EDGE ? "fwd"
          : window.scrollY <= 0 && !innerCanScrollUp(e.target) ? "pull" : null;
      g.current = mode ? { x: t.clientX, y: t.clientY, mode, armed: false } : null;
    };
    const onMove = (e: TouchEvent) => {
      const s = g.current; if (!s) return;
      const t = e.touches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (s.mode === "pull") {
        if (window.scrollY > 0 || Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 12) { g.current = null; setPull(0); return; }
        const d = Math.max(0, dy) * 0.5; // damped, so the ring trails the thumb
        if (d >= PULL && !s.armed) { s.armed = true; buzz(); } else if (d < PULL) s.armed = false;
        setPull(Math.min(d, PULL * 1.5));
      } else {
        const travel = s.mode === "back" ? dx : -dx;
        if (Math.abs(dy) > 40 && Math.abs(dy) > travel) { g.current = null; setSwipe(null); return; }
        const d = Math.max(0, travel);
        if (d >= SWIPE && !s.armed) { s.armed = true; buzz(); } else if (d < SWIPE) s.armed = false;
        setSwipe({ dir: s.mode === "back" ? "back" : "fwd", dx: Math.min(d, SWIPE * 1.4), y: t.clientY });
      }
    };
    const onEnd = () => {
      const s = g.current; g.current = null;
      if (s?.armed && s.mode === "pull") start(() => router.refresh());
      if (s?.armed && s.mode === "back") router.back();
      if (s?.armed && s.mode === "fwd") router.forward();
      setPull(0); setSwipe(null);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const shown = pending ? PULL : pull;
  const ready = pending || pull >= PULL;
  const sw = swipe ? Math.min(swipe.dx / SWIPE, 1.4) : 0;
  return (
    <>
      {/* the refresh ring: drops in from under the top edge, turns with the pull, fills when letting
          go will refresh, and spins while the screen's data comes back */}
      <div aria-hidden={!pending} role={pending ? "status" : undefined} aria-label={pending ? "Refreshing" : undefined}
        className="gesture-ring fixed left-1/2 z-[80] pointer-events-none"
        style={{ top: "calc(env(safe-area-inset-top) + 6px)", transform: `translate(-50%, ${shown ? shown - 44 : -60}px)`, opacity: shown ? Math.min(1, shown / 36) : 0, transition: pull && !pending ? "none" : "transform .25s var(--ease-out), opacity .2s" }}>
        <span className={cn("h-11 w-11 rounded-full grid place-items-center shadow-[var(--shadow-pop)] border transition-colors",
          ready ? "bg-[var(--color-tint)] text-[var(--color-on-tint)] border-transparent" : "bg-[var(--color-bg-2)] text-[var(--color-label)] border-[var(--color-separator)]")}>
          <RefreshCw size={19} strokeWidth={2.4} className={pending ? "animate-spin" : ""} style={pending ? undefined : { transform: `rotate(${pull * 3.2}deg)` }} />
        </span>
      </div>
      {/* the swipe arrow: slides out from the edge the thumb started at and fills when letting go
          will go back (or forward) */}
      {swipe && (
        <div aria-hidden className="gesture-arrow fixed z-[80] pointer-events-none"
          style={{ top: swipe.y - 24, [swipe.dir === "back" ? "left" : "right"]: -48 + sw * 64, opacity: Math.min(1, sw * 1.6) }}>
          <span className={cn("h-12 w-12 rounded-full grid place-items-center shadow-[var(--shadow-pop)] border transition-colors",
            sw >= 1 ? "bg-[var(--color-tint)] text-[var(--color-on-tint)] border-transparent" : "bg-[var(--color-bg-2)] text-[var(--color-label)] border-[var(--color-separator)]")}>
            {swipe.dir === "back" ? <ChevronLeft size={24} strokeWidth={2.6} /> : <ChevronRight size={24} strokeWidth={2.6} />}
          </span>
        </div>
      )}
    </>
  );
}
