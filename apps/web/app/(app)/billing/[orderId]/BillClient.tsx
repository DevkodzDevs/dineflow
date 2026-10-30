"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Printer, Plus, Trash2, QrCode, Smartphone, Timer, MessageCircle, Ticket as TicketIcon, UserRound, Coins, Copy, Check, ExternalLink, X, Package, Undo2, Percent, ChevronDown } from "lucide-react";
import { Button, Field, Card, cn, Pill } from "@/components/ui";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { computeBill, formatINR, PAYMENT_METHODS, billTitle, SAC, gstCollectable, lineExtras, type PaymentMethod, type TaxLine } from "@dineflow/shared";
import { RefundSheet } from "./RefundSheet";
import { generateBill, settleBill, voidBill, lookupCustomer, checkCoupon, type Customer, type Coupon } from "../actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import { PrinterOutput } from "@/components/receipt/PrinterOutput";
import type { ReceiptData } from "@/components/receipt/Receipt";
import { QR, qrDataUrl } from "@/components/QR";
import { useLive } from "@/lib/useLive";
import { upiUri, validVpa } from "@/lib/upi";
import { copyText } from "@/lib/clipboard";
import { postOrderToRoom } from "../../frontdesk/actions";
import { BedDouble, FileText } from "lucide-react";
import { diningInvoice } from "../../invoices/actions";

type Item = { id: string; name_snapshot: string; qty: number; price_snapshot: number; gst_rate?: number | null; status: string; notes?: string | null; addons?: { name: string; price: number }[] | null; components?: { name: string; qty: number }[] | null };
type Order = { id: string; order_no: number; status: string; type: string; customer_name: string | null; customer_phone?: string | null; created_at: string; promised_at?: string | null; served_at?: string | null; promise_minutes?: number | null; promise_pct?: number | null; token_no?: number | null; delivery_address?: string | null; dining_tables: { name: string } | null; order_items: Item[];
  /* 0146: what an online order brought — its offer's money off, packing & delivery — and the channel it came through */
  discount_amount?: number | null; extra_charges?: number | null; offer_title?: string | null; channel_id?: string | null; order_channels?: { kind: string } | null };
type CreditNote = { id: string; cn_no: number; amount: number; taxable: number; cgst: number; sgst: number; refund_method: string; reason: string; created_at: string };
type Bill = { id: string; bill_no: number; promise_fee?: number; promise_waived?: number; promise_kept?: boolean | null; points_redeemed?: number; points_earned?: number; coupon_code?: string | null; subtotal: number; discount_pct: number; discount_amount: number; service_charge: number; cgst: number; sgst: number; round_off: number; total: number; status: string; created_at: string; paid_at: string | null; pay_token?: string | null; pay_claim_ref?: string | null; pay_claimed_at?: string | null; payments: { method: string; amount: number; ref: string | null }[];
  charges?: number | null; service_charge_on?: boolean | null; tax_lines?: TaxLine[] | null; gst_by_operator?: boolean | null; credit_notes?: CreditNote[] } | null;
type Rest = { name: string; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; legal_name?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; fssai_no?: string | null; loyalty_enabled?: boolean; loyalty_point_value?: number; loyalty_min_redeem?: number; upi_vpa?: string | null; upi_payee?: string | null };

const OPERATOR_NOTE = "GST on this supply is paid by the e-commerce operator under section 9(5) of the CGST Act.";

export function BillClient({ order, bill, restaurant, cashier, inHouse = [], billedBy = null }: { order: Order; bill: Bill; restaurant: Rest; cashier: string; inHouse?: { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null }[] ; billedBy?: string | null }) {
  const [roomFor, setRoomFor] = useState("");
  const [inv, setInv] = useState({ name: "", gstin: "" });
  const { online } = useOffline();
  const { printBill, hasPrinter, openDrawer } = usePrinters();
  const [voiding, setVoiding] = useState(false);
  const [justPrinted, setJustPrinted] = useState(false);
  const lastBillId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = bill?.id ?? null;
    const first = lastBillId.current === undefined;   // opening a bill that already exists must not re-print it
    const isNew = !first && !!id && id !== lastBillId.current;
    lastBillId.current = id;
    if (!isNew) return;
    setJustPrinted(true);
    const t = setTimeout(() => setJustPrinted(false), 2300);   // the feed lasts ~2s; re-arm for the next bill
    return () => clearTimeout(t);
  }, [bill?.id]);
  // The pay link. The QR on the bill and on this screen opens it: the guest sees the total with UPI
  // and card options. Origin is read after mount so the server and the browser render the same thing.
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);
  const payUrl = bill?.pay_token && origin ? `${origin}/pay/${bill.pay_token}` : null;
  const [qrPng, setQrPng] = useState<string | undefined>(undefined);
  useEffect(() => { let on = true; if (!payUrl) { setQrPng(undefined); return; } qrDataUrl(payUrl, 180).then((png) => { if (on) setQrPng(png); }); return () => { on = false; }; }, [payUrl]);
  useLive(["bills"], 15000);   // flips to Paid by itself when the guest pays by card, or claims a UPI payment
  // what the paper says about the business: the registration it files under, and the words the rules require
  const printRest = { name: restaurant.name, address: restaurant.address, phone: restaurant.phone, gstin: restaurant.gstin, fssai: restaurant.fssai_no ?? null, legalName: restaurant.legal_name ?? null, gstScheme: restaurant.gst_scheme ?? null, stateCode: restaurant.gst_state_code ?? null };
  const receiptData = (): ReceiptData => ({
    restaurant: printRest, title: billTitle(restaurant.gst_scheme, restaurant.gstin, bill?.status === "paid"), sac: SAC.restaurant, gstRate: printRate, no: bill ? `BILL-${String(bill.bill_no).padStart(4, "0")}` : "BILL — DRAFT",
    when: new Date(bill?.created_at ?? Date.now()).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    where: order.dining_tables?.name ? `Table ${order.dining_tables.name}` : order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery",
    cashier,
    lines: order.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, price: Number(i.price_snapshot), note: i.notes ?? null, extras: lineExtras(i) })),
    subtotal: Number(totals.subtotal ?? bill?.subtotal ?? 0), discount: Number(totals.discount ?? bill?.discount_amount ?? 0),
    service: Number(totals.serviceCharge ?? bill?.service_charge ?? 0),
    cgst: Number(totals.cgst ?? bill?.cgst ?? 0), sgst: Number(totals.sgst ?? bill?.sgst ?? 0), roundOff: Number(bill?.round_off ?? 0),
    charges: Number(totals.charges ?? 0), taxLines: shownTax, operatorNote: eco ? OPERATOR_NOTE : undefined,
    total: Number(totals.total ?? bill?.total ?? 0),
    promiseFee: Number(bill?.promise_fee ?? preview.promiseFee ?? 0),
    promiseWaived: Number(bill?.promise_waived ?? preview.promiseWaived ?? 0),
    promiseMinutes: order.promise_minutes ?? undefined,
    payments: bill?.status === "paid" ? pays.map((p) => ({ method: p.method, amount: Number(p.amount), ref: p.ref })) : undefined,
    qr: payUrl,
    copyLabel: "Customer copy",
    loyalty: bill && Number(bill.points_earned ?? 0) > 0 ? `You earned ${Math.round(Number(bill.points_earned))} points on this visit` : undefined,
    offline: !online,
  });
  const billData = () => ({ restaurant: printRest, gstRate: printRate, sac: SAC.restaurant, charges: Number(bill?.charges ?? 0), taxLines: shownTax, operatorNote: eco ? OPERATOR_NOTE : undefined, billNo: bill ? `BILL-${String(bill.bill_no).padStart(4, "0")}` : "BILL", when: new Date(bill?.created_at ?? Date.now()).toLocaleString("en-IN"), tableOrType: order.dining_tables?.name ?? `${order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery"}${order.token_no ? ` · Token ${order.token_no}` : ""}${order.delivery_address ? ` · ${order.delivery_address}` : ""}`, cashier, items: order.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, price: Number(i.price_snapshot), note: i.notes ?? null, extras: lineExtras(i) })), subtotal: Number(bill?.subtotal ?? 0), discount: Number(bill?.discount_amount ?? 0), service: Number(bill?.service_charge ?? 0), promiseFee: Number(bill?.promise_fee ?? 0), promiseWaived: Number(bill?.promise_waived ?? 0), cgst: Number(bill?.cgst ?? 0), sgst: Number(bill?.sgst ?? 0), roundOff: Number(bill?.round_off ?? 0), total: Number(bill?.total ?? 0), payments: pays.map((p) => ({ method: p.method, amount: Number(p.amount) })), offline: !online, upiQr: payUrl ?? undefined, qrPng, loyalty: bill && Number(bill.points_earned ?? 0) > 0 ? `You earned ${Math.round(Number(bill.points_earned))} points on this visit` : undefined });
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  /* A composition dealer or an unregistered business may not collect tax, so the preview must not
     show any — the bill the server raises will not have it either. */
  const taxRate = gstCollectable(restaurant.gst_scheme, restaurant.gstin) ? Number(restaurant.gst_rate) : 0;
  /* 0146. An aggregator or ONDC pays the GST on its orders (section 9(5)): none on this bill. An online order's offer and
     its packing / delivery were quoted to the guest and come with the ticket. The service charge is a switch: on at the
     till as before, off for an order placed online — that guest never saw it. */
  const eco = ["swiggy", "zomato", "ondc"].includes(order.order_channels?.kind ?? "");
  const collect = taxRate > 0 && !eco;
  const scPct = Number(restaurant.service_charge_pct);
  const [scOn, setScOn] = useState(!order.channel_id);
  const onlineOff = Number(order.discount_amount ?? 0), packing = Number(order.extra_charges ?? 0);
  const [discPct, setDiscPct] = useState(0); const [discAmt, setDiscAmt] = useState(0);
  /* Who the bill is for. A phone makes them a customer — visits, spend and points build up from
     here — and what they already hold can come off this bill. A coupon code is checked by the
     server, in words the cashier can repeat to the guest. */
  const [guest, setGuest] = useState({ phone: order.customer_phone ?? "", name: order.customer_name ?? "" });
  const [known, setKnown] = useState<Customer | null>(null);
  const [redeem, setRedeem] = useState(0);
  const [code, setCode] = useState(""); const [coupon, setCoupon] = useState<Coupon | null>(null); const [couponErr, setCouponErr] = useState<string | null>(null);
  useEffect(() => {
    if (guest.phone.replace(/\D/g, "").length < 10) { setKnown(null); setRedeem(0); return; }
    let on = true;
    lookupCustomer(guest.phone).then((r) => { if (!on || "error" in r) return; setKnown(r.customer); if (r.customer?.name) setGuest((g) => (g.name ? g : { ...g, name: r.customer!.name! })); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest.phone]);
  const pointValue = Number(known?.point_value ?? restaurant.loyalty_point_value ?? 1);
  const minRedeem = Number(known?.min_redeem ?? restaurant.loyalty_min_redeem ?? 50);
  const canRedeem = !!restaurant.loyalty_enabled && !!known && Number(known.points) >= minRedeem;
  const redeemAmt = canRedeem ? Math.min(redeem, Number(known!.points)) * pointValue : 0;
  /* which of the two folded panels are open: Guest opens by itself when the order already names someone */
  const [panel, setPanel] = useState({ discount: false, guest: !!(order.customer_phone || order.customer_name) });
  const discSummary = [discPct > 0 ? `${discPct}%` : null, discAmt > 0 ? formatINR(discAmt) : null, coupon?.code ?? null].filter(Boolean).join(" · ");
  const guestSummary = guest.name.trim() || guest.phone.trim();
  const applyCoupon = () => start(async () => { setCouponErr(null); const r = await checkCoupon(code, preview.subtotal); if ("error" in r) setCouponErr(r.error!); else setCoupon(r.coupon); });
  // a WhatsApp link to the guest with the message typed: the pay link before, the receipt after
  const waPhone = (guest.phone || order.customer_phone || "").replace(/\D/g, "").slice(-10);
  const waHref = (text: string) => `https://wa.me/${waPhone.length === 10 ? "91" + waPhone : waPhone}?text=${encodeURIComponent(text)}`;
  /* The on-time promise. The system's own reading comes first: a recorded delivery settled against
     the deadline. With no delivery recorded the promise stands — a bill raised long after a quiet
     lunch must not hand back the food because nobody tapped "Picked up" — and the cashier, with the
     guest in front of them, can say otherwise. Whatever is showing here is what the bill is raised on. */
  const promisedAt = order.promised_at ? new Date(order.promised_at) : null;
  const servedAt = order.served_at ? new Date(order.served_at) : null;
  const autoKept = promisedAt ? (servedAt ? servedAt <= promisedAt : true) : null;
  const [keptOverride, setKeptOverride] = useState<boolean | null>(null);
  const kept = keptOverride ?? autoKept;
  const lateBy = promisedAt && servedAt ? Math.round((servedAt.getTime() - promisedAt.getTime()) / 60000) : null;
  const hhmm = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const live = order.order_items.filter((i) => i.status !== "cancelled");
  const preview = computeBill({ lines: live.map((i) => ({ price: Number(i.price_snapshot), qty: i.qty, gstRate: i.gst_rate ?? null })), discountPct: discPct + (coupon?.pct ?? 0), discountAmount: discAmt + (coupon?.amount ?? 0) + redeemAmt + onlineOff, serviceChargePct: scPct, serviceCharge: scOn, gstRate: Number(restaurant.gst_rate), collectGst: collect, charges: packing, promiseKept: kept, promisePct: Number(order.promise_pct ?? 0) });
  const totals = bill ? { subtotal: Number(bill.subtotal), discount: Number(bill.discount_amount), serviceCharge: Number(bill.service_charge), cgst: Number(bill.cgst), sgst: Number(bill.sgst), roundOff: Number(bill.round_off), total: Number(bill.total), charges: Number(bill.charges ?? 0) } : preview;
  // the tax per rate: as the bill recorded it, else as the preview makes it; one rate prints "CGST @ 2.5%", several print a table
  const shownTax: TaxLine[] = bill ? (bill.tax_lines ?? []) : preview.taxLines;
  const printRate = bill && !bill.tax_lines ? taxRate : shownTax.length === 1 ? shownTax[0].rate : shownTax.length ? undefined : taxRate;
  const dishRates = [...new Set(live.map((i) => (i.gst_rate ?? Number(restaurant.gst_rate))))].sort((a, b) => a - b);
  // credit notes on a paid bill, and what is still left to give back
  const notes = bill?.credit_notes ?? [];
  const refundLeft = bill ? Math.max(0, Math.round((Number(bill.total) - notes.reduce((t, n) => t + Number(n.amount), 0)) * 100) / 100) : 0;
  const [refunding, setRefunding] = useState(false);
  const printNote = async (n: CreditNote) => {
    const [{ creditNoteHtml }, { printBrowser }] = await Promise.all([import("@/lib/print/html"), import("@/lib/print/transport")]);
    printBrowser(creditNoteHtml({ restaurant: printRest, cnNo: `CN-${String(n.cn_no).padStart(4, "0")}`, when: new Date(n.created_at).toLocaleString("en-IN"), billNo: `BILL-${String(bill!.bill_no).padStart(4, "0")}`, billWhen: new Date(bill!.created_at).toLocaleDateString("en-IN"), reason: n.reason, amount: Number(n.amount), taxable: Number(n.taxable), cgst: Number(n.cgst), sgst: Number(n.sgst), method: n.refund_method }), 80);
  };
  const [pays, setPays] = useState<{ method: PaymentMethod; amount: number; ref: string }[]>([{ method: "upi", amount: totals.total, ref: "" }]);
  const paid = pays.reduce((t, p) => t + Number(p.amount || 0), 0);
  /* The scan-to-pay QR: a UPI request for exactly what is being paid by UPI on this screen — the whole
     bill, or the UPI part of a split — so the guest's UPI app opens with the amount filled in. Drawn
     only when the property has a UPI ID (Settings → Payments) and UPI is one of the methods. */
  const upiTyped = pays.filter((p) => p.method === "upi").reduce((t, p) => t + Number(p.amount || 0), 0);
  // a UPI row left blank (as it is right after Generate bill) asks for what the other rows leave unpaid
  const upiAmount = Math.round((pays.some((p) => p.method === "upi") && upiTyped === 0
    ? Math.max(0, totals.total - pays.filter((p) => p.method !== "upi").reduce((t, p) => t + Number(p.amount || 0), 0))
    : upiTyped) * 100) / 100;
  const hasVpa = validVpa(restaurant.upi_vpa);
  const upiQr = bill ? upiUri({ vpa: restaurant.upi_vpa, payee: restaurant.upi_payee || restaurant.name, amount: upiAmount, note: `BILL-${String(bill.bill_no).padStart(4, "0")} ${restaurant.name}` }) : null;
  const where = order.dining_tables?.name ?? (order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery");
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="no-print">
        <div className="flex items-center gap-3 mb-6">
          <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order #{order.order_no}</div><h1 className="text-3xl">{where}</h1></div>
        </div>
        {!bill ? (
          <Card>
            {/* Discount and Guest fold behind two icon toggles (2026-10-30, the owner: "don't show the Discount and Guest sections
                by default — just icons"). The coupon lives with the discount — a coupon is a discount. A panel opens by itself
                when it already holds something (a guest on the order), and a closed one says what it holds on its toggle, so
                nothing entered is ever out of sight. What reaches generateBill is unchanged. */}
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2" data-bill-toggles>
              {([["discount", Percent, "Discount", discSummary], ["guest", UserRound, "Guest", guestSummary]] as const).map(([k, Icon, label, summary]) => {
                const on = panel[k];
                return (
                  <button key={k} type="button" aria-expanded={on} aria-controls={`bill-${k}-panel`} data-bill-toggle={k} onClick={() => setPanel((p) => ({ ...p, [k]: !p[k] }))}
                    className={cn("h-12 min-h-11 min-w-0 rounded-2xl pl-1.5 pr-3 inline-flex items-center gap-2.5 text-[14px] font-semibold border transition-colors",
                      on ? "bg-[var(--color-green-2)] border-[color-mix(in_srgb,var(--color-tint)_40%,transparent)] text-[var(--color-label)]" : "bg-[var(--color-fill)] border-transparent hover:bg-[var(--color-fill-2)]")}>
                    <span className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center transition-colors", on || summary ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-bg-2)] text-[var(--color-label-2)]")} aria-hidden><Icon size={17} /></span>
                    <span className="min-w-0 flex-1 text-left leading-tight">
                      <span className="block truncate">{label}</span>
                      {summary && <span className="block truncate text-[11.5px] font-semibold text-[var(--color-tint)] num" data-bill-toggle-value>{summary}</span>}
                    </span>
                    <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-steel transition-transform duration-200", on && "rotate-180")} />
                  </button>
                );
              })}
            </div>
            <AnimatePresence initial={false}>
              {panel.discount && (
                <motion.div key="discount" id="bill-discount-panel" data-bill-panel="discount" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
                  <div className="pt-3 pb-0.5 space-y-3">
                    <div className="grid grid-cols-2 gap-3"><Field label="Percent"><input type="number" min={0} max={100} value={discPct || ""} onChange={(e) => setDiscPct(Number(e.target.value))} className="num" placeholder="0" /></Field><Field label="Flat (₹)"><input type="number" min={0} value={discAmt || ""} onChange={(e) => setDiscAmt(Number(e.target.value))} className="num" placeholder="0" /></Field></div>
                    {/* The coupon: the ticket sits inside the box like a search field's glass, and Apply is the box's
                        own height (items-stretch, !h-auto). Once applied it is a green card — the code, what it
                        takes off, and a cross to take it back. It was a loose 14px icon beside a bare box. */}
                    {coupon ? (
                      <div className="flex items-center gap-3 rounded-xl bg-[var(--color-green-2)] pl-2.5 pr-1.5 py-2" data-coupon-applied>
                        <span className="h-9 w-9 rounded-lg grid place-items-center shrink-0 bg-[var(--color-tint)] text-[var(--color-on-tint)]"><TicketIcon size={16} /></span>
                        <span className="flex-1 min-w-0 leading-tight">
                          <span className="block text-sm font-semibold num uppercase truncate">{coupon.code}</span>
                          <span className="block text-xs text-steel truncate">{coupon.title} · {Number(coupon.pct) > 0 ? `${coupon.pct}% off` : `${formatINR(Number(coupon.amount))} off`}</span>
                        </span>
                        <button type="button" aria-label="Remove the coupon" title="Remove the coupon" className="h-10 w-10 shrink-0 rounded-lg grid place-items-center text-steel hover:text-chili hover:bg-[var(--color-fill)]" onClick={() => { setCoupon(null); setCode(""); }}><X size={16} /></button>
                      </div>
                    ) : (
                      <div className="flex items-stretch gap-2" data-coupon>
                        <div className="relative flex-1 min-w-0">
                          <TicketIcon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
                          <input placeholder="Coupon code" aria-label="Coupon code" className="num uppercase !pl-11 w-full" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} />
                        </div>
                        <Button variant="gray" type="button" className="!h-auto shrink-0 !px-5" disabled={!code.trim() || pending} onClick={applyCoupon}>Apply</Button>
                      </div>
                    )}
                    {couponErr && <p className="text-xs text-chili">{couponErr}</p>}
                  </div>
                </motion.div>
              )}
              {panel.guest && (
                <motion.div key="guest" id="bill-guest-panel" data-bill-panel="guest" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
                  <div className="pt-3 pb-0.5 space-y-3">
                    <div className="grid grid-cols-2 gap-3"><input placeholder="Phone" inputMode="tel" className="num" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /><input placeholder="Name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></div>
                    {known ? (
                      <div className="rounded-xl bg-[var(--color-fill)] px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold">{known.name ?? "Known guest"}</span><span className="text-steel">{known.visits} visit{known.visits === 1 ? "" : "s"} · {formatINR(Number(known.total_spend))}</span>
                        {restaurant.loyalty_enabled && <span className={cn("num", canRedeem ? "text-mint font-semibold" : "text-steel")}>{Math.round(Number(known.points))} points</span>}
                        {known.notes && <span className="w-full text-steel">{known.notes}</span>}
                      </div>
                    ) : guest.phone.replace(/\D/g, "").length >= 10 ? <p className="text-xs text-steel">New guest</p> : null}
                    {canRedeem && (
                      <div className="flex items-center gap-2">
                        <Coins size={14} className="text-mint shrink-0" />
                        <input type="number" min={0} max={Math.floor(Number(known!.points))} className="num !w-28" placeholder="Points" value={redeem || ""} onChange={(e) => setRedeem(Math.max(0, Math.min(Math.floor(Number(known!.points)), Number(e.target.value))))} />
                        <button type="button" className="text-xs font-semibold underline text-steel" onClick={() => setRedeem(Math.floor(Number(known!.points)))}>Use all {Math.floor(Number(known!.points))}</button>
                        {redeem > 0 && <span className="text-xs num ml-auto">−{formatINR(redeemAmt)}</span>}
                      </div>
                    )}
                    {redeem > 0 && redeem < minRedeem && <p className="text-xs text-chili">At least {minRedeem} points at a time.</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {(onlineOff > 0 || packing > 0) && (
              <div className="mt-3 space-y-1.5" data-online-money>
                {onlineOff > 0 && <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-green-2)] px-3 py-2 text-sm" data-online-offer><TicketIcon size={15} className="text-[var(--color-tint)] shrink-0" /><span className="flex-1 min-w-0 truncate">Ordered online{order.offer_title ? ` · ${order.offer_title}` : ""}</span><span className="num font-semibold shrink-0">−{formatINR(onlineOff)}</span></div>}
                {packing > 0 && <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-fill)] px-3 py-2 text-sm" data-packing><Package size={15} className="text-steel shrink-0" /><span className="flex-1 min-w-0">Packing &amp; delivery</span><span className="num font-semibold shrink-0">{formatINR(packing)}</span></div>}
              </div>
            )}
            {scPct > 0 && !eco && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--color-fill)] px-3 py-2.5 min-h-11" data-service-charge>
                <span className="flex-1 min-w-0 leading-tight"><span className="block text-sm font-semibold">Service charge {scPct}%</span><span className="block text-xs text-steel">Only if guest agrees</span></span>
                <button type="button" role="switch" aria-checked={scOn} data-on={scOn ? "true" : "false"} className="switch shrink-0" onClick={() => setScOn((v) => !v)} aria-label={`Service charge ${scPct}%`} />
              </div>
            )}
            {eco && <p className="mt-3 text-xs rounded-xl bg-[var(--color-fill)] px-3 py-2.5" data-gst-operator><b className="capitalize">{order.order_channels?.kind}</b> pays GST · 9(5)</p>}
            {promisedAt && (
              <div className={cn("mt-4 rounded-2xl border p-3.5", kept ? "border-[var(--color-tint)]/40 bg-[var(--color-green-2)]" : "border-[var(--color-red)]/40 bg-[var(--color-red-2)]")}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Timer size={15} className={kept ? "text-[var(--color-tint)]" : "text-[var(--color-red)]"} />
                  On-time promise · {order.promise_minutes} min
                </div>
                <p className="text-xs text-steel mt-1.5">
                  Promised by {hhmm(promisedAt)}.{" "}
                  {servedAt
                    ? lateBy !== null && lateBy > 0
                      ? `Delivered ${hhmm(servedAt)} — ${lateBy} min late.`
                      : `Delivered ${hhmm(servedAt)}, on time.`
                    : "No delivery logged."}
                </p>
                <p className={cn("text-xs font-semibold mt-1.5", kept ? "text-[var(--color-tint)]" : "text-[var(--color-red)]")}>
                  {kept ? `Kept · +${order.promise_pct}% on food` : "Missed · food free"}
                </p>
                <button type="button" onClick={() => setKeptOverride(!kept)}
                  className="mt-2.5 text-xs font-semibold underline text-steel hover:text-[var(--color-label)]">
                  {kept ? "Mark late (free)" : "Mark on time"}
                </button>
              </div>
            )}
            {!eco && <p className="text-xs text-steel mt-3">{dishRates.length > 1 ? <>GST by dish: {dishRates.map((x) => `${x}%`).join(", ")}</> : <>GST {dishRates[0] ?? restaurant.gst_rate}% (CGST + SGST)</>}</p>}
            {live.some((i) => i.status === "pending" || i.status === "preparing") && <p className="text-xs text-chili mt-2">Items still in kitchen</p>}
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" className="w-full mt-5" data-kbd-primary disabled={pending || order.status !== "open"} onClick={() => start(async () => { const r = await generateBill(order.id, discPct, discAmt, kept, { phone: guest.phone, name: guest.name, redeem, coupon: coupon?.code }, scPct > 0 && !eco ? scOn : undefined); if ("error" in r) setErr(r.error!); else setPays([{ method: "upi", amount: 0, ref: "" }]); })}>Generate bill</Button>
            {inHouse.length > 0 && order.status === "open" && (
              <div className="mt-4 pt-4 border-t border-dashed border-line"><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1"><BedDouble size={12} /> Or charge to a room</div>
                <div className="flex gap-2"><select value={roomFor} onChange={(e) => setRoomFor(e.target.value)}><option value="">In-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
                  <Button variant="outline" disabled={pending || !roomFor} onClick={() => start(async () => { const r = await postOrderToRoom(order.id, roomFor); if ("error" in r) setErr(r.error!); else router.push(`/frontdesk/${roomFor}`); })}>Post</Button></div>
                <p className="text-xs text-steel mt-2">Paid at check-out</p></div>
            )}
          </Card>
        ) : bill.status === "unpaid" ? (<>
          <Card>
            <div className="flex items-center justify-between"><h3 className="text-xl">Take payment</h3><Pill tone="pending">unpaid</Pill></div>
            {/* who (2026-10-24, the owner: "show who is billing, from the login"): who generated this bill, and who is taking the
                money now — the payment is written with that person's id (0139) */}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]" data-bill-people>
              {billedBy && <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--color-fill)]"><span className="text-steel">Billed by</span><b>{billedBy}</b></span>}
              <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--color-green-2)] text-[var(--color-tint)]"><span className="opacity-80">At the counter</span><b>{cashier}</b></span>
            </div>
            {/* the scan-to-pay QR lives in its own card below — one QR on the screen, never two */}
            {bill.pay_claim_ref && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-mint-2 px-3 py-2 text-sm">
                <Smartphone size={15} className="shrink-0 text-mint" />
                <span className="min-w-0">Guest paid by UPI?{bill.pay_claim_ref !== "UPI" && <> · ref <b className="num">{bill.pay_claim_ref}</b></>} Check app</span>
                <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setPays([{ method: "upi", amount: totals.total, ref: bill.pay_claim_ref === "UPI" ? "" : bill.pay_claim_ref! }])}>Use it</Button>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {pays.map((p, i) => (
                <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 items-center">
                  <select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select>
                  <input type="number" step="0.01" className="num" value={p.amount || ""} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} placeholder="Amount" />
                  <input value={p.ref} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} placeholder="UPI ref / last 4" />
                  <button className="text-steel hover:text-chili" onClick={() => setPays(pays.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPays([...pays, { method: "cash", amount: Math.max(0, totals.total - paid), ref: "" }])}><Plus size={14} /> Split</Button>
                <Button variant="outline" size="sm" onClick={() => setPays([{ method: "upi", amount: totals.total, ref: "" }])}>Full UPI</Button>
                <Button variant="outline" size="sm" onClick={() => setPays([{ method: "cash", amount: totals.total, ref: "" }])}>Full cash</Button>
              </div>
              {/* split evenly — the guests sharing a table pay the same; the last share takes the odd paise */}
              <div className="flex flex-wrap items-center gap-1.5" data-split-even>
                <span className="text-[12px] font-semibold text-steel mr-1">Split evenly</span>
                {[2, 3, 4].map((n) => <button key={n} type="button" className="h-9 min-w-11 px-3 rounded-full text-[13px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" data-split-n={n}
                  onClick={() => { const part = Math.floor((totals.total / n) * 100) / 100; setPays(Array.from({ length: n }, (_, k) => ({ method: "upi" as PaymentMethod, amount: k === n - 1 ? Math.round((totals.total - part * (n - 1)) * 100) / 100 : part, ref: "" }))); }}>÷ {n}</button>)}
              </div>
              {/* cash handed over: tap what the guest gave, see the change — big, so it is counted out right */}
              {pays.some((p) => p.method === "cash") && (
                <div className="flex flex-wrap items-center gap-1.5" data-cash-keys>
                  <span className="text-[12px] font-semibold text-steel mr-1">Cash given</span>
                  {[0, 100, 200, 500, 2000].filter((v) => v === 0 || v >= totals.total - (paid - (pays.find((p) => p.method === "cash")?.amount ?? 0))).map((v) => (
                    <button key={v} type="button" className="h-9 min-w-11 px-3 rounded-full text-[13px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] num" data-cash-key={v}
                      onClick={() => { const ci = pays.findIndex((p) => p.method === "cash"); const others = paid - pays[ci].amount; const owed = Math.max(0, totals.total - others); setPays(pays.map((x, j) => j === ci ? { ...x, amount: v === 0 ? owed : v } : x)); }}>{v === 0 ? "Exact" : `₹${v}`}</button>))}
                </div>
              )}
            </div>
            <div className={cn("mt-4 flex justify-between text-sm", paid + 0.01 < totals.total ? "text-chili" : "text-ink")}><span>Received</span><span className="num font-semibold">{formatINR(paid)} / {formatINR(totals.total)}</span></div>
            {paid > totals.total + 0.01 && <div className="mt-2 flex items-center justify-between rounded-2xl bg-[var(--color-green-2)] px-4 py-3" data-change><span className="text-[14px] font-bold text-[var(--color-tint)]">Change to return</span><span className="font-display num text-[28px] leading-none text-[var(--color-tint)]">{formatINR(paid - totals.total)}</span></div>}
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button data-kbd-primary size="lg" className="w-full mt-4" disabled={pending || paid + 0.01 < totals.total} onClick={() => start(async () => {
              const settled = pays.map((p) => ({ ...p, amount: p.method === "cash" && paid > totals.total ? p.amount - (paid - totals.total) : p.amount }));
              setJustPrinted(true);
              try { await printBill(billData()); } catch { /* printer trouble must not stop the payment */ }
              // cash changes hands: the drawer pops on any bill printer set up to kick it (0087 — the setting was saved but never fired)
              if (settled.some((p) => p.method === "cash" && p.amount > 0)) { try { await openDrawer(); } catch { /* a drawer that will not open is not a payment problem */ } }
              if (!online) { await enqueue("settle_bill", { bill_id: bill.id, payments: settled, client_id: crypto.randomUUID() }, `Payment · ${bill.bill_no}`); router.push("/billing?queued=1"); return; }
              const r = await settleBill(bill.id, settled); if ("error" in r) setErr(r.error!);   // the action's answer is the re-rendered bill — no second render
            })}>Mark paid{!online && " (offline)"}</Button>
            <button type="button" className="mt-3 text-xs text-steel hover:text-chili w-full" disabled={pending} onClick={() => setVoiding(true)} data-void-bill>Void &amp; edit</button>
            <ReasonDialog open={voiding} onClose={() => setVoiding(false)} title={`Void bill ${bill.bill_no}?`} hint="Reopens order; reason logged"
              chips={["Wrong table", "Item missed", "Discount missed", "Guest changed order", "Billed twice"]} confirmLabel="Void the bill"
              onConfirm={async (reason) => { const r = await voidBill(bill.id, reason); if ("error" in r) return { error: r.error }; }} />
          </Card>
          {/* Scan to pay — the QR is the card. With UPI among the methods (and a UPI ID in Settings →
              Payments) it is a UPI request for exactly the UPI amount: the whole bill, or the UPI part of
              a split, redrawn as the rows above change — the guest's app opens with it filled in. With
              card or cash chosen it is the bill link instead, which opens this bill on their phone with
              UPI and card. The link's actions sit in a footer strip, edge to edge. */}
          {(upiQr || payUrl) && (() => {
            const mode = upiQr ? "upi" : "link";
            const upiChosen = pays.some((p) => p.method === "upi");
            return (
              <Card className="mt-4 !p-0 overflow-hidden" data-scan-pay data-mode={mode}>
                <div className="p-5 pb-6 flex flex-col items-center text-center">
                  <div className="w-full flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold flex items-center gap-1.5"><QrCode size={16} /> {mode === "upi" ? "Scan to pay" : "Scan the bill"}</h3>
                    <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0"
                      style={{ background: mode === "upi" ? "var(--color-green-2)" : "var(--color-fill)", color: mode === "upi" ? "var(--color-tint)" : "var(--color-label-2)" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />{mode === "upi" ? "UPI · exact amount" : "UPI or card"}
                    </span>
                  </div>
                  {/* the code: a white tile a phone's camera reads at arm's length */}
                  <div className="mt-5 rounded-[24px] bg-white p-3 ring-1 ring-black/5 shadow-[0_18px_40px_-18px_rgb(0_0_0/.75)]" data-qr>
                    <QR value={upiQr ?? payUrl!} size={216} />
                  </div>
                  {mode === "upi" ? (<>
                    <div className="mt-5 text-[11px] font-semibold uppercase tracking-[.16em] text-steel">Any UPI app</div>
                    <div className="font-display num text-[44px] leading-none mt-1.5" data-upi-amount>{formatINR(upiAmount)}</div>
                    {upiAmount + 0.01 < totals.total && <div className="text-xs text-steel mt-1.5 num">UPI part of {formatINR(totals.total)}</div>}
                    <div className="mt-3 text-[13px] leading-snug max-w-full"><span className="text-steel">To </span><b className="break-words">{restaurant.upi_payee || restaurant.name}</b></div>
                    <div className="text-xs text-steel num break-all">{restaurant.upi_vpa}</div>
                    <div className="mt-3.5 flex flex-wrap justify-center gap-1.5 text-[11px] font-semibold">
                      {["Google Pay", "PhonePe", "Paytm", "BHIM"].map((a) => <span key={a} className="h-6 px-2.5 rounded-full bg-[var(--color-fill)] inline-flex items-center">{a}</span>)}
                    </div>
                  </>) : (<>
                    <div className="font-display num text-[36px] leading-none mt-5">{formatINR(totals.total)}</div>
                    {upiChosen && !hasVpa && <p className="mt-3 text-xs rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-left" data-upi-missing><b>Exact-amount QR:</b> add <Link href="/settings" className="underline">UPI ID</Link></p>}
                  </>)}
                </div>
                {payUrl && (
                  <div className="border-t border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)]">
                    {mode === "upi" && <div className="px-5 pt-2.5 text-[11px] font-semibold uppercase tracking-[.14em] text-steel text-left">Or send to phone</div>}
                    <div className="grid divide-x divide-[var(--color-separator)]" style={{ gridTemplateColumns: `repeat(${waPhone.length === 10 ? 3 : 2}, minmax(0, 1fr))` }} data-link-actions>
                      <a href={payUrl} target="_blank" rel="noreferrer" className="h-12 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] transition-colors"><ExternalLink size={15} /> Open</a>
                      <button type="button" onClick={async () => { if (await copyText(payUrl)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                        className="h-12 !min-h-0 !rounded-none !bg-transparent inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:!bg-[var(--color-fill)] transition-colors" data-copy-link>
                        {copied ? <><Check size={15} className="text-[var(--color-tint)]" /> Copied</> : <><Copy size={15} /> Copy link</>}
                      </button>
                      {waPhone.length === 10 && <a href={waHref(`${restaurant.name}: your bill BILL-${bill.bill_no} is ${formatINR(totals.total)}. Pay here: ${payUrl}`)} target="_blank" rel="noreferrer" className="h-12 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--color-tint)] hover:bg-[var(--color-fill)] transition-colors"><MessageCircle size={15} /> WhatsApp</a>}
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}
        </>) : (
          <Card className="border-mint"><div className="flex items-center justify-between"><h3 className="text-xl">Paid</h3><Pill tone="ready">settled</Pill></div>
            <ul className="mt-3 text-sm space-y-1">{bill.payments.map((p, i) => <li key={i} className="flex justify-between"><span className="uppercase">{p.method}{p.ref ? ` · ${p.ref}` : ""}</span><span className="num">{formatINR(Number(p.amount))}</span></li>)}</ul>
            {(Number(bill.points_earned ?? 0) > 0 || Number(bill.points_redeemed ?? 0) > 0 || bill.coupon_code) && (
              <p className="text-xs mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {Number(bill.points_earned ?? 0) > 0 && <span className="text-mint flex items-center gap-1"><Coins size={12} /> Earned {Math.round(Number(bill.points_earned))} points</span>}
                {Number(bill.points_redeemed ?? 0) > 0 && <span className="text-steel">{Math.round(Number(bill.points_redeemed))} points redeemed</span>}
                {bill.coupon_code && <span className="text-steel">coupon {bill.coupon_code}</span>}
              </p>
            )}
            {notes.length > 0 && (
              <ul className="mt-3 space-y-1.5" data-credit-notes>
                {notes.map((n) => (
                  <li key={n.id} className="flex items-center gap-2.5 rounded-xl bg-[var(--color-red-2)] pl-3 pr-1 py-1.5 text-sm">
                    <Undo2 size={14} className="text-[var(--color-red)] shrink-0" />
                    <span className="flex-1 min-w-0 leading-tight"><span className="block font-semibold num">CN-{String(n.cn_no).padStart(4, "0")} · −{formatINR(Number(n.amount))} <span className="font-normal text-steel uppercase text-xs">{n.refund_method}</span></span><span className="block text-xs text-steel truncate">{n.reason}</span></span>
                    <button type="button" onClick={() => { void printNote(n).catch((e) => setErr((e as Error).message)); }} className="h-10 w-10 shrink-0 rounded-lg grid place-items-center text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]" aria-label={`Print credit note ${n.cn_no}`} title="Print the credit note"><Printer size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2"><input placeholder="Customer name (optional)" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /><input placeholder="GSTIN (optional)" className="num uppercase" value={inv.gstin} onChange={(e) => setInv({ ...inv, gstin: e.target.value })} /></div>
            <Button className="w-full mt-2" disabled={pending} onClick={() => start(async () => { const r = await diningInvoice(bill.id, { name: inv.name || order.customer_name || undefined, gstin: inv.gstin }); if ("id" in r) router.push(`/invoices/${r.id}`); else setErr(r.error!); })}><FileText size={16} /> Tax invoice</Button>
            <div className="flex gap-2 mt-2">{waPhone.length === 10 && payUrl && <a href={waHref(`Thank you for dining at ${restaurant.name}! Your receipt for ${formatINR(Number(bill.total))}: ${payUrl}`)} target="_blank" rel="noreferrer" className="btn btn-outline" aria-label="Send the receipt on WhatsApp" title="Send the receipt on WhatsApp"><MessageCircle size={16} /></a>}<Button variant="outline" className="flex-1" onClick={() => { void printBill(billData()).catch((e) => setErr((e as Error).message)); }}><Printer size={16} /> {hasPrinter ? "Print receipt" : "Print"}</Button><Link href="/orders" className="flex-1"><Button variant="ink" className="w-full">Next order</Button></Link></div>
            {refundLeft > 0 && <button type="button" className="mt-3 text-xs text-steel hover:text-chili w-full min-h-10" disabled={pending} onClick={() => setRefunding(true)} data-refund>Refund / credit note</button>}
            <RefundSheet open={refunding} onClose={() => setRefunding(false)} billId={bill.id} billNo={bill.bill_no} left={refundLeft} method={bill.payments[0]?.method ?? "cash"} />
          </Card>
        )}
      </div>

      {/* the bill, coming out of the machine */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="justify-self-center w-full max-w-[400px]">
        <PrinterOutput data={receiptData()} printing={justPrinted} label={hasPrinter ? "Counter printer" : "Preview"} onTear={() => setJustPrinted(false)} />
      </motion.div>
    </div>
  );
}
