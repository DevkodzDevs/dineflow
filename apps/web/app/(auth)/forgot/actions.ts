"use server";
import { adminClient } from "@/lib/supabase/admin";
import { sendPasswordCode } from "@/lib/email";
import { toLoginAddress } from "@dineflow/shared";

/**
 * Ask for a reset code.
 *
 * The answer is deliberately the same whether or not the id exists, whether or not it has a contact
 * address, and whether or not a code was just sent. Anything else turns this box into a way to find
 * out which accounts are real. The only error surfaced is one the server itself caused, such as mail
 * not being configured, because that is not about the account.
 */
export async function requestReset(_: unknown, fd: FormData) {
  const loginId = toLoginAddress(String(fd.get("login_id") ?? ""));
  const same = { ok: true as const, sent: true };
  if (!loginId) return { error: "Enter your login ID." };

  let db;
  try { db = adminClient(); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }

  const { data, error } = await db.rpc("request_password_reset", { p_login_id: loginId });
  if (error) return { error: error.message };
  const r = data as { found: boolean; throttled?: boolean; code?: string; sent_to?: string; property?: string };
  if (!r.found || r.throttled || !r.code) return same;

  const sent = await sendPasswordCode(r.sent_to!, r.code, r.property ?? "your property");
  // A mail failure is the server's fault and worth saying; it leaks nothing about the account,
  // because by this point a code was going to be sent regardless of who asked.
  if (!sent.ok) return { error: sent.error };
  return { ...same, echoed: sent.echoed };
}

/** Check the code and set the new password in one call, so there is no half-finished state. */
export async function resetPassword(_: unknown, fd: FormData) {
  const loginId = toLoginAddress(String(fd.get("login_id") ?? ""));
  const code = String(fd.get("code") ?? "").trim();
  const next = String(fd.get("password") ?? "");
  const again = String(fd.get("confirm") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (next !== again) return { error: "The two passwords do not match." };

  let db;
  try { db = adminClient(); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }

  const { error } = await db.rpc("reset_password_with_code", {
    p_login_id: loginId, p_code: code, p_new_password: next,
  });
  if (error) return { error: error.message };
  return { ok: true as const, done: true };
}
