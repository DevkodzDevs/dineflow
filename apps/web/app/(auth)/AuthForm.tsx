"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Reveal, cn } from "@/components/ui";
import { UtensilsCrossed, Building2, Palmtree } from "lucide-react";

type Action = (s: unknown, fd: FormData) => Promise<{ error?: string } | void>;

export function AuthForm({ mode, action }: { mode: "login" | "signup" | "join"; action: Action }) {
  const [state, act, pending] = useActionState(action as never, null as { error?: string } | null);
  const [ptype, setPtype] = useState("restaurant");
  const showMasterHint = mode === "login" && (process.env.NEXT_PUBLIC_SHOW_MASTER_HINT === "1");
  const copy = {
    login: { title: "Welcome back", sub: "Sign in to your restaurant.", cta: "Sign in" },
    signup: { title: "Open your property", sub: "7-day free trial. No card needed.", cta: "Start free trial" },
    join: { title: "Join your team", sub: "Enter the invite code from your manager.", cta: "Join restaurant" },
  }[mode];
  return (
    <Reveal className="w-full max-w-sm">
      <div className="lg:hidden flex items-center gap-2.5 mb-8"><span className="h-9 w-9 rounded-xl bg-saffron grid place-items-center text-ink font-display font-bold text-lg">D</span><span className="font-display text-xl">DineFlow</span></div>
      <h1 className="text-4xl">{copy.title}</h1>
      <p className="text-steel mt-2">{copy.sub}</p>
      <form action={act} className="mt-8 space-y-4">
        {mode !== "login" && <Field label="Your name"><input name="full_name" required autoComplete="name" placeholder="Priya Kumar" /></Field>}
        {mode === "signup" && (<>
          <Field label="What are you running?">
            <div className="grid grid-cols-3 gap-2">
              {[{ v: "restaurant", l: "Restaurant", I: UtensilsCrossed }, { v: "hotel", l: "Hotel", I: Building2 }, { v: "resort", l: "Resort", I: Palmtree }].map(({ v, l, I }) => (
                <button type="button" key={v} onClick={() => setPtype(v)} className={cn("feather feather-lift flex flex-col items-center gap-1.5 py-3 text-xs font-semibold", ptype === v && "!border-saffron bg-saffron/5 shadow-glow")}><I size={18} />{l}</button>
              ))}
            </div>
            <input type="hidden" name="property_type" value={ptype} />
          </Field>
          <Field label={ptype === "restaurant" ? "Restaurant name" : ptype === "hotel" ? "Hotel name" : "Resort name"}><input name="restaurant" required placeholder={ptype === "restaurant" ? "Annapoorna Mess" : ptype === "hotel" ? "Hotel Tamizh Residency" : "Kanyakumari Bay Resort"} /></Field>
        </>)}
        {mode === "join" && <Field label="Invite code"><input name="code" required className="num uppercase" placeholder="A1B2C3D4" maxLength={8} /></Field>}
        <Field label="Email"><input name="email" type="email" required autoComplete="email" placeholder="you@restaurant.in" /></Field>
        <Field label="Password"><input name="password" type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
        {state?.error && <p className="text-sm text-chili bg-chili-2 rounded-xl px-3 py-2">{state.error}</p>}
        <Button size="lg" className="w-full" disabled={pending}>{pending ? "One moment…" : copy.cta}</Button>
      </form>
      <div className="mt-6 text-sm text-steel space-x-3">
        {mode !== "login" && <Link href="/login" className="underline">Sign in</Link>}
        {mode !== "signup" && <Link href="/signup" className="underline">Open a restaurant</Link>}
        {mode !== "join" && <Link href="/join" className="underline">Join with code</Link>}
      </div>
    </Reveal>
  );
}
