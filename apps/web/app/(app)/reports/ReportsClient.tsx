"use client";
import Link from "next/link";
import { useMemo } from "react";
import dynamic from "next/dynamic";
// Charts are ~105 kB and nobody needs them before the page paints; they arrive a beat later.
const SalesChart = dynamic(() => import("./Charts").then((m) => m.SalesChart), { ssr: false, loading: () => <div className="h-56 shimmer rounded-2xl" /> });
const TopChart = dynamic(() => import("./Charts").then((m) => m.TopChart), { ssr: false, loading: () => <div className="h-56 shimmer rounded-2xl" /> });
import { Card, StatTile, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";

type Bill = { total: number; paid_at: string; payments: { method: string; amount: number }[] };
type Item = { name_snapshot: string; qty: number; price_snapshot: number };
type Led = { qty: number; reason: string; ingredients: { name: string; unit: string; cost_per_unit: number } | null };
type Close = { business_date: string; orders_count: number; total_sales: number; cash: number; upi: number; card: number; other: number; notes: string | null };

export function ReportsClient({ days, bills, items, ledger, closes }: { days: number; bills: Bill[]; items: Item[]; ledger: Led[]; closes: Close[] }) {
  const sales = bills.reduce((t, b) => t + Number(b.total), 0);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) m.set(new Date(Date.now() - i * 86400000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), 0);
    bills.forEach((b) => { const k = new Date(b.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); m.set(k, (m.get(k) ?? 0) + Number(b.total)); });
    return [...m].map(([day, total]) => ({ day, total }));
  }, [bills, days]);
  const top = useMemo(() => { const m = new Map<string, { qty: number; rev: number }>(); items.forEach((i) => { const c = m.get(i.name_snapshot) ?? { qty: 0, rev: 0 }; m.set(i.name_snapshot, { qty: c.qty + i.qty, rev: c.rev + i.qty * Number(i.price_snapshot) }); }); return [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 8); }, [items]);
  const consumption = useMemo(() => { const m = new Map<string, { unit: string; used: number; waste: number; cost: number }>(); ledger.forEach((l) => { if (!l.ingredients) return; const c = m.get(l.ingredients.name) ?? { unit: l.ingredients.unit, used: 0, waste: 0, cost: Number(l.ingredients.cost_per_unit) }; const q = Math.abs(Number(l.qty)); if (l.reason === "sale") c.used += q; else c.waste += q; m.set(l.ingredients.name, c); }); return [...m].map(([name, v]) => ({ name, ...v, value: (v.used + v.waste) * v.cost })).sort((a, b) => b.value - a.value).slice(0, 10); }, [ledger]);
  const wasteCost = consumption.reduce((t, c) => t + c.waste * c.cost, 0);
  const cogs = consumption.reduce((t, c) => t + c.used * c.cost, 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">{[1, 7, 30, 90].map((d) => <Link key={d} href={`/reports?days=${d}`} className={cn("rounded-full px-4 h-9 grid place-items-center text-sm font-semibold", days === d ? "bg-ink text-white" : "bg-card border border-line")}>{d === 1 ? "Today" : `${d} days`}</Link>)}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Sales" value={formatINR(sales)} sub={`${bills.length} bills`} />
        <StatTile label="Avg bill" value={formatINR(bills.length ? sales / bills.length : 0)} delay={0.05} />
        <StatTile label="Ingredient cost (est.)" value={formatINR(cogs)} sub={sales ? `${((cogs / sales) * 100).toFixed(0)}% of sales` : undefined} delay={0.1} />
        <StatTile label="Wastage cost" value={formatINR(wasteCost)} tone={wasteCost > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card><h3 className="text-xl mb-3">Sales by day</h3>
          <SalesChart data={byDay} /></Card>
        <Card><h3 className="text-xl mb-3">Top dishes</h3>
          <TopChart data={top} /></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="text-xl mb-3">Stock consumption</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[420px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Ingredient</th><th className="text-right">Used</th><th className="text-right">Wasted</th><th className="text-right">Cost</th></tr></thead>
            <tbody>{consumption.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-2">{c.name}</td><td className="text-right num">{c.used.toFixed(2)} {c.unit}</td><td className={cn("text-right num", c.waste > 0 && "text-chili")}>{c.waste.toFixed(2)}</td><td className="text-right num">{formatINR(c.value)}</td></tr>)}
              {consumption.length === 0 && <tr><td colSpan={4} className="py-4 text-steel">No consumption yet — map recipes on the Menu page.</td></tr>}</tbody></table></div></Card>
        <Card><h3 className="text-xl mb-3">Day closes</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[420px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Date</th><th className="text-right">Bills</th><th className="text-right">Cash</th><th className="text-right">UPI</th><th className="text-right">Total</th></tr></thead>
            <tbody>{closes.map((c) => <tr key={c.business_date} className="border-t border-line"><td className="py-2 num">{c.business_date}</td><td className="text-right num">{c.orders_count}</td><td className="text-right num">{formatINR(Number(c.cash))}</td><td className="text-right num">{formatINR(Number(c.upi))}</td><td className="text-right num font-semibold">{formatINR(Number(c.total_sales))}</td></tr>)}
              {closes.length === 0 && <tr><td colSpan={5} className="py-4 text-steel">Close a day from Billing to lock its totals here.</td></tr>}</tbody></table></div></Card>
      </div>
    </div>
  );
}
