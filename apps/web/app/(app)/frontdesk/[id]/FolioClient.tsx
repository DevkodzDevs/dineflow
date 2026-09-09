"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, LogIn, LogOut, Plus, Printer, UtensilsCrossed } from "lucide-react";
import { Button, Card, Field, Pill, cn } from "@/components/ui";
import { Receipt } from "@/components/receipt/Receipt";
import { formatINR, PAYMENT_METHODS, type PaymentMethod } from "@dineflow/shared";
import { checkIn, checkOut, addCharge, postOrderToRoom } from "../actions";
import { stayInvoice } from "../../invoices/actions";
import { FileText } from "lucide-react";

type B = { id: string; booking_no: number; check_in: string; check_out: string; status: string; rate: number; adults: number; children: number; source: string; notes: string | null; checked_in_at: string | null; guests: { full_name: string; phone: string | null; email: string | null; id_type: string | null; id_last4: string | null; visits: number } | null; rooms: { number: string; floor: number; room_types: { name: string } | null } | null };
type C = { id: string; kind: string; description: string; amount: number; created_at: string };
type T = { nights: number; room_total: number; extras: number; discounts: number; taxable: number; gst: number; total: number; paid: number; balance: number };
type O = { id: string; order_no: number; order_items: { qty: number; price_snapshot: number; status: string }[] };

export function FolioClient({ booking: b, charges, totals: t, openOrders, restaurant }: { booking: B; charges: C[]; totals: T; openOrders: O[]; restaurant: { name: string; gstin: string | null; address: string | null; room_gst_rate: number } }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const [pays, setPays] = useState<{ method: PaymentMethod; amount: number; ref: string }[]>([{ method: "upi", amount: Number(t?.balance ?? 0), ref: "" }]);
  const [extra, setExtra] = useState({ kind: "extra" as "extra" | "discount", description: "", amount: 0 });
  const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const tone = b.status === "checked_in" ? "ready" : b.status === "reserved" ? "gold" : "served";
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="no-print">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/frontdesk" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
          <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Booking #{b.booking_no} · {b.source?.replace("_", " ")}</div><h1 className="text-3xl">Room {b.rooms?.number} <em>{b.guests?.full_name}</em></h1></div>
          <Pill tone={tone}>{b.status.replace("_", " ")}</Pill>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel">Guest</div><div className="mt-2 font-semibold text-lg">{b.guests?.full_name}</div><div className="text-sm text-steel">{b.guests?.phone}{b.guests?.email ? ` · ${b.guests.email}` : ""}</div><div className="text-xs text-steel mt-1">{b.guests?.id_type} ••••{b.guests?.id_last4} · {b.guests?.visits} visit{b.guests?.visits === 1 ? "" : "s"}</div></Card>
          <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel">Stay</div><div className="mt-2 font-semibold text-lg num">{b.check_in} → {b.check_out}</div><div className="text-sm text-steel">{t?.nights} night{t?.nights === 1 ? "" : "s"} · {b.rooms?.room_types?.name} · {b.adults} adult{b.adults > 1 ? "s" : ""}{b.children ? `, ${b.children} child` : ""}</div>{b.notes && <div className="text-xs text-steel mt-1">{b.notes}</div>}</Card>
        </div>
        {b.status === "reserved" && <Button size="lg" className="mt-4 w-full sm:w-auto" disabled={pending} onClick={() => start(async () => { const r = await checkIn(b.id); if ("error" in r) setErr(r.error!); })}><LogIn size={16} /> Check in guest</Button>}
        {b.status === "checked_in" && (
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <Card><h3 className="text-lg mb-3">Add to folio</h3>
              <div className="space-y-3"><div className="flex gap-1 p-1 bg-porcelain-2 rounded-xl">{(["extra", "discount"] as const).map((k) => <button key={k} onClick={() => setExtra({ ...extra, kind: k })} className={cn("flex-1 h-8 rounded-lg text-xs font-semibold capitalize", extra.kind === k ? "bg-card shadow-feather" : "text-steel")}>{k}</button>)}</div>
                <input placeholder={extra.kind === "extra" ? "Laundry, minibar, airport drop…" : "Reason for discount"} value={extra.description} onChange={(e) => setExtra({ ...extra, description: e.target.value })} />
                <input type="number" className="num" placeholder="Amount" value={extra.amount || ""} onChange={(e) => setExtra({ ...extra, amount: Number(e.target.value) })} />
                <Button variant="outline" className="w-full" disabled={pending || !extra.description || !extra.amount} onClick={() => start(async () => { await addCharge(b.id, extra.kind, extra.description, extra.amount); setExtra({ kind: "extra", description: "", amount: 0 }); })}><Plus size={15} /> Post</Button></div></Card>
            <Card><h3 className="text-lg mb-3 flex items-center gap-2"><UtensilsCrossed size={16} /> Charge a restaurant order</h3>
              {openOrders.length === 0 ? <p className="text-sm text-steel">No open restaurant orders. Room-service orders placed from the POS appear here.</p> : (
                <ul className="space-y-2">{openOrders.map((o) => { const amt = o.order_items.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.qty * Number(i.price_snapshot), 0); return <li key={o.id} className="flex items-center justify-between text-sm"><span>Order #{o.order_no} · <span className="num">{formatINR(amt)}</span></span><Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await postOrderToRoom(o.id, b.id); if ("error" in r) setErr(r.error!); })}>Post to room</Button></li>; })}</ul>
              )}</Card>
          </div>
        )}
        {b.status === "checked_in" && (
          <Card className="mt-4"><div className="flex items-center justify-between"><h3 className="text-lg">Check out · settle everything</h3><span className="num font-semibold">{formatINR(Number(t.balance))}</span></div>
            <div className="mt-3 space-y-2">{pays.map((p, i) => <div key={i} className="grid grid-cols-[110px_1fr_1fr] gap-2"><select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select><input type="number" className="num" value={p.amount || ""} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} /><input placeholder="Ref" value={p.ref} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} /></div>)}
              <Button size="sm" variant="outline" onClick={() => setPays([...pays, { method: "cash", amount: Math.max(0, Number(t.balance) - paid), ref: "" }])}><Plus size={14} /> Split</Button></div>
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" variant="ink" className="w-full mt-4" disabled={pending || paid + 0.01 < Number(t.balance)} onClick={() => { if (confirm("Check out and mark room for cleaning?")) start(async () => { const r = await checkOut(b.id, pays); if ("error" in r) setErr(r.error!); else router.push(r.invoiceId ? `/invoices/${r.invoiceId}` : "/frontdesk"); }); }}><LogOut size={16} /> Check out & issue final invoice</Button><p className="text-xs text-steel mt-2">One tax invoice: room nights, restaurant orders, spa/activities, extras, advance and payments — printable and shareable.</p></Card>
        )}
        {b.status === "checked_out" && <div className="mt-4 flex gap-2"><Button disabled={pending} onClick={() => start(async () => { const r = await stayInvoice(b.id); if ("id" in r) router.push(`/invoices/${r.id}`); })}><FileText size={16} /> Final tax invoice</Button><Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print folio</Button></div>}
      </div>

      {/* folio */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full justify-self-center">
        <Receipt data={{ restaurant, title: "Guest folio", no: `FOLIO-${String(b.booking_no).padStart(4, "0")}`,
          when: `${b.check_in} → ${b.check_out}`, where: `Room ${b.rooms?.number ?? ""}`, cashier: b.guests?.full_name,
          lines: [{ name: `Room · ${t?.nights ?? 1} night${(t?.nights ?? 1) > 1 ? "s" : ""}`, qty: t?.nights ?? 1, price: Number(b.rate) },
            ...charges.filter((c) => !(c.kind === "discount")).map((c) => ({ name: c.description, qty: 1, price: Number(c.amount) }))],
          subtotal: Number(t?.room_total ?? 0) + Number(t?.extras ?? 0), discount: Number(t?.discounts ?? 0),
          cgst: Number(t?.gst ?? 0) / 2, sgst: Number(t?.gst ?? 0) / 2, total: Number(t?.total ?? 0),
          payments: charges.filter((c) => c.description === "Advance received" || c.description.startsWith("Payment ·")).map((c) => ({ method: c.description, amount: -Number(c.amount) })),
          balance: Number(t?.balance ?? 0), footer: "We hope you enjoyed your stay" }} className="mx-auto" />
      </motion.div>
    </div>
  );
}
