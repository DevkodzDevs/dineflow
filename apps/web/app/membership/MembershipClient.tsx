"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Crown, KeyRound, Check, LogOut } from "lucide-react";
import { Button, Field, cn } from "@/components/ui";
import { redeemKey } from "./actions";

export function MembershipClient({ state, name, plan, endsAt, trialDays, isOwner }: { state: string; name: string; plan: string | null; endsAt: string | null; trialDays: number; isOwner: boolean }) {
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null); const [pending, start] = useTransition();
  const locked = state === "expired" || state === "suspended";
  return (
    <div className="min-h-dvh grid place-items-center p-6 aurora">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="glass p-8">
          <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-2xl bg-ink text-champagne grid place-items-center"><Crown size={20} /></span><div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{name}</div><h1 className="text-3xl">{locked ? "Membership login" : "Membership"}</h1></div></div>
          <div className="hairline-gold my-6" />
          {state === "trial" && <p className="text-sm text-steel">Your <b className="text-ink">7-day trial</b> has {trialDays} day{trialDays === 1 ? "" : "s"} left. Activate now and nothing changes for your team — same logins, same data.</p>}
          {state === "expired" && <p className="text-sm text-steel">The temporary trial login for <b className="text-ink">{name}</b> has ended. Enter the membership key from DineFlow to continue — all your menus, rooms, stock and history are safe.</p>}
          {state === "suspended" && <p className="text-sm text-chili">This account is suspended. Contact DineFlow support.</p>}
          {state === "active" && <p className="text-sm text-steel flex items-center gap-2"><Check size={16} className="text-mint" /> Active · <b className="text-ink capitalize">{plan}</b> plan{endsAt && <> · renews by <span className="num">{endsAt.slice(0, 10)}</span></>}</p>}
          {state !== "suspended" && (isOwner ? (
            <form className="mt-6 space-y-4" action={(fd) => start(async () => { const r = await redeemKey(fd); setMsg("error" in r ? { text: r.error! } : { ok: true, text: `Activated the ${r.plan} plan. Welcome aboard.` }); })}>
              <Field label="Membership key" hint="Format XXXX-XXXX-XXXX, issued by DineFlow master control."><input name="code" required placeholder="A1B2-C3D4-E5F6" className="num uppercase tracking-[0.2em] text-lg" /></Field>
              {msg && <p className={cn("text-sm", msg.ok ? "text-mint" : "text-chili")}>{msg.text}</p>}
              <Button size="lg" className="w-full" disabled={pending}><KeyRound size={16} /> {pending ? "Checking…" : state === "active" ? "Extend membership" : "Activate membership"}</Button>
            </form>
          ) : <p className="mt-6 text-sm text-steel">Ask the owner to enter the membership key.</p>)}
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="feather p-4"><div className="font-semibold">Monthly</div><div className="num text-2xl mt-1">₹2,499</div><div className="text-xs text-steel">per property</div></div>
            <div className="feather p-4 border-champagne"><div className="font-semibold flex items-center gap-1">Yearly <span className="pill pill-gold">2 months free</span></div><div className="num text-2xl mt-1">₹24,999</div><div className="text-xs text-steel">per property</div></div>
          </div>
          <p className="text-xs text-steel mt-4">Get a key: WhatsApp +91 98XXX XXXXX · support@dineflow.in — online payment (Razorpay) arrives in the next version.</p>
          <div className="mt-6 flex justify-between items-center">
            {!locked ? <Link href="/dashboard" className="text-sm font-semibold underline">Back to control room</Link> : <span />}
            <form action="/logout" method="post"><button className="flex items-center gap-1.5 text-xs text-steel hover:text-ink"><LogOut size={13} /> Sign out</button></form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
