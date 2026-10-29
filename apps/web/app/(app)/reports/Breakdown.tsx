"use client";
import { useState } from "react";
import { Card, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";

/** sales_breakdown(): what the summary could not say, already added up. */
export type Breakdown = {
  days: number;
  by_category: { name: string; rev: number; qty: number }[];
  by_hour: { h: number; rev: number; bills: number }[];
  by_type: { type: string; rev: number; bills: number }[];
  by_cashier: { name: string; rev: number; bills: number }[];
  discounts: { bills: number; amount: number; coupons: number; points_redeemed: number; points_earned: number; promise_waived: number };
  cancelled: { lines: number; value: number };
  addons: { name: string; n: number; rev: number }[];
  variants: { name: string; qty: number; rev: number }[];
  table_qr: number;
};

const TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", room_service: "Room service" };
const hh = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

export function BreakdownView({ d }: { d: Breakdown | null }) {
  if (!d) return null;
  const totalType = d.by_type.reduce((s, t) => s + Number(t.rev), 0);
  const maxHour = Math.max(...d.by_hour.map((h) => Number(h.rev)), 1);
  const maxCat = Math.max(...d.by_category.map((c) => Number(c.rev)), 1);
  const hours = Array.from({ length: 24 }, (_, h) => d.by_hour.find((x) => Number(x.h) === h) ?? { h, rev: 0, bills: 0 });
  // the working day: from the first hour with a bill to the last, so a lunch-only place is not a wall of empty midnight bars
  const lit = hours.filter((x) => Number(x.bills) > 0).map((x) => Number(x.h));
  // two quiet hours either side, so a single busy hour reads as a peak rather than one wall of colour
  const from = lit.length ? Math.max(0, Math.min(...lit) - 2) : 8, to = lit.length ? Math.min(23, Math.max(...lit) + 2) : 22;
  const day = hours.slice(from, to + 1);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-3"><h3 className="text-xl">Sales by hour</h3><span className="text-xs text-steel">{d.days} day{d.days === 1 ? "" : "s"}</span></div>
          {lit.length === 0 ? <p className="text-sm text-steel">No paid bills</p> : <HourChart day={day} maxHour={maxHour} />}
        </Card>
        <Card>
          <h3 className="text-xl mb-3">By order type</h3>
          <div className="space-y-2">
            {d.by_type.map((t) => (
              <div key={t.type}><div className="flex justify-between text-sm"><span>{TYPE_LABEL[t.type] ?? t.type}</span><span className="num">{formatINR(Number(t.rev))} <span className="text-xs text-steel">· {t.bills} bill{Number(t.bills) === 1 ? "" : "s"}</span></span></div>
                <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-mint" style={{ width: `${totalType ? (Number(t.rev) / totalType) * 100 : 0}%` }} /></div></div>
            ))}
            {d.by_type.length === 0 && <p className="text-sm text-steel">Nothing yet.</p>}
            {Number(d.table_qr) > 0 && <p className="text-xs text-steel pt-1">{d.table_qr} via table QR</p>}
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="text-xl mb-3">By category</h3>
          <div className="space-y-2">{d.by_category.slice(0, 8).map((c) => (
            <div key={c.name}><div className="flex justify-between text-sm"><span className="truncate">{c.name}</span><span className="num">{formatINR(Number(c.rev))}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-ink/70" style={{ width: `${(Number(c.rev) / maxCat) * 100}%` }} /></div></div>
          ))}{d.by_category.length === 0 && <p className="text-sm text-steel">Nothing yet.</p>}</div>
        </Card>
        <Card>
          <h3 className="text-xl mb-3">Discounts &amp; cancellations</h3>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-steel">Discounted bills</dt><dd className="num">{d.discounts.bills} · {formatINR(Number(d.discounts.amount))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">Coupons used</dt><dd className="num">{d.discounts.coupons}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">Points redeemed / earned</dt><dd className="num">{Math.round(Number(d.discounts.points_redeemed))} / {Math.round(Number(d.discounts.points_earned))}</dd></div>
            {Number(d.discounts.promise_waived) > 0 && <div className="flex justify-between"><dt className="text-steel">Late promises, food free</dt><dd className="num text-chili">{formatINR(Number(d.discounts.promise_waived))}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1.5"><dt className="text-steel">Cancelled lines</dt><dd className={cn("num", Number(d.cancelled.lines) > 0 && "text-chili")}>{d.cancelled.lines} · {formatINR(Number(d.cancelled.value))}</dd></div>
          </dl>
          {d.by_cashier.length > 0 && <div className="mt-4"><div className="text-xs uppercase text-steel mb-1.5">By cashier</div><ul className="text-sm space-y-1">{d.by_cashier.slice(0, 6).map((c) => <li key={c.name} className="flex justify-between"><span className="truncate">{c.name}</span><span className="num">{formatINR(Number(c.rev))} <span className="text-xs text-steel">· {c.bills}</span></span></li>)}</ul></div>}
        </Card>
        <Card>
          <h3 className="text-xl mb-3">Top sizes &amp; add-ons</h3>
          {d.variants.length === 0 && d.addons.length === 0 ? <p className="text-sm text-steel">None sold yet</p> : (<>
            {d.variants.length > 0 && <ul className="text-sm space-y-1">{d.variants.slice(0, 6).map((v) => <li key={v.name} className="flex justify-between"><span className="truncate">{v.name}</span><span className="num">{v.qty} · {formatINR(Number(v.rev))}</span></li>)}</ul>}
            {d.addons.length > 0 && <div className={cn(d.variants.length > 0 && "mt-3 pt-3 border-t border-line")}><div className="text-xs uppercase text-steel mb-1.5">Add-ons</div><ul className="text-sm space-y-1">{d.addons.slice(0, 6).map((a) => <li key={a.name} className="flex justify-between"><span className="truncate">+ {a.name}</span><span className="num">{a.n} · {formatINR(Number(a.rev))}</span></li>)}</ul></div>}
          </>)}
        </Card>
      </div>
    </div>
  );
}

/**
 * The hours as thin bars on one baseline, one hue: the hour you are reading full colour, the rest a tint of it, an hour
 * with nothing a dot. Labels only on the clock's 3-hour marks (two-hour when the day is short) — 24 labels in a phone's
 * width ran into one another. Tap, hover or tab to a bar and the line above reads it; it starts on the busiest hour.
 */
function HourChart({ day, maxHour }: { day: { h: number; rev: number; bills: number }[]; maxHour: number }) {
  const peak = day.reduce((a, x) => (Number(x.rev) > Number(a.rev) ? x : a), day[0]);
  const [sel, setSel] = useState<number>(Number(peak.h));
  const cur = day.find((x) => Number(x.h) === sel) ?? peak;
  const step = day.length <= 8 ? 1 : day.length <= 14 ? 2 : 3;
  const isPeak = Number(cur.h) === Number(peak.h);
  return (
    <div data-hour-chart>
      <div className="flex items-end justify-between gap-3 mb-6 min-h-[2.75rem]" aria-live="polite">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-steel num">{hh(Number(cur.h))} – {hh((Number(cur.h) + 1) % 24)} · {cur.bills} bill{Number(cur.bills) === 1 ? "" : "s"}</div>
          <div className="font-display num text-[22px] leading-tight" data-hour-readout>{formatINR(Number(cur.rev))}</div>
        </div>
        {isPeak ? <span className="shrink-0 rounded-full px-2.5 h-7 inline-flex items-center text-[12px] font-bold bg-[color-mix(in_srgb,var(--color-tint)_16%,transparent)] text-[var(--color-tint)]">Busiest hour</span>
          : <button type="button" onClick={() => setSel(Number(peak.h))} className="shrink-0 rounded-full px-3 !min-h-9 text-[12px] font-bold bg-[var(--color-fill)] num">Busiest · {hh(Number(peak.h))}</button>}
      </div>
      <div className="relative h-36" role="group" aria-label="Sales by hour" onPointerLeave={(e) => { if (e.pointerType === "mouse") setSel(Number(peak.h)); }}>
        {/* the top line is the busiest hour; the baseline is nothing */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-[var(--color-separator)]" aria-hidden />
        <span className="absolute right-0 -top-2 -translate-y-full text-[10.5px] text-steel num" aria-hidden>{formatINR(maxHour, { whole: true })}</span>
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-separator)]" aria-hidden />
        <div className="absolute inset-0 flex items-stretch">
          {day.map((x) => { const h = Number(x.h), v = Number(x.rev), on = h === Number(cur.h); return (
            <button key={h} type="button" aria-pressed={on} aria-label={`${hh(h)} · ${formatINR(v)} · ${x.bills} bills`} data-hour={h}
              onClick={() => setSel(h)} onFocus={() => setSel(h)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setSel(h); }}
              className="relative flex-1 min-w-0 h-full flex items-end justify-center !min-h-0 rounded-md focus-visible:outline-none focus-visible:bg-[var(--color-fill)]">
              {on && <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[var(--color-separator)]" aria-hidden />}
              {v > 0
                ? <span className="relative w-[62%] max-w-[18px] rounded-t-[4px] transition-[height,background-color] duration-200" style={{ height: `${Math.max(4, (v / maxHour) * 100)}%`, background: on ? "var(--color-tint)" : "color-mix(in srgb, var(--color-tint) 34%, transparent)" }} />
                : <span className="relative mb-[-2px] h-1 w-1 rounded-full bg-[var(--color-separator)]" />}
            </button>); })}
        </div>
      </div>
      <div className="flex mt-1.5" aria-hidden>
        {day.map((x) => <span key={x.h} className={cn("flex-1 min-w-0 flex justify-center text-[10.5px] num whitespace-nowrap overflow-visible", Number(x.h) === Number(cur.h) ? "font-bold text-[var(--color-label)]" : "text-steel")}>{Number(x.h) === Number(cur.h) || (Number(x.h) % step === 0 && (step === 1 || Math.abs(Number(x.h) - Number(cur.h)) > 1)) ? hh(Number(x.h)) : ""}</span>)}
      </div>
    </div>
  );
}
