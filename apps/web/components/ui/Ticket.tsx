"use client";
import { motion } from "framer-motion";
import { cn } from "./index";
import type { ReactNode } from "react";

/** The KOT ticket: DineFlow's signature surface — real thermal paper, torn top edge, mono numbers.
 *  `top`: "tear" (the torn edge — the default), or "slot" (it comes out of a `PrinterHead` slot: no
 *  torn edge, the machine's shadow across its top, and a new one feeds down out of the slot). */
export function Ticket({ no, title, meta, tone = "pending", children, footer, className, layoutId, aside, top = "tear" }:
  { no: string | number; title: string; meta?: string; tone?: "pending" | "preparing" | "ready" | "served" | "alert" | "warn"; children: ReactNode; footer?: ReactNode; className?: string; layoutId?: string; aside?: ReactNode; top?: "tear" | "slot" }) {
  // "warn" is the amber between fine and late: the ticket is past the hurry-up mark but not yet past the target
  const bar = { pending: "bg-line-2", preparing: "bg-saffron", ready: "bg-mint", served: "bg-steel", alert: "bg-chili", warn: "bg-saffron" }[tone];
  return (
    <motion.article layout layoutId={layoutId} data-top={top}
      initial={top === "slot" ? { y: -44 } : { opacity: 0, scale: 0.96, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95, y: -6 }}
      transition={top === "slot" ? { duration: 0.9, ease: [0.16, 1, 0.3, 1] } : { type: "spring", stiffness: 340, damping: 32 }}
      className={cn("relative", top === "slot" ? "mt-0" : "mt-2.5", className)}>
      <div className={cn("tear-strip tear-top", top === "slot" && "hidden")} aria-hidden />
      {/* the machine's shadow across the paper where it leaves the slot */}
      {top === "slot" && <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10" aria-hidden
        style={{ background: "linear-gradient(180deg, rgb(13 28 23 / .38), rgb(13 28 23 / .06) 55%, transparent)" }} />}
      <div className="paper thermal p-4 relative">
      {/* the coloured spine that says how urgent this ticket is */}
      <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r", bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <div>
          <div className="num text-[10.5px] tracking-[0.18em] uppercase opacity-70">KOT #{no}</div>
          <div className="font-sans font-bold text-[19px] leading-tight tracking-tight">{title}</div>
          {meta && <div className="text-[11px] opacity-70 mt-0.5">{meta}</div>}
        </div>
        {aside ?? <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0", bar, tone === "preparing" && "pulse-dot text-saffron")} />}
      </div>
      <hr className="paper-rule" />
      <div className="space-y-1.5 pl-1.5">{children}</div>
      {footer && <><hr className="paper-rule" /><div className="pl-1.5">{footer}</div></>}
      </div>
      <div className="tear-strip tear-bottom" aria-hidden />
    </motion.article>
  );
}
