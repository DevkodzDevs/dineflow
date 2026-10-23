import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { Empty, StatTile } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { InvoicesClient, type Invoice, type Month } from "./InvoicesClient";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const IST = 5.5 * 3600 * 1000;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ days?: string; kind?: string }> }) {
  const { days = "30", kind } = await searchParams;
  const n = Math.min(365, Math.max(1, Number(days)));
  const s = await createClient();

  const cols = "id, invoice_no, kind, guest_name, guest_phone, total, paid, subtotal, discount, cgst, sgst, status, issued_at, lines";
  /* The list is the latest SHOWN invoices; the figures come from invoice_summary (0089), counted by
     the database over the whole window. Adding the rows up here was wrong past 1000 invoices —
     PostgREST stops there — and slower every month until then. */
  const SHOWN = 300;
  let q = s.from("invoices").select(cols)
    .gte("issued_at", new Date(Date.now() - n * 86400000).toISOString())
    .order("issued_at", { ascending: false }).limit(SHOWN);
  if (kind) q = q.eq("kind", kind);
  const summary = s.rpc("invoice_summary", { p_days: n, p_kind: kind ?? null });

  // both queries leave together; the page waits once rather than twice
  const [session, { data: inv }, { data: sum }] = await Promise.all([requireSession(), q, summary]);
  type Sum = { count: number; total: number; gst: number; stay: number; outstanding: number; months: { key: string; total: number; count: number }[] };
  const fig = (sum ?? null) as Sum | null;

  const months: Month[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.now() + IST); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), total: 0, count: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const h of fig?.months ?? []) { const m = byKey.get(h.key); if (m) { m.total = Number(h.total); m.count = Number(h.count); } }

  const rows = (inv ?? []) as unknown as Invoice[];
  // the database's figures; if the summary could not be had, the rows on screen are the fallback
  const total = fig ? Number(fig.total) : rows.reduce((t, i) => t + Number(i.total), 0);
  const gst = fig ? Number(fig.gst) : rows.reduce((t, i) => t + Number(i.cgst) + Number(i.sgst), 0);
  const outstanding = fig ? Number(fig.outstanding) : rows.filter((i) => i.status === "due").reduce((t, i) => t + Number(i.total) - Number(i.paid), 0);
  const count = fig ? Number(fig.count) : rows.length;
  const stays = fig ? Number(fig.stay) : rows.filter((i) => i.kind === "stay").length;

  return (
    <>
      <PageHeader eyebrow="Numbered GST tax invoices" title="Invoices" accent="& tax" sub="From stays and paid bills" />
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-4">
        <StatTile label={`Invoiced · ${n} days`} value={formatINR(total)} sub={`${count} invoices`} />
        <StatTile label="GST collected" value={formatINR(gst)} sub="CGST + SGST" delay={0.05} />
        <StatTile label="Stay invoices" value={String(stays)} delay={0.1} />
        <StatTile label="Outstanding" value={formatINR(outstanding)} tone={outstanding > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      {/* Phone: what and when as two even segmented rows — the chips wrapped into a ragged pair of lines
          with the date range pushed to the right on its own. sm and up keep the chips. */}
      <div className="sm:hidden space-y-2 mb-4">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[var(--color-fill)]" role="group" aria-label="Kind">
          {[["", "All"], ["stay", "Stay"], ["dining", "Dining"]].map(([k, l]) => { const on = (kind ?? "") === k; return (
            <Link key={k} href={`/invoices?days=${n}${k ? `&kind=${k}` : ""}`} aria-current={on ? "page" : undefined}
              className={`h-11 rounded-xl grid place-items-center text-[14px] font-semibold transition-colors ${on ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "text-[var(--color-label-2)]"}`}>{l}</Link>); })}
        </div>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--color-fill)]" role="group" aria-label="Period">
          {[7, 30, 90, 365].map((d) => { const on = n === d; return (
            <Link key={d} href={`/invoices?days=${d}${kind ? `&kind=${kind}` : ""}`} aria-current={on ? "page" : undefined}
              className={`h-11 rounded-xl grid place-items-center num text-[14px] font-semibold transition-colors ${on ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "text-[var(--color-label-2)]"}`}>{d === 365 ? "1 yr" : `${d} days`}</Link>); })}
        </div>
      </div>
      <div className="hidden sm:flex flex-wrap gap-2 mb-4">
        {[["", "All"], ["stay", "Stay"], ["dining", "Dining"]].map(([k, l]) => (
          <Link key={k} href={`/invoices?days=${n}${k ? `&kind=${k}` : ""}`} className={`chip ${(kind ?? "") === k ? "on" : ""}`}>{l}</Link>
        ))}
        <span className="ml-auto flex gap-2">
          {[7, 30, 90, 365].map((d) => <Link key={d} href={`/invoices?days=${d}${kind ? `&kind=${kind}` : ""}`} className={`chip ${n === d ? "on" : ""}`}>{d}d</Link>)}
        </span>
      </div>
      {!rows.length
        ? <Empty title="No invoices yet" hint="From check-out or a paid bill" />
        : <>
            {count > rows.length && <p className="footnote mb-3" data-shown>Showing {rows.length} of {count} · totals count all {count}.</p>}
            <InvoicesClient invoices={rows} months={months} property={session.restaurant.name} />
          </>}
    </>
  );
}
