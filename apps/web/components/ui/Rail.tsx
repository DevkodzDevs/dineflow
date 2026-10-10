"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { clsx as cn } from "clsx";

/**
 * A one-line scrolling track with a round arrow on its right edge — shown only when something is
 * hidden past the edge. A tap slides the hidden part into view; at the end the arrow turns round
 * and a tap goes back to the start. On a phone and an iPad the chips, cards and suggestions in a
 * track ran off the edge with nothing to say there was more, and the only way to them was a swipe
 * nobody knew to make.
 *
 * `className` is the track itself (its flex, gap, padding, mask); `wrapClassName` the box around it,
 * which the arrow is positioned in — so the arrow is never faded by the track's own mask. The track
 * gets `data-rail-more` while it overflows, which adds a spacer at its end (globals.css) so the last
 * item can scroll clear of the arrow.
 */
export function Rail({ className, wrapClassName, arrowClassName, label, children }: { className?: string; wrapClassName?: string; arrowClassName?: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false); const [end, setEnd] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const o = el.scrollWidth > el.clientWidth + 2;
      setOver(o); setEnd(o && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    const watch = () => { for (const c of Array.from(el.children)) ro.observe(c); };
    watch();
    const mo = new MutationObserver(() => { watch(); measure(); }); mo.observe(el, { childList: true });
    el.addEventListener("scroll", measure, { passive: true });
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener("scroll", measure); };
  }, []);
  const go = () => {
    const el = ref.current; if (!el) return;
    if (end) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: Math.max(120, el.clientWidth * 0.75), behavior: "smooth" });
  };
  return (
    <div className={cn("relative min-w-0", wrapClassName)}>
      <div ref={ref} className={className} data-rail-more={over || undefined} aria-label={label} role={label ? "group" : undefined}>{children}</div>
      {over && (
        <button type="button" onClick={go} className={cn("rail-arrow", arrowClassName)} data-end={end || undefined}
          aria-label={end ? "Back to the start" : "Show more"} title={end ? "Back to the start" : "Show more"}>
          <span><ChevronRight size={16} strokeWidth={2.4} /></span>
        </button>
      )}
    </div>
  );
}
