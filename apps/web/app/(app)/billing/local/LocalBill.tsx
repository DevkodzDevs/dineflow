"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CloudOff, Plus, Printer, Trash2, Check, Percent } from "lucide-react";
import { Button, Field, Card, cn, Pill } from "@/components/ui";
import { computeBill, formatINR, PAYMENT_METHODS, SAC, gstCollectable, type PaymentMethod } from "@dineflow/shared";
import { enqueue, onQueue } from "@/lib/offline/sync";
import { cacheGet, type Job } from "@/lib/offline/db";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { orderFor, whereOf, isLocal, cidOf, LOCAL, FLOOR_SNAP, type FloorSnap, type PaidShow, type LocalLine } from "@/lib/offline/local";
import { usePrinters } from "@/lib/print/usePrinter";
import { PrinterOutput } from "@/components/receipt/PrinterOutput";
import type { ReceiptData } from "@/components/receipt/Receipt";

type Rest = { name: string; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; legal_name?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; fssai_no?: string | null };

const PROVISIONAL = "PROVISIONAL";
const FOOT = "Provisional bill. The bill number is given when this device is back online.";

/**
 * A bill raised and paid on the device (offline Step 2). What it is and is not:
 *  - the same arithmetic as the live bill (`computeBill` — GST per dish, the service charge switch, a discount), on the
 *    dishes as the device has them: an order still in the outbox, or an open order from the device's copy of the floor
 *    with whatever was queued onto it;
 *  - **provisional**: it has no bill number. The server raises the real bill when the outbox sends (`bill_settle` in
 *    lib/offline/sync.ts), so the number comes from the one sequence, in order — the owner's rule;
 *  - no coupon, no loyalty points, no on-time promise, no charge to a room: each needs the server's word.
 * Online, an order the server has opens on its live bill instead; this page is for what only the device knows.
 */
export function LocalBill({ restaurant, cashier }: { restaurant: Rest; cashier: string }) {
  const router = useRouter(); const { online } = useOffline(); const { printBill, hasPrinter, openDrawer } = usePrinters();
  const [pending, start] = useTransition();
  const [ref, setRef] = useState<string | null>(null); const [snap, setSnap] = useState<FloorSnap | null>(null); const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => { const un = onQueue(setJobs); return () => { un(); }; }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search); const c = q.get("c"), o = q.get("o");
    setRef(c ? LOCAL + c : o);
    void cacheGet<FloorSnap>(FLOOR_SNAP).then((r) => { setSnap(r?.v ?? null); setReady(true); });
  }, []);
  const found = ref && jobs ? orderFor(ref, snap, jobs) : null;
  const order = found?.order ?? null;
  // online, the server's own order has a live bill — this page is not a second way to bill it
  const live = !!ref && !isLocal(ref) && online && !found?.paid;
  useEffect(() => { if (ready && jobs && live) router.replace(`/billing/${ref}`); }, [ready, jobs, live, ref, router]);

  const [discPct, setDiscPct] = useState(0); const [discAmt, setDiscAmt] = useState(0); const [discOpen, setDiscOpen] = useState(false);
  const scPct = Number(restaurant.service_charge_pct); const [scOn, setScOn] = useState(true);
  // as the live bill decides it (BillClient): a composition dealer or an unregistered business collects no tax
  const collect = gstCollectable(restaurant.gst_scheme, restaurant.gstin) && Number(restaurant.gst_rate) > 0;
  const lines: LocalLine[] = (order?.order_items ?? []).filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, price: Number(i.price_snapshot), gstRate: i.gst_rate ?? null, note: i.notes ?? null }));
  const bill = computeBill({ lines: lines.map((l) => ({ price: l.price, qty: l.qty, gstRate: l.gstRate })), discountPct: discPct, discountAmount: discAmt, serviceChargePct: scPct, serviceCharge: scOn, gstRate: Number(restaurant.gst_rate), collectGst: collect });
  const [pays, setPays] = useState<{ method: PaymentMethod; amount: number; ref: string }[]>([{ method: "cash", amount: 0, ref: "" }]);
  // one untouched row follows the total as the discount changes; a row someone typed in is theirs
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setPays((p) => (p.length === 1 ? [{ ...p[0], amount: bill.total }] : p)); }, [bill.total, touched]);
  const setPay = (next: typeof pays) => { setTouched(true); setPays(next); };
  const paidSum = pays.reduce((t, p) => t + Number(p.amount || 0), 0);
  const where = order ? whereOf(order, snap?.tables ?? []) : found?.paid?.where ?? "";
  const whereLine = order?.table_id ? `Table ${where}` : where;

  const printRest = { name: restaurant.name, address: restaurant.address, phone: restaurant.phone, gstin: restaurant.gstin, fssai: restaurant.fssai_no ?? null, legalName: restaurant.legal_name ?? null, gstScheme: restaurant.gst_scheme ?? null, stateCode: restaurant.gst_state_code ?? null };
  const stamp = (at: number) => new Date(at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  /** what the paper and the preview carry: the open bill as it stands, or the one already paid here */
  const sheet = (p: PaidShow | null, at: number) => {
    const s = p ?? { where: whereLine, total: bill.total, payments: [] as { method: string; amount: number }[], lines, discount: bill.discount, service: bill.serviceCharge, cgst: bill.cgst, sgst: bill.sgst, roundOff: bill.roundOff, subtotal: bill.subtotal };
    const rate = bill.taxLines.length === 1 ? bill.taxLines[0].rate : undefined;
    const receipt: ReceiptData = { restaurant: printRest, title: "Provisional bill", sac: SAC.restaurant, gstRate: p ? undefined : rate, no: PROVISIONAL, when: stamp(at), where: s.where, cashier,
      lines: s.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, note: l.note ?? null, extras: l.extras ?? undefined })), subtotal: s.subtotal, discount: s.discount, service: s.service, cgst: s.cgst, sgst: s.sgst, roundOff: s.roundOff, total: s.total,
      taxLines: p ? undefined : bill.taxLines, payments: p ? s.payments.map((x) => ({ method: x.method, amount: x.amount })) : undefined, footer: FOOT, offline: true, copyLabel: "Customer copy" } as ReceiptData;
    const paper = { restaurant: printRest, title: "Provisional bill", sac: SAC.restaurant, gstRate: p ? undefined : rate, taxLines: p ? undefined : bill.taxLines, billNo: PROVISIONAL, when: stamp(at), tableOrType: s.where, cashier,
      items: s.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, note: l.note ?? null, extras: l.extras ?? undefined })), subtotal: s.subtotal, discount: s.discount, service: s.service, cgst: s.cgst, sgst: s.sgst, roundOff: s.roundOff, total: s.total,
      payments: s.payments, footer: FOOT, offline: true };
    return { receipt, paper };
  };
  const [err, setErr] = useState<string | null>(null);
  const print = (p: PaidShow | null, at: number) => { void printBill(sheet(p, at).paper).catch((e) => setErr((e as Error).message)); };

  const markPaid = () => start(async () => {
    if (!order || !ref) return;
    setErr(null);
    const over = Math.max(0, paidSum - bill.total);
    // cash given over the total is change, not takings — what is kept is what the bill came to
    const settled = pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Math.round((p.method === "cash" && over > 0 ? Math.max(0, p.amount - over) : p.amount) * 100) / 100, ref: p.ref || null }));
    const show: PaidShow = { where: whereLine, total: bill.total, payments: settled.map((p) => ({ method: p.method, amount: p.amount })), lines, discount: bill.discount, service: bill.serviceCharge, cgst: bill.cgst, sgst: bill.sgst, roundOff: bill.roundOff, subtotal: bill.subtotal };
    try { await printBill(sheet(show, Date.now()).paper); } catch { /* printer trouble must not stop the payment */ }
    if (settled.some((p) => p.method === "cash" && p.amount > 0)) { try { await openDrawer(); } catch { /* a drawer that will not open is not a payment problem */ } }
    await enqueue("bill_settle", { ...(isLocal(ref) ? { order_client: cidOf(ref) } : { order_id: ref }), disc_pct: discPct, disc_amt: discAmt, ...(scPct > 0 ? { service_on: scOn } : {}), payments: settled, total: bill.total, client_id: crypto.randomUUID() },
      `Bill + payment · ${whereLine} · ${formatINR(bill.total)}`, show);
  });

  // no back link of its own: Back is the top bar's (lib/back.test.ts)
  const note = (title: string, body: string, extra?: React.ReactNode) => (
    <div className="max-w-md" data-local-note>
      <Card><h1 className="text-2xl">{title}</h1><p className="text-sm text-steel mt-2">{body}</p>{extra && <div className="mt-4 flex flex-wrap gap-2">{extra}</div>}</Card>
    </div>
  );
  if (!ready || !jobs || live) return <div className="max-w-md" data-local-loading><div className="h-40 rounded-[22px] bg-[var(--color-fill)] animate-pulse" /></div>;
  if (!ref) return note("No order chosen", "Open an order from the floor.", <Link href="/orders" className="btn btn-filled">Orders</Link>);
  if (found?.gone) return note("This order has been sent", "It reached the server. Open it from the floor.", <Link href="/orders" className="btn btn-filled">Orders</Link>);
  if (found?.paid) {
    const p = found.paid; const at = found.paidAt ?? Date.now();
    return (
      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]" data-local-bill="paid">
        <div className="no-print">
          <div className="mb-5"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Paid on this device</div><h1 className="text-3xl">{p.where}</h1></div>
          <Card className="border-mint">
            <div className="flex items-center justify-between"><h3 className="text-xl">Paid</h3><Pill tone="ready">saved here</Pill></div>
            <div className="font-display num text-[40px] leading-none mt-3" data-local-total>{formatINR(p.total)}</div>
            <ul className="mt-3 text-sm space-y-1">{p.payments.map((x, i) => <li key={i} className="flex justify-between"><span className="uppercase">{x.method}</span><span className="num">{formatINR(x.amount)}</span></li>)}</ul>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-xs" data-local-waiting><CloudOff size={14} className="shrink-0 mt-px" aria-hidden /><span>Sends by itself when the connection is back. The bill gets its number then.</span></p>
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={() => print(p, at)}><Printer size={16} /> {hasPrinter ? "Print receipt" : "Print"}</Button><Link href="/orders" className="flex-1"><Button variant="ink" className="w-full">Next order</Button></Link></div>
          </Card>
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="justify-self-center w-full max-w-[400px]"><PrinterOutput data={sheet(p, at).receipt} label={hasPrinter ? "Counter printer" : "Preview"} /></motion.div>
      </div>
    );
  }
  if (!order) return note("Not on this device", online ? "This order's bill is on the live screen." : "This device has no copy of that order. Open the floor once while online and it will be kept.",
    <>{online && !isLocal(ref) && <Link href={`/billing/${ref}`} className="btn btn-filled">Open the bill</Link>}<Link href="/orders" className="btn btn-gray">Orders</Link></>);
  if ((order.bills ?? []).some((b) => b.status === "unpaid" || b.status === "paid")) return note("A bill is already out", "This order was billed before the connection dropped. Its payment is taken on that bill.",
    <><Link href={`/billing/${order.id}`} className="btn btn-filled">Open the bill</Link><Link href="/orders" className="btn btn-gray">Orders</Link></>);

  const addHref = isLocal(order.id) ? `/orders/new?${order.table_id ? `table=${order.table_id}&` : `type=${order.type}&`}local=${cidOf(order.id)}` : `/orders/new?${order.table_id ? `table=${order.table_id}&` : ""}add=${order.id}`;
  const cashAt = pays.findIndex((p) => p.method === "cash");
  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]" data-local-bill="open">
      <div className="no-print min-w-0">
        <div className="mb-5 flex items-end gap-3">
          <div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">{isLocal(order.id) ? "Order on this device" : `Order #${order.order_no}`}</div><h1 className="text-3xl truncate">{whereLine}</h1></div>
          <Link href={addHref} className="btn btn-gray shrink-0" data-local-add><Plus size={16} aria-hidden />Add items</Link>
        </div>
        <Card>
          <div className="flex items-center justify-between gap-2"><h3 className="text-xl">Bill &amp; payment</h3><span className="h-7 px-2.5 rounded-full inline-flex items-center gap-1 text-[12px] font-bold bg-[var(--color-label)] text-[var(--color-on-label)]" data-local-provisional><CloudOff size={13} aria-hidden />Provisional</span></div>
          <p className="text-xs text-steel mt-1.5">No connection: the bill gets its number when this device is back online.</p>
          <button type="button" aria-expanded={discOpen} onClick={() => setDiscOpen((v) => !v)} data-local-discount
            className={cn("mt-3 h-12 min-h-11 w-full rounded-2xl pl-1.5 pr-3 inline-flex items-center gap-2.5 text-[14px] font-semibold border transition-colors", discOpen ? "bg-[var(--color-green-2)] border-[color-mix(in_srgb,var(--color-tint)_40%,transparent)]" : "bg-[var(--color-fill)] border-transparent hover:bg-[var(--color-fill-2)]")}>
            <span className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center", discOpen || bill.discount > 0 ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-bg-2)] text-[var(--color-label-2)]")} aria-hidden><Percent size={17} /></span>
            <span className="flex-1 text-left">Discount</span>{bill.discount > 0 && <span className="num text-[13px] text-[var(--color-tint)]">−{formatINR(bill.discount)}</span>}
          </button>
          {discOpen && <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 mt-3"><Field label="Percent"><input type="number" min={0} max={100} value={discPct || ""} onChange={(e) => setDiscPct(Math.max(0, Math.min(100, Number(e.target.value))))} className="num" placeholder="0" /></Field><Field label="Flat (₹)"><input type="number" min={0} value={discAmt || ""} onChange={(e) => setDiscAmt(Math.max(0, Number(e.target.value)))} className="num" placeholder="0" /></Field></div>}
          {scPct > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--color-fill)] px-3 py-2.5 min-h-11" data-service-charge>
              <span className="flex-1 min-w-0 leading-tight"><span className="block text-sm font-semibold">Service charge {scPct}%</span><span className="block text-xs text-steel">Only if guest agrees</span></span>
              <button type="button" role="switch" aria-checked={scOn} data-on={scOn ? "true" : "false"} className="switch shrink-0" onClick={() => setScOn((v) => !v)} aria-label={`Service charge ${scPct}%`} />
            </div>
          )}
          <div className="mt-4 flex items-end justify-between gap-3"><span className="text-sm text-steel">To pay</span><span className="font-display num text-[40px] leading-none" data-local-total>{formatINR(bill.total)}</span></div>
          <div className="mt-4 space-y-2">
            {pays.map((p, i) => (
              <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)_44px] gap-2 items-center" data-local-pay>
                <select value={p.method} onChange={(e) => setPay(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))} aria-label="Paid by">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select>
                <input type="number" step="0.01" className="num" value={p.amount || ""} onChange={(e) => setPay(pays.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} placeholder="Amount" aria-label="Amount" />
                <button type="button" className="h-11 w-11 grid place-items-center rounded-xl text-steel hover:text-chili hover:bg-[var(--color-fill)] disabled:opacity-40" disabled={pays.length === 1} onClick={() => setPay(pays.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={16} /></button>
              </div>
            ))}
            {/* 44px: this screen is used at a table, on a phone (the live bill's same three are 40) */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="!h-11" onClick={() => setPay([...pays, { method: "upi", amount: Math.max(0, Math.round((bill.total - paidSum) * 100) / 100), ref: "" }])}><Plus size={14} /> Split</Button>
              <Button variant="outline" size="sm" className="!h-11" onClick={() => setPay([{ method: "cash", amount: bill.total, ref: "" }])} data-local-cash>Full cash</Button>
              <Button variant="outline" size="sm" className="!h-11" onClick={() => setPay([{ method: "upi", amount: bill.total, ref: "" }])} data-local-upi>Full UPI</Button>
            </div>
            {cashAt >= 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-cash-keys>
                <span className="text-[12px] font-semibold text-steel mr-1">Cash given</span>
                {[0, 100, 200, 500, 2000].filter((v) => v === 0 || v >= bill.total - (paidSum - pays[cashAt].amount)).map((v) => (
                  <button key={v} type="button" className="h-11 min-w-11 px-3 rounded-full text-[13px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] num"
                    onClick={() => { const owed = Math.max(0, bill.total - (paidSum - pays[cashAt].amount)); setPay(pays.map((x, j) => (j === cashAt ? { ...x, amount: v === 0 ? owed : v } : x))); }}>{v === 0 ? "Exact" : `₹${v}`}</button>))}
              </div>
            )}
          </div>
          <div className={cn("mt-4 flex justify-between text-sm", paidSum + 0.01 < bill.total ? "text-chili" : "text-ink")}><span>Received</span><span className="num font-semibold">{formatINR(paidSum)} / {formatINR(bill.total)}</span></div>
          {paidSum > bill.total + 0.01 && <div className="mt-2 flex items-center justify-between rounded-2xl bg-[var(--color-green-2)] px-4 py-3" data-change><span className="text-[14px] font-bold text-[var(--color-tint)]">Change to return</span><span className="font-display num text-[28px] leading-none text-[var(--color-tint)]">{formatINR(paidSum - bill.total)}</span></div>}
          {err && <p className="text-sm text-chili mt-2">{err}</p>}
          <Button data-kbd-primary size="lg" className="w-full mt-4" disabled={pending || lines.length === 0 || paidSum + 0.01 < bill.total} onClick={markPaid} data-local-paid><Check size={18} aria-hidden />Mark paid · saved here</Button>
          <Button variant="outline" className="w-full mt-2" disabled={lines.length === 0} onClick={() => print(null, Date.now())} data-local-print><Printer size={16} /> Print provisional bill</Button>
        </Card>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="justify-self-center w-full max-w-[400px]"><PrinterOutput data={sheet(null, Date.now()).receipt} label={hasPrinter ? "Counter printer" : "Preview"} /></motion.div>
    </div>
  );
}
