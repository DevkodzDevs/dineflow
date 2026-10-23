"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * A row of chips that slides sideways when it is longer than the room (2026-10-23, the owner: "add the arrow options to
 * see the hidden ones — like the earlier design", meaning Staff's department rail). The row fades at an edge it carries
 * on past, and a round arrow sits at that edge — only then — moving it by most of a screen. The chip marked
 * aria-pressed="true" is brought into view when it changes. 36px arrows with a mouse, 44px on a touch screen.
 * `wrapClassName` (e.g. lg:flex-wrap) lets a wide screen wrap the chips instead (no overflow, so no arrows).
 */
export function ChipRail({ children, label, watch, className, wrapClassName, data }: { children: ReactNode; label: string; watch?: unknown; className?: string; wrapClassName?: string; data?: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const f = () => setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    f(); el.addEventListener("scroll", f, { passive: true }); const ro = new ResizeObserver(f); ro.observe(el);
    return () => { el.removeEventListener("scroll", f); ro.disconnect(); };
  }, []);
  useEffect(() => {
    const el = ref.current, b = el?.querySelector<HTMLElement>('[aria-pressed="true"]'); if (!el || !b || el.scrollWidth <= el.clientWidth) return;
    const l = b.offsetLeft - el.offsetLeft - 48, r = l + b.offsetWidth + 96;
    if (l < el.scrollLeft) el.scrollTo({ left: Math.max(0, l), behavior: "smooth" });
    else if (r > el.scrollLeft + el.clientWidth) el.scrollTo({ left: r - el.clientWidth, behavior: "smooth" });
  }, [watch]);
  const by = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth * 0.7, behavior: "smooth" }); };
  const mask = edge.l && edge.r ? "linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent)"
    : edge.l ? "linear-gradient(90deg, transparent, #000 40px)" : edge.r ? "linear-gradient(90deg, #000 calc(100% - 40px), transparent)" : "none";
  const arrow = "absolute top-1/2 -translate-y-1/2 z-[1] h-9 w-9 !min-h-9 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:!min-h-11 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-label)] border border-[var(--color-separator)] shadow-[0_2px_8px_rgb(0_0_0/0.22)] hover:brightness-110 transition-opacity";
  return (
    <div className={cn("relative min-w-0", className)} {...data}>
      <div ref={ref} className={cn("flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", wrapClassName)} style={{ maskImage: mask, WebkitMaskImage: mask }} role="group" aria-label={label}>
        {children}
      </div>
      {edge.l && <button type="button" onClick={() => by(-1)} className={cn(arrow, "left-0")} aria-label="Show earlier" data-rail-prev><ChevronLeft size={18} aria-hidden /></button>}
      {edge.r && <button type="button" onClick={() => by(1)} className={cn(arrow, "right-0")} aria-label="Show more" data-rail-next><ChevronRight size={18} aria-hidden /></button>}
    </div>
  );
}
