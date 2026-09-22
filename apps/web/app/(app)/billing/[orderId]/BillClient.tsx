"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Printer, Plus, Trash2, QrCode, Smartphone, Timer, MessageCircle, Ticket as TicketIcon, UserRound, Coins } from "lucide-react";
import { Button, Field, Card, cn, Pill } from "@/components/ui";
import { computeBill, formatINR, PAYMENT_METHODS, billTitle, SAC, gstCollectable, lineExtras, type PaymentMethod } from "@dineflow/shared";
import { generateBill, settleBill, voidBill, lookupCustomer, checkCoupon, type Customer, type Coupon } from "../actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import { PrinterOutput } from "@/components/receipt/PrinterOutput";
import type { ReceiptData } from "@/components/receipt/Receipt";
import { QR, qrDataUrl } from "@/components/QR";
import { useLive } from "@/lib/useLive";
import { postOrderToRoom } from "../../frontdesk/actions";
import { BedDouble, FileText } from "lucide-react";
import { diningInvoice } from "../../invoices/actions";

type Item = { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string; notes?: string | null; addons?: { name: string; price: number }[] | null; components?: { name: string; qty: number }[] | null };
type Order = { id: string; order_no: number; status: string; type: string; customer_name: string | null; customer_phone?: string | null; created_at: string; promised_at?: string | null; served_at?: string | null; promise_minutes?: number | null; promise_pct?: number | null; dining_tables: { name: string } | null; order_items: Item[] };
type Bill = { id: string; bill_no: number; promise_fee?: number; promise_waived?: number; promise_kept?: boolean | null; points_redeemed?: number; points_earned?: number; coupon_code?: string | null; subtotal: number; discount_pct: number; discount_amount: number; service_charge: number; cgst: number; sgst: number; round_off: number; total: number; status: string; created_at: string; paid_at: string | null; pay_token?: string | null; pay_claim_ref?: string | null; pay_claimed_at?: string | null; payments: { method: string; amount: number; ref: string | null }[] } | null;
type Rest = { name: string; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; legal_name?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; fssai_no?: string | null; loyalty_enabled?: boolean; loyalty_point_value?: number; loyalty_min_redeem?: number };

export function BillClient({ order, bill, restaurant, cashier, inHouse = [] }: { order: Order; bill: Bill; restaurant: Rest; cashier: string; inHouse?: { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null }[] }) {
  const [roomFor, setRoomFor] = useState("");
  const [inv, setInv] = useState({ name: "", gstin: "" });
  const { online } = useOffline();
  const { printBill, hasPrinter } = usePrinters();
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
    restaurant: printRest, title: billTitle(restaurant.gst_scheme, restaurant.gstin, bill?.status === "paid"), sac: SAC.restaurant, gstRate: taxRate, no: bill ? `BILL-${String(bill.bill_no).padStart(4, "0")}` : "BILL — DRAFT",
    when: new Date(bill?.created_at ?? Date.now()).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    where: order.dining_tables?.name ? `Table ${order.dining_tables.name}` : order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery",
    cashier,
    lines: order.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, price: Number(i.price_snapshot), note: i.notes ?? null, extras: lineExtras(i) })),
    subtotal: Number(totals.subtotal ?? bill?.subtotal ?? 0), discount: Number(bill?.discount_amount ?? 0),
    cgst: Number(totals.cgst ?? bill?.cgst ?? 0), sgst: Number(totals.sgst ?? bill?.sgst ?? 0), roundOff: Number(bill?.round_off ?? 0),
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
  const billData = () => ({ restaurant: printRest, gstRate: taxRate, sac: SAC.restaurant, billNo: bill ? `BILL-${bill.bill_no}` : "BILL", when: new Date().toLocaleString("en-IN"), tableOrType: order.dining_tables?.name ?? (order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery"), cashier, items: order.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, price: Number(i.price_snapshot), note: i.notes ?? null, extras: lineExtras(i) })), subtotal: Number(bill?.subtotal ?? 0), discount: Number(bill?.discount_amount ?? 0), cgst: Number(bill?.cgst ?? 0), sgst: Number(bill?.sgst ?? 0), roundOff: Number(bill?.round_off ?? 0), total: Number(bill?.total ?? 0), payments: pays.map((p) => ({ method: p.method, amount: Number(p.amount) })), offline: !online, upiQr: payUrl ?? undefined, qrPng, loyalty: bill && Number(bill.points_earned ?? 0) > 0 ? `You earned ${Math.round(Number(bill.points_earned))} points on this visit` : undefined });
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  /* A composition dealer or an unregistered business may not collect tax, so the preview must not
     show any — the bill the server raises will not have it either. */
  const taxRate = gstCollectable(restaurant.gst_scheme, restaurant.gstin) ? Number(restaurant.gst_rate) : 0;
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
  const preview = computeBill({ lines: live.map((i) => ({ price: Number(i.price_snapshot), qty: i.qty })), discountPct: discPct + (coupon?.pct ?? 0), discountAmount: discAmt + (coupon?.amount ?? 0) + redeemAmt, serviceChargePct: Number(restaurant.service_charge_pct), gstRate: taxRate, promiseKept: kept, promisePct: Number(order.promise_pct ?? 0) });
  const totals = bill ? { subtotal: Number(bill.subtotal), discount: Number(bill.discount_amount), serviceCharge: Number(bill.service_charge), cgst: Number(bill.cgst), sgst: Number(bill.sgst), roundOff: Number(bill.round_off), total: Number(bill.total) } : preview;
  const [pays, setPays] = useState<{ method: PaymentMethod; amount: number; ref: string }[]>([{ method: "upi", amount: totals.total, ref: "" }]);
  const paid = pays.reduce((t, p) => t + Number(p.amount || 0), 0);
  const where = order.dining_tables?.name ?? (order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery");

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="no-print">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/billing" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
          <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order #{order.order_no}</div><h1 className="text-3xl">{where}</h1></div>
        </div>
        {!bill ? (
          <Card>
            <h3 className="text-xl">Discount</h3>
            <div className="grid grid-cols-2 gap-3 mt-3"><Field label="Percent"><input type="number" min={0} max={100} value={discPct || ""} onChange={(e) => setDiscPct(Number(e.target.value))} className="num" placeholder="0" /></Field><Field label="Flat (₹)"><input type="number" min={0} value={discAmt || ""} onChange={(e) => setDiscAmt(Number(e.target.value))} className="num" placeholder="0" /></Field></div>
            <div className="mt-4 pt-4 border-t border-dashed border-line space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-steel flex items-center gap-1.5"><UserRound size={12} /> Guest</div>
              <div className="grid grid-cols-2 gap-3"><input placeholder="Phone" inputMode="tel" className="num" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /><input placeholder="Name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></div>
              {known ? (
                <div className="rounded-xl bg-[var(--color-fill)] px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{known.name ?? "Known guest"}</span><span className="text-steel">{known.visits} visit{known.visits === 1 ? "" : "s"} · {formatINR(Number(known.total_spend))}</span>
                  {restaurant.loyalty_enabled && <span className={cn("num", canRedeem ? "text-mint font-semibold" : "text-steel")}>{Math.round(Number(known.points))} points</span>}
                  {known.notes && <span className="w-full text-steel">{known.notes}</span>}
                </div>
              ) : guest.phone.replace(/\D/g, "").length >= 10 ? <p className="text-xs text-steel">New guest — this bill starts their record.</p> : null}
              {canRedeem && (
                <div className="flex items-center gap-2">
                  <Coins size={14} className="text-mint shrink-0" />
                  <input type="number" min={0} max={Math.floor(Number(known!.points))} className="num !w-28" placeholder="Points" value={redeem || ""} onChange={(e) => setRedeem(Math.max(0, Math.min(Math.floor(Number(known!.points)), Number(e.target.value))))} />
                  <button type="button" className="text-xs font-semibold underline text-steel" onClick={() => setRedeem(Math.floor(Number(known!.points)))}>Use all {Math.floor(Number(known!.points))}</button>
                  {redeem > 0 && <span className="text-xs num ml-auto">−{formatINR(redeemAmt)}</span>}
                </div>
              )}
              {redeem > 0 && redeem < minRedeem && <p className="text-xs text-chili">At least {minRedeem} points at a time.</p>}
              <div className="flex items-center gap-2">
                <TicketIcon size={14} className="text-steel shrink-0" />
                {coupon ? (
                  <><span className="text-xs flex-1 min-w-0 truncate"><b>{coupon.code}</b> · {coupon.title} · {Number(coupon.pct) > 0 ? `${coupon.pct}% off` : `${formatINR(Number(coupon.amount))} off`}</span><button type="button" className="text-xs underline text-steel" onClick={() => { setCoupon(null); setCode(""); }}>remove</button></>
                ) : (
                  <><input placeholder="Coupon code" className="num uppercase !w-36" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} /><Button size="sm" variant="outline" type="button" disabled={!code.trim() || pending} onClick={applyCoupon}>Apply</Button></>
                )}
              </div>
              {couponErr && <p className="text-xs text-chili">{couponErr}</p>}
            </div>
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
                    : "No delivery was recorded, so the promise stands."}
                </p>
                <p className={cn("text-xs font-semibold mt-1.5", kept ? "text-[var(--color-tint)]" : "text-[var(--color-red)]")}>
                  {kept ? `Kept — ${order.promise_pct}% added to the food.` : "Missed — the food is free and nothing is charged for the promise."}
                </p>
                <button type="button" onClick={() => setKeptOverride(!kept)}
                  className="mt-2.5 text-xs font-semibold underline text-steel hover:text-[var(--color-label)]">
                  {kept ? "We were late — make this meal free" : "It was on time after all — charge it"}
                </button>
              </div>
            )}
            <p className="text-xs text-steel mt-3">GST {restaurant.gst_rate}% split as CGST + SGST{Number(restaurant.service_charge_pct) > 0 && <>, service charge {restaurant.service_charge_pct}%</>}. Change these in Settings.</p>
            {live.some((i) => i.status === "pending" || i.status === "preparing") && <p className="text-xs text-chili mt-2">Some items are still in the kitchen.</p>}
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" className="w-full mt-5" disabled={pending || order.status !== "open"} onClick={() => start(async () => { const r = await generateBill(order.id, discPct, discAmt, kept, { phone: guest.phone, name: guest.name, redeem, coupon: coupon?.code }); if ("error" in r) setErr(r.error!); else { setPays([{ method: "upi", amount: 0, ref: "" }]); router.refresh(); } })}>Generate bill</Button>
            {inHouse.length > 0 && order.status === "open" && (
              <div className="mt-4 pt-4 border-t border-dashed border-line"><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1"><BedDouble size={12} /> Or charge to a room</div>
                <div className="flex gap-2"><select value={roomFor} onChange={(e) => setRoomFor(e.target.value)}><option value="">In-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
                  <Button variant="outline" disabled={pending || !roomFor} onClick={() => start(async () => { const r = await postOrderToRoom(order.id, roomFor); if ("error" in r) setErr(r.error!); else router.push(`/frontdesk/${roomFor}`); })}>Post</Button></div>
                <p className="text-xs text-steel mt-2">Amount + GST goes on the guest folio; settled at check-out.</p></div>
            )}
          </Card>
        ) : bill.status === "unpaid" ? (<>
          <Card>
            <div className="flex items-center justify-between"><h3 className="text-xl">Take payment</h3><Pill tone="pending">unpaid</Pill></div>
            {bill.pay_claim_ref && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-mint-2 px-3 py-2 text-sm">
                <Smartphone size={15} className="shrink-0 text-mint" />
                <span className="min-w-0">Guest says they paid by UPI{bill.pay_claim_ref !== "UPI" && <> · ref <b className="num">{bill.pay_claim_ref}</b></>}. Check your UPI app, then</span>
                <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setPays([{ method: "upi", amount: totals.total, ref: bill.pay_claim_ref === "UPI" ? "" : bill.pay_claim_ref! }])}>Use it</Button>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {pays.map((p, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr_1fr_32px] gap-2 items-center">
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
            </div>
            <div className={cn("mt-4 flex justify-between text-sm", paid + 0.01 < totals.total ? "text-chili" : "text-ink")}><span>Received</span><span className="num font-semibold">{formatINR(paid)} / {formatINR(totals.total)}</span></div>
            {paid > totals.total + 0.01 && <div className="flex justify-between text-sm text-steel"><span>Change to return</span><span className="num">{formatINR(paid - totals.total)}</span></div>}
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" className="w-full mt-4" disabled={pending || paid + 0.01 < totals.total} onClick={() => start(async () => {
              const settled = pays.map((p) => ({ ...p, amount: p.method === "cash" && paid > totals.total ? p.amount - (paid - totals.total) : p.amount }));
              setJustPrinted(true);
              try { await printBill(billData()); } catch { /* printer trouble must not stop the payment */ }
              if (!online) { await enqueue("settle_bill", { bill_id: bill.id, payments: settled, client_id: crypto.randomUUID() }, `Payment · ${bill.bill_no}`); router.push("/billing?queued=1"); return; }
              const r = await settleBill(bill.id, settled); if ("error" in r) setErr(r.error!); else router.refresh();
            })}>Mark paid{!online && " (offline)"}</Button>
            <button className="mt-3 text-xs text-steel hover:text-chili w-full" disabled={pending} onClick={() => start(async () => { await voidBill(bill.id); router.refresh(); })}>Void bill and edit order</button>
          </Card>
          {payUrl && (
            <Card className="mt-4">
              <div className="flex items-center gap-4">
                <QR value={payUrl} size={128} />
                <div className="min-w-0">
                  <h3 className="text-lg flex items-center gap-1.5"><QrCode size={16} /> Guest can scan to pay</h3>
                  <p className="text-sm text-steel mt-1">Opens this bill on their phone with UPI and card options. Turn the screen to them — it is printed on the bill too.</p>
                  <a href={payUrl} target="_blank" rel="noreferrer" className="text-[11px] text-steel underline break-all mt-1 inline-block">{payUrl}</a>
                  {waPhone.length === 10 && <div className="mt-2"><a href={waHref(`${restaurant.name}: your bill BILL-${bill.bill_no} is ${formatINR(totals.total)}. Pay here: ${payUrl}`)} target="_blank" rel="noreferrer" className="btn btn-outline !h-8 !text-xs"><MessageCircle size={13} /> Send the pay link on WhatsApp</a></div>}
                </div>
              </div>
            </Card>
          )}
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
            <div className="mt-4 grid grid-cols-2 gap-2"><input placeholder="Customer name (optional)" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /><input placeholder="GSTIN (optional)" className="num uppercase" value={inv.gstin} onChange={(e) => setInv({ ...inv, gstin: e.target.value })} /></div>
            <Button className="w-full mt-2" disabled={pending} onClick={() => start(async () => { const r = await diningInvoice(bill.id, { name: inv.name || order.customer_name || undefined, gstin: inv.gstin }); if ("id" in r) router.push(`/invoices/${r.id}`); else setErr(r.error!); })}><FileText size={16} /> Tax invoice</Button>
            <div className="flex gap-2 mt-2">{waPhone.length === 10 && payUrl && <a href={waHref(`Thank you for dining at ${restaurant.name}! Your receipt for ${formatINR(Number(bill.total))}: ${payUrl}`)} target="_blank" rel="noreferrer" className="btn btn-outline" aria-label="Send the receipt on WhatsApp" title="Send the receipt on WhatsApp"><MessageCircle size={16} /></a>}<Button variant="outline" className="flex-1" onClick={() => { void printBill(billData()).catch((e) => setErr((e as Error).message)); }}><Printer size={16} /> {hasPrinter ? "Print receipt" : "Print"}</Button><Link href="/orders" className="flex-1"><Button variant="ink" className="w-full">Next order</Button></Link></div></Card>
        )}
      </div>

      {/* the bill, coming out of the machine */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="justify-self-center w-full max-w-[400px]">
        <PrinterOutput data={receiptData()} printing={justPrinted} label={hasPrinter ? "Counter printer" : "Preview"} onTear={() => setJustPrinted(false)} />
      </motion.div>
    </div>
  );
}
