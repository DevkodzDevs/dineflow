"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, PasswordInput, Reveal, cn } from "@/components/ui";
import { UtensilsCrossed, Building2, Palmtree } from "lucide-react";

type Action = (s: unknown, fd: FormData) => Promise<{ error?: string } | void>;

export function AuthForm({ mode, action, pendingApproval }:
  { mode: "login" | "signup" | "join"; action: Action; pendingApproval?: boolean }) {
  const [state, act, pending] = useActionState(action as never, null as { error?: string } | null);
  const [ptype, setPtype] = useState("restaurant");
  const showMasterHint = mode === "login" && (process.env.NEXT_PUBLIC_SHOW_MASTER_HINT === "1");
  const copy = {
    login: { title: "Welcome back", sub: "Sign in to your restaurant.", cta: "Sign in" },
    signup: { title: "Open your property", sub: "7-day free trial. No card needed.", cta: "Start free trial" },
    join: { title: "Join your team", sub: "Enter your property's DineFlow code.", cta: "Join restaurant" },
  }[mode];
  return (
    <Reveal className="w-full max-w-sm">
      <div className="lg:hidden flex items-center gap-2.5 mb-8"><span className="h-9 w-9 rounded-xl bg-saffron grid place-items-center text-on-tint font-display font-bold text-lg">D</span><span className="font-display text-xl">DineFlow</span></div>
      <h1 className="text-4xl">{pendingApproval ? "Waiting for approval" : copy.title}</h1>
      <p className="text-steel mt-2">
        {pendingApproval
          ? "You have joined, but the owner has not switched your account on yet. Ask them to open Staff and activate you, then sign in again."
          : copy.sub}
      </p>
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
        {mode === "join" && (
          <Field label="DineFlow code" hint="The code on your property, like dine-res-mano-00001. An invite code from your manager also works.">
            <input name="code" required className="num" placeholder="dine-res-mano-00001" maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
        )}
        {/* On sign-in this is the DineFlow id, not a mailbox, so it is not typed as an email field —
            a browser would otherwise refuse dine-htl-mano-00001 before the form was ever submitted. */}
        {mode === "login"
          ? <Field label="Login ID" hint="The DineFlow id from Master control, or your email">
              <input name="email" required autoFocus autoComplete="username" autoCapitalize="none"
                autoCorrect="off" spellCheck={false} className="num" placeholder="dine-htl-mano-00001" />
            </Field>
          : <Field label="Email"><input name="email" type="email" required autoComplete="email" placeholder="you@restaurant.in" /></Field>}
        <Field label="Password"><PasswordInput name="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
        {mode === "login" && (
          <div className="text-right -mt-1">
            <Link href="/forgot" className="text-sm text-steel underline">Forgot your password?</Link>
          </div>
        )}
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
