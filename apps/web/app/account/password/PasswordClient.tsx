"use client";
import { useActionState, useState, useTransition } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button, Field, PasswordInput } from "@/components/ui";
import { changePassword, requestCode, verifyCode } from "./actions";

type Step = "send" | "code" | "password";

export function PasswordClient({ email, contactEmail, forced }:
  { email: string; contactEmail: string | null; forced: boolean }) {
  const [step, setStep] = useState<Step>("send");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [echoed, setEchoed] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [vState, vAct, vPending] = useActionState(verifyCode as never, null as { error?: string; ok?: boolean } | null);
  const [pState, pAct, pPending] = useActionState(changePassword as never, null as { error?: string } | null);

  // derived, not stored: setting state while rendering is a loop waiting to happen
  const active: Step = vState?.ok ? "password" : step;

  const send = () => start(async () => {
    setSendErr(null);
    const r = await requestCode();
    if ("error" in r && r.error) { setSendErr(r.error); return; }
    setSentTo(("sentTo" in r && r.sentTo) || null);
    setEchoed(("echoed" in r && r.echoed) || null);
    setStep("code");
  });

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <span className="h-11 w-11 rounded-2xl bg-[var(--color-fill)] grid place-items-center mb-5">
          {active === "password" ? <ShieldCheck size={20} /> : active === "code" ? <Mail size={20} /> : <KeyRound size={20} />}
        </span>
        <h1 className="text-3xl">{forced ? "Choose your password" : "Change your password"}</h1>
        <p className="text-sm text-[var(--color-label-2)] mt-2">
          Signed in as <span className="num">{email}</span>
        </p>

        {active === "send" && (
          <div className="mt-7 space-y-4">
            <p className="text-sm text-[var(--color-label-2)]">
              {forced ? "You signed in with a temporary password. " : ""}
              To set a new one, we first send a six-digit code to the email address on this account.
            </p>
            {contactEmail
              ? <p className="text-sm">The code goes to <span className="num font-semibold">{contactEmail}</span>.</p>
              : <p className="text-sm text-[var(--color-orange)]">There is no contact address on this account yet. Ask Master control to add one before you can change your password.</p>}
            {sendErr && <p className="text-sm text-[var(--color-red)] bg-[var(--color-red-2)] rounded-xl px-3 py-2">{sendErr}</p>}
            <Button size="lg" className="w-full" disabled={pending || !contactEmail} onClick={send}>
              {pending ? "Sending the code" : "Send me the code"}
            </Button>
          </div>
        )}

        {active === "code" && (
          <form action={vAct} className="mt-7 space-y-4">
            <p className="text-sm text-[var(--color-label-2)]">
              We sent a six-digit code to <span className="num">{sentTo}</span>. It expires in 10 minutes.
            </p>
            {echoed && (
              <p className="text-sm bg-[var(--color-fill)] rounded-xl px-3 py-2">
                Email is not set up on this server, so the code is shown here instead:{" "}
                <span className="num font-semibold tracking-[0.25em]">{echoed}</span>
              </p>
            )}
            <Field label="Paste the code">
              <input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoFocus autoComplete="one-time-code"
                className="num text-center text-2xl tracking-[0.4em]" placeholder="000000" />
            </Field>
            {vState?.error && <p className="text-sm text-[var(--color-red)] bg-[var(--color-red-2)] rounded-xl px-3 py-2">{vState.error}</p>}
            <Button size="lg" className="w-full" disabled={vPending}>{vPending ? "Checking" : "Check the code"}</Button>
            <button type="button" onClick={send} disabled={pending}
              className="w-full text-sm text-[var(--color-label-2)] underline disabled:opacity-50">
              {pending ? "Sending" : "Send a new code"}
            </button>
            {sendErr && <p className="text-sm text-[var(--color-red)]">{sendErr}</p>}
          </form>
        )}

        {active === "password" && (
          <form action={pAct} className="mt-7 space-y-4">
            <p className="text-sm text-[var(--color-green)]">Code accepted. Set your password within 15 minutes.</p>
            <Field label="New password" hint="At least 8 characters">
              <PasswordInput name="password" required minLength={8} autoComplete="new-password" autoFocus />
            </Field>
            <Field label="Type it again">
              <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" />
            </Field>
            {pState?.error && <p className="text-sm text-[var(--color-red)] bg-[var(--color-red-2)] rounded-xl px-3 py-2">{pState.error}</p>}
            <Button size="lg" className="w-full" disabled={pPending}>{pPending ? "Saving" : "Save and continue"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
