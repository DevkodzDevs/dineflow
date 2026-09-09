"use client";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Printer, Clock, Ban } from "lucide-react";
import { Button, Card, Pill } from "@/components/ui";
import { formatINR } from "@/lib/format";

type P = { period: string; rooms_revenue: number; dining_revenue: number; delivery_revenue: number; total_revenue: number; gst_collected: number; covers: number; invoices_issued: number; occupancy_pct: number | null; avg_ticket: number | null; days_traded: number; supplier_paid: number | null; wages_paid: number | null; hash: string };
type D = { ok?: boolean; error?: string; expired_at?: string; label: string; purpose: string; property: { name: string; address: string | null; phone: string | null; gstin: string | null; type: string; since: string }; from: string; to: string; months: number; periods: P[]; show_costs: boolean; total_revenue: number; gst_collected: number; avg_monthly: number; chain_intact: boolean; head: string | null; expires_at: string; opened_at: string };
const mon = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function RecordView({ data: d }: { data: D | null }) {
  if (!d || d.error) {
    const t = d?.error === "expired" ? "This link has expired" : d?.error === "revoked" ? "This link was withdrawn" : "Link not found";
    const s = d?.error === "expired" ? "Business records are shared for a limited time. Ask the property for a fresh link." : d?.error === "revoked" ? "The property revoked access to this record." : "Check the address, or ask the property to send the link again.";
    return (
      <div className="min-h-dvh grid place-items-center p-8 text-center">
        <div><span className="h-14 w-14 rounded-2xl bg-porcelain-2 grid place-items-center mx-auto text-steel">{d?.error === "revoked" ? <Ban size={24} /> : <Clock size={24} />}</span>
          <h1 className="text-3xl mt-4">{t}</h1><p className="text-steel mt-2 max-w-sm">{s}</p></div>
      </div>
    );
  }
  const max = Math.max(...d.periods.map((p) => Number(p.total_revenue)), 1);
  const growth = (() => { if (d.periods.length < 4) return null; const h = Math.floor(d.periods.length / 2);
    const a = d.periods.slice(0, h).reduce((t, p) => t + Number(p.total_revenue), 0) / h;
    const b = d.periods.slice(-h).reduce((t, p) => t + Number(p.total_revenue), 0) / h;
    return a > 0 ? Math.round(((b - a) / a) * 100) : null; })();

  return (
    <div className="min-h-dvh bg-porcelain">
      <header className="ink-panel relative"><div className="max-w-4xl mx-auto px-6 py-10">
        <div className="eyebrow text-white/50">Verified business record · {d.label}</div>
        <h1 className="font-display text-4xl md:text-5xl text-white mt-2">{d.property.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-white/60">
          {d.property.address && <span>{d.property.address}</span>}
          {d.property.gstin && <span className="num">GSTIN {d.property.gstin}</span>}
          <span className="capitalize">{d.property.type}</span>
          <span>Trading on DineFlow since {new Date(d.property.since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
        </div>
      </div></header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        <Card className={d.chain_intact ? "!bg-mint-2 border-mint" : "!bg-chili-2 border-chili"}>
          <div className="flex items-start gap-3">
            {d.chain_intact ? <ShieldCheck size={22} className="shrink-0 mt-0.5" /> : <ShieldAlert size={22} className="shrink-0 mt-0.5 text-chili" />}
            <div className="text-sm">
              {d.chain_intact
                ? <><b>These figures are sealed and unaltered.</b> Each month was fingerprinted when it closed and cryptographically chained to the month before it. Changing any past figure would break the chain, and this page would say so.</>
                : <><b className="text-chili">Warning: the chain does not verify.</b> One or more months no longer match what was originally sealed. Treat these figures with caution and ask the property to explain.</>}
              {d.head && <div className="num text-[11px] text-steel mt-1.5">Chain head {d.head}…</div>}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["Turnover", formatINR(d.total_revenue), `${d.months} months`], ["Average month", formatINR(d.avg_monthly), ""], ["GST collected", formatINR(d.gst_collected), "paid to government"], ["Growth", growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`, "first half vs second"]].map(([l, v, s], i) => (
            <motion.div key={l} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="feather p-4">
              <div className="eyebrow">{l}</div><div className="font-display num text-[28px] mt-1.5 leading-none">{v}</div>{s && <div className="text-xs text-steel mt-1">{s}</div>}
            </motion.div>
          ))}
        </div>

        <Card>
          <h2 className="text-2xl mb-1">{mon(d.from)} to {mon(d.to)}</h2>
          <p className="text-xs text-steel mb-5">Revenue by source, month by month.</p>
          <div className="flex items-end gap-1.5 h-44">
            {d.periods.map((p, i) => (
              <motion.div key={p.period} initial={{ height: 0 }} animate={{ height: "auto" }} transition={{ delay: i * 0.02 }} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end h-36 rounded-t overflow-hidden" title={`${mon(p.period)} — ${formatINR(p.total_revenue)}`}>
                  <div className="w-full bg-champagne" style={{ height: `${(Number(p.delivery_revenue) / max) * 100}%` }} />
                  <div className="w-full bg-saffron" style={{ height: `${(Number(p.dining_revenue) / max) * 100}%` }} />
                  <div className="w-full bg-ink" style={{ height: `${(Number(p.rooms_revenue) / max) * 100}%` }} />
                </div>
                <span className="text-[9px] text-steel num">{new Date(p.period).toLocaleDateString("en-IN", { month: "short" })}</span>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-steel">
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-ink" /> rooms</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-saffron" /> dining</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-champagne" /> delivery</span>
          </div>
        </Card>

        <Card>
          <div className="overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[700px]">
            <thead className="text-xs uppercase tracking-wide text-steel border-b border-line"><tr>
              <th className="text-left py-2">Month</th><th className="text-right py-2">Rooms</th><th className="text-right py-2">Dining</th><th className="text-right py-2">Delivery</th>
              <th className="text-right py-2">Total</th><th className="text-right py-2">GST</th><th className="text-right py-2">Occ.</th><th className="text-right py-2">Covers</th>
              {d.show_costs && <><th className="text-right py-2">Suppliers</th><th className="text-right py-2">Wages</th></>}
              <th className="text-right py-2">Seal</th></tr></thead>
            <tbody>{d.periods.slice().reverse().map((p) => (
              <tr key={p.period} className="border-b border-line/60">
                <td className="py-2.5 font-medium">{mon(p.period)}<div className="text-[11px] text-steel">{p.days_traded} days traded · {p.invoices_issued} invoices</div></td>
                <td className="py-2.5 text-right num">{Number(p.rooms_revenue) ? formatINR(p.rooms_revenue) : "—"}</td>
                <td className="py-2.5 text-right num">{formatINR(p.dining_revenue)}</td>
                <td className="py-2.5 text-right num">{Number(p.delivery_revenue) ? formatINR(p.delivery_revenue) : "—"}</td>
                <td className="py-2.5 text-right num font-semibold">{formatINR(p.total_revenue)}</td>
                <td className="py-2.5 text-right num text-steel">{formatINR(p.gst_collected)}</td>
                <td className="py-2.5 text-right num">{p.occupancy_pct != null ? `${p.occupancy_pct}%` : "—"}</td>
                <td className="py-2.5 text-right num">{p.covers}</td>
                {d.show_costs && <><td className="py-2.5 text-right num text-steel">{formatINR(p.supplier_paid ?? 0)}</td><td className="py-2.5 text-right num text-steel">{formatINR(p.wages_paid ?? 0)}</td></>}
                <td className="py-2.5 text-right num text-[10px] text-steel">{p.hash}</td>
              </tr>))}</tbody>
          </table></div>
          {!d.show_costs && <p className="text-xs text-steel mt-3">The property chose to share revenue only. Costs are not included in this record.</p>}
        </Card>

        <Card className="!bg-porcelain-2">
          <div className="text-sm text-steel space-y-2">
            <p><b className="text-ink">How to read this.</b> These figures come from the property&apos;s own point-of-sale, front desk and pantry records as they were entered day by day, not from a report typed up afterwards. Each closed month was sealed with a cryptographic fingerprint that includes the previous month&apos;s fingerprint, so the sequence cannot be quietly edited later.</p>
            <p><b className="text-ink">What it is not.</b> It is not audited accounts, and it is not a credit score. Cash taken outside the system would not appear here. DineFlow neither assesses nor recommends this business — it only certifies that these numbers are the ones the property recorded at the time.</p>
            <p className="num text-xs">Opened {new Date(d.opened_at).toLocaleString("en-IN")} · link expires {new Date(d.expires_at).toLocaleDateString("en-IN")} · the property is shown every time this page is opened.</p>
          </div>
        </Card>

        <div className="flex justify-between items-center no-print pb-8">
          <span className="text-xs text-steel">Generated by DineFlow</span>
          <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Print / save as PDF</Button>
        </div>
      </main>
    </div>
  );
}
