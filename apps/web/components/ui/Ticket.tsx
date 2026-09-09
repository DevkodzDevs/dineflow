"use client";
import { motion } from "framer-motion";
import { itemV, glide } from "@/lib/motion";
import { cn } from "./index";
import type { ReactNode } from "react";

/** The KOT ticket: DineFlow's signature surface — real thermal paper, torn top edge, mono numbers. */
export function Ticket({ no, title, meta, tone = "pending", children, footer, className, layoutId, aside }:
  { no: string | number; title: string; meta?: string; tone?: "pending" | "preparing" | "ready" | "served" | "alert"; children: ReactNode; footer?: ReactNode; className?: string; layoutId?: string; aside?: ReactNode }) {
  const bar = { pending: "bg-line-2", preparing: "bg-saffron", ready: "bg-mint", served: "bg-steel", alert: "bg-chili" }[tone];
  return (
    <motion.article layout layoutId={layoutId}
      initial={{ opacity: 0, scale: 0.96, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95, y: -6 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      className={cn("relative mt-2.5", className)}>
      <div className="tear-strip tear-top" aria-hidden />
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
