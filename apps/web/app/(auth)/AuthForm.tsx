"use client";
import { useActionState, useEffect, useRef, type ClipboardEvent } from "react";
import Link from "next/link";
import { useState } from "react";
import { sameLogin, splitPastedLogin } from "./pasteLogin";
import { Button, Field, PasswordInput, Reveal, cn } from "@/components/ui";
import { UtensilsCrossed, Building2, Palmtree, Sparkles } from "lucide-react";
import { DemoDialog } from "./demo/DemoDialog";
import { InstallRow } from "@/components/shell/InstallRow";
import { EmailCodeField, sameEmail, type Verified } from "@/components/EmailCodeField";
import { PhoneField } from "@/components/PhoneField";
import { isMobile } from "@/lib/phone";
import { publicSendCode, publicVerifyCode } from "./actions";

type Action = (s: unknown, fd: FormData) => Promise<{ error?: string; go?: string } | void>;

export function AuthForm({ mode, action, pendingApproval }:
  { mode: "login" | "signup" | "join"; action: Action; pendingApproval?: boolean }) {
  const [state, act, pending] = useActionState(action as never, null as { error?: string; go?: string } | null);
  /* signed in: into the app by a full page load (actions.ts login — a client-side move from here looped on the layout's
     redirect in Safari); the button keeps saying "One moment…" until the new page is up */
  useEffect(() => { if (state?.go) window.location.replace(state.go); }, [state]);
  const leaving = !!state?.go;
  const [ptype, setPtype] = useState("restaurant");
  // 0196: sign-up and join prove the email with a code before the account exists
  const [email, setEmail] = useState(""); const [ok, setOk] = useState<Verified | null>(null);
  const [phone, setPhone] = useState(""); const [propertyName, setPropertyName] = useState("");
  const verified = !!ok && sameEmail(ok.email, email);
  const [showDemo, setShowDemo] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  /* "<id> / <password>" pasted whole (pasteLogin.ts): the id goes to Login ID — only when that box is empty or already
     holds the same login — and only the password stays in Password. Pasted into Login ID, the password moves to
     Password (if that is empty) instead of sitting in the id, which the sign-in throttle records. On the device only. */
  const put = (el: HTMLInputElement, text: string, replaceSelection: boolean) => {
    if (replaceSelection) {
      const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
      el.value = el.value.slice(0, s) + text + el.value.slice(e);
      const at = s + text.length;
      try { el.setSelectionRange(at, at); } catch { /* some input types refuse a selection */ }
    } else el.value = text;
  };
  const onPastePassword = (e: ClipboardEvent<HTMLInputElement>) => {
    const got = splitPastedLogin(e.clipboardData.getData("text"));
    const idEl = idRef.current;
    if (!got || !idEl) return;
    if (idEl.value.trim() && !sameLogin(idEl.value, got.id)) return;   // a different id is typed: paste as it is
    e.preventDefault();
    if (!idEl.value.trim()) put(idEl, got.id, false);
    put(e.currentTarget, got.password, true);
  };
  const onPasteId = (e: ClipboardEvent<HTMLInputElement>) => {
    const got = splitPastedLogin(e.clipboardData.getData("text"));
    const pwEl = e.currentTarget.form?.elements.namedItem("password");
    if (!got || !(pwEl instanceof HTMLInputElement)) return;
    e.preventDefault();
    put(e.currentTarget, got.id, false);
    if (!pwEl.value) put(pwEl, got.password, false);
  };
  const copy = {
    login: { title: "Welcome back", sub: "Sign in to your restaurant.", cta: "Sign in" },
    signup: { title: "Open your property", sub: "7-day free trial. No card needed.", cta: "Start free trial" },
    join: { title: "Join your team", sub: "Enter your property's DineFlow code.", cta: "Join restaurant" },
  }[mode];
  return (
    <Reveal className="w-full max-w-sm min-[1800px]:max-w-[26rem]">
      {/* the left panel carries the brand from lg up; below that this is the only place it appears */}
      <div className="lg:hidden flex items-center gap-2.5 mb-8">
        {/* the card behind this one flips with the theme, so the mark ships in two inks */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="" width={36} height={36} className="mark-board h-9 w-9 shrink-0 object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark-ink.png" alt="" width={36} height={36} className="mark-paper h-9 w-9 shrink-0 object-contain" />
        <span className="font-display text-xl">DineFlow</span>
      </div>
      <h1 className="text-4xl">{pendingApproval ? "Waiting for approval" : copy.title}</h1>
      <p className="text-steel mt-2">
        {pendingApproval
          ? "You're in, but not active yet. Ask the owner to activate you in Staff."
          : copy.sub}
      </p>
      <form action={act} className="mt-8 space-y-4">
        {mode !== "login" && <Field label="Your name"><input name="full_name" required autoComplete="name" placeholder="Your full name" /></Field>}
        {mode === "signup" && (<>
          <Field label="What are you running?">
            <div className="grid grid-cols-3 gap-2">
              {[{ v: "restaurant", l: "Restaurant", I: UtensilsCrossed }, { v: "hotel", l: "Hotel", I: Building2 }, { v: "resort", l: "Resort", I: Palmtree }].map(({ v, l, I }) => (
                <button type="button" key={v} onClick={() => setPtype(v)} className={cn("feather feather-lift flex flex-col items-center gap-1.5 py-3 text-xs font-semibold", ptype === v && "!border-saffron bg-saffron/5 shadow-glow")}><I size={18} />{l}</button>
              ))}
            </div>
            <input type="hidden" name="property_type" value={ptype} />
          </Field>
          <Field label={ptype === "restaurant" ? "Restaurant name" : ptype === "hotel" ? "Hotel name" : "Resort name"}><input name="restaurant" required value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder={ptype === "restaurant" ? "Annapoorna Mess" : ptype === "hotel" ? "Hotel Tamizh Residency" : "Kanyakumari Bay Resort"} /></Field>
        </>)}
        {mode === "join" && (
          <Field label="DineFlow code" hint="Property code or invite code">
            <input name="code" required className="num" placeholder="Code from your manager" maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
        )}
        {/* On sign-in this is the DineFlow id, not a mailbox, so it is not typed as an email field —
            a browser would otherwise refuse dine-htl-mano-00001 before the form was ever submitted. */}
        {mode === "login"
          ? <Field label="Login ID" hint="Your DineFlow ID or email">
              <input ref={idRef} onPaste={onPasteId} name="email" required autoFocus autoComplete="username" autoCapitalize="none"
                autoCorrect="off" spellCheck={false} placeholder="Login ID or email" />
            </Field>
          : (<>
            {/* 0196: our code proves the email before the account exists; the phone (needed to open a property) must not
                belong to another DineFlow account — the code is refused for either repeat */}
            <PhoneField label={mode === "signup" ? "Your phone" : "Your phone (optional)"} hint="10 digits" value={phone} onValue={setPhone} name="phone" required={mode === "signup"} />
            <EmailCodeField label="Email" email={email} onEmail={setEmail} verified={ok} onVerified={setOk} name="email"
              placeholder="Your email address" hintIdle="We send a 6-digit code to confirm it" hintVerified="Verified"
              canSend={mode !== "signup" || isMobile(phone)} cantSendHint="Enter your phone first"
              send={(e) => publicSendCode(e, phone, mode === "signup" ? "signup" : "join", propertyName)} verify={publicVerifyCode} />
          </>)}
        <Field label="Password" hint={mode === "login" ? undefined : "At least 8 characters"}><PasswordInput name="password" required minLength={mode === "login" ? 6 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"}
          onPaste={mode === "login" ? onPastePassword : undefined} /></Field>
        {mode === "login" && (
          <div className="text-right -mt-1">
            <Link href="/forgot" className="text-sm text-steel underline">Forgot your password?</Link>
          </div>
        )}
        {state?.error && <p className="text-sm text-chili bg-chili-2 rounded-xl px-3 py-2">{state.error}</p>}
        <Button size="lg" className="w-full" disabled={pending || leaving || (mode !== "login" && !verified)} data-auth-submit>{pending || leaving ? "One moment…" : copy.cta}</Button>
        {mode !== "login" && !verified && <p className="text-xs text-steel text-center -mt-2" data-auth-blocked>Verify your email to continue</p>}
      </form>
      {mode === "login" && (
        <button type="button" onClick={() => setShowDemo(true)}
          className="mt-5 w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-[var(--color-tint)]/40 text-sm font-semibold text-[var(--color-tint)] hover:bg-[var(--color-green-2)] transition-colors">
          <Sparkles size={15} /> Try Demo
          <span className="text-xs font-normal text-steel">8 hours, no sign-up</span>
        </button>
      )}
      <div className="mt-6 text-sm text-steel space-x-3">
        {mode !== "login" && <Link href="/login" className="underline">Sign in</Link>}
        {mode !== "signup" && <Link href="/signup" className="underline">Open a restaurant</Link>}
        {mode !== "join" && <Link href="/join" className="underline">Join with code</Link>}
      </div>
      {/* the first screen on a new device: install here, and the app opens to this sign-in */}
      <InstallRow className="mt-6" />
      {showDemo && <DemoDialog open={showDemo} onClose={() => setShowDemo(false)} />}
    </Reveal>
  );
}
