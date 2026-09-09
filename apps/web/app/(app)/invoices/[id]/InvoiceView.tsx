"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, Printer, Share2, Pencil } from "lucide-react";
import { Button, Field, Pill, Sheet } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { updateInvoiceGuest } from "../actions";

type Line = { description: string; qty: number; rate: number; amount: number; gst_rate: number; gst: number };
type Inv = { id: string; invoice_no: number; kind: string; guest_name: string | null; guest_phone: string | null; guest_gstin: string | null; lines: Line[]; subtotal: number; discount: number; cgst: number; sgst: number; round_off: number; total: number; paid: number; payments: { description: string; amount: number; at: string }[]; status: string; issued_at: string; bookings: { booking_no: number; check_in: string; check_out: string; rooms: { number: string } | null } | null };
type Rest = { name: string; address: string | null; phone: string | null; gstin: string | null };

export function InvoiceView({ inv, restaurant, cashier }: { inv: Inv; restaurant: Rest; cashier: string }) {
  const [edit, setEdit] = useState(false); const [pending, start] = useTransition();
  const no = `INV-${String(inv.invoice_no).padStart(5, "0")}`;
  const gstGroups = Object.values(inv.lines.reduce((m, l) => { const k = String(l.gst_rate); (m[k] ??= { rate: l.gst_rate, taxable: 0, gst: 0 }); m[k].taxable += Number(l.amount); m[k].gst += Number(l.gst); return m; }, {} as Record<string, { rate: number; taxable: number; gst: number }>));
  const share = async () => { const text = `${restaurant.name} · ${no} · ${formatINR(Number(inv.total))} · ${window.location.href}`; if (navigator.share) await navigator.share({ title: no, text }); else { await navigator.clipboard.writeText(text); alert("Link copied"); } };
  return (
    <div className="max-w-3xl mx-auto">
      <div className="no-print flex items-center gap-3 mb-6">
        <Link href="/invoices" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
        <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{inv.kind} invoice</div><h1 className="text-3xl num">{no}</h1></div>
        <Pill tone={inv.status === "paid" ? "ready" : "alert"}>{inv.status}</Pill>
        <div className="ml-auto page-actions"><Button variant="outline" onClick={() => setEdit(true)}><Pencil size={15} /> Guest / GSTIN</Button><Button variant="outline" onClick={share}><Share2 size={15} /> Share</Button><Button onClick={() => window.print()}><Printer size={15} /> Print</Button></div>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="feather p-8 print:border-0 print:shadow-none">
        <div className="flex justify-between gap-6 flex-wrap">
          <div><div className="font-display text-2xl">{restaurant.name}</div>{restaurant.address && <div className="text-sm text-steel">{restaurant.address}</div>}{restaurant.phone && <div className="text-sm text-steel">{restaurant.phone}</div>}{restaurant.gstin && <div className="text-sm num mt-1">GSTIN {restaurant.gstin}</div>}</div>
          <div className="text-right"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Tax invoice</div><div className="font-display text-3xl num">{no}</div><div className="text-sm num text-steel">{new Date(inv.issued_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
        </div>
        <div className="hairline-gold my-6" />
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-steel">Billed to</div><div className="font-semibold mt-1">{inv.guest_name ?? "Walk-in guest"}</div>{inv.guest_phone && <div className="text-steel">{inv.guest_phone}</div>}{inv.guest_gstin && <div className="num">GSTIN {inv.guest_gstin}</div>}</div>
          {inv.bookings && <div className="sm:text-right"><div className="text-xs font-semibold uppercase tracking-wide text-steel">Stay</div><div className="font-semibold mt-1">Room {inv.bookings.rooms?.number} · booking #{inv.bookings.booking_no}</div><div className="num text-steel">{inv.bookings.check_in} → {inv.bookings.check_out}</div></div>}
        </div>
        <div className="table-wrap"><table className="w-full text-sm mt-6"><thead className="text-xs uppercase tracking-wide text-steel border-b border-line"><tr><th className="text-left py-2">Description</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Rate</th><th className="text-right py-2">GST</th><th className="text-right py-2">Amount</th></tr></thead>
          <tbody>{inv.lines.map((l, i) => <tr key={i} className="border-b border-line/60"><td className="py-2.5">{l.description}</td><td className="py-2.5 text-right num">{Number(l.qty)}</td><td className="py-2.5 text-right num">{Number(l.rate).toFixed(2)}</td><td className="py-2.5 text-right num text-steel">{Number(l.gst_rate)}%</td><td className="py-2.5 text-right num">{Number(l.amount).toFixed(2)}</td></tr>)}</tbody></table></div>
        <div className="mt-4 grid sm:grid-cols-[1fr_280px] gap-6">
          <div className="text-xs text-steel"><div className="font-semibold uppercase tracking-wide mb-1">GST summary</div>{gstGroups.map((g) => <div key={g.rate} className="flex justify-between num"><span>{g.rate}% on {g.taxable.toFixed(2)}</span><span>CGST {(g.gst / 2).toFixed(2)} + SGST {(g.gst / 2).toFixed(2)}</span></div>)}
            {inv.payments.length > 0 && <><div className="font-semibold uppercase tracking-wide mt-3 mb-1">Payments</div>{inv.payments.map((p, i) => <div key={i} className="flex justify-between num"><span>{p.description}</span><span>{Number(p.amount).toFixed(2)}</span></div>)}</>}</div>
          <div className="text-sm space-y-1 num"><Row k="Subtotal" v={inv.subtotal} />{Number(inv.discount) > 0 && <Row k="Discount" v={-inv.discount} />}<Row k="CGST" v={inv.cgst} /><Row k="SGST" v={inv.sgst} />{Number(inv.round_off) !== 0 && <Row k="Round off" v={inv.round_off} />}<div className="flex justify-between text-xl font-bold border-t border-ink pt-2 mt-2"><span>Total</span><span>{formatINR(Number(inv.total))}</span></div><Row k="Paid" v={inv.paid} /><div className={`flex justify-between font-semibold ${Number(inv.total) - Number(inv.paid) > 0.01 ? "text-chili" : "text-mint"}`}><span>Balance</span><span>{formatINR(Math.max(0, Number(inv.total) - Number(inv.paid)))}</span></div></div>
        </div>
        <div className="mt-8 flex justify-between text-xs text-steel"><span>Issued by {cashier}</span><span>Thank you — {restaurant.name}</span></div>
      </motion.div>
      <Sheet open={edit} onClose={() => setEdit(false)} title="Guest details on invoice">
        <form className="space-y-4" action={(fd) => start(async () => { await updateInvoiceGuest(inv.id, { name: String(fd.get("name")), phone: String(fd.get("phone")), gstin: String(fd.get("gstin")) }); setEdit(false); })}>
          <Field label="Name"><input name="name" defaultValue={inv.guest_name ?? ""} /></Field><Field label="Phone"><input name="phone" defaultValue={inv.guest_phone ?? ""} /></Field><Field label="Guest GSTIN (for B2B input credit)"><input name="gstin" className="num uppercase" defaultValue={inv.guest_gstin ?? ""} /></Field>
          <Button className="w-full" disabled={pending}>Save</Button></form>
      </Sheet>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: number }) => <div className="flex justify-between"><span className="text-steel">{k}</span><span>{Number(v).toFixed(2)}</span></div>;
