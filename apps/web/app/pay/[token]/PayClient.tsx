"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, CreditCard, ShieldCheck, Smartphone, Store, Star } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { QR } from "@/components/QR";
import { formatINR } from "@/lib/format";
import { payInfo, claimPaid, sendReview } from "./actions";

import type { PayInfo } from "./types";
export type { PayInfo };

declare global {
  interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (e: { error?: { description?: string } }) => void) => void } }
}

const enc = encodeURIComponent;
const billLabel = (i: PayInfo) => `BILL-${String(i.bill_no).padStart(4, "0")}`;
const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** upi://pay parameters the way every Indian UPI app reads them. Built by hand: URLSearchParams turns a
 *  space into "+", and a few apps then show the payee as "Hotel+Name". */
const upiQuery = (i: PayInfo) =>
  `pa=${enc(i.upi!.vpa)}&pn=${enc(i.upi!.payee)}&am=${Number(i.total).toFixed(2)}&cu=INR&tn=${enc(`${billLabel(i)} ${i.restaurant.name}`.slice(0, 50))}`;
const UPI_APPS = [
  { key: "gpay", name: "Google Pay", scheme: "tez://upi/pay" },
  { key: "phonepe", name: "PhonePe", scheme: "phonepe://pay" },
  { key: "paytm", name: "Paytm", scheme: "paytmmp://pay" },
  { key: "any", name: "Any UPI app", scheme: "upi://pay" },
];

const loadScript = (src: string) => new Promise<void>((ok, fail) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement("script"); s.src = src; s.async = true;
  s.onload = () => ok(); s.onerror = () => fail(new Error("Could not load the payment window. Check the connection and try again."));
  document.head.appendChild(s);
});

export function PayClient({ token, initial, gatewayReady }: { token: string; initial: PayInfo; gatewayReady: boolean }) {
  const [info, setInfo] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tapped, setTapped] = useState(false);            // a UPI app was opened: show the "done paying?" step
  const [ref, setRef] = useState("");
  const [claimed, setClaimed] = useState(!!initial.claim_ref);
  const [showQr, setShowQr] = useState(false);
  const [items, setItems] = useState(false);
  const [phone, setPhone] = useState(true);               // assume a phone: that is where a scanned bill opens
  useEffect(() => { setPhone(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)); }, []);

  // The counter marks a UPI payment, or the gateway confirms a card: this page should notice on its own.
  const refresh = async () => { const r = await payInfo(token); if ("info" in r && r.info) setInfo(r.info); };
  useEffect(() => {
    if (info.status === "paid") return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const vis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.status, token]);

  const total = Number(info.total);
  const tint = info.restaurant.brand_colour ?? undefined;

  const payByCard = async () => {
    setErr(null); setBusy(true);
    try {
      await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      const o = await fetch(`/api/pay/${token}/order`, { method: "POST" }).then((r) => r.json());
      if (o.error) throw new Error(o.error);
      if (!window.Razorpay) throw new Error("The payment window did not load");
      const rz = new window.Razorpay({
        key: o.key_id, order_id: o.order_id, amount: o.amount, currency: "INR", name: o.name, description: o.description,
        image: info.restaurant.logo_url ?? undefined, theme: { color: tint ?? "#4cd964" }, notes: { pay_token: token },
        handler: (res: Record<string, string>) => {
          start(async () => {
            const v = await fetch(`/api/pay/${token}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(res) }).then((r) => r.json());
            if (v.ok) await refresh();
            else setErr(v.error ?? "The payment went through but could not be confirmed here. Show this screen at the counter.");
            setBusy(false);
          });
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on("payment.failed", (e) => { setErr(e.error?.description ?? "The payment did not go through"); setBusy(false); });
      rz.open();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  if (info.status === "paid") return (
    <Shell info={info}>
      <motion.div initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card p-6 text-center mt-5">
        <div className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={32} strokeWidth={3} /></div>
        <h1 className="text-3xl mt-4">Paid. <em>Thank you.</em></h1>
        <div className="num text-4xl mt-2">{formatINR(total)}</div>
        {info.paid_at && <p className="text-sm text-[var(--color-label-2)] mt-2">{stamp(info.paid_at)}</p>}
        {info.payments.length > 0 && (
          <ul className="mt-4 text-sm space-y-1 text-left border-t border-[var(--color-separator)] pt-3">
            {info.payments.map((p, i) => <li key={i} className="flex justify-between"><span className="uppercase">{p.method}{p.ref ? <span className="num text-[var(--color-label-2)]"> · {p.ref}</span> : null}</span><span className="num">{formatINR(Number(p.amount))}</span></li>)}
          </ul>
        )}
        <p className="footnote mt-4">Keep this page as your receipt, or ask the counter for a printed tax invoice.</p>
      </motion.div>
      <ReviewBox token={token} />
    </Shell>
  );

  const counterOnly = !info.upi && !info.gateway;
  return (
    <Shell info={info}>
      {/* the amount, with the items a tap away */}
      <div className="card p-5 mt-5">
        <div className="eyebrow">To pay</div>
        <div className="num text-[44px] leading-none mt-1">{formatINR(total)}</div>
        <button type="button" className="mt-3 text-sm text-[var(--color-label-2)] inline-flex items-center gap-1" onClick={() => setItems(!items)} aria-expanded={items}>
          {info.lines.length} item{info.lines.length === 1 ? "" : "s"} <ChevronDown size={14} className={cn("transition", items && "rotate-180")} />
        </button>
        {items && (
          <div className="mt-3 border-t border-[var(--color-separator)] pt-3 space-y-1 text-sm">
            {info.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{l.qty} × {l.name}</span><span className="num">{formatINR(l.qty * Number(l.price))}</span></div>)}
            <div className="border-t border-dashed border-[var(--color-separator)] pt-2 mt-2 space-y-1 text-[var(--color-label-2)]">
              <div className="flex justify-between"><span>Subtotal</span><span className="num">{formatINR(Number(info.subtotal))}</span></div>
              {Number(info.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span className="num">−{formatINR(Number(info.discount))}</span></div>}
              {Number(info.service) > 0 && <div className="flex justify-between"><span>Service charge</span><span className="num">{formatINR(Number(info.service))}</span></div>}
              <div className="flex justify-between"><span>CGST + SGST</span><span className="num">{formatINR(Number(info.cgst) + Number(info.sgst))}</span></div>
              {Number(info.round_off) !== 0 && <div className="flex justify-between"><span>Round off</span><span className="num">{formatINR(Number(info.round_off))}</span></div>}
            </div>
          </div>
        )}
      </div>

      {claimed ? (
        <div className="card p-5 mt-4 border-[var(--color-green)]">
          <div className="flex items-start gap-3">
            <Smartphone size={20} className="shrink-0 text-[var(--color-green)] mt-0.5" />
            <div><b>Noted — thank you.</b><p className="text-sm text-[var(--color-label-2)] mt-1">The counter is confirming your UPI payment{ref ? <> (ref <span className="num">{ref}</span>)</> : null}. This page updates by itself once it is marked paid.</p></div>
          </div>
        </div>
      ) : counterOnly ? (
        <section className="card p-5 mt-4">
          <h2 className="text-xl flex items-center gap-2"><Store size={18} /> Pay at the counter</h2>
          <p className="text-sm text-[var(--color-label-2)] mt-1">Cash, card or UPI at the counter. Show them this bill.</p>
        </section>
      ) : (<>
        {info.upi && (
          <section className="card p-5 mt-4">
            <h2 className="text-xl flex items-center gap-2"><Smartphone size={18} /> Pay with UPI</h2>
            <p className="text-sm text-[var(--color-label-2)] mt-1">The amount and payee are filled in. You pay <b className="num">{info.upi.vpa}</b>.</p>
            {phone ? (
              <div className="grid grid-cols-2 gap-2 mt-4">
                {UPI_APPS.map((a) => <a key={a.key} href={`${a.scheme}?${upiQuery(info)}`} onClick={() => setTapped(true)} className="btn btn-gray justify-center">{a.name}</a>)}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <QR value={`upi://pay?${upiQuery(info)}`} size={168} />
                <p className="text-sm text-[var(--color-label-2)]">Open any UPI app on your phone and scan this. The amount is already set.</p>
              </div>
            )}
            {phone && (showQr
              ? <div className="mt-3 flex justify-center"><QR value={`upi://pay?${upiQuery(info)}`} size={168} label="Scan with the phone that pays" /></div>
              : <button type="button" className="mt-3 text-xs text-[var(--color-label-2)] underline" onClick={() => setShowQr(true)}>Paying from another phone? Show a QR</button>)}
            {(tapped || !phone) && (
              <div className="mt-4 pt-4 border-t border-[var(--color-separator)]">
                <div className="text-sm font-semibold">Done paying?</div>
                <p className="text-xs text-[var(--color-label-2)] mt-0.5">Let the counter know. The reference (UTR) from your UPI app helps them find it at once.</p>
                <div className="flex gap-2 mt-2">
                  <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / reference (optional)" className="num flex-1" inputMode="numeric" />
                  <Button loading={pending} onClick={() => start(async () => { const r = await claimPaid(token, ref.trim()); if ("error" in r) setErr(r.error!); else setClaimed(true); })}>I&apos;ve paid</Button>
                </div>
              </div>
            )}
          </section>
        )}
        <section className="card p-5 mt-4">
          <h2 className="text-xl flex items-center gap-2"><CreditCard size={18} /> Pay by card</h2>
          {info.gateway && gatewayReady ? (<>
            <p className="text-sm text-[var(--color-label-2)] mt-1">Debit or credit card, netbanking or a wallet, in a secure window from Razorpay.</p>
            <Button size="lg" className="w-full mt-4" loading={busy} onClick={payByCard}>Pay {formatINR(total)} by card</Button>
            <p className="footnote mt-2 flex items-center gap-1"><ShieldCheck size={12} /> Your card details go to Razorpay only. {info.restaurant.name} never sees them.</p>
          </>) : (
            <p className="text-sm text-[var(--color-label-2)] mt-1">{info.gateway ? "Card payments on the phone are not switched on for this server yet. " : ""}The counter has a card machine. Show them this bill.</p>
          )}
        </section>
      </>)}
      {err && <p className="text-sm text-[var(--color-red)] mt-3">{err}</p>}
    </Shell>
  );
}

/** Five stars and a line, sent once. The property reads it under Reservations → reviews. */
function ReviewBox({ token }: { token: string }) {
  const [rating, setRating] = useState(0); const [body, setBody] = useState(""); const [name, setName] = useState("");
  const [sent, setSent] = useState(false); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  if (sent) return <div className="card p-5 mt-4 text-center"><b>Thank you.</b><p className="text-sm text-[var(--color-label-2)] mt-1">Your word reaches the owner directly.</p></div>;
  return (
    <section className="card p-5 mt-4">
      <h2 className="text-xl">How was it?</h2>
      <div className="flex gap-1 mt-3" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}
            className={cn("h-11 w-11 rounded-xl grid place-items-center transition", n <= rating ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}><Star size={20} fill={n <= rating ? "currentColor" : "none"} /></button>
        ))}
      </div>
      {rating > 0 && (
        <div className="mt-3 space-y-2">
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={rating >= 4 ? "What did you like?" : "What should we fix?"} maxLength={500} />
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="flex-1" maxLength={60} />
            <Button loading={pending} onClick={() => start(async () => { const r = await sendReview(token, rating, body, name); if ("error" in r) setErr(r.error!); else setSent(true); })}>Send</Button>
          </div>
          {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
        </div>
      )}
    </section>
  );
}

function Shell({ info, children }: { info: PayInfo; children: ReactNode }) {
  const r = info.restaurant;
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] p-5" style={r.brand_colour ? { ["--color-tint" as string]: r.brand_colour } : undefined}>
      <div className="max-w-md mx-auto pt-6 pb-12">
        <div className="flex items-center gap-3">
          {r.logo_url
            ? <img src={r.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover shrink-0" />
            : <span className="h-11 w-11 rounded-xl bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-lg shrink-0">{r.name.slice(0, 1)}</span>}
          <div className="min-w-0">
            <div className="font-display text-xl leading-tight truncate">{r.name}</div>
            {r.address && <div className="text-xs text-[var(--color-label-2)] truncate">{r.address}</div>}
          </div>
        </div>
        <div className="text-xs text-[var(--color-label-2)] mt-3 num">{billLabel(info)} · {info.where} · {stamp(info.created_at)}</div>
        {children}
        <p className="text-[10px] tracking-[0.2em] uppercase text-[var(--color-label-3)] text-center mt-8">Powered by DineFlow{r.gstin ? ` · GSTIN ${r.gstin}` : ""}</p>
      </div>
    </div>
  );
}
