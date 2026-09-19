"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendContactVerification } from "@/lib/email";
export async function createInvite(role: string) {
  const s = await createClient(); const { data, error } = await s.rpc("create_invite", { p_role: role });
  if (error) return { error: error.message }; revalidatePath("/staff"); return { ok: true, code: data as string };
}

export type NewStaff = { user_id: string; full_name: string; role: string; staff_code: string; login_id: string; temp_password: string; contact_email: string; phone: string | null };

/**
 * Add someone and get their sign-in back in one go — for the person starting tomorrow who has no
 * email to receive an invite code. The database decides whether the caller may appoint this role and
 * trims the sections to ones they hold themselves, so this is not a way around the ladder.
 */
export async function addStaff(input: { full_name: string; role: string; modules: string[] | null; login_id?: string; contact_email?: string; phone?: string }) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_create_login", {
    p_full_name: input.full_name, p_role: input.role, p_modules: input.modules,
    p_login_id: input.login_id || null, p_contact_email: input.contact_email || null, p_phone: input.phone || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  const r = data as NewStaff & { verify_code: string; property: string };
  // the account exists either way; a mail failure only means the address is not proved yet, so it is
  // reported alongside the credentials rather than instead of them
  const sent = await sendContactVerification(r.contact_email, r.verify_code, r.full_name, r.property);
  const { verify_code: _c, property: _p, ...staff } = r;
  return { ok: true as const, ...staff, mailed: sent.ok, mailError: sent.ok ? null : sent.error, echoed: sent.ok ? sent.echoed : undefined };
}

/** Send (or re-send) the code that proves the address on someone's record. */
export async function sendStaffVerification(userId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_request_contact_otp", { p_user: userId });
  if (error) return { error: error.message };
  const r = data as { throttled: boolean; code?: string; sent_to: string; name?: string; property?: string };
  if (r.throttled) return { error: "A code went out moments ago — wait a minute before asking for another." };
  const sent = await sendContactVerification(r.sent_to, r.code!, r.name ?? "there", r.property ?? "your property");
  if (!sent.ok) return { error: sent.error };
  return { ok: true as const, sent_to: r.sent_to, echoed: sent.echoed };
}

/** Check the code they were sent and mark the address proved. */
export async function verifyStaffContact(userId: string, code: string) {
  const s = await createClient();
  const { error } = await s.rpc("staff_verify_contact", { p_user: userId, p_code: code });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true as const };
}

/** The slip again, for the three days before it is used — or nothing, once they have set their own. */
export async function staffLogin(userId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_login_details", { p_user: userId });
  if (error) return { error: error.message };
  return { ok: true as const, ...(data as { login_id: string; temp_password: string | null; must_change_password: boolean; expires_at: string | null }) };
}

/** A fresh temporary password when the old one is lost or used. They must change it at next sign-in. */
export async function resetStaffPassword(userId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_reset_password", { p_user: userId });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true as const, ...(data as { login_id: string; temp_password: string }) };
}

/** Role, sections and active flag for one person — through owner_set_access, which enforces who may change whom. */
export async function setAccess(userId: string, role: string, modules: string[] | null, active: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("owner_set_access", { p_user: userId, p_role: role, p_modules: modules, p_active: active });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}
