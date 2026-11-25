"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { loginCandidates, modulesFor, positionHome, landsOnMyDay, type PropertyType, type Role } from "@dineflow/shared";
import { sendJoinCode, sendSignupCode } from "@/lib/email";
import { CODES_OFF, revealAndSend } from "@/lib/emailCodes";
import { friendlyContactError } from "@/lib/contactErrors";
import { allow } from "@/lib/ratelimit";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);

export async function login(_: unknown, fd: FormData) {
  const supabase = await createClient();
  // Typing the bare code is enough: dine-htl-mano-00001 becomes the full sign-in address, while a
  // real email typed in full is left alone. Same rule the create form shows.
  // Since 0130 a bare id is tried on @dineflow.cloud first, then on the old @dineflow.local (loginCandidates).
  const tries = loginCandidates(String(fd.get("email") ?? "")); const email = tries[0] ?? "";
  // Failed sign-ins are counted (0098): ten for one account, or thirty from one address, within
  // fifteen minutes and this form stops trying until the window passes. The count is by what was
  // typed, so an id that does not exist is treated the same and the answer reveals nothing. On Vercel
  // x-forwarded-for is set by the platform itself, so it is the visitor's address.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const db = serviceRoleConfigured() ? adminClient() : null;
  if (db) {
    // Enforce temp password lockout before the sign-in attempt. If the password has been live for more
    // than 4 days without the owner changing it, the hash is scrambled and the attempt will fail with
    // "Invalid login credentials" — which is the right answer, because the password genuinely no
    // longer works. The owner must ask Master control for a new one. Asked beside the gate, not after it
    // (2026-10-29): both must finish before the attempt, neither needs the other.
    const [{ data: open }] = await Promise.all([
      db.rpc("login_gate", { p_login: email, p_ip: ip }),
      Promise.resolve(db.rpc("enforce_temp_password_lockout")).catch(() => null),   // best-effort
    ]);
    if (open === false) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  }
  let { data: signed, error } = await supabase.auth.signInWithPassword({ email, password: String(fd.get("password")) });
  for (const other of tries.slice(1)) { if (!error) break; ({ data: signed, error } = await supabase.auth.signInWithPassword({ email: other, password: String(fd.get("password")) })); }
  if (error) {
    if (db) await db.rpc("login_failed", { p_login: email, p_ip: ip });
    return { error: error.message };
  }
  // the master's credentials open Master control and nothing else; owners open their own property
  // where they land is worked out beside "is this the master?" rather than after it — one trip fewer (2026-10-29)
  const [{ data: master }, start] = await Promise.all([supabase.rpc("is_master"), startScreen(supabase, signed.user?.id ?? null)]);
  /* Into the app by a full page load, not a client-side move (2026-11-01, the owner's iPad: "after signing in — with the
     temporary password, either way — Application error; closed and opened again it is fine"). A move that starts outside
     the app's layout and meets the layout's own redirect (/dashboard → /home for staff, → /account/password for a temporary
     password) left the router re-applying the redirected page every frame until Safari stopped it ("history.replaceState()
     more than 100 times per 10 seconds"). A full load takes the same redirects as plain HTTP ones — what reopening did.
     AuthForm goes to `go` with location.replace. */
  return { go: master ? "/admin" : start };
}

/**
 * Where someone lands after signing in: their position's own screen — Kitchen for a commis, Billing for a cashier,
 * Front desk for a receptionist (packages/shared/src/positionAccess.ts) — when they hold it, else the control room.
 * Since 2026-10-20 staff (everyone but the owner and a manager) start on their own My day (/home) instead.
 * Any failure here is not a reason to keep someone out: it falls back to the control room.
 */
async function startScreen(supabase: Awaited<ReturnType<typeof createClient>>, userId: string | null) {
  if (!userId) return "/dashboard";
  try {
    const [{ data: b }, { data: me }] = await Promise.all([
      supabase.rpc("session_bundle"),
      // their own row only: an owner can read the whole team's
      supabase.from("profiles").select("position").eq("id", userId).maybeSingle(),
    ]);
    const bundle = b as { profile?: { role: Role; allowed_modules?: string[] | null } | null; restaurant?: { property_type: PropertyType; enabled_modules?: string[] | null } | null } | null;
    const position = (me as { position?: string | null } | null)?.position;
    // staff start on their own My day (2026-10-20); the owner and managers on the control room / their position's screen
    if (bundle?.profile && landsOnMyDay(bundle.profile.role)) return "/home";
    if (!position || !bundle?.profile || !bundle.restaurant) return "/dashboard";
    const held = modulesFor(bundle.restaurant.property_type, bundle.profile.role, bundle.restaurant.enabled_modules ?? null, bundle.profile.allowed_modules ?? null);
    return `/${positionHome(position, held)}`;
  } catch { return "/dashboard"; }
}

/**
 * 0196 — /signup and /join prove the email with OUR code before any account exists (the owner: "the email OTP everywhere
 * it is needed"). They used Supabase's own confirmation mail, which is switched on but goes through Supabase's built-in
 * mailer — that delivers only to the project's own team, so a new owner never received it. Now:
 *   publicSendCode   → public_email_code (server key) mints a code, refusing an email or phone any DineFlow account
 *                      already has; email_code_reveal reads it once; Gmail / Resend sends it
 *   publicVerifyCode → public_email_verify
 *   signup / join    → public_account_create makes a CONFIRMED login for the verified address, then it signs in and runs
 *                      create_restaurant / join_restaurant as before, then account_finish puts the verified email on as
 *                      the contact (so Forgot password works) with the phone
 * Everything needs SUPABASE_SERVICE_ROLE_KEY on the server (it is on Vercel). A visitor's address is limited too.
 */
async function visitor() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function publicSendCode(email: string, phone: string, purpose: "signup" | "join", propertyName: string) {
  if (!serviceRoleConfigured()) return { error: CODES_OFF };
  if (!allow(`code:${await visitor()}`, 8, 60 * 60_000)) return { error: "Too many codes from this connection. Try again in an hour." };
  const db = adminClient();
  const { data, error } = await db.rpc("public_email_code", { p_email: email, p_phone: phone || null, p_purpose: purpose });
  if (error) return { error: friendlyContactError(error.message) };
  const d = data as { id: string; email: string };
  const sent = await revealAndSend(d.id, (to, code) => purpose === "signup" ? sendSignupCode(to, code, propertyName) : sendJoinCode(to, code));
  if ("error" in sent) return { error: sent.error };
  return { ok: true as const, id: d.id, email: d.email, echoed: sent.echoed };
}

export async function publicVerifyCode(id: string, code: string) {
  if (!serviceRoleConfigured()) return { error: CODES_OFF };
  if (!allow(`verify:${await visitor()}`, 30, 60 * 60_000)) return { error: "Too many tries from this connection. Try again in an hour." };
  const { data, error } = await adminClient().rpc("public_email_verify", { p_id: id, p_code: code });
  if (error) return { error: error.message };
  const r = data as { ok: boolean; error?: string; email?: string };
  return r.ok ? { ok: true as const, email: r.email! } : { error: r.error ?? "That code is not right." };
}

/** A confirmed login for the verified address, signed in on this browser. */
async function openAccount(otp: string, password: string, fullName: string) {
  if (!serviceRoleConfigured()) return { error: CODES_OFF };
  const { data, error } = await adminClient().rpc("public_account_create", { p_otp: otp, p_password: password, p_full_name: fullName });
  if (error) return { error: friendlyContactError(error.message) };
  const made = data as { email: string };
  const supabase = await createClient();
  const { error: e2 } = await supabase.auth.signInWithPassword({ email: made.email, password });
  if (e2) return { error: `Your account was made, but signing in failed: ${e2.message}. Sign in with ${made.email}.` };
  return { ok: true as const, supabase };
}

export async function signup(_: unknown, fd: FormData) {
  const password = String(fd.get("password") ?? ""), otp = String(fd.get("email_otp") ?? "");
  const fullName = String(fd.get("full_name") ?? "").trim(), restaurant = String(fd.get("restaurant") ?? "").trim(), type = String(fd.get("property_type") || "restaurant");
  if (!otp) return { error: "Verify your email first: send the code, then type the code that arrived." };
  if (!fullName || !restaurant) return { error: "Enter your name and your property's name." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  const opened = await openAccount(otp, password, fullName);
  if ("error" in opened) return { error: opened.error };
  const { error: e2 } = await opened.supabase.rpc("create_restaurant", { p_name: restaurant, p_slug: slugify(restaurant), p_full_name: fullName, p_type: type });
  if (e2) return { error: e2.message };
  const { error: e3 } = await opened.supabase.rpc("account_finish", { p_otp: otp });
  if (e3) return { error: friendlyContactError(e3.message) };
  return { go: "/dashboard" };   // a full page load into the app (see login)
}

export async function join(_: unknown, fd: FormData) {
  let supabase = await createClient();
  // Not upper-cased any more: an invite code is hex and case-insensitive on the way in, but a
  // DineFlow code is lower case and matching it is done case-insensitively in the database.
  const code = String(fd.get("code")).trim();
  const fullName = String(fd.get("full_name"));
  const { data: { user } } = await supabase.auth.getUser();
  let otp = "";
  if (!user) {
    // 0196: a new account only for an email proved by our code
    otp = String(fd.get("email_otp") ?? "");
    const password = String(fd.get("password") ?? "");
    if (!otp) return { error: "Verify your email first: send the code, then type the code that arrived." };
    if (password.length < 8) return { error: "Use a password of at least 8 characters." };
    const opened = await openAccount(otp, password, fullName);
    if ("error" in opened) return { error: opened.error };
    supabase = opened.supabase;
  }
  const { data, error } = await supabase.rpc("join_restaurant", { p_code: code, p_full_name: fullName });
  if (error) return { error: error.message };
  if (otp) { const { error: e3 } = await supabase.rpc("account_finish", { p_otp: otp }); if (e3) return { error: friendlyContactError(e3.message) }; }
  // A DineFlow code gets you in the door but switched off, so there is nothing to show on the
  // dashboard yet. An invite code carries its role and goes straight through.
  const joined = data as { pending?: boolean } | null;
  return { go: joined?.pending ? "/join?pending=1" : "/dashboard" };   // a full page load into the app (see login)
}
