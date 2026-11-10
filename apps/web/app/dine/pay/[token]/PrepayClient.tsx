"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { prepayStatus, type PrepayInfo } from "./actions";

/**
 * The prepay page (0181). While the order is held it shows the dynamic UPI QR for the exact total and waits: every few
 * seconds it asks whether the money has landed. When it has (the webhook settled it), it turns into a confirmation with the
 * tracking link, and the order is now the counter's to accept. Nothing here marks anything paid — only Razorpay's webhook does.
 */
export function PrepayClient({ token, initial, gatewayReady }: { token: string; initial: PrepayInfo; gatewayReady: boolean }) {
  const [info, setInfo] = useState<PrepayInfo>(initial);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(false);

  // the code for this order, issued once (re-used if the page is reloaded)
  useEffect(() => {
    if (info.status !== "pending" || !gatewayReady || asked.current) return;
    asked.current = true; setLoading(true);
    fetch(`/api/dine/pay/${token}/qr`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { image_url?: string; error?: string }) => { if (d.image_url) setQr(d.image_url); else setErr(d.error ?? "Could not start the payment."); })
      .catch(() => setErr("Could not reach the payment service."))
      .finally(() => setLoading(false));
  }, [token, info.status, gatewayReady]);

  // wait for the money: ask the order's state while the tab is open
  useEffect(() => {
    if (info.status === "paid") return;
    const tick = async () => { if (document.visibilityState !== "visible") return; const next = await prepayStatus(token); if (next) setInfo(next); };
    const t = setInterval(() => void tick(), 5000);
    const vis = () => void tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [token, info.status]);

  if (info.status === "paid") return (
    <main className="min-h-dvh grid place-items-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm text-center py-10">
        <div className="mx-auto h-16 w-16 rounded-full bg-[var(--color-green-2)] grid place-items-center"><Check size={32} className="text-[var(--color-tint)]" /></div>
        <h1 className="text-3xl mt-5">Paid. <em>Thank you.</em></h1>
        <p className="text-[var(--color-label-2)] mt-2">{info.name} has your order{info.ref ? ` · #${info.ref}` : ""}. The kitchen takes it from here.</p>
        <div className="mt-7 flex gap-2">
          {info.track && <Link href={`/track/${info.track}`} className="flex-1"><Button variant="gray" className="w-full"><MapPin size={15} /> Track your order</Button></Link>}
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-dvh grid place-items-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm py-10">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-label-3)]">{info.name}</p>
          <h1 className="text-3xl mt-2">Pay {formatINR(info.total)}</h1>
          <p className="text-[var(--color-label-2)] mt-2 text-sm">Scan with any UPI app to confirm your order{info.ref ? ` · #${info.ref}` : ""}.</p>
        </div>

        <div className="mt-6 rounded-3xl bg-[var(--color-bg-2)] border border-[var(--color-line)] p-6 grid place-items-center min-h-[280px]">
          {qr ? (
            /* Razorpay serves the single-use UPI QR image for this exact amount */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="UPI QR to pay for your order" width={240} height={240} className="rounded-xl bg-white p-2" />
          ) : err ? (
            <div className="text-center text-sm">
              <p className="text-[var(--color-red)] font-medium">{err}</p>
              <p className="text-[var(--color-label-2)] mt-2">This order is held for 20 minutes. If payment will not start, place it again from the menu.</p>
            </div>
          ) : (
            <p className="text-[var(--color-label-2)] text-sm">{loading || gatewayReady ? "Preparing your UPI code…" : "Online payment is not available right now."}</p>
          )}
        </div>

        {qr && (
          <div className="mt-5 flex items-start gap-2 text-xs text-[var(--color-label-2)]">
            <Smartphone size={14} className="mt-0.5 shrink-0" />
            <p>Open PhonePe, Google Pay, Paytm or your bank app and scan. This page confirms by itself the moment the payment lands — keep it open.</p>
          </div>
        )}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-label-3)]">
          <ShieldCheck size={13} /> Paid straight to {info.name} · <span>Powered by DineFlow</span>
        </div>
      </div>
    </main>
  );
}
