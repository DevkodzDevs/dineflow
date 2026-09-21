"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
// Charts are ~105 kB and nobody needs them before the page paints; they arrive a beat later.
const SalesChart = dynamic(() => import("./Charts").then((m) => m.SalesChart), { ssr: false, loading: () => <div className="h-56 shimmer rounded-2xl" /> });
const TopChart = dynamic(() => import("./Charts").then((m) => m.TopChart), { ssr: false, loading: () => <div className="h-56 shimmer rounded-2xl" /> });
import { Card, StatTile, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";

/** Already added up by report_summary() in the database, so the size of the window stops mattering. */
export type Summary = {
  sales: number; bills: number;
  by_day: { day: string; total: number }[];
  payments: { method: string; amount: number }[];
  top: { name: string; qty: number; rev: number }[];
  consumption: { name: string; unit: string; cost: number; used: number; waste: number }[];
  cogs: number; waste_cost: number;
};
type Close = { business_date: string; orders_count: number; total_sales: number; cash: number; upi: number; card: number; other: number; notes: string | null };
/** kitchen_speed(): ticket print → ready, against the property's own target */
export type KitchenSpeed = { target: number | null; warn: number | null; tickets: number; ignored?: number; recalls: number; avg_min: number; p90_min: number; within_pct: number;
  by_hour: { h: number; n: number; avg_min: number; within: number }[]; by_day: { day: string; n: number; avg_min: number; within: number }[]; slowest: { name: string; n: number; avg_min: number }[] };
/** hotel_kpis(): occupancy, ADR and RevPAR — a night is sold when a stay covers it */
export type HotelKpis = { rooms: number; sellable?: number; ooo?: number; days: number; room_nights: number; revenue: number; occ_pct: number; adr: number; revpar: number;
  by_day: { day: string; occupied: number; total: number; occ_pct: number; revenue: number; adr: number; revpar: number }[] };
export type AuditRow = { business_date: string; occupancy_pct: number; adr: number; revpar: number; room_revenue: number; no_shows: number; discrepancies: number };

export function ReportsClient({ days, summary, closes, kitchen = null, hotel = null, audits = [] }: { days: number; summary: Summary; closes: Close[]; kitchen?: KitchenSpeed | null; hotel?: HotelKpis | null; audits?: AuditRow[] }) {
  const { sales, bills: billCount, by_day: byDay, top, consumption, cogs, waste_cost: wasteCost } = summary;
  return (
    <div className="space-y-6">
      <div className="flex gap-2">{[1, 7, 30, 90].map((d) => <Link key={d} href={`/reports?days=${d}`} className={cn("rounded-full px-4 h-9 grid place-items-center text-sm font-semibold", days === d ? "bg-ink text-on-label" : "bg-card border border-line")}>{d === 1 ? "Today" : `${d} days`}</Link>)}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Sales" value={formatINR(sales)} sub={`${billCount} bills`} />
        <StatTile label="Avg bill" value={formatINR(billCount ? sales / billCount : 0)} delay={0.05} />
        <StatTile label="Ingredient cost (est.)" value={formatINR(cogs)} sub={sales ? `${((cogs / sales) * 100).toFixed(0)}% of sales` : undefined} delay={0.1} />
        <StatTile label="Wastage cost" value={formatINR(wasteCost)} tone={wasteCost > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card><h3 className="text-xl mb-3">Sales by day</h3>
          <SalesChart data={byDay} /></Card>
        <Card><h3 className="text-xl mb-3">Top dishes</h3>
          <TopChart data={top} /></Card>
      </div>

      {/* what the chains manage the kitchen by, and what every hotel opens its morning meeting with */}
      <div className={cn("grid gap-4", hotel && "lg:grid-cols-2")}>
        {kitchen && (
          <Card>
            <div className="flex items-baseline justify-between gap-3 mb-3"><h3 className="text-xl">Speed of service</h3><span className="text-xs text-steel num">target {kitchen.target ?? 15} min · {kitchen.tickets} tickets · {kitchen.recalls} recall{Number(kitchen.recalls) === 1 ? "" : "s"}</span></div>
            {Number(kitchen.tickets) === 0 ? <p className="text-sm text-steel">No tickets marked ready in this window yet.{Number(kitchen.ignored ?? 0) > 0 && <> {kitchen.ignored} ticket{Number(kitchen.ignored) === 1 ? " was" : "s were"} left open for hours and closed later, so {Number(kitchen.ignored) === 1 ? "it is" : "they are"} not counted as cooking time.</>}</p> : (
              <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div>
                  <div className="grid grid-cols-3 gap-3">
                    <Mini label="Avg ticket" value={`${Number(kitchen.avg_min).toFixed(1)} min`} />
                    <Mini label="Slowest 10%" value={`${Number(kitchen.p90_min).toFixed(1)} min`} />
                    <Mini label="Within target" value={`${kitchen.within_pct}%`} tone={Number(kitchen.within_pct) >= 90 ? "good" : Number(kitchen.within_pct) < 70 ? "alert" : undefined} />
                  </div>
                  {Number(kitchen.ignored ?? 0) > 0 && <p className="text-[11px] text-steel mt-2">{kitchen.ignored} ticket{Number(kitchen.ignored) === 1 ? "" : "s"} left open for hours and closed later — not counted as cooking time.</p>}
                  {kitchen.slowest.length > 0 && <div className="mt-4"><div className="text-xs uppercase text-steel mb-1.5">Slowest dishes</div><ul className="text-sm space-y-1">{kitchen.slowest.map((d) => <li key={d.name} className="flex justify-between gap-3"><span className="truncate">{d.name}</span><span className="num text-steel shrink-0">{Number(d.avg_min).toFixed(1)} min · {d.n}</span></li>)}</ul></div>}
                </div>
                <div><div className="text-xs uppercase text-steel mb-1.5">By hour of day</div><Hours rows={kitchen.by_hour} target={Number(kitchen.target ?? 15)} /></div>
              </div>
            )}
          </Card>
        )}
        {hotel && (
          <Card>
            {/* the denominator is named on screen: occupancy is over the rooms that can be sold, which is what the night audit divides by too */}
            <div className="flex items-baseline justify-between gap-3 mb-3"><h3 className="text-xl">Rooms</h3><span className="text-xs text-steel num">{hotel.sellable ?? hotel.rooms} sellable{Number(hotel.ooo ?? 0) > 0 && ` · ${hotel.ooo} out of order`} · {hotel.room_nights} room-nights sold</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Mini label="Occupancy" value={`${hotel.occ_pct}%`} tone={Number(hotel.occ_pct) >= 80 ? "good" : undefined} />
              <Mini label="ADR" value={formatINR(Number(hotel.adr))} />
              <Mini label="RevPAR" value={formatINR(Number(hotel.revpar))} />
              <Mini label="Room revenue" value={formatINR(Number(hotel.revenue))} />
            </div>
            <div className="text-xs uppercase text-steel mb-1.5">Occupancy by day</div>
            <div className="flex items-stretch gap-[3px] h-24">{hotel.by_day.map((d) => <div key={d.day} className="flex-1 h-full flex flex-col justify-end" title={`${d.day} — ${d.occupied}/${d.total} rooms · ADR ${formatINR(Number(d.adr))} · RevPAR ${formatINR(Number(d.revpar))}`}><div className={cn("rounded-t", Number(d.occ_pct) >= 80 ? "bg-mint" : "bg-[var(--color-label)]/70")} style={{ height: `${Math.max(2, Math.min(100, Number(d.occ_pct)))}%` }} /></div>)}</div>
            <div className="flex text-[10px] text-steel num mt-1">{hotel.by_day.map((d, i) => <span key={d.day} className="flex-1 text-center truncate">{hotel.by_day.length <= 7 || i % Math.ceil(hotel.by_day.length / 7) === 0 ? d.day.slice(0, 2) : ""}</span>)}</div>
            {audits.length > 0 && (
              <div className="mt-4"><div className="text-xs uppercase text-steel mb-1.5">Night audits</div>
                <table className="w-full text-sm"><tbody>{audits.map((a) => <tr key={a.business_date} className="border-t border-line"><td className="py-1.5 num"><Link href={`/frontdesk/night-audit?date=${a.business_date}`} className="hover:underline">{a.business_date}</Link></td><td className="text-right num">{Math.round(Number(a.occupancy_pct))}%</td><td className="text-right num">{formatINR(Number(a.adr))}</td><td className="text-right num font-semibold">{formatINR(Number(a.room_revenue))}</td><td className={cn("text-right num text-xs", a.no_shows > 0 ? "text-chili" : "text-steel")}>{a.no_shows} no-show{a.no_shows === 1 ? "" : "s"}</td></tr>)}</tbody></table></div>
            )}
          </Card>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="text-xl mb-3">Stock consumption</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[360px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Ingredient</th><th className="text-right">Used</th><th className="text-right">Wasted</th><th className="text-right">Cost</th></tr></thead>
            <tbody>{consumption.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-2">{c.name}</td><td className="text-right num">{c.used.toFixed(2)} {c.unit}</td><td className={cn("text-right num", c.waste > 0 && "text-chili")}>{c.waste.toFixed(2)}</td><td className="text-right num">{formatINR(c.used * c.cost)}</td></tr>)}
              {consumption.length === 0 && <tr><td colSpan={4} className="py-4 text-steel">No consumption yet — map recipes on the Menu page.</td></tr>}</tbody></table></div></Card>
        <Card><h3 className="text-xl mb-3">Day closes</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[360px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Date</th><th className="text-right">Bills</th><th className="text-right">Cash</th><th className="text-right">UPI</th><th className="text-right">Total</th></tr></thead>
            <tbody>{closes.map((c) => <tr key={c.business_date} className="border-t border-line"><td className="py-2 num">{c.business_date}</td><td className="text-right num">{c.orders_count}</td><td className="text-right num">{formatINR(Number(c.cash))}</td><td className="text-right num">{formatINR(Number(c.upi))}</td><td className="text-right num font-semibold">{formatINR(Number(c.total_sales))}</td></tr>)}
              {closes.length === 0 && <tr><td colSpan={5} className="py-4 text-steel">Close a day from Billing to lock its totals here.</td></tr>}</tbody></table></div></Card>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "good" | "alert" }) {
  return <div className="rounded-2xl bg-[var(--color-fill)] p-3"><div className="text-[10.5px] uppercase tracking-wide text-steel">{label}</div><div className={cn("num text-2xl font-semibold mt-1", tone === "good" && "text-[var(--color-tint)]", tone === "alert" && "text-chili")}>{value}</div></div>;
}

/** Twenty-four bars, one per hour: height is the average ticket time, colour is how much of that hour beat the target. */
function Hours({ rows, target }: { rows: { h: number; n: number; avg_min: number; within: number }[]; target: number }) {
  const by = new Map(rows.map((r) => [Number(r.h), r])); const max = Math.max(target, ...rows.map((r) => Number(r.avg_min)));
  return (
    <div>
      {/* Each column must stretch to the full height of the strip: a bar is sized as a percentage of
          its column, and a column that only wraps its content has no height to take a percentage of
          — which is how this chart came out completely empty. */}
      <div className="flex items-stretch gap-[3px] h-28 relative">
        <div className="absolute left-0 right-0 border-t border-dashed border-[var(--color-line)]" style={{ bottom: `${(target / max) * 100}%` }} title={`target ${target} min`} />
        {Array.from({ length: 24 }, (_, h) => { const r = by.get(h); const v = r ? Number(r.avg_min) : 0; const w = r ? Number(r.within) : 100;
          return <div key={h} className="flex-1 h-full flex flex-col justify-end" title={r ? `${h}:00 — ${r.n} ticket${r.n === 1 ? "" : "s"}, avg ${v.toFixed(1)} min, ${w}% within target` : `${h}:00 — no tickets`}>
            <div className={cn("rounded-t", !r ? "bg-[var(--color-fill)]" : w >= 90 ? "bg-mint" : w >= 70 ? "bg-saffron" : "bg-chili")} style={{ height: r ? `${Math.max(4, Math.min(100, (v / max) * 100))}%` : "2px" }} /></div>; })}
      </div>
      <div className="flex text-[10px] text-steel num mt-1">{Array.from({ length: 24 }, (_, h) => <span key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ""}</span>)}</div>
    </div>
  );
}
