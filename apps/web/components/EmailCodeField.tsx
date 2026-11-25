"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Check, MailCheck, Send } from "lucide-react";
import { Button, Field, cn } from "@/components/ui";

/** The same test the database applies (_email_code_new), so Send lights only for an address it will take. */
export const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) && !/@dineflow\.(local|cloud)$/i.test(v.trim());
export const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type Verified = { id: string; email: string };
type SendResult = { ok: true; id: string; email: string; echoed?: string | null } | { error?: string };
type CheckResult = { ok: true; email: string } | { error?: string };

/**
 * An email field that proves the address before anything is made (0195 Master control → New property; 0196 Staff → Add
 * staff, /signup, /join — the owner: "apply the email OTP everywhere it is needed").
 *
 * Send code → the code is emailed to that address (never shown here, except DINEFLOW_OTP_ECHO on a development server)
 * → type it → Verify. `verified` is the parent's: the code's id and the address it proved. Editing the address after that
 * drops the proof, so the parent's Create / Add / Start stays off for anything but the exact address confirmed — and the
 * database refuses it as well. `name` adds hidden inputs (`name` = the address, `name + "_otp"` = the code's id) for a
 * <form> that posts.
 */
export function EmailCodeField({ label, email, onEmail, verified, onVerified, send, verify, placeholder = "name@gmail.com",
  hintIdle, hintVerified = "Verified", askWho = "Check the inbox — and spam.", canSend = true, cantSendHint, name, autoFocus }: {
  label: string; email: string; onEmail: (v: string) => void; verified: Verified | null; onVerified: (v: Verified | null) => void;
  send: (email: string) => Promise<SendResult>; verify: (id: string, code: string) => Promise<CheckResult>;
  placeholder?: string; hintIdle?: string; hintVerified?: string; askWho?: ReactNode; canSend?: boolean; cantSendHint?: string;
  name?: string; autoFocus?: boolean;
}) {
  const [busy, start] = useTransition();
  const [sent, setSent] = useState<{ id: string; email: string; echoed: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);            // seconds before another code may be asked for (the database: 1 a minute)
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const isVerified = !!verified && sameEmail(verified.email, email);
  const codeFor = sent && sameEmail(sent.email, email) ? sent : null;   // a code for a different address is no use here

  const doSend = () => start(async () => {
    setErr(null); setCode("");
    const r = await send(email.trim());
    if (!("ok" in r)) { setErr(r.error ?? "The code could not be sent."); if (/Wait a minute/i.test(r.error ?? "")) setWait(60); return; }
    setSent({ id: r.id, email: r.email, echoed: r.echoed ?? null }); setWait(60);
  });
  const doVerify = () => start(async () => {
    if (!codeFor) return;
    setErr(null);
    const r = await verify(codeFor.id, code);
    if (!("ok" in r)) { setErr(r.error ?? "That code is not right."); return; }
    onVerified({ id: codeFor.id, email: r.email });
  });

  return (
    <div className="space-y-2.5 min-w-0" data-email-field data-verified={isVerified ? "1" : "0"}>
      <Field label={label} hint={isVerified ? hintVerified : (!canSend && cantSendHint) || hintIdle}>
        <input value={email} type="email" required placeholder={placeholder} autoComplete="email" readOnly={isVerified} autoFocus={autoFocus}
          onChange={(e) => { onEmail(e.target.value); setErr(null); if (verified) onVerified(null); }}
          className={cn(isVerified && "!border-[var(--color-green)]")} data-email-input />
      </Field>
      {name && <><input type="hidden" name={name} value={isVerified ? verified!.email : ""} /><input type="hidden" name={`${name}_otp`} value={isVerified ? verified!.id : ""} /></>}

      {isVerified ? (
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-green-2)] px-3.5 min-h-12" data-email-verified>
          <span className="h-7 w-7 rounded-full bg-[var(--color-green)] text-[var(--color-on-tint)] grid place-items-center shrink-0"><Check size={15} strokeWidth={3} aria-hidden /></span>
          <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">Email verified</span>
          <button type="button" className="h-11 px-2 text-[13px] font-semibold text-[var(--color-tint)] shrink-0"
            onClick={() => { onVerified(null); setCode(""); }} data-email-change>Change</button>
        </div>
      ) : (<>
        <Button type="button" variant={codeFor ? "outline" : "primary"} className="w-full !h-11" disabled={busy || !looksLikeEmail(email) || !canSend || wait > 0}
          onClick={doSend} data-email-send>
          <Send size={15} aria-hidden /> {codeFor ? (wait > 0 ? `Send again in ${wait}s` : "Send the code again") : busy ? "Sending…" : "Send code to this email"}
        </Button>
        {codeFor && (
          <div className="rounded-2xl border border-[var(--color-separator)] p-3 space-y-2.5" data-email-code>
            <p className="text-[13px] leading-snug text-[var(--color-label-2)] flex gap-2">
              <MailCheck size={16} className="shrink-0 mt-px text-[var(--color-tint)]" aria-hidden />
              <span>Code sent to <b className="text-[var(--color-label)] break-all">{codeFor.email}</b>. {askWho} It works for 10 minutes.</span>
            </p>
            {codeFor.echoed && <p className="text-[12px] text-[var(--color-orange)]" data-email-echo>Development server, email off — the code is <b className="num">{codeFor.echoed}</b></p>}
            <div className="flex gap-2">
              <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (code.length === 6) doVerify(); } }}
                inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="The code from the email"
                className="flex-1 min-w-0 num text-center tracking-[0.3em] text-[17px]" data-email-code-input />
              <Button type="button" className="!h-11 shrink-0" disabled={busy || code.length !== 6} onClick={doVerify} data-email-verify>Verify</Button>
            </div>
          </div>
        )}
      </>)}
      {err && <p className="text-sm text-chili" role="alert" data-email-error>{err}</p>}
    </div>
  );
}
