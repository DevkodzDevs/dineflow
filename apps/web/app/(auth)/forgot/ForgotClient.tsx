"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button, Field, PasswordInput, Reveal } from "@/components/ui";
import { requestReset, resetPassword } from "./actions";

export function ForgotClient() {
  const [loginId, setLoginId] = useState("");
  const [rState, rAct, rPending] = useActionState(requestReset as never,
    null as { error?: string; ok?: boolean; echoed?: string } | null);
  const [pState, pAct, pPending] = useActionState(resetPassword as never,
    null as { error?: string; done?: boolean } | null);

  const step = pState?.done ? "done" : rState?.ok ? "code" : "ask";

  return (
    <Reveal className="w-full max-w-sm">
      <div className="lg:hidden flex items-center gap-2.5 mb-8">
        <span className="h-9 w-9 rounded-xl bg-saffron grid place-items-center text-on-tint font-display font-bold text-lg">D</span>
        <span className="font-display text-xl">DineFlow</span>
      </div>
      <span className="h-11 w-11 rounded-2xl bg-[var(--color-fill)] grid place-items-center mb-5">
        {step === "done" ? <ShieldCheck size={20} /> : step === "code" ? <Mail size={20} /> : <KeyRound size={20} />}
      </span>

      {step === "done" ? (
        <>
          <h1 className="text-4xl">Password changed</h1>
          <p className="text-steel mt-2">Sign in with your new password.</p>
          <Link href="/login" className="btn btn-filled w-full mt-7 !h-[52px] !rounded-[16px]">Go to sign in</Link>
        </>
      ) : step === "code" ? (
        <>
          <h1 className="text-4xl">Check your email</h1>
          <p className="text-steel mt-2">
            If <span className="num">{loginId}</span> is a DineFlow account with a contact address on
            it, a six-digit code is on its way. It expires in 10 minutes.
          </p>
          {rState?.echoed && (
            <p className="text-sm bg-[var(--color-fill)] rounded-xl px-3 py-2 mt-4">
              Email is not set up on this server, so the code is shown here instead:{" "}
              <span className="num font-semibold tracking-[0.25em]">{rState.echoed}</span>
            </p>
          )}
          <form action={pAct} className="mt-7 space-y-4">
            <input type="hidden" name="login_id" value={loginId} />
            <Field label="Paste the code">
              <input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoFocus
                autoComplete="one-time-code" className="num text-center text-2xl tracking-[0.4em]" placeholder="000000" />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Type it again">
              <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" />
            </Field>
            {pState?.error && <p className="text-sm text-chili bg-chili-2 rounded-xl px-3 py-2">{pState.error}</p>}
            <Button size="lg" className="w-full" disabled={pPending}>{pPending ? "Saving" : "Set new password"}</Button>
          </form>
          <form action={rAct} className="mt-3">
            <input type="hidden" name="login_id" value={loginId} />
            <button className="w-full text-sm text-steel underline disabled:opacity-50" disabled={rPending}>
              {rPending ? "Sending" : "Send another code"}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-4xl">Forgot your password</h1>
          <p className="text-steel mt-2">
            Enter your login ID. We send a code to the email address recorded for your property.
          </p>
          <form action={rAct} className="mt-7 space-y-4">
            <Field label="Login ID" hint="The DineFlow id you sign in with, like dine-htl-mano-00001">
              <input name="login_id" value={loginId} onChange={(e) => setLoginId(e.target.value)}
                required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="num" placeholder="dine-htl-mano-00001" />
            </Field>
            {rState?.error && <p className="text-sm text-chili bg-chili-2 rounded-xl px-3 py-2">{rState.error}</p>}
            <Button size="lg" className="w-full" disabled={rPending}>{rPending ? "Sending" : "Send me a code"}</Button>
          </form>
        </>
      )}

      <div className="mt-6 text-sm text-steel space-x-3">
        <Link href="/login" className="underline">Back to sign in</Link>
        <Link href="/join" className="underline">Join with a code</Link>
      </div>
    </Reveal>
  );
}
