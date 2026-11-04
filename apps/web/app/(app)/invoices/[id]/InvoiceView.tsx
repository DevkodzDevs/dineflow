"use client";
import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Printer, Share2, Pencil, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, Field, Pill, Sheet, PhoneInput, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { taxLabels, billTitle, SAC, COMPOSITION_NOTE } from "@dineflow/shared";
import { updateInvoiceGuest } from "../actions";
import { copyText, shareText } from "@/lib/clipboard";

type Line = { description: string; qty: number; rate: number; amount: number; gst_rate: number; gst: number; taxable?: number; sac?: string };
type Inv = { id: string; invoice_no: number; kind: string; guest_name: string | null; guest_phone: string | null; guest_gstin: string | null; lines: Line[]; subtotal: number; discount: number; cgst: number; sgst: number; round_off: number; total: number; paid: number; payments: { description: string; amount: number; at: string }[]; status: string; issued_at: string; bookings: { booking_no: number; check_in: string; check_out: string; rooms: { number: string } | null } | null };
type Rest = { name: string; address: string | null; phone: string | null; gstin: string | null; legal_name?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; fssai_no?: string | null };

export function InvoiceView({ inv, restaurant, cashier }: { inv: Inv; restaurant: Rest; cashier: string }) {
  const [edit, setEdit] = useState(false); const [pending, start] = useTransition();
  /* the Print button on the invoices list links straight here with ?print=1 */
  const sp = useSearchParams();
  useEffect(() => { if (sp.get("print") !== "1") return; const t = setTimeout(() => window.print(), 500); return () => clearTimeout(t); }, [sp]);
  /* 2026-11-04, the owner: after Check out the invoice opens with Print in plain view, and once it is printed the way back to the
     front desk is the next thing to press. ?done=checkout is what the folio's Check out lands on. */
  const done = sp.get("done") === "checkout";
  const [printed, setPrinted] = useState(false);
  useEffect(() => { const on = () => setPrinted(true); window.addEventListener("afterprint", on); return () => window.removeEventListener("afterprint", on); }, []);
  const stay = inv.kind === "stay";
  const back = stay ? { href: "/frontdesk", label: "Front desk" } : { href: "/invoices", label: "Invoices" };
  const no = `INV-${String(inv.invoice_no).padStart(5, "0")}`;
  const lab = taxLabels(restaurant.gst_state_code), comp = restaurant.gst_scheme === "composition";
  const title = billTitle(restaurant.gst_scheme, restaurant.gstin, true);
  const sac = inv.kind === "stay" ? SAC.accommodation : SAC.restaurant;
  // 0100: lines carry their taxable value after the discount (`taxable`) and their SAC; an older invoice has
  // neither, and its amount stands in
  const gstGroups = Object.values(inv.lines.reduce((m, l) => { const k = `${l.gst_rate}|${l.sac ?? ""}`; (m[k] ??= { rate: l.gst_rate, sac: l.sac ?? null, taxable: 0, gst: 0 }); m[k].taxable += Number(l.taxable ?? l.amount); m[k].gst += Number(l.gst); return m; }, {} as Record<string, { rate: number; sac: string | null; taxable: number; gst: number }>));
  const toast = useToast();
  const share = async () => { const text = `${restaurant.name} · ${no} · ${formatINR(Number(inv.total))} · ${window.location.href}`; const shared = await shareText({ title: no, text }); if (shared === "unavailable") toast(await copyText(text) ? "Link copied" : "Couldn't copy the link"); };
  return (
    <div className="max-w-3xl mx-auto">
      <Link href={back.href} className="no-print inline-flex items-center gap-1.5 min-h-10 [@media(pointer:coarse)]:min-h-11 pl-2.5 pr-3.5 mb-4 rounded-full text-[13.5px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors" data-inv-back><ArrowLeft size={16} aria-hidden /> {back.label}</Link>
      {done && (
        <div className="no-print mb-5 rounded-[22px] p-4 sm:p-5 flex flex-wrap items-center gap-3 sm:gap-4 bg-[color-mix(in_srgb,var(--color-green)_11%,var(--color-bg-2))] border border-[color-mix(in_srgb,var(--color-green)_30%,transparent)]" data-checkout-done role="status">
          <span className="h-11 w-11 shrink-0 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--color-green)_18%,transparent)] text-[var(--color-green)]"><CheckCircle2 size={22} aria-hidden /></span>
          <div className="min-w-0 flex-1 basis-48">
            <div className="text-[16px] font-bold leading-tight">{printed ? "Invoice printed" : "Checked out"}{inv.bookings?.rooms?.number ? ` · Room ${inv.bookings.rooms.number}` : ""}</div>
            <div className="text-[13px] text-[var(--color-label-2)]">{printed ? "Back to the desk when you are done" : `${no} is ready to print`}</div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {printed
              ? <><Button variant="outline" onClick={() => window.print()} data-done-print><Printer size={16} /> Print again</Button><Link href={back.href} className="btn btn-filled min-h-11 px-5 rounded-full inline-flex items-center justify-center gap-2 font-semibold" data-done-back><ArrowLeft size={16} aria-hidden /> Back to {back.label}</Link></>
              : <><Link href={back.href} className="min-h-11 px-4 rounded-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" data-done-back><ArrowLeft size={16} aria-hidden /> {back.label}</Link><Button size="lg" onClick={() => window.print()} data-done-print><Printer size={17} /> Print invoice</Button></>}
          </div>
        </div>
      )}
      <div className="no-print flex items-center gap-3 mb-6">
        <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{inv.kind} invoice</div><h1 className="text-3xl num">{no}</h1></div>
        <Pill tone={inv.status === "paid" ? "ready" : "alert"}>{inv.status}</Pill>
        <div className="ml-auto page-actions"><Button variant="outline" onClick={() => setEdit(true)}><Pencil size={15} /> Guest / GSTIN</Button><Button variant="outline" onClick={share}><Share2 size={15} /> Share</Button><Button onClick={() => window.print()}><Printer size={15} /> Print</Button></div>
      </div>
      {/* the paper that prints — alone (data-print-root, globals.css) */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="feather p-8 print:border-0 print:shadow-none" data-print-root>
        <div className="flex justify-between gap-6 flex-wrap">
          <div><div className="font-display text-2xl">{restaurant.name}</div>{restaurant.address && <div className="text-sm text-steel">{restaurant.address}</div>}{restaurant.phone && <div className="text-sm text-steel">{restaurant.phone}</div>}{restaurant.legal_name && restaurant.legal_name !== restaurant.name && <div className="text-sm text-steel">{restaurant.legal_name}</div>}{restaurant.gstin && <div className="text-sm num mt-1">GSTIN {restaurant.gstin}</div>}{restaurant.fssai_no && <div className="text-xs num text-steel">FSSAI {restaurant.fssai_no}</div>}</div>
          <div className="text-right"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{title}</div><div className="font-display text-3xl num">{no}</div><div className="text-sm num text-steel">{new Date(inv.issued_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
        </div>
        <div className="hairline-gold my-6" />
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-steel">Billed to</div><div className="font-semibold mt-1">{inv.guest_name ?? "Walk-in guest"}</div>{inv.guest_phone && <div className="text-steel">{inv.guest_phone}</div>}{inv.guest_gstin && <div className="num">GSTIN {inv.guest_gstin}</div>}</div>
          {inv.bookings && <div className="sm:text-right"><div className="text-xs font-semibold uppercase tracking-wide text-steel">Stay</div><div className="font-semibold mt-1">Room {inv.bookings.rooms?.number} · booking #{inv.bookings.booking_no}</div><div className="num text-steel">{inv.bookings.check_in} → {inv.bookings.check_out}</div></div>}
        </div>
        <div className="mt-4 text-xs text-steel tabular-nums">SAC {sac} · {inv.kind === "stay" ? "Accommodation services" : "Restaurant services"}{lab.stateName && <> · Place of supply: {lab.stateName} ({restaurant.gst_state_code})</>} · Reverse charge: No</div>
        <div className="table-wrap"><table className="w-full text-sm mt-4"><thead className="text-xs uppercase tracking-wide text-steel border-b border-line"><tr><th className="text-left py-2">Description</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Rate</th><th className="text-right py-2">GST</th><th className="text-right py-2">Amount</th></tr></thead>
          <tbody>{inv.lines.map((l, i) => <tr key={i} className="border-b border-line/60"><td className="py-2.5">{l.description}</td><td className="py-2.5 text-right num">{Number(l.qty)}</td><td className="py-2.5 text-right num">{Number(l.rate).toFixed(2)}</td><td className="py-2.5 text-right num text-steel">{Number(l.gst_rate)}%</td><td className="py-2.5 text-right num">{Number(l.amount).toFixed(2)}</td></tr>)}</tbody></table></div>
        <div className="mt-4 grid sm:grid-cols-[minmax(0,1fr)_280px] gap-6">
          <div className="text-xs text-steel"><div className="font-semibold uppercase tracking-wide mb-1">GST summary</div>{gstGroups.map((g) => <div key={`${g.rate}|${g.sac ?? ""}`} className="flex justify-between num"><span>{g.sac && inv.kind === "stay" ? `SAC ${g.sac} · ` : ""}{g.rate}% on {g.taxable.toFixed(2)}</span><span>{lab.central} @ {g.rate / 2}% {(g.gst / 2).toFixed(2)} + {lab.state} @ {g.rate / 2}% {(g.gst / 2).toFixed(2)}</span></div>)}
            {inv.payments.length > 0 && <><div className="font-semibold uppercase tracking-wide mt-3 mb-1">Payments</div>{inv.payments.map((p, i) => <div key={i} className="flex justify-between num"><span>{p.description}</span><span>{Number(p.amount).toFixed(2)}</span></div>)}</>}</div>
          <div className="text-sm space-y-1 num"><Row k="Subtotal" v={inv.subtotal} />{Number(inv.discount) > 0 && <Row k="Discount" v={-inv.discount} />}{(!comp || Number(inv.cgst) > 0) && <Row k={lab.central} v={inv.cgst} />}{(!comp || Number(inv.sgst) > 0) && <Row k={lab.state} v={inv.sgst} />}{Number(inv.round_off) !== 0 && <Row k="Round off" v={inv.round_off} />}<div className="flex justify-between text-xl font-bold border-t border-ink pt-2 mt-2"><span>Total</span><span>{formatINR(Number(inv.total))}</span></div><Row k="Paid" v={inv.paid} /><div className={`flex justify-between font-semibold ${Number(inv.total) - Number(inv.paid) > 0.01 ? "text-chili" : "text-mint"}`}><span>Balance</span><span>{formatINR(Math.max(0, Number(inv.total) - Number(inv.paid)))}</span></div></div>
        </div>
        {comp && <div className="mt-6 text-xs font-semibold">{COMPOSITION_NOTE}</div>}
        <div className="mt-8 flex justify-between text-xs text-steel"><span>Issued by {cashier}</span><span>Thank you — {restaurant.name}</span></div>
      </motion.div>
      <Sheet open={edit} onClose={() => setEdit(false)} title="Guest details">
        <form className="space-y-4" action={(fd) => start(async () => { const r = await updateInvoiceGuest(inv.id, { name: String(fd.get("name")), phone: String(fd.get("phone")), gstin: String(fd.get("gstin")) }); if ("error" in r) return void toast(r.error!, "err"); setEdit(false); })}>
          <Field label="Name"><input name="name" defaultValue={inv.guest_name ?? ""} /></Field><Field label="Phone"><PhoneInput name="phone" defaultValue={inv.guest_phone ?? ""} /></Field><Field label="Guest GSTIN (B2B)"><input name="gstin" className="num uppercase" defaultValue={inv.guest_gstin ?? ""} /></Field>
          <Button className="w-full" disabled={pending}>Save</Button></form>
      </Sheet>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: number }) => <div className="flex justify-between"><span className="text-steel">{k}</span><span>{Number(v).toFixed(2)}</span></div>;
