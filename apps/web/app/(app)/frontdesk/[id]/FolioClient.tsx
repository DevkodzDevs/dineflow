"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn, LogOut, Plus, Printer, UtensilsCrossed, ArrowLeft, Moon, ChevronDown, Clock } from "lucide-react";
import { Button, Card, Pill, cn, ask } from "@/components/ui";
import { PrinterOutput } from "@/components/receipt/PrinterOutput";
import { formatINR, PAYMENT_METHODS, type PaymentMethod } from "@dineflow/shared";
import { checkIn, checkOut, addCharge, postOrderToRoom, waiveLate } from "../actions";
import { stayInvoice } from "../../invoices/actions";
import { FileText, MessageCircle } from "lucide-react";
import { waHref, waDate, firstName } from "@/lib/wa";
import { OnlineCheckin } from "./OnlineCheckin";
import { ChargePicker } from "./ChargePicker";
import type { Preset } from "./charges";
import { todayIST } from "@/lib/format";
import f from "./Folio.module.css";

type B = { id: string; booking_no: number; check_in: string; check_out: string; status: string; rate: number; adults: number; children: number; source: string; notes: string | null; checked_in_at: string | null; checkin_token?: string | null; precheckin?: { nationality?: string; arrival_time?: string | null; requests?: string | null; id_type?: string; id_last4?: string } | null; precheckin_at?: string | null; guests: { full_name: string; phone: string | null; email: string | null; id_type: string | null; id_last4: string | null; visits: number; vip?: boolean; preferences?: string | null } | null; rooms: { number: string; floor: number; room_types: { name: string } | null } | null };
type C = { id: string; kind: string; description: string; amount: number; created_at: string };
type T = { nights: number; room_total: number; extras: number; discounts: number; taxable: number; gst: number; total: number; paid: number; balance: number; late_fee?: number | null; late_label?: string | null };
type R = { name: string; gstin: string | null; address: string | null; room_gst_rate: number; check_in_time?: string | null; check_out_time?: string | null; late_checkout_on?: boolean; late_half_after_min?: number; late_full_after_min?: number };

/* late check-out (0171): when the stay is due out (its date at the property's check-out time, IST), and the next moment the charge
   steps up — half after `half`, a night after `full`, again each 24 h — so the folio can fetch itself once at that moment */
const dueAt = (date: string, time?: string | null) => Date.parse(`${date}T${(time ?? "11:00").slice(0, 5)}:00+05:30`);
function nextStep(due: number, half: number, full: number, now: number) {
  for (let d = 0; d < 60; d++) for (const m of [half, full]) { const at = due + (d * 1440 + m) * 60000 + 1000; if (at > now) return at; }
  return null;
}
const clockIST = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
type O = { id: string; order_no: number; booking_id?: string | null; type?: string; customer_name?: string | null; table?: { name: string } | null; order_items: { qty: number; price_snapshot: number; status: string }[] };
const orderAmt = (o: O) => o.order_items.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.qty * Number(i.price_snapshot), 0);
const orderWhere = (o: O) => o.table?.name ? `Table ${o.table.name}` : o.type === "room_service" ? "Room service" : o.type === "takeaway" ? "Parcel" : o.type === "delivery" ? "Delivery" : "Order";

export function FolioClient({ booking: b, charges, totals: t, openOrders, otherOrders = [], presets = { extra: [], discount: [] }, restaurant, base = "" }: { booking: B; charges: C[]; totals: T; openOrders: O[]; otherOrders?: O[]; presets?: { extra: Preset[]; discount: Preset[] }; restaurant: R; base?: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const [pays, setPays] = useState<{ method: PaymentMethod; amount: number; ref: string }[]>([{ method: "upi", amount: Number(t?.balance ?? 0), ref: "" }]);
  const [extra, setExtra] = useState({ kind: "extra" as "extra" | "discount", description: "", amount: 0 });
  const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const [another, setAnother] = useState(false);
  /* the payment follows the balance: posting an extra, a discount or an order used to leave it at the old figure, and Check out
     stayed greyed out until someone retyped it (2026-11-04). A split the desk has made is left alone. */
  useEffect(() => { setPays((ps) => (ps.length === 1 ? [{ ...ps[0], amount: Number(t?.balance ?? 0) }] : ps)); }, [t?.balance]);
  /* the fee steps up while the folio is open: fetch the page once when the next step is reached (not after an action — it is
     the clock that changed), so the strip, the total and the payment row follow it */
  const lateOn = restaurant.late_checkout_on !== false && b.status === "checked_in";
  const half = restaurant.late_half_after_min ?? 180, full = restaurant.late_full_after_min ?? 360;
  const dueOut = dueAt(b.check_out, restaurant.check_out_time);   // not `due`: in the Stay card that is what is left to pay
  useEffect(() => {
    if (!lateOn || !Number.isFinite(dueOut)) return;
    const at = nextStep(dueOut, half, full, Date.now()); if (at == null || at - Date.now() > 36 * 3600000) return;
    const id = window.setTimeout(() => router.refresh(), Math.max(1000, at - Date.now()));
    return () => window.clearTimeout(id);
  }, [lateOn, dueOut, half, full, router, t?.late_fee]);
  const waive = (on: boolean) => start(async () => { const r = await waiveLate(b.id, on); if ("error" in r) setErr(r.error!); else setErr(null); });
  const post = (o: O) => start(async () => { const r = await postOrderToRoom(o.id, b.id); if ("error" in r) setErr(r.error!); else setErr(null); });
  const tone = b.status === "checked_in" ? "ready" : b.status === "reserved" ? "gold" : "served";
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_344px] lg:grid-cols-[minmax(0,1fr)_372px] xl:grid-cols-[minmax(0,1fr)_400px] items-start">
      <div className="no-print min-w-0">
        {/* 2026-11-04, the owner: "after check-in, a Back to Front desk at the top" */}
        <Link href="/frontdesk" className={f.back} data-folio-back><ArrowLeft size={16} aria-hidden /> Front desk</Link>
        <div className="flex items-start gap-3 mb-5">
          <div className="flex-1 min-w-0"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Booking #{b.booking_no} · {b.source?.replace("_", " ")}</div><h1 className="text-3xl leading-tight">Room {b.rooms?.number} <em>{b.guests?.full_name}</em></h1></div>
          <span className="shrink-0 mt-1"><Pill tone={tone}>{b.status.replace("_", " ")}</Pill></span>
        </div>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
          <Card className="flex flex-col"><div className="text-xs font-semibold uppercase tracking-wide text-steel flex items-center gap-2">Guest {b.guests?.vip && <Pill tone="gold">VIP</Pill>}</div><div className="mt-2 font-semibold text-lg">{b.guests?.full_name}</div><div className="text-sm text-steel">{b.guests?.phone}{b.guests?.email ? ` · ${b.guests.email}` : ""}</div><div className="text-xs text-steel mt-1">{b.guests?.id_type} ••••{b.guests?.id_last4} · {b.guests?.visits} visit{b.guests?.visits === 1 ? "" : "s"}</div>{b.guests?.preferences && <div className="text-xs mt-2 text-champagne">{b.guests.preferences}</div>}
            <div className="h-4 shrink-0" aria-hidden />
            {(() => {
              /* Before arrival the guest gets the confirmation; once in, a welcome they can reply to. */
              const g = firstName(b.guests?.full_name ?? ""); const nights = Math.max(1, Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000));
              const href = b.status === "reserved" ? waHref(b.guests?.phone, `Hi ${g}, your stay at ${restaurant.name} is confirmed: ${b.rooms?.room_types?.name ?? "room"} ${b.rooms?.number ?? ""}, ${waDate(b.check_in)} to ${waDate(b.check_out)} (${nights} night${nights === 1 ? "" : "s"}). Booking #${b.booking_no}. Reply here if you need anything before you arrive.`)
                : b.status === "checked_in" ? waHref(b.guests?.phone, `Welcome to ${restaurant.name}, ${g}! You are in room ${b.rooms?.number ?? ""} until ${waDate(b.check_out)}. Message us here any time for food, towels or a late checkout.`) : null;
              return href && <a href={href} target="_blank" rel="noreferrer" className="mt-auto pt-0 w-full min-h-11 rounded-full px-4 flex items-center justify-center gap-2 text-sm font-semibold bg-[var(--color-green-2)] text-[var(--color-green)] hover:brightness-110 transition"><MessageCircle size={16} className="shrink-0" /> {b.status === "reserved" ? "Confirm on WhatsApp" : "Welcome on WhatsApp"}</a>;
            })()}</Card>
          {/* The stay (2026-11-04, the owner: "messy — upgrade the design, clean"): where it stands in a pill; arrive and leave with
              their times on a boarding-pass line, the nights between; room · guests · rate as three quiet cells; then the total, what
              is left to pay, and a bar for how much of it is paid. */}
          {(() => {
            const nights = Number(t?.nights ?? 1), today = todayIST();
            const at = (d: string) => new Date(d + "T12:00:00").getTime();
            const night = Math.min(nights, Math.max(1, Math.round((at(today) - at(b.check_in)) / 86400000) + 1));
            const inDays = Math.round((at(b.check_in) - at(today)) / 86400000);
            const when = b.status === "checked_in" ? (b.check_out <= today ? { w: "Due out today", c: "var(--color-red)" } : { w: `Night ${night} of ${nights}`, c: "var(--color-orange)" })
              : b.status === "reserved" ? { w: inDays <= 0 ? "Arriving today" : inDays === 1 ? "Arrives tomorrow" : `Arrives in ${inDays} days`, c: "var(--color-green)" }
              : { w: b.status === "checked_out" ? "Checked out" : b.status.replace("_", " "), c: "var(--color-label-2)" };
            const total = Number(t?.total ?? 0), due = Number(t?.balance ?? 0), paidSoFar = Math.max(0, total - due);
            const share = total > 0 ? Math.min(100, Math.round((paidSoFar / total) * 100)) : 0;
            const hm = (v?: string | null) => (v ? v.slice(0, 5) : null);
            const kids = b.children ? ` · ${b.children} child${b.children > 1 ? "ren" : ""}` : "";
            return (
              <Card className={f.stay} data-folio-stay style={{ "--tone": when.c } as React.CSSProperties}>
                <div className={f.stayHead}><span className={f.cap}>Stay</span><span className={f.when} data-stay-when>{when.w}</span></div>
                <div className={f.trip}>
                  <div className={f.end}><div className={f.endLabel}>Arrive</div><div className={f.endDate}>{waDate(b.check_in)}</div>{hm(restaurant.check_in_time) && <div className={f.endTime}>from {hm(restaurant.check_in_time)}</div>}</div>
                  <div className={f.track}><span className={f.nights}><Moon size={12} aria-hidden />{nights === 1 ? "1 night" : `${nights} nights`}</span></div>
                  <div className={cn(f.end, f.out)}><div className={f.endLabel}>Leave</div><div className={f.endDate}>{waDate(b.check_out)}</div>{hm(restaurant.check_out_time) && <div className={f.endTime}>by {hm(restaurant.check_out_time)}</div>}</div>
                </div>
                <div className={f.facts}>
                  <div className={f.fact}><span className={f.factLabel}>Room</span><span className={f.factValue}>{b.rooms?.number ?? "—"}</span><span className={f.factSub} title={b.rooms?.room_types?.name ?? undefined}>{b.rooms?.room_types?.name ?? "Room"}</span></div>
                  <div className={f.fact}><span className={f.factLabel}>Guests</span><span className={f.factValue}>{b.adults + (b.children ?? 0)}</span><span className={f.factSub}>{b.adults} adult{b.adults > 1 ? "s" : ""}{kids}</span></div>
                  <div className={f.fact}><span className={f.factLabel}>Rate</span><span className={f.factValue}>{formatINR(Number(b.rate), { whole: true })}</span><span className={f.factSub}>per night</span></div>
                </div>
                {(() => {
                  /* 0171 — charged (½ / 1 / more), waived, or (due out today, not late yet) when it starts */
                  const fee = Number(t?.late_fee ?? 0), label = t?.late_label ?? null, waived = !!label && / · waived$/.test(label);
                  const detail = label?.replace(/^Late check-out · /, "").replace(/ · waived$/, "") ?? "";
                  if (fee > 0 || waived) {
                    const state = waived ? "waived" : /day/.test(detail) && !/half day$/.test(detail) ? "full" : "half";
                    const m = detail.match(/(\d+) days?( \+ half)?$/), nights = /half day$/.test(detail) ? 0.5 : m ? Number(m[1]) + (m[2] ? 0.5 : 0) : 0;
                    const amt = waived ? Math.round(Number(b.rate) * nights) : fee;
                    return (
                      <div className={f.late} data-folio-late={state}>
                        <span className={f.lateIcon} aria-hidden><Clock size={18} /></span>
                        <span className={f.lateText}><span className={f.lateTitle}>{waived ? "Late check-out waived" : "Late check-out"}</span><span className={f.lateSub} title={detail}>{detail}</span></span>
                        <span className={f.lateAmt} data-folio-late-amt>{formatINR(waived ? amt : fee, { whole: true })}</span>
                        {b.status === "checked_in" && <button type="button" className={f.lateBtn} disabled={pending} onClick={() => waive(!waived)} data-folio-late-waive={waived ? "undo" : "waive"}>{waived ? "Charge it" : "Waive"}</button>}
                      </div>
                    );
                  }
                  if (lateOn && b.check_out <= todayIST() && Number.isFinite(dueOut) && Date.now() < dueOut + half * 60000) return (
                    <div className={f.late} data-folio-late="soon">
                      <span className={f.lateIcon} aria-hidden><Clock size={18} /></span>
                      <span className={f.lateText}><span className={f.lateTitle}>Late check-out after {clockIST(dueOut + half * 60000)}</span><span className={f.lateSub}>½ night, 1 night after {clockIST(dueOut + full * 60000)}</span></span>
                      <span />
                    </div>
                  );
                  return null;
                })()}
                <div className={f.money}>
                  <div className={f.sums}>
                    <div className={f.sum}><span className={f.sumLabel}>Total</span><span className={f.sumValue}>{formatINR(total)}</span></div>
                    <div className={cn(f.sum, f.right)}><span className={f.sumLabel}>To pay</span><span className={f.sumValue} style={{ color: due > 0 ? "var(--color-orange)" : "var(--color-green)" }} data-stay-due>{formatINR(due)}</span></div>
                  </div>
                  <div className={f.bar} role="progressbar" aria-label="Paid" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${share}%` }} /></div>
                  <div className={f.barText}><span>{formatINR(paidSoFar)} paid</span><span>{share}%</span></div>
                </div>
              </Card>
            );
          })()}
        </div>
        {b.status === "reserved" && b.checkin_token && <OnlineCheckin token={b.checkin_token} base={base} at={b.precheckin_at ?? null} pre={b.precheckin ?? null} guest={b.guests?.full_name ?? ""} phone={b.guests?.phone ?? null} property={restaurant.name} checkIn={b.check_in} />}
        {b.status === "reserved" && <Button size="lg" className="mt-4 w-full" disabled={pending} onClick={() => start(async () => { const r = await checkIn(b.id); if ("error" in r) setErr(r.error!); })}><LogIn size={16} /> Check in guest</Button>}
        {b.status === "checked_in" && (
          <div className="mt-4 grid gap-4 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
            <Card><h3 className="text-lg mb-3">Add to folio</h3>
              <div className="space-y-3"><div className="flex gap-1 p-1 bg-porcelain-2 rounded-xl">{(["extra", "discount"] as const).map((k) => <button key={k} onClick={() => setExtra({ ...extra, kind: k, description: "", amount: 0 })} className={cn("flex-1 h-8 rounded-lg text-xs font-semibold capitalize", extra.kind === k ? "bg-card shadow-feather" : "text-steel")}>{k}</button>)}</div>
                <ChargePicker value={extra.description} onChange={(v) => setExtra({ ...extra, description: v })} presets={presets[extra.kind]} placeholder={extra.kind === "extra" ? "Choose or type a charge" : "Choose or type a reason"}
                  onPick={(p) => setExtra({ ...extra, description: p.name, amount: extra.amount || p.amount || 0 })} />
                <input type="number" className="num" placeholder="Amount" value={extra.amount || ""} onChange={(e) => setExtra({ ...extra, amount: Number(e.target.value) })} />
                <Button variant="outline" className="w-full" disabled={pending || !extra.description || !extra.amount} onClick={() => start(async () => { const r = await addCharge(b.id, extra.kind, extra.description, extra.amount); if ("error" in r) return setErr(r.error!); setErr(null); setExtra({ kind: "extra", description: "", amount: 0 }); })}><Plus size={15} /> Post</Button></div></Card>
            <Card><h3 className="text-lg mb-3 flex items-center gap-2"><UtensilsCrossed size={16} /> Charge a restaurant order</h3>
              {openOrders.length === 0 ? <p className={f.none} data-folio-orders-none>No orders for this room</p> : (
                <ul className={f.orders} data-folio-orders>{[...openOrders].sort((a, c) => Number(c.booking_id === b.id) - Number(a.booking_id === b.id)).map((o) => { const mine = o.booking_id === b.id; return (
                  <li key={o.id} className={f.order} data-folio-order={mine ? "room" : "stay"}>
                    <span className={f.orderText}><span className={f.orderNo}>#{o.order_no} · <span className="num">{formatINR(orderAmt(o))}</span></span>
                      {/* 0170: room service ordered from this room's QR — it posts itself once the kitchen marks it served */}
                      <span className={f.orderSub}>{mine ? "From this room · goes on the bill when served" : orderWhere(o)}</span></span>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => post(o)}>Post to room</Button>
                  </li>); })}</ul>
              )}
              {/* someone staying who ate at a table and gave no phone: the other open orders, only when asked for */}
              {otherOrders.length > 0 && (another ? (
                <div className={f.other} data-folio-other>
                  <span className={f.cap}>Another open order</span>
                  {otherOrders.map((o) => (
                    <div key={o.id} className={f.order} data-folio-other-order>
                      <span className={f.orderText}><span className={f.orderNo}>#{o.order_no} · <span className="num">{formatINR(orderAmt(o))}</span></span><span className={f.orderSub}>{[orderWhere(o), o.customer_name].filter(Boolean).join(" · ")}</span></span>
                      <Button size="sm" variant="outline" disabled={pending} onClick={async () => { if (await ask({ title: `Post #${o.order_no} to room ${b.rooms?.number ?? ""}?`, body: `${formatINR(orderAmt(o))} goes on ${b.guests?.full_name ?? "this guest"}'s bill.`, ok: "Post to room", tone: "go" })) post(o); }}>Post</Button>
                    </div>
                  ))}
                </div>
              ) : <button type="button" className={f.otherBtn} onClick={() => setAnother(true)} data-folio-another><ChevronDown size={15} aria-hidden /> Another order</button>)}
            </Card>
          </div>
        )}
        {b.status === "checked_in" && (
          <Card className="mt-4"><div className="flex items-center justify-between"><h3 className="text-lg">Check out · settle everything</h3><span className="num font-semibold">{formatINR(Number(t.balance))}</span></div>
            <div className="mt-3 space-y-2">{pays.map((p, i) => <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-2"><select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select><input type="number" className="num" value={p.amount || ""} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} /><input placeholder="Ref" value={p.ref} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} /></div>)}
              <Button size="sm" variant="outline" onClick={() => setPays([...pays, { method: "cash", amount: Math.max(0, Number(t.balance) - paid), ref: "" }])}><Plus size={14} /> Split</Button></div>
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" variant="ink" className="w-full mt-4" disabled={pending || paid + 0.01 < Number(t.balance)} onClick={async () => { if (await ask({ title: "Check out?", body: "The room goes to cleaning and one invoice is made.", ok: "Check out", tone: "go", icon: "out" })) start(async () => { const r = await checkOut(b.id, pays); if ("error" in r) setErr(r.error!); else router.push(r.invoiceId ? `/invoices/${r.invoiceId}?done=checkout` : "/frontdesk"); }); }}><LogOut size={16} /> Check out & invoice</Button><p className="text-xs text-steel mt-2">One invoice for everything</p></Card>
        )}
        {b.status === "checked_out" && <div className="mt-4 flex gap-2"><Button disabled={pending} onClick={() => start(async () => { const r = await stayInvoice(b.id); if ("id" in r) router.push(`/invoices/${r.id}`); })}><FileText size={16} /> Final tax invoice</Button><Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print folio</Button></div>}
      </div>

      {/* the folio, coming out of the machine like the bill does — the printer's sides narrow to fit the
          344px column on an iPad held upright (`fit`); 372px from lg holds it whole */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full justify-self-center md:sticky md:top-24">
        <div className="flex justify-center" data-folio data-print-root><PrinterOutput label="Front desk" fit data={{ restaurant, title: "Guest folio", no: `FOLIO-${String(b.booking_no).padStart(4, "0")}`,
          when: `${b.check_in} → ${b.check_out}`, where: `Room ${b.rooms?.number ?? ""}`, cashier: b.guests?.full_name,
          lines: [{ name: `Room · ${t?.nights ?? 1} night${(t?.nights ?? 1) > 1 ? "s" : ""}`, qty: t?.nights ?? 1, price: Number(b.rate) },
            ...(Number(t?.late_fee ?? 0) > 0 ? [{ name: t?.late_label ?? "Late check-out", qty: 1, price: Number(t?.late_fee) }] : []),
            ...charges.filter((c) => !(c.kind === "discount")).map((c) => ({ name: c.description, qty: 1, price: Number(c.amount) }))],
          subtotal: Number(t?.room_total ?? 0) + Number(t?.late_fee ?? 0) + Number(t?.extras ?? 0), discount: Number(t?.discounts ?? 0),
          cgst: Number(t?.gst ?? 0) / 2, sgst: Number(t?.gst ?? 0) / 2, total: Number(t?.total ?? 0),
          payments: charges.filter((c) => c.description === "Advance received" || c.description.startsWith("Payment ·")).map((c) => ({ method: c.description, amount: -Number(c.amount) })),
          balance: Number(t?.balance ?? 0), footer: "We hope you enjoyed your stay" }} /></div>
      </motion.div>
    </div>
  );
}
