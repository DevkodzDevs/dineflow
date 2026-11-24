import "server-only";

/**
 * Sending one-time codes.
 *
 * This project has never sent email, so there is nothing to plug into. Rather than add a mail
 * library and a build step, this speaks Resend's HTTP API directly with fetch — set two environment
 * variables and codes start arriving; set neither and every send fails loudly instead of pretending
 * to have worked. A silent no-op here would be the worst outcome: the owner waits for a code that
 * was never posted and has no way to tell.
 *
 *   RESEND_API_KEY   from resend.com → API keys
 *   EMAIL_FROM       a verified sender, e.g. "DineFlow <no-reply@yourdomain.in>"
 *
 * Or Gmail (2026-11-25 — the owner: "can the codes go from Gmail?"): a Gmail account with 2-Step Verification and an
 * App Password (myaccount.google.com/apppasswords), sent through smtp.gmail.com:465 with nodemailer. ~500 emails a day on
 * a free account. The sender is the Gmail address itself (Gmail rewrites any other From).
 *
 *   GMAIL_USER          the account, e.g. dineflow.otp@gmail.com
 *   GMAIL_APP_PASSWORD  the 16-letter App Password (not the Gmail password; spaces are fine)
 *   EMAIL_FROM          optional, e.g. "DineFlow <dineflow.otp@gmail.com>" — only its display name is used
 *
 * With both set, Resend is used (a domain sender looks more professional); with neither, every send fails loudly.
 *
 * DINEFLOW_OTP_ECHO=1 skips sending and returns the code to the screen instead. That is for local
 * testing on a machine with no mail account; it puts the code in the browser, so it must never be
 * set on anything reachable from outside.
 */
import nodemailer, { type Transporter } from "nodemailer";

export type SendResult = { ok: true; echoed?: string } | { ok: false; error: string };

const resendOn = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const gmailOn = () => Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
export const emailConfigured = () => resendOn() || gmailOn();
/** Which way the codes go out: "resend", "gmail" or null (off). */
export const emailVia = (): "resend" | "gmail" | null => (resendOn() ? "resend" : gmailOn() ? "gmail" : null);

let gmail: Transporter | null = null;
/** One connection setup per server instance; a hung Gmail must not hold the screen open. */
function gmailTransport(): Transporter {
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER!.trim(), pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return gmail;
}

/** "DineFlow <the gmail address>": the display name from EMAIL_FROM when there is one, the address always the account's. */
export function gmailFrom(user: string, emailFrom?: string): string {
  const name = emailFrom?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() || "DineFlow";
  return `${name.replace(/[<>"\r\n]/g, "")} <${user.trim()}>`;
}

async function sendGmail(to: string, subject: string, text: string): Promise<SendResult> {
  try {
    await gmailTransport().sendMail({ from: gmailFrom(process.env.GMAIL_USER!, process.env.EMAIL_FROM), to, subject, text });
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    gmail = null;   // a fresh connection next time
    if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
      return { ok: false, error: "Gmail refused the sign-in, so no code was sent. Check GMAIL_USER and GMAIL_APP_PASSWORD — after the Gmail password changes, a new App Password is needed." };
    }
    if (err.responseCode === 550 || err.responseCode === 553) {
      return { ok: false, error: `Gmail would not deliver to ${to}. Check the address. (${err.message?.slice(0, 160) ?? ""})` };
    }
    if (err.responseCode === 421 || err.responseCode === 454 || /limit/i.test(err.message ?? "")) {
      return { ok: false, error: "Gmail's daily sending limit was reached, so no code was sent. Try again later." };
    }
    return { ok: false, error: `The code could not be sent through Gmail: ${err.message ?? String(e)}` };
  }
}
/* Honoured only by a development server (`next dev`, which is what the launcher's local mode runs).
   A production build ignores it — on Vercel, on a Box in the building, anywhere — because a reset code
   on screen lets anyone who knows a login id take that account. */
export const otpEcho = () => process.env.DINEFLOW_OTP_ECHO === "1" && process.env.NODE_ENV !== "production";

/**
 * The code that proves a new member of staff owns the address on their record. Worth its own wording:
 * this one arrives unprompted, sent by someone else, so it has to say who added them and why — a
 * bare "your code is 123456" from a name they have never heard of reads like a phishing attempt.
 */
export async function sendContactVerification(to: string, code: string, name: string, propertyName: string): Promise<SendResult> {
  const text = [
    `Hello ${name},`,
    "",
    `You have been added to ${propertyName} on DineFlow, and this address was given as your contact.`,
    "",
    `Your confirmation code is ${code}`,
    "",
    "Give it to whoever is setting you up. It expires in 15 minutes.",
    "Once confirmed, your password reset codes will come here.",
    "",
    `If you have no connection to ${propertyName}, ignore this message; nothing happens without the code.`,
  ].join("\n");
  return send(to, `${code} is your DineFlow confirmation code`, text, code,
    "Email is off, so no code was sent. Their sign-in works; only the address is unconfirmed.");
}

/**
 * The code that proves a NEW property's owner email before Master control may create the property (0195, 2026-11-25).
 * The owner reads it out (or forwards it) to whoever is setting the property up; nothing exists until it is typed back.
 */
export async function sendOwnerEmailCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  const name = propertyName.trim() || "your property";
  const text = [
    `Your DineFlow code is ${code}`,
    "",
    `DineFlow is setting up ${name}, and this address was given as the owner's email.`,
    "Give this code to the person setting it up. It expires in 10 minutes and works once.",
    "Once confirmed, your password reset codes will come here.",
    "",
    `If you have no connection to ${name}, ignore this message; nothing is created without the code.`,
  ].join("\n");
  return send(to, `${code} is your DineFlow code to confirm ${name}`, text, code,
    "Email is off on this server, so no code could be sent — and a property cannot be created without it. Set GMAIL_USER + GMAIL_APP_PASSWORD (or RESEND_API_KEY + EMAIL_FROM) in Vercel → Settings → Environment Variables, redeploy, then send the code again.");
}

export async function sendPasswordCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  const text = [
    `Your DineFlow verification code is ${code}`,
    "",
    `It lets you set a new password for ${propertyName}.`,
    "It expires in 10 minutes and works once.",
    "",
    "Didn't ask for this? Ignore it and tell whoever runs your account.",
  ].join("\n");
  return send(to, `${code} is your DineFlow verification code`, text, code);
}

/**
 * The one place that actually posts anything, so both kinds of code fail and echo the same way.
 * `unconfigured` lets each caller say what an unsent code means for them — losing your way back into
 * an account is a different problem from an address that is merely unconfirmed, and the same sentence
 * cannot serve both.
 */
async function send(to: string, subject: string, text: string, code: string, unconfigured?: string): Promise<SendResult> {
  if (otpEcho()) return { ok: true, echoed: code };

  if (!emailConfigured()) {
    return {
      ok: false,
      error: unconfigured ?? "Email is off, so no code was sent. Ask Master control to change your password.",
    };
  }

  if (emailVia() === "gmail") return sendGmail(to, subject, text);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
      // a hung mail provider must not hold the screen open indefinitely
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `The mail provider refused the message (${res.status}). ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `The code could not be sent: ${why}` };
  }
}
