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

export async function sendPasswordCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  if (otpEcho()) return { ok: true, echoed: code };

  if (!emailConfigured()) {
    return {
      ok: false,
      error: "Email is not set up on this server, so the code could not be sent. Set RESEND_API_KEY and EMAIL_FROM, or ask Master control to change the password for you.",
    };
  }

  const text = [
    `Your DineFlow verification code is ${code}`,
    "",
    `It lets you set a new password for ${propertyName}.`,
    "The code expires in 10 minutes and can be used once.",
    "",
    "If you did not ask for this, ignore this message and tell whoever manages your account.",
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: `${code} is your DineFlow verification code`,
        text,
      }),
      // a hung mail provider must not hold the password screen open indefinitely
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
