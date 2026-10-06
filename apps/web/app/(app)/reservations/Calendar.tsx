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
 * Weeks start on Monday: a restaurant's week bends around the weekend, and splitting Saturday from
 * Sunday across two rows is exactly the wrong cut.
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
    return { date, n: d.getUTCDate(), thisMonth: d.getUTCMonth() + 1 === m, rows: byDate.get(date) ?? [] };
  });

  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return `/reservations?date=${d.toISOString().slice(0, 10)}`;
  };

  return (
    /* min-w-0: as a grid item this defaults to min-width:auto, which refuses to go below the
       620px the scrolling grid inside it asks for — and pushed the whole page sideways on a
       phone instead of letting the track scroll. */
    <div className="feather p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl md:text-2xl">{label}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={step(-1)} aria-label="Previous month" className="icon-btn border border-line"><ChevronLeft size={16} /></Link>
          <Link href={`/reservations?date=${today}`} className="tap h-9 rounded-full px-3 text-[12px] font-semibold border border-line text-steel hover:text-[var(--color-label)]">Today</Link>
          <Link href={step(1)} aria-label="Next month" className="icon-btn border border-line"><ChevronRight size={16} /></Link>
        </div>
      </div>

      {/* The grid scrolls sideways rather than squeezing seven columns into a phone: a day cell
          below about 44px wide is unreadable and untappable at once. */}
      <div className="overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
        <div className="min-w-[460px]">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
            {WEEK.map((w) => <div key={w} className="text-[11px] font-semibold text-steel text-center">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((c, i) => {
              const isToday = c.date === today, isOpen = c.date === day;
              const covers = c.rows.reduce((t, r) => t + r.party_size, 0);
              return (
                <motion.div key={c.date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 24) * 0.008 }}>
                  <Link href={`/reservations?date=${c.date}`} aria-current={isOpen ? "date" : undefined}
                    aria-label={`${c.n} — ${c.rows.length} booking${c.rows.length === 1 ? "" : "s"}`}
                    className={cn("relative rounded-xl p-2 min-h-[56px] sm:min-h-[64px] flex flex-col transition-colors",
                      isOpen ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-[0_6px_18px_-8px_rgb(0_0_0/.8)]"
                        : isToday ? "bg-[var(--color-green-2)] ring-1 ring-inset ring-[var(--color-tint)]/60"
                        : c.thisMonth ? "bg-[var(--color-bg-3)] hover:bg-[var(--color-fill-2)]"
                        : "hover:bg-[var(--color-fill)]")}>
                    <span className={cn("num text-[13px] font-semibold leading-none", !c.thisMonth && !isOpen && "opacity-35")}>{c.n}</span>
                    {c.rows.length > 0 && (
                      <div className="mt-auto flex items-center gap-1">
                        {c.rows.slice(0, 3).map((r) => <span key={r.id} className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[r.status] ?? "bg-[var(--color-label-3)]")} />)}
                        {c.rows.length > 3 && <span className={cn("text-[9px] leading-none num", isOpen ? "opacity-70" : "text-steel")}>+{c.rows.length - 3}</span>}
                        <span className={cn("num text-[10px] leading-none ml-auto", isOpen ? "opacity-70" : "text-steel")}>{covers}p</span>
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-steel">
        {[["requested", "Waiting"], ["confirmed", "Confirmed"], ["seated", "At the table"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", DOT[k])} /> {l}</span>
        ))}
      </div>
    </div>
  );
}
