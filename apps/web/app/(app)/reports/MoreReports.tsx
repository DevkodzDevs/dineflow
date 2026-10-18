"use client";
import { useState } from "react";
import Link from "next/link";
import { Wallet, Users, ReceiptText, Ban, Utensils } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { METHOD, type Extra } from "./tables";

/**
 * report_extra (0105): sales less expenses, how people paid, who sold, every dish, the tax lines, cancellations and
 * voids. Only for the owner, a manager or a supervisor — for anyone else the database says no and nothing shows.
 */
export function MoreReports({ x }: { x: Extra | null }) {
  const [allItems, setAllItems] = useState(false);
  if (!x) return null;
  const t = x.totals; const left = Number(x.net.sales) - Number(x.net.expenses);
  const payTotal = x.payments.reduce((a, p) => a + Number(p.amount), 0) || 1;
  const staffMax = Math.max(1, ...x.staff.map((s) => Number(s.amount)));
  const items = allItems ? x.items : x.items.slice(0, 12);
  const h3 = "flex items-center gap-2 text-[17px] font-extrabold mb-3";
  return (
    <div className="space-y-4" data-more-reports>
      {/* the owner's first question: after what we spent, what is left */}
      <Card data-net>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3"><div className={h3 + " !mb-0"}><Wallet size={18} aria-hidden /> Sales less expenses</div>
          <Link href="/expenses" className="inline-flex items-center !min-h-11 -my-2 px-1 text-[13px] font-semibold text-steel hover:text-[var(--color-label)] underline-offset-2 hover:underline">Expenses →</Link></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[["Sales before tax", Number(x.net.sales), ""], ["Expenses before GST", Number(x.net.expenses), "text-chili"], ["What is left", left, left >= 0 ? "text-mint" : "text-chili"]].map(([k, v, c]) => (
            <div key={k as string} className="rounded-2xl bg-[var(--color-fill)] px-4 py-3 min-w-0"><div className="text-[12.5px] font-bold text-steel">{k}</div><div className={cn("font-display num text-[26px] leading-tight truncate", c as string)}>{formatINR(v as number)}</div></div>))}
        </div>
        <p className="mt-2 text-[12.5px] text-steel">Ingredient cost is not taken off here — it shows in the tiles above. GST paid on expenses: {formatINR(Number(x.net.expense_gst))} (may come back as input credit).</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-payments>
          <div className={h3}><ReceiptText size={18} aria-hidden /> How guests paid</div>
          {x.payments.length === 0 ? <p className="text-sm text-steel">No paid bills in this period.</p> : <div className="space-y-2.5">
            {x.payments.map((p) => (
              <div key={p.method} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-[14px]"><span className="font-bold">{METHOD[p.method] ?? p.method} <span className="font-normal text-steel">· {p.count}</span></span><span className="num font-bold">{formatINR(Number(p.amount))}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-tint)]" style={{ width: `${(Number(p.amount) / payTotal) * 100}%` }} /></div>
              </div>))}
          </div>}
        </Card>
        <Card data-staff>
          <div className={h3}><Users size={18} aria-hidden /> Sales by staff <span className="text-[12px] font-semibold text-steel">who took the order</span></div>
          {x.staff.length === 0 ? <p className="text-sm text-steel">No paid bills in this period.</p> : <div className="space-y-2.5">
            {x.staff.map((s) => (
              <div key={s.name} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-[14px]"><span className="font-bold truncate">{s.name} <span className="font-normal text-steel">· {s.bills} bill{Number(s.bills) === 1 ? "" : "s"}</span></span><span className="num font-bold shrink-0">{formatINR(Number(s.amount))}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-blue)]" style={{ width: `${(Number(s.amount) / staffMax) * 100}%` }} /></div>
              </div>))}
          </div>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card data-items>
          <div className={h3}><Utensils size={18} aria-hidden /> Every dish sold <span className="text-[12px] font-semibold text-steel num">{x.items.length}</span></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-steel text-xs"><th className="py-1.5 font-semibold">Dish</th><th className="py-1.5 font-semibold text-right">Qty</th><th className="py-1.5 font-semibold text-right">Amount</th></tr></thead>
            <tbody>{items.map((i) => <tr key={i.name + (i.variant ?? "")} className="border-t border-line"><td className="py-2 pr-2">{i.name}{i.variant && <span className="text-steel"> · {i.variant}</span>}</td><td className="py-2 text-right num">{i.qty}</td><td className="py-2 text-right num">{formatINR(Number(i.amount))}</td></tr>)}
              {x.items.length === 0 && <tr><td colSpan={3} className="py-4 text-steel">Nothing sold in this period.</td></tr>}</tbody></table></div>
          {x.items.length > 12 && <button type="button" className="svc-btn quiet sm w-full mt-3" onClick={() => setAllItems((v) => !v)}>{allItems ? "Show the top 12" : `Show all ${x.items.length}`}</button>}
        </Card>
        <div className="space-y-4 min-w-0">
          <Card data-taxes>
            <div className={h3}>The bill lines</div>
            <dl className="text-[14px] space-y-1.5">
              {[["Food & drink", t.gross], ["Discounts", Number(t.discount) ? -Number(t.discount) : 0], ["Service charge", t.service], ["CGST", t.cgst], ["SGST", t.sgst], ["Round off", t.round_off]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2"><dt className="text-steel">{k}</dt><dd className="num">{formatINR(Number(v))}</dd></div>))}
              <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-bold"><dt>Total · {t.bills} bills</dt><dd className="num">{formatINR(Number(t.total))}</dd></div>
            </dl>
          </Card>
          <Card data-losses>
            <div className={h3}><Ban size={18} aria-hidden /> Cancelled & voided</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[var(--color-fill)] px-3 py-2.5"><div className="text-[12px] font-bold text-steel">Lines cancelled · {x.cancelled.lines}</div><div className="num font-display text-[20px]">{formatINR(Number(x.cancelled.amount))}</div></div>
              <div className="rounded-2xl bg-[var(--color-fill)] px-3 py-2.5"><div className="text-[12px] font-bold text-steel">Bills voided · {x.voids.bills}</div><div className="num font-display text-[20px]">{formatINR(Number(x.voids.amount))}</div></div>
            </div>
            <Link href="/controls" className="mt-1 inline-flex items-center !min-h-11 text-[13px] font-semibold text-steel hover:underline">Who and why → Cash & controls</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
