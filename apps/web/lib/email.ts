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
 * DINEFLOW_OTP_ECHO=1 skips sending and returns the code to the screen instead. That is for local
 * testing on a machine with no mail account; it puts the code in the browser, so it must never be
 * set on anything reachable from outside.
 */

export type SendResult = { ok: true; echoed?: string } | { ok: false; error: string };

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export const otpEcho = () => process.env.DINEFLOW_OTP_ECHO === "1";

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
    "Give this code to whoever is setting you up. It expires in 15 minutes.",
    "Confirming it means you can reset your own password later — codes will come here.",
    "",
    `If you have no connection to ${propertyName}, ignore this message; nothing happens without the code.`,
  ].join("\n");
  return send(to, `${code} is your DineFlow confirmation code`, text, code,
    "Email is not set up on this server, so the confirmation code could not be sent. Their account and sign-in are ready to use — only the address is unconfirmed. Set RESEND_API_KEY and EMAIL_FROM to send codes, or DINEFLOW_OTP_ECHO=1 to show them on screen while testing.");
}

export async function sendPasswordCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  const text = [
    `Your DineFlow verification code is ${code}`,
    "",
    `It lets you set a new password for ${propertyName}.`,
    "The code expires in 10 minutes and can be used once.",
    "",
    "If you did not ask for this, ignore this message and tell whoever manages your account.",
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
      error: unconfigured ?? "Email is not set up on this server, so the code could not be sent. Set RESEND_API_KEY and EMAIL_FROM, or ask Master control to change the password for you.",
    };
  }

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
