"use client";
import { useEffect, useState, useTransition } from "react";
import { Check, MailCheck, Send } from "lucide-react";
import { Button, Field, cn } from "@/components/ui";
import { sendOwnerCode, verifyOwnerCode } from "./actions";

/** The same test the database applies (admin_owner_email_code), so the button lights only for an address it will take. */
const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) && !/@dineflow\.local$/i.test(v.trim());
export const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "Owner's real email" on Master control → Create a property (0195, 2026-11-25 — the owner: "the owner's real email gets
 * a code at once; type the code here; only when it verifies is the property created — otherwise no property account").
 *
 * Send code → the code is emailed to that address (never shown here) → type it → Verify. `verified` is the parent's: the
 * code's id and the address it proved. Editing the address after that drops the proof, so a property can only be made
 * for the exact address that was confirmed. Create property stays off until then (AdminClient), and the database refuses
 * it as well (admin_create_property_verified).
 */
export function OwnerEmailVerify({ email, onEmail, propertyName, verified, onVerified }: {
  email: string; onEmail: (v: string) => void; propertyName: string;
  verified: { id: string; email: string } | null; onVerified: (v: { id: string; email: string } | null) => void;
}) {
  const [busy, start] = useTransition();
  const [sent, setSent] = useState<{ id: string; email: string; echoed: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);            // seconds before another code may be asked for (the database: 1 a minute)
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const isVerified = !!verified && sameEmail(verified.email, email);
  const codeFor = sent && sameEmail(sent.email, email) ? sent : null;   // a code for a different address is no use here

  const send = () => start(async () => {
    setErr(null); setCode("");
    const r = await sendOwnerCode(email.trim(), propertyName);
    if ("error" in r) { setErr(r.error ?? "The code could not be sent."); if (/Wait a minute/i.test(r.error ?? "")) setWait(60); return; }
    setSent({ id: r.id, email: r.email, echoed: r.echoed }); setWait(60);
  });
  const verify = () => start(async () => {
    if (!codeFor) return;
    setErr(null);
    const r = await verifyOwnerCode(codeFor.id, code);
    if ("error" in r) { setErr(r.error ?? "That code is not right."); return; }
    onVerified({ id: codeFor.id, email: r.email });
  });

  return (
    <div className="space-y-2.5" data-owner-email data-verified={isVerified ? "1" : "0"}>
      <Field label="Owner's real email *" hint={isVerified ? "Verified · password-reset codes go here" : "A code is sent here · the property is created only after it is verified"}>
        <input value={email} type="email" required placeholder="owner@gmail.com" autoComplete="off" readOnly={isVerified}
          onChange={(e) => { onEmail(e.target.value); setErr(null); if (verified) onVerified(null); }}
          className={cn(isVerified && "!border-[var(--color-green)]", !email.trim() && propertyName && "!border-[var(--color-orange)]")} data-owner-email-input />
      </Field>

      {isVerified ? (
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-green-2)] px-3.5 min-h-12" data-owner-verified>
          <span className="h-7 w-7 rounded-full bg-[var(--color-green)] text-[var(--color-on-tint)] grid place-items-center shrink-0"><Check size={15} strokeWidth={3} aria-hidden /></span>
          <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">Email verified</span>
          <button type="button" className="h-11 px-2 text-[13px] font-semibold text-[var(--color-tint)] shrink-0"
            onClick={() => { onVerified(null); setCode(""); }} data-owner-change>Change</button>
        </div>
      ) : (<>
        <Button type="button" variant={codeFor ? "outline" : "primary"} className="w-full !h-11" disabled={busy || !looksLikeEmail(email) || wait > 0}
          onClick={send} data-owner-send>
          <Send size={15} aria-hidden /> {codeFor ? (wait > 0 ? `Send again in ${wait}s` : "Send the code again") : busy ? "Sending…" : "Send code to this email"}
        </Button>
        {codeFor && (
          <div className="rounded-2xl border border-[var(--color-separator)] p-3 space-y-2.5" data-owner-code>
            <p className="text-[13px] leading-snug text-[var(--color-label-2)] flex gap-2">
              <MailCheck size={16} className="shrink-0 mt-px text-[var(--color-tint)]" aria-hidden />
              <span>Code sent to <b className="text-[var(--color-label)] break-all">{codeFor.email}</b>. Ask the owner for it — inbox or spam. It works for 10 minutes.</span>
            </p>
            {codeFor.echoed && <p className="text-[12px] text-[var(--color-orange)]" data-owner-echo>Development server, email off — the code is <b className="num">{codeFor.echoed}</b></p>}
            <div className="flex gap-2">
              <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) { e.preventDefault(); verify(); } }}
                inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="The code from the email"
                className="flex-1 min-w-0 num text-center tracking-[0.3em] text-[17px]" data-owner-code-input />
              <Button type="button" className="!h-11 shrink-0" disabled={busy || code.length !== 6} onClick={verify} data-owner-verify>Verify</Button>
            </div>
          </div>
        )}
      </>)}
      {err && <p className="text-sm text-chili" role="alert" data-owner-error>{err}</p>}
    </div>
  );
}
