"use client";
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
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-3"><h3 className="text-xl">Sales by hour</h3><span className="text-xs text-steel">when the money comes in · {d.days} day{d.days === 1 ? "" : "s"}</span></div>
          {lit.length === 0 ? <p className="text-sm text-steel">No paid bills in this window.</p> : (
            <div className="flex items-stretch gap-1 h-40">
              {day.map((x) => (
                <div key={x.h} className="flex-1 flex flex-col justify-end items-center gap-1 min-w-0" title={`${hh(Number(x.h))} · ${formatINR(Number(x.rev))} · ${x.bills} bills`}>
                  <div className={cn("w-full rounded-t-md transition-all", Number(x.rev) === maxHour ? "bg-saffron" : "bg-ink/70")} style={{ height: `${Math.max(2, (Number(x.rev) / maxHour) * 100)}%` }} />
                  <span className="text-[9px] text-steel num truncate">{hh(Number(x.h))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="text-xl mb-3">By order type</h3>
          <div className="space-y-2">
            {d.by_type.map((t) => (
              <div key={t.type}><div className="flex justify-between text-sm"><span>{TYPE_LABEL[t.type] ?? t.type}</span><span className="num">{formatINR(Number(t.rev))} <span className="text-xs text-steel">· {t.bills} bill{Number(t.bills) === 1 ? "" : "s"}</span></span></div>
                <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-mint" style={{ width: `${totalType ? (Number(t.rev) / totalType) * 100 : 0}%` }} /></div></div>
            ))}
            {d.by_type.length === 0 && <p className="text-sm text-steel">Nothing yet.</p>}
            {Number(d.table_qr) > 0 && <p className="text-xs text-steel pt-1">{d.table_qr} order{Number(d.table_qr) === 1 ? "" : "s"} placed by guests scanning the table code.</p>}
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
          <h3 className="text-xl mb-3">Sizes &amp; add-ons that sell</h3>
          {d.variants.length === 0 && d.addons.length === 0 ? <p className="text-sm text-steel">No sizes or add-ons sold yet. Set them up under Menu → Options.</p> : (<>
            {d.variants.length > 0 && <ul className="text-sm space-y-1">{d.variants.slice(0, 6).map((v) => <li key={v.name} className="flex justify-between"><span className="truncate">{v.name}</span><span className="num">{v.qty} · {formatINR(Number(v.rev))}</span></li>)}</ul>}
            {d.addons.length > 0 && <div className={cn(d.variants.length > 0 && "mt-3 pt-3 border-t border-line")}><div className="text-xs uppercase text-steel mb-1.5">Add-ons</div><ul className="text-sm space-y-1">{d.addons.slice(0, 6).map((a) => <li key={a.name} className="flex justify-between"><span className="truncate">+ {a.name}</span><span className="num">{a.n} · {formatINR(Number(a.rev))}</span></li>)}</ul></div>}
          </>)}
        </Card>
      </div>
    </div>
  );
}
