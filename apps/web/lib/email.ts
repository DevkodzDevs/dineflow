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
    // the name the server gives itself — a serverless box's own was a link-local "[169.254.5.173]" in the headers
    name: "www.dineflow.cloud",
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

async function sendGmail(to: string, subject: string, text: string, html: string): Promise<SendResult> {
  try {
    await gmailTransport().sendMail({ from: gmailFrom(process.env.GMAIL_USER!, process.env.EMAIL_FROM), to, subject, text, html, headers: AUTO_HEADERS });
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
 * What every code email is made of (2026-11-25 — the owner: "the mails go to the spam folder", then "an ultra-modern,
 * user-friendly design — perfect when the email is opened", then "better still"). The first owner code went to Spam at
 * Gmail: plain text only, the digits first in the subject, and "Give this code to the person setting it up" — asking
 * someone to hand a code to another person is the account-takeover pattern spam filters are trained on. Every code email
 * now has an HTML part beside the text, a subject without the digits, a sentence that names exactly what the code is
 * for, "never share it" instead of "give it to someone", and a line saying why this address got it. (The rest of the
 * score is the sender: a personal Gmail sending from a cloud server — Resend on dineflow.cloud with SPF/DKIM/DMARC is the
 * full fix; it wins when set.)
 *
 * The design: the app's icon and name above a rounded card; a check badge, a centred heading and lead; the code as six
 * digit tiles that are still ONE string (inline spans with nothing between them — a long-press copies "856885", iOS can
 * offer it for AutoFill); an expiry chip; three small cards (property, valid for, use); three numbered steps; an amber
 * never-share note; and a footer that says why the email came. Tables and inline styles because that is what Gmail,
 * Outlook and Apple Mail all draw; a <style> block adds dark mode (prefers-color-scheme, Outlook.com's [data-ogsc]) and
 * the phone sizes — without it the light design still holds. Fixed colours: mail clients know no tokens.
 */
export type CodeMail = {
  subject: string;
  eyebrow: string;
  heading: string;
  lead: string;
  /** a phrase inside `lead` drawn bold in the HTML (the property's name) */
  strong?: string;
  code: string;
  /** exactly three short facts, drawn as three small cards */
  details: [string, string][];
  /** "Expires in 10 minutes" — the chip under the code */
  expiry: string;
  steps: string[];
  warn: string;
  footnote: string;
  /** why this address got the email — the footer's first line */
  reason: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const SITE = () => (process.env.NEXT_PUBLIC_CLOUD_URL || "https://www.dineflow.cloud").replace(/\/$/, "");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** The text and HTML of a code email. */
export function renderCodeMail(m: CodeMail): { text: string; html: string } {
  const text = [
    m.heading, "", m.lead, "",
    `Your code: ${m.code}  (${m.expiry.toLowerCase()})`, "",
    ...m.details.map(([k, v]) => `${k}: ${v}`), "",
    "How to use it:", ...m.steps.map((s, i) => `${i + 1}. ${s}`), "",
    m.warn, "", m.footnote, "", m.reason, "", "— DineFlow", SITE(),
  ].join("\n");

  const lead = m.strong && m.lead.includes(m.strong)
    ? m.lead.split(m.strong).map(esc).join(`<strong class="df-h" style="color:#0f1a14;font-weight:700">${esc(m.strong)}</strong>`)
    : esc(m.lead);
  const site = SITE();
  const host = site.replace(/^https?:\/\//, "");
  // six tiles, no whitespace between them, so the selection copies as one number
  const tiles = [...m.code].map((d) => `<span class="df-tile" style="display:inline-block;width:38px;height:50px;line-height:50px;margin:0 2px;border-radius:14px;background:#ffffff;border:1.5px solid #cfe7da;box-shadow:0 1px 0 rgba(15,26,20,.04);font-family:${MONO};font-size:24px;font-weight:700;color:#0b4a35;text-align:center">${esc(d)}</span>`).join("");

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(m.subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { text-decoration:none; }
  /* phone sizes are the default (an app that drops this block still fits a phone); wider screens grow */
  @media (min-width:541px) {
    .df-px { padding-left:40px !important; padding-right:40px !important; }
    .df-tile { width:46px !important; height:58px !important; line-height:58px !important; font-size:28px !important; margin:0 3px !important; }
  }
  @media (max-width:540px) { .df-h1 { font-size:25px !important; } .df-fact { padding:12px 6px !important; } }
  @media (max-width:340px) {
    .df-tile { width:32px !important; height:44px !important; line-height:44px !important; font-size:21px !important; margin:0 1px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .df-bg { background:#0a0d0c !important; }
    .df-card { background:#131816 !important; border-color:#232d28 !important; }
    .df-h { color:#f2f6f3 !important; }
    .df-t { color:#a7b3ac !important; }
    .df-m { color:#7d8a83 !important; }
    .df-codebox { background:#0e2219 !important; border-color:#1f4a35 !important; }
    .df-tile { background:#132c20 !important; border-color:#2f6a4c !important; color:#e9fff2 !important; }
    .df-chip { background:#16382a !important; color:#9be7bf !important; }
    .df-fact { background:#1a201d !important; border-color:#26302b !important; }
    .df-panel { background:#171d1a !important; border-color:#24302a !important; }
    .df-num { background:#1d3a2b !important; color:#8fe0b4 !important; }
    .df-warn { background:#2a2113 !important; border-color:#4a3a1c !important; }
    .df-warnt { color:#f3d9a8 !important; }
    .df-link { color:#6fd39c !important; }
    .df-rule { border-color:#232d28 !important; }
  }
  [data-ogsc] .df-bg { background:#0a0d0c !important; }
  [data-ogsc] .df-card { background:#131816 !important; }
  [data-ogsc] .df-h { color:#f2f6f3 !important; }
  [data-ogsc] .df-t { color:#a7b3ac !important; }
  [data-ogsc] .df-tile { background:#132c20 !important; color:#e9fff2 !important; }
</style>
</head>
<body class="df-bg" style="margin:0;padding:0;background:#edf2ee">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(`${m.code} is your code — ${m.lead}`)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" class="df-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf2ee">
<tr><td align="center" style="padding:36px 12px 44px">

<!-- brand -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td align="center" style="padding:0 0 22px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle"><img src="${site}/apple-touch-icon.png" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:11px;border:0"></td>
    <td class="df-h" style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.3px;color:#0f1a14">DineFlow</td>
  </tr></table>
</td></tr>
</table>

<!-- card -->
<table role="presentation" class="df-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #dfe7e2;border-radius:28px;font-family:${FONT}">


<!-- badge + heading -->
<tr><td class="df-px" align="center" style="padding:34px 22px 6px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="width:60px;height:60px;border-radius:999px;background:#17794a;background-image:linear-gradient(135deg,#1c8a56,#0b4a35);font-family:${FONT};font-size:28px;line-height:60px;font-weight:700;color:#ffffff;text-align:center">&#10003;</td></tr></table>
  <div class="df-chip" style="display:inline-block;margin:18px 0 0;padding:5px 12px;border-radius:999px;background:#e5f4ec;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.4px;color:#17794a">${esc(m.eyebrow)}</div>
  <h1 class="df-h df-h1" style="margin:12px 0 10px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.6px;color:#0f1a14">${esc(m.heading)}</h1>
  <p class="df-t" style="margin:0 auto;max-width:400px;font-family:${FONT};font-size:16px;line-height:1.6;color:#4b5751">${lead}</p>
</td></tr>

<!-- code -->
<tr><td class="df-px" style="padding:26px 22px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="df-codebox" align="center" style="background:#f2f9f5;border:1px solid #d6ebdf;border-radius:22px;padding:22px 10px 18px">
      <div class="df-m" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#5f8a73;margin:0 0 14px">Your verification code</div>
      <div aria-label="Your code is ${esc(m.code.split("").join(" "))}" style="white-space:nowrap">${tiles}</div>
      <div class="df-chip" style="display:inline-block;margin:16px 0 0;padding:6px 12px;border-radius:999px;background:#e2f2e9;font-family:${FONT};font-size:12.5px;font-weight:600;color:#17794a">&#9679;&nbsp; ${esc(m.expiry)}</div>
      <div class="df-m" style="margin:10px 0 0;font-family:${FONT};font-size:12px;color:#7d8a83">Tip: long-press or double-click the code to copy it</div>
    </td>
  </tr></table>
</td></tr>

<!-- three facts -->
<tr><td class="df-px" style="padding:16px 22px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  ${m.details.slice(0, 3).map(([k, v], i) => `<td width="33%" style="vertical-align:top;${i ? "padding-left:8px;" : ""}">
      <div class="df-fact" style="background:#f7f9f8;border:1px solid #e8eeea;border-radius:16px;padding:13px 12px;text-align:center">
        <div class="df-m" style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#7d8a83">${esc(k)}</div>
        <div class="df-h" style="margin-top:4px;font-family:${FONT};font-size:14.5px;line-height:1.3;font-weight:700;color:#0f1a14;word-break:break-word">${esc(v)}</div>
      </div></td>`).join("")}
  </tr></table>
</td></tr>

<!-- steps -->
<tr><td class="df-px" style="padding:20px 22px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="df-panel" style="border:1px solid #e8eeea;border-radius:20px;padding:18px 18px 8px">
    <div class="df-h" style="font-family:${FONT};font-size:15px;font-weight:700;color:#0f1a14;margin:0 0 14px">How to use it</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${m.steps.map((s, i) => `<tr>
      <td style="vertical-align:top;width:36px;padding:0 0 12px"><div class="df-num" style="width:26px;height:26px;line-height:26px;border-radius:999px;background:#e3f3ea;color:#17794a;font-family:${FONT};font-size:13px;font-weight:800;text-align:center">${i + 1}</div></td>
      <td class="df-t" style="vertical-align:top;padding:3px 0 12px;font-family:${FONT};font-size:15px;line-height:1.5;color:#4b5751">${esc(s)}</td>
    </tr>`).join("")}
    </table>
  </td></tr></table>
</td></tr>

<!-- security -->
<tr><td class="df-px" style="padding:14px 22px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="df-warn" style="background:#fdf6e8;border:1px solid #f0dfbb;border-radius:16px;padding:14px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:top;width:30px"><div style="width:22px;height:22px;line-height:22px;border-radius:999px;background:#e39a2d;color:#ffffff;font-family:${FONT};font-size:13px;font-weight:800;text-align:center">!</div></td>
        <td class="df-warnt" style="font-family:${FONT};font-size:13.5px;line-height:1.55;color:#7a5a1e"><strong>Keep it private.</strong> ${esc(m.warn)}</td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>

<!-- footnote -->
<tr><td class="df-px" align="center" style="padding:18px 22px 30px">
  <p class="df-m" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:#7d8a83">${esc(m.footnote)}</p>
</td></tr>

</table>

<!-- footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td align="center" class="df-m" style="padding:24px 24px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#8a958f">
  ${esc(m.reason)}<br>
  <strong>DineFlow</strong> · Restaurant &amp; hotel software · <a class="df-link" href="${site}" style="color:#17794a;text-decoration:none;font-weight:600">${esc(host)}</a>
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
  return { text, html };
}

/** The three code emails, as data — so their wording is unit-tested (email.test.ts) rather than read off a screenshot. */
export function contactMail(code: string, name: string, propertyName: string): CodeMail {
  return {
    subject: `Confirm your email for ${propertyName} on DineFlow`,
    eyebrow: "Email verification",
    heading: `Hi ${name}, confirm your email`,
    lead: `You were added to ${propertyName} on DineFlow. Use this code to confirm this email address is yours.`,
    strong: propertyName,
    code,
    expiry: "Expires in 15 minutes",
    details: [["Property", propertyName], ["Valid for", "15 min"], ["Use", "Once"]],
    steps: ["Open the DineFlow screen where your account is being set up.", "Type the 6-digit code above.", "Tap Verify — password-reset codes will come to this address."],
    warn: `Never share this code with anyone outside ${propertyName}. DineFlow will never call or message you to ask for it.`,
    footnote: "Not expecting this? You can safely ignore this email — nothing changes without the code.",
    reason: `You got this email because this address was entered for you at ${propertyName} on DineFlow.`,
  };
}
export function ownerMail(code: string, propertyName: string): CodeMail {
  const name = propertyName.trim() || "your property";
  return {
    subject: `Confirm your email for ${name} on DineFlow`,
    eyebrow: "Email verification",
    heading: "Confirm your email",
    lead: `This code confirms this address as the owner's email for ${name} on DineFlow.`,
    strong: name,
    code,
    expiry: "Expires in 10 minutes",
    details: [["Property", name], ["Valid for", "10 min"], ["Use", "Once"]],
    steps: [`Enter this code on the DineFlow setup screen for ${name}.`, "Tap Verify.", `${name} is created, and your password-reset codes will come to this address.`],
    warn: "Never share this code with anyone you do not know. DineFlow will never call or message you to ask for it.",
    footnote: "Not expecting this? You can safely ignore this email — nothing is created without the code.",
    reason: `You got this email because this address was entered as the owner's email for ${name} on DineFlow.`,
  };
}
export function passwordMail(code: string, propertyName: string): CodeMail {
  return {
    subject: `Your DineFlow password code for ${propertyName}`,
    eyebrow: "Password reset",
    heading: "Reset your password",
    lead: `Use this code to set a new password for your ${propertyName} account on DineFlow.`,
    strong: propertyName,
    code,
    expiry: "Expires in 10 minutes",
    details: [["Account", propertyName], ["Valid for", "10 min"], ["Use", "Once"]],
    steps: ["Go back to the DineFlow password screen.", "Type the 6-digit code above.", "Choose your new password."],
    warn: "Never share this code — DineFlow will never call or message you to ask for it. Anyone with it can change your password.",
    footnote: "Didn't ask for this? Ignore this email — your password stays the same.",
    reason: `You got this email because a password reset was asked for on your ${propertyName} account.`,
  };
}

/** 0196: the code BEFORE a new member of staff's login is made (Staff → Add staff). */
export function newStaffMail(code: string, name: string, propertyName: string): CodeMail {
  const who = name.trim() || "there";
  return {
    subject: `Confirm your email for ${propertyName} on DineFlow`,
    eyebrow: "Email verification",
    heading: `Hi ${who}, confirm your email`,
    lead: `${propertyName} is adding you to its team on DineFlow. This code confirms this email address is yours.`,
    strong: propertyName,
    code,
    expiry: "Expires in 10 minutes",
    details: [["Property", propertyName], ["Valid for", "10 min"], ["Use", "Once"]],
    steps: ["Enter this code on the DineFlow screen where your account is being set up.", "Tap Verify.",
      "Your account is created, and your password-reset codes will come to this address."],
    warn: `Never share this code with anyone outside ${propertyName}. DineFlow will never call or message you to ask for it.`,
    footnote: "Not expecting this? You can safely ignore this email — no account is made without the code.",
    reason: `You got this email because this address was entered for you at ${propertyName} on DineFlow.`,
  };
}
/** 0196: the code before an owner's own sign-up (/signup — "Start your free 7 days"). */
export function signupMail(code: string, propertyName: string): CodeMail {
  const name = propertyName.trim() || "your property";
  return {
    subject: `Confirm your email to open ${name} on DineFlow`,
    eyebrow: "Email verification",
    heading: "Confirm your email",
    lead: `Use this code to confirm your email and open ${name} on DineFlow — your 7-day free trial starts right after.`,
    strong: name,
    code,
    expiry: "Expires in 10 minutes",
    details: [["Property", name], ["Valid for", "10 min"], ["Use", "Once"]],
    steps: ["Go back to the DineFlow sign-up page.", "Type the 6-digit code above and tap Verify.", "Tap Start free trial — you are in."],
    warn: "Never share this code with anyone. DineFlow will never call or message you to ask for it.",
    footnote: "Didn't sign up? You can safely ignore this email — no account is made without the code.",
    reason: "You got this email because this address was used to open a property on DineFlow.",
  };
}
/** 0196: the code before someone joins a team with a code (/join). */
export function joinMail(code: string): CodeMail {
  return {
    subject: "Confirm your email to join your team on DineFlow",
    eyebrow: "Email verification",
    heading: "Confirm your email",
    lead: "Use this code to confirm your email and join your team on DineFlow.",
    code,
    expiry: "Expires in 10 minutes",
    details: [["For", "Joining a team"], ["Valid for", "10 min"], ["Use", "Once"]],
    steps: ["Go back to the DineFlow join page.", "Type the 6-digit code above and tap Verify.", "Tap Join — your manager then switches you on."],
    warn: "Never share this code with anyone. DineFlow will never call or message you to ask for it.",
    footnote: "Didn't ask to join? You can safely ignore this email — no account is made without the code.",
    reason: "You got this email because this address was used to join a team on DineFlow.",
  };
}

const MAIL_OFF = "Email is off on this server, so no code could be sent — and the account cannot be made without it. Set GMAIL_USER + GMAIL_APP_PASSWORD (or RESEND_API_KEY + EMAIL_FROM) on the server.";
export async function sendNewStaffCode(to: string, code: string, name: string, propertyName: string): Promise<SendResult> {
  return send(to, newStaffMail(code, name, propertyName), MAIL_OFF);
}
export async function sendSignupCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  return send(to, signupMail(code, propertyName), MAIL_OFF);
}
export async function sendJoinCode(to: string, code: string): Promise<SendResult> {
  return send(to, joinMail(code), MAIL_OFF);
}

/**
 * The code that proves a new member of staff owns the address on their record. It arrives unprompted, sent by someone
 * else, so it says who added them and why — a bare "your code is 123456" from a name they have never heard of reads
 * like a phishing attempt.
 */
export async function sendContactVerification(to: string, code: string, name: string, propertyName: string): Promise<SendResult> {
  return send(to, contactMail(code, name, propertyName),
    "Email is off, so no code was sent. Their sign-in works; only the address is unconfirmed.");
}

/**
 * The code that proves a NEW property's owner email before Master control may create the property (0195, 2026-11-25).
 * The owner reads it out to whoever is setting the property up; nothing exists until it is typed back.
 */
export async function sendOwnerEmailCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  return send(to, ownerMail(code, propertyName),
    "Email is off on this server, so no code could be sent — and a property cannot be created without it. Set GMAIL_USER + GMAIL_APP_PASSWORD (or RESEND_API_KEY + EMAIL_FROM) in Vercel → Settings → Environment Variables, redeploy, then send the code again.");
}

export async function sendPasswordCode(to: string, code: string, propertyName: string): Promise<SendResult> {
  return send(to, passwordMail(code, propertyName));
}

/** Marks every code email as an automatic message (RFC 3834): no auto-replies, no out-of-office loops. */
const AUTO_HEADERS = { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" };

/**
 * The one place that actually posts anything, so every kind of code fails and echoes the same way.
 * `unconfigured` lets each caller say what an unsent code means for them — losing your way back into
 * an account is a different problem from an address that is merely unconfirmed, and the same sentence
 * cannot serve both.
 */
async function send(to: string, mail: CodeMail, unconfigured?: string): Promise<SendResult> {
  const { code, subject } = mail;
  const { text, html } = renderCodeMail(mail);
  if (otpEcho()) return { ok: true, echoed: code };

  if (!emailConfigured()) {
    return {
      ok: false,
      error: unconfigured ?? "Email is off, so no code was sent. Ask Master control to change your password.",
    };
  }

  if (emailVia() === "gmail") return sendGmail(to, subject, text, html);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html, headers: AUTO_HEADERS }),
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
