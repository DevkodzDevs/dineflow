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
/** "2026-09" for the month an instant falls in, counted in the only timezone this app bills in. */
const monthKey = (iso: string | Date) => new Date(new Date(iso).getTime() + IST).toISOString().slice(0, 7);

export default async function Invoices({ searchParams }: { searchParams: Promise<{ days?: string; kind?: string }> }) {
  const { days = "30", kind } = await searchParams;
  const n = Math.min(365, Math.max(1, Number(days)));
  const s = await createClient();

  const cols = "id, invoice_no, kind, guest_name, guest_phone, total, paid, subtotal, discount, cgst, sgst, status, issued_at, lines";
  let q = s.from("invoices").select(cols)
    .gte("issued_at", new Date(Date.now() - n * 86400000).toISOString())
    .order("issued_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);

  // six months of totals for the strip, regardless of which window the table is showing
  const from = new Date(Date.now() + IST); from.setUTCDate(1); from.setUTCMonth(from.getUTCMonth() - 5); from.setUTCHours(0, 0, 0, 0);
  const history = s.from("invoices").select("issued_at, total").gte("issued_at", new Date(from.getTime() - IST).toISOString());

  // both queries leave together; the page waits once rather than twice
  const [session, { data: inv }, { data: hist }] = await Promise.all([requireSession(), q, history]);

  const months: Month[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.now() + IST); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), total: 0, count: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const h of hist ?? []) { const m = byKey.get(monthKey(h.issued_at)); if (m) { m.total += Number(h.total); m.count += 1; } }

  const rows = (inv ?? []) as unknown as Invoice[];
  const total = rows.reduce((t, i) => t + Number(i.total), 0);
  const gst = rows.reduce((t, i) => t + Number(i.cgst) + Number(i.sgst), 0);
  const outstanding = rows.filter((i) => i.status === "due").reduce((t, i) => t + Number(i.total) - Number(i.paid), 0);

  return (
    <>
      <PageHeader eyebrow="Numbered GST tax invoices" title="Invoices" accent="& tax" sub="Stay invoices combine room, food, spa and extras. Dining invoices come from paid bills." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile label={`Invoiced · ${n} days`} value={formatINR(total)} sub={`${rows.length} invoices`} />
        <StatTile label="GST collected" value={formatINR(gst)} sub="CGST + SGST" delay={0.05} />
        <StatTile label="Stay invoices" value={String(rows.filter((i) => i.kind === "stay").length)} delay={0.1} />
        <StatTile label="Outstanding" value={formatINR(outstanding)} tone={outstanding > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[["", "All"], ["stay", "Stay"], ["dining", "Dining"]].map(([k, l]) => (
          <Link key={k} href={`/invoices?days=${n}${k ? `&kind=${k}` : ""}`} className={`chip ${(kind ?? "") === k ? "on" : ""}`}>{l}</Link>
        ))}
        <span className="ml-auto flex gap-2">
          {[7, 30, 90, 365].map((d) => <Link key={d} href={`/invoices?days=${d}${kind ? `&kind=${kind}` : ""}`} className={`chip ${n === d ? "on" : ""}`}>{d}d</Link>)}
        </span>
      </div>
      {!rows.length
        ? <Empty title="No invoices yet" hint="Check a guest out, or open a paid bill and press Tax invoice." />
        : <InvoicesClient invoices={rows} months={months} property={session.restaurant.name} />}
    </>
  );
}
