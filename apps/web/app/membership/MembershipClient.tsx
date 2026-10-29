"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { LegalFooter } from "@/components/LegalFooter";
import { motion } from "framer-motion";
import { Crown, KeyRound, Check, LogOut, CreditCard } from "lucide-react";
import { formatINR } from "@dineflow/shared";
import { Button, Field, cn } from "@/components/ui";
import { redeemKey } from "./actions";

type PlanInfo = { key: string; label: string; monthly: number | null; yearly: number | null } | null;
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (e: { error?: { description?: string } }) => void) => void } } }
const loadCheckout = () => new Promise<void>((ok, fail) => {
  if (window.Razorpay) return ok();
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
  s.onload = () => ok(); s.onerror = () => fail(new Error("The payment window didn't load. Check your connection and retry.")); document.head.appendChild(s);
});

export function MembershipClient({ state, name, plan, endsAt, trialDays, isOwner, planInfo = null, online = false }: { state: string; name: string; plan: string | null; endsAt: string | null; trialDays: number; isOwner: boolean; planInfo?: PlanInfo; online?: boolean }) {
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null); const [pending, start] = useTransition();
  const router = useRouter(); const [paying, setPaying] = useState<"month" | "year" | null>(null);
  /* 0151: the prices are the plan's (Master control → Keys → Plans & prices), not numbers in the code; with DineFlow's
     Razorpay keys on the server the owner pays here — the server makes the order, checks Razorpay's signature, and the
     database extends the membership exactly as a key does */
  const monthly = planInfo ? planInfo.monthly : 2499, yearly = planInfo ? planInfo.yearly : 24999;
  // what the yearly price saves, in months — said only when it is at least one
  const freeMonths = monthly && yearly ? Math.round(12 - Number(yearly) / Number(monthly)) : 0;
  const pay = async (period: "month" | "year") => {
    setMsg(null); setPaying(period);
    try {
      await loadCheckout();
      const o = await fetch("/api/membership/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period }) }).then((r) => r.json());
      if (o.error) throw new Error(o.error);
      const rz = new window.Razorpay!({
        key: o.key_id, order_id: o.order_id, amount: o.amount, currency: "INR", name: o.name, description: o.description, theme: { color: "#3fbe7c" },
        handler: async (res: Record<string, string>) => {
          const v = await fetch("/api/membership/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(res) }).then((r) => r.json()).catch(() => ({ error: "Paid — your membership turns on in a minute." }));
          setPaying(null);
          if (v.ok) { setMsg({ ok: true, text: `Paid. Active until ${v.ends_at ? new Date(v.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "next period"}.` }); router.refresh(); }
          else setMsg({ text: v.error ?? "The payment could not be confirmed." });
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rz.on("payment.failed", (e) => { setMsg({ text: e.error?.description ?? "The payment did not go through" }); setPaying(null); });
      rz.open();
    } catch (e) { setMsg({ text: (e as Error).message }); setPaying(null); }
  };
  const locked = state === "expired" || state === "suspended";
  return (
    <div className="min-h-dvh grid place-items-center p-6 aurora">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="glass p-8">
          <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-2xl bg-ink text-on-label grid place-items-center"><Crown size={20} /></span><div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{name}</div><h1 className="text-3xl">{locked ? "Membership login" : "Membership"}</h1></div></div>
          <div className="hairline-gold my-6" />
          {state === "trial" && <p className="text-sm text-steel">Trial: <b className="text-ink">{trialDays} day{trialDays === 1 ? "" : "s"} left</b></p>}
          {state === "expired" && <p className="text-sm text-steel">Trial ended · data safe</p>}
          {state === "suspended" && <p className="text-sm text-chili">This account is suspended. Contact DineFlow support.</p>}
          {state === "active" && <p className="text-sm text-steel leading-relaxed"><Check size={16} className="text-mint inline -mt-0.5 mr-1.5" />Active · <b className="text-ink capitalize">{plan}</b> plan{endsAt && <> · renews by <span className="num whitespace-nowrap">{endsAt.slice(0, 10)}</span></>}</p>}
          {state !== "suspended" && (isOwner ? (
            <form className="mt-6 space-y-4" action={(fd) => start(async () => { const r = await redeemKey(fd); setMsg("error" in r ? { text: r.error! } : { ok: true, text: `${r.plan} plan active` }); })}>
              <Field label="Membership key" hint="From DineFlow"><input name="code" required placeholder="A1B2-C3D4-E5F6" className="num uppercase tracking-[0.2em] text-lg" /></Field>
              {msg && <p className={cn("text-sm", msg.ok ? "text-mint" : "text-chili")}>{msg.text}</p>}
              <Button size="lg" className="w-full" disabled={pending}><KeyRound size={16} /> {pending ? "Checking…" : state === "active" ? "Extend membership" : "Activate membership"}</Button>
            </form>
          ) : <p className="mt-6 text-sm text-steel">Owner enters the key</p>)}
          {planInfo && <div className="mt-6 -mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-steel" data-plan-label>{planInfo.label} plan</div>}
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm" data-plan={planInfo?.key ?? ""}>
            <div className="feather p-4 flex flex-col"><div className="font-semibold">Monthly</div><div className="num text-2xl mt-1" data-price-month>{monthly != null ? formatINR(monthly, { whole: true }) : "—"}</div><div className="text-xs text-steel">per property</div>
              {online && isOwner && monthly != null && state !== "suspended" && <Button size="sm" className="mt-3 w-full" disabled={!!paying} onClick={() => void pay("month")} data-pay-period="month"><CreditCard size={14} /> {paying === "month" ? "Opening…" : `Pay ${formatINR(monthly, { whole: true })}`}</Button>}</div>
            <div className="feather p-4 border-champagne flex flex-col"><div className="font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">Yearly {freeMonths >= 1 && <span className="pill pill-gold">{freeMonths} month{freeMonths === 1 ? "" : "s"} free</span>}</div><div className="num text-2xl mt-1" data-price-year>{yearly != null ? formatINR(yearly, { whole: true }) : "—"}</div><div className="text-xs text-steel">per property</div>
              {online && isOwner && yearly != null && state !== "suspended" && <Button size="sm" variant="ink" className="mt-3 w-full" disabled={!!paying} onClick={() => void pay("year")} data-pay-period="year"><CreditCard size={14} /> {paying === "year" ? "Opening…" : `Pay ${formatINR(yearly, { whole: true })}`}</Button>}</div>
          </div>
          {/* the number came from a placeholder and was shown to people trying to pay us;
              it now comes from lib/company.ts, and is simply absent until it is real */}
          {!online && <p className="text-xs text-steel mt-4">
            Get a key: {COMPANY.phone ? <>WhatsApp <span className="num">{COMPANY.phone}</span> · </> : null}
            <a href={`mailto:${COMPANY.supportEmail}`} className="underline">{COMPANY.supportEmail}</a>
          </p>}
          <div className="mt-6 flex justify-between items-center">
            {!locked ? <Link href="/dashboard" className="text-sm font-semibold underline inline-flex items-center min-h-10">Back to control room</Link> : <span />}
            <form action="/logout" method="post"><button className="flex items-center gap-1.5 text-xs text-steel hover:text-ink"><LogOut size={13} /> Sign out</button></form>
          </div>
          <LegalFooter className="!pt-5 mt-5 border-t border-line" />
        </div>
      </motion.div>
    </div>
  );
}
