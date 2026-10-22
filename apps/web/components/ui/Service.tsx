"use client";
import type { ReactNode } from "react";
import { Plus, ClipboardList, Flame, BellRing, Utensils, Receipt, AlarmClock, CalendarClock, CalendarCheck, Activity, Bike, HeartHandshake, UtensilsCrossed, Boxes, SprayCan, ListTodo, QrCode, type LucideIcon, Armchair } from "lucide-react";
import { cn } from "./index";
import { Say } from "./Say";
import { SVC_WORD, type Svc } from "@/lib/service";

/** The picture for each state — the same on every Dining screen (globals.css SIMPLE SERVICE). */
export const SVC_ICON: Record<Svc | "late", LucideIcon> = { free: Plus, hold: CalendarClock, new: ClipboardList, cook: Flame, ready: BellRing, eat: Utensils, bill: Receipt, clean: SprayCan, late: AlarmClock };
export const stClass = (s: Svc | "late") => `st-${s}`;

/** A state as a chip: its picture, its word (and the second language), a count. As a button it filters. */
export function StateChip({ s, n, onClick, on, className }: { s: Svc | "late"; n?: number; onClick?: () => void; on?: boolean; className?: string }) {
  const I = SVC_ICON[s]; const inner = <><I size={16} aria-hidden /><Say w={s === "late" ? "late" : SVC_WORD[s]} start />{n !== undefined && <b className="num">{n}</b>}</>;
  const cls = cn("svc-chip", stClass(s), n === undefined && "lone", className);
  return onClick ? <button type="button" onClick={onClick} aria-pressed={on} className={cls} data-state-chip={s}>{inner}</button> : <span className={cls} data-state-chip={s}>{inner}</span>;
}

/** The head of a Dining screen: its picture in a square, the title, one plain sentence; actions on the right. */
const HEAD_ICON: Record<string, LucideIcon> = { tables: Armchair, cleaning: SprayCan, work: ListTodo, orders: ClipboardList, kitchen: Flame, billing: Receipt, reservations: CalendarCheck, pulse: Activity, qr: QrCode, online: Bike, customers: HeartHandshake, menu: UtensilsCrossed, pantry: Boxes };
/** `actionsClassName` places the actions per screen (2026-10-22: Pulse moves Join by QR into its glance card on a phone). */
export function SvcHead({ icon, title, sub, actions, className, actionsClassName }: { icon: keyof typeof HEAD_ICON | string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string; actionsClassName?: string }) {
  const I = HEAD_ICON[icon] ?? UtensilsCrossed;
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)} data-svc-head>
      <div className="svc-head flex-1 min-w-[min(100%,16rem)]">
        <span className="ico" aria-hidden><I size={24} /></span>
        <div className="min-w-0"><h1 className="truncate">{title}</h1>{sub && <p>{sub}</p>}</div>
      </div>
      {actions && <div className={cn("flex items-center gap-2 flex-wrap max-sm:w-full max-sm:[&>*]:flex-1", actionsClassName)}>{actions}</div>}
    </div>
  );
}
