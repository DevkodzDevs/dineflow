"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * A month of bookings, as a month looks.
 *
 * The day view answered "who is coming tonight" and nothing else — to see whether Saturday was
 * filling up you had to step through a week one arrow at a time. The grid answers it at a glance
 * and still opens a single day, because that is where the work happens.
 *
 * It is drawn as one ruled block (.cal-grid), not as forty-two separate cards. Cards meant a 28px
 * radius on every cell, which at 140×70 is a pill, and a selected day came out as a white blob
 * with nothing calendar-like about it. Hairlines between flush cells give a filled day a crisp
 * rectangle, let the grid fit a phone without scrolling sideways, and read as a month.
 *
 * Weeks start on Monday: a restaurant's week bends around the weekend, and splitting Saturday from
 * Sunday across two rows is exactly the wrong cut. The weekend columns carry their own ground, so
 * the shape of the week is visible before you read a single number.
 */

export type Day = { id: string; on_date: string; at_time: string; guest_name: string; party_size: number; status: string };

/** Dead bookings still occupy the list; they must not colour the calendar. */
const LIVE = (r: Day) => r.status !== "cancelled" && r.status !== "no_show";
const DOT: Record<string, string> = {
  requested: "bg-[var(--color-orange)]", confirmed: "bg-[var(--color-tint)]",
  seated: "bg-[var(--color-blue)]", done: "bg-[var(--color-label-3)]",
};
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the week that holds the first of this month, so the grid always starts on a Monday. */
function gridStart(y: number, m: number) {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const back = (first.getUTCDay() + 6) % 7;          // Sunday is 0; we want Monday to be 0
  first.setUTCDate(first.getUTCDate() - back);
  return first;
}

export function Calendar({ day, month, today }: { day: string; month: Day[]; today: string }) {
  const [y, m] = day.split("-").map(Number);
  const byDate = new Map<string, Day[]>();
  for (const r of month.filter(LIVE)) {
    const a = byDate.get(r.on_date) ?? []; a.push(r); byDate.set(r.on_date, a);
  }

  const start = gridStart(y, m);
  /* Six rows always. A month that fits in five would otherwise make the grid jump height as you
     page through it, and the panel beside it with it. */
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return { date, n: d.getUTCDate(), thisMonth: d.getUTCMonth() + 1 === m, wknd: i % 7 >= 5, rows: byDate.get(date) ?? [] };
  });

  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return `/reservations?date=${d.toISOString().slice(0, 10)}`;
  };
  const busiest = Math.max(1, ...cells.map((c) => c.rows.length));

  return (
    /* min-w-0: as a grid item this defaults to min-width:auto, which refuses to go below the width
       the grid inside it asks for — and pushed the whole page sideways on a phone. */
    <div className="feather p-3 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4 px-1">
        <h2 className="text-xl md:text-2xl min-w-0 truncate">{label}</h2>
        <div className="cal-nav">
          <Link href={step(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Link>
          <Link href={`/reservations?date=${today}`} className="!px-4 text-[12px] font-semibold">Today</Link>
          <Link href={step(1)} aria-label="Next month"><ChevronRight size={16} /></Link>
        </div>
      </div>

      {/* the same track as the grid below it — a 1px gap and a 1px border, so every heading sits
          over its own column instead of drifting a pixel further off across the week */}
      <div className="grid grid-cols-7 gap-px border border-transparent mb-1.5">
        {WEEK.map((w, i) => (
          /* the whole name at every width: "MON" is 26px of a 50px phone column, and a column of
             single letters makes Tuesday and Thursday the same heading */
          <div key={w} className={cn("text-[10px] font-semibold uppercase tracking-[0.1em] text-center", i >= 5 ? "text-[var(--color-label)]" : "text-steel")}>{w}</div>
        ))}
      </div>

      {/* one fade for the block, not forty-two: a stagger here animates every cell on every month
          change, and on a tablet that is the slowest thing on the page */}
      <motion.div className="cal-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
        {cells.map((c) => {
          const isToday = c.date === today, isOpen = c.date === day;
          const covers = c.rows.reduce((t, r) => t + r.party_size, 0);
          return (
            <Link key={c.date} href={`/reservations?date=${c.date}`} aria-current={isOpen ? "date" : undefined}
              aria-label={`${c.n} — ${c.rows.length} booking${c.rows.length === 1 ? "" : "s"}`}
              className={cn("cal-cell", isOpen && "on", !isOpen && c.wknd && "wknd", !isOpen && !c.thisMonth && "off")}>
              <span className={cn("cal-num num self-start", isToday && !isOpen && "today", !c.thisMonth && !isOpen && !isToday && "opacity-30")}>{c.n}</span>
              {c.rows.length > 0 && (
                <>
                  {/* how busy the day is, before you have read a number: a bar measured against the
                      busiest day of this month. The dots say what state those bookings are in. */}
                  <span className={cn("mt-auto h-[3px] rounded-full", isOpen ? "bg-current opacity-60" : "bg-[var(--color-tint)]")}
                    style={{ width: `${Math.round((c.rows.length / busiest) * 100)}%` }} aria-hidden />
                  <span className="flex items-center gap-[3px]">
                    {c.rows.slice(0, 3).map((r) => <span key={r.id} className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[r.status] ?? "bg-[var(--color-label-3)]")} />)}
                    <span className={cn("num text-[10px] leading-none ml-auto tabular-nums", isOpen ? "opacity-70" : "text-steel")}>{covers}p</span>
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </motion.div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 px-1 text-[11px] text-steel">
        {[["requested", "Waiting"], ["confirmed", "Confirmed"], ["seated", "At the table"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", DOT[k])} /> {l}</span>
        ))}
      </div>
    </div>
  );
}
