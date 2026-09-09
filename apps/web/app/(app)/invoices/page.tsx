import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Empty, Pill, StatTile } from "@/components/ui";
import { formatINR } from "@/lib/format";
export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";
export default async function Invoices({ searchParams }: { searchParams: Promise<{ days?: string; kind?: string }> }) {
  const { days = "30", kind } = await searchParams; const n = Math.min(365, Math.max(1, Number(days)));
  const s = await createClient();
  let q = s.from("invoices").select("id, invoice_no, kind, guest_name, total, paid, status, issued_at, cgst, sgst").gte("issued_at", new Date(Date.now() - n * 86400000).toISOString()).order("issued_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data: inv } = await q;
  const total = (inv ?? []).reduce((t, i) => t + Number(i.total), 0); const gst = (inv ?? []).reduce((t, i) => t + Number(i.cgst) + Number(i.sgst), 0);
  return (
    <>
      <PageHeader eyebrow="Numbered GST tax invoices" title="Invoices" accent="& tax" sub="Stay invoices combine room, food, spa and extras. Dining invoices come from paid bills." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label={`Invoiced · ${n} days`} value={formatINR(total)} sub={`${inv?.length ?? 0} invoices`} /><StatTile label="GST collected" value={formatINR(gst)} sub="CGST + SGST" delay={0.05} />
        <StatTile label="Stay invoices" value={String((inv ?? []).filter((i) => i.kind === "stay").length)} delay={0.1} /><StatTile label="Outstanding" value={formatINR((inv ?? []).filter((i) => i.status === "due").reduce((t, i) => t + Number(i.total) - Number(i.paid), 0))} tone={(inv ?? []).some((i) => i.status === "due") ? "alert" : "good"} delay={0.15} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">{[["", "All"], ["stay", "Stay"], ["dining", "Dining"]].map(([k, l]) => <Link key={k} href={`/invoices?days=${n}${k ? `&kind=${k}` : ""}`} className={`chip ${(kind ?? "") === k ? "on" : ""}`}>{l}</Link>)}<span className="ml-auto flex gap-2">{[7, 30, 90, 365].map((d) => <Link key={d} href={`/invoices?days=${d}${kind ? `&kind=${kind}` : ""}`} className={`chip ${n === d ? "on" : ""}`}>{d}d</Link>)}</span></div>
      {!inv?.length ? <Empty title="No invoices yet" hint="Check a guest out, or open a paid bill and press Tax invoice." /> : (
        <div className="feather overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[640px]"><thead><tr><th className="text-left px-4 py-3">No.</th><th className="text-left px-4 py-3">Kind</th><th className="text-left px-4 py-3">Guest</th><th className="text-right px-4 py-3">Total</th><th className="text-left px-4 py-3">Status</th><th className="text-right px-4 py-3">Issued</th></tr></thead>
          <tbody>{inv.map((i) => <tr key={i.id} className=""><td className="px-4 py-3 num font-semibold"><Link href={`/invoices/${i.id}`} className="underline">INV-{String(i.invoice_no).padStart(5, "0")}</Link></td><td className="px-4 py-3"><Pill tone={i.kind === "stay" ? "gold" : "preparing"}>{i.kind}</Pill></td><td className="px-4 py-3">{i.guest_name ?? "Walk-in"}</td><td className="px-4 py-3 text-right num font-semibold">{formatINR(Number(i.total))}</td><td className="px-4 py-3"><Pill tone={i.status === "paid" ? "ready" : "alert"}>{i.status}</Pill></td><td className="px-4 py-3 text-right num text-steel">{new Date(i.issued_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
