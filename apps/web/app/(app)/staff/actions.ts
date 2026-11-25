"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendContactVerification, sendNewStaffCode } from "@/lib/email";
import { revealAndSend } from "@/lib/emailCodes";
import { friendlyContactError } from "@/lib/contactErrors";
export async function createInvite(role: string) {
  const s = await createClient(); const { data, error } = await s.rpc("create_invite", { p_role: role });
  if (error) return { error: error.message }; revalidatePath("/staff"); return { ok: true, code: data as string };
}

export type NewStaff = { user_id: string; full_name: string; role: string; staff_code: string; login_id: string; temp_password: string; contact_email: string; phone: string | null };

/**
 * 0196 (the owner: "staff creation in the client section — the same email OTP process"): a code for the new person's
 * email BEFORE their login exists. The database mints it (staff_email_code — refusing an email any DineFlow account
 * already uses) and does not hand it to the owner; the server reads it once and emails it (revealAndSend).
 */
export async function sendStaffEmailCode(email: string, name: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_email_code", { p_email: email, p_phone: null });
  if (error) return { error: friendlyContactError(error.message) };
  const d = data as { id: string; email: string };
  const sent = await revealAndSend(d.id, (to, code, property) => sendNewStaffCode(to, code, name, property || "your property"));
  if ("error" in sent) return { error: sent.error };
  return { ok: true as const, id: d.id, email: d.email, echoed: sent.echoed };
}

/** The code the new person received, typed back. A wrong code is an answer, not a throw (0098). */
export async function verifyStaffEmailCode(id: string, code: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_email_verify", { p_id: id, p_code: code });
  if (error) return { error: error.message };
  const r = data as { ok: boolean; error?: string; email?: string };
  return r.ok ? { ok: true as const, email: r.email! } : { error: r.error ?? "That code is not right." };
}

/** 0196: is this email or phone already used by any DineFlow account? */
export async function staffContactAvailable(email: string | null, phone: string | null) {
  const s = await createClient();
  const { data, error } = await s.rpc("contact_available", { p_email: email?.trim() || null, p_phone: phone?.trim() || null });
  if (error) return { error: error.message };
  return { ok: true as const, ...(data as { email_taken: boolean; phone_taken: boolean }) };
}

/**
 * Add someone and get their sign-in back in one go — for the person starting tomorrow who has no
 * email to receive an invite code. The database decides whether the caller may appoint this role and
 * trims the sections to ones they hold themselves, so this is not a way around the ladder.
 *
 * Since 0196 only with a verified code for their email (otp, from sendStaffEmailCode + verifyStaffEmailCode):
 * staff_create_login_verified refuses anything else, refuses an email or phone another DineFlow account already has,
 * and marks the address confirmed from the first day — no code is sent afterwards.
 */
export async function addStaff(input: { full_name: string; role: string; modules: string[] | null; login_id?: string; contact_email: string; phone?: string; otp: string }) {
  if (!input.otp) return { error: "Verify their email first: send the code, then type the code they received." };
  const s = await createClient();
  const { data, error } = await s.rpc("staff_create_login_verified", {
    p_otp: input.otp, p_full_name: input.full_name, p_role: input.role, p_modules: input.modules,
    p_login_id: input.login_id || null, p_contact_email: input.contact_email, p_phone: input.phone || null,
  });
  if (error) return { error: friendlyContactError(error.message) };
  revalidatePath("/staff");
  const { property: _p, ...staff } = data as NewStaff & { property: string; contact_verified: boolean };
  return { ok: true as const, ...staff };
}

/** Send (or re-send) the code that proves the address on someone's record. */
export async function sendStaffVerification(userId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_request_contact_otp", { p_user: userId });
  if (error) return { error: error.message };
  const r = data as { throttled: boolean; code?: string; sent_to: string; name?: string; property?: string };
  if (r.throttled) return { error: "A code was just sent. Wait a minute to ask again." };
  const sent = await sendContactVerification(r.sent_to, r.code!, r.name ?? "there", r.property ?? "your property");
  if (!sent.ok) return { error: sent.error };
  return { ok: true as const, sent_to: r.sent_to, echoed: sent.echoed };
}

/** Check the code they were sent and mark the address proved. */
export async function verifyStaffContact(userId: string, code: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_verify_contact", { p_user: userId, p_code: code });
  if (error) return { error: error.message };
  // a wrong code is an answer, not an error (0098): raised, its try would have been un-counted
  const r = data as { ok?: boolean; error?: string } | null;
  if (r?.ok === false) return { error: r.error ?? "That code is not right." };
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

/** The owner lets a manager give temporary passwords, or stops them (0136 staff_set_password_right — the owner only). */
export async function setPasswordRight(userId: string, on: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("staff_set_password_right", { p_user: userId, p_on: on });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}

/** Assist (the AI) for one person below a supervisor (0138 staff_set_assist — the owner, or a manager for someone below them). */
export async function setAssistAccess(userId: string, on: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("staff_set_assist", { p_user: userId, p_on: on });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}

/** Connections or Reports for one person (0140 staff_set_grant — the owner only). */
export async function setGrant(userId: string, grant: "connections" | "reports", on: boolean) {
  const s = await createClient();
  const { data, error } = await s.rpc("staff_set_grant", { p_user: userId, p_grant: grant, p_on: on });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const, grants: (data ?? []) as string[] };
}

/** Role, sections and active flag for one person — through owner_set_access, which enforces who may change whom. */
export async function setAccess(userId: string, role: string, modules: string[] | null, active: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("owner_set_access", { p_user: userId, p_role: role, p_modules: modules, p_active: active });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}

/** A staff member ticked present (or not) by hand — staff_mark checks the role and that Manual is on. */
export async function markStaff(profileId: string, date: string, present: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("staff_mark", { p_profile: profileId, p_date: date, p_present: present });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { error: null };
}

export type RegisterMonth = { month: string; att: { profile_id: string; work_date: string; in_at: string | null; out_at: string | null; hours: number | null }[]; leave: { profile_id: string; from_date: string; to_date: string; kind: string }[] };
/** One month of the attendance register (2026-10-23): every punch day and every approved leave touching the month, for the
 *  people the caller may see (staff_attendance: the property; staff_leave: what 0135 lets them see). Read on demand — the
 *  Staff page carries only today. "YYYY-MM". */
export async function attendanceMonth(month: string): Promise<RegisterMonth | { error: string }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "That is not a month." };
  const s = await createClient();
  const [y, m] = month.split("-").map(Number); const first = `${month}-01`; const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const [{ data: att, error: e1 }, { data: leave, error: e2 }] = await Promise.all([
    s.from("staff_attendance").select("profile_id, work_date, in_at, out_at, hours").gte("work_date", first).lte("work_date", last).limit(5000),
    s.from("staff_leave").select("profile_id, from_date, to_date, kind").eq("status", "approved").lte("from_date", last).gte("to_date", first).limit(2000),
  ]);
  if (e1 || e2) return { error: (e1 ?? e2)!.message };
  return { month, att: (att ?? []) as RegisterMonth["att"], leave: (leave ?? []) as RegisterMonth["leave"] };
}

/** Position, own title, department, manager and joining date (0107 staff_set_position — the same who-may-change-whom
 *  rule as access; an owner may also set their own). */
/** Their emergency contact (0134), set by whoever adds or manages them; the person can change it on My profile. */
export async function setEmergency(userId: string, name: string, phone: string) {
  const s = await createClient();
  const { error } = await s.rpc("staff_set_emergency", { p_user: userId, p_name: name, p_phone: phone });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true as const };
}

export async function setPosition(userId: string, p: { position: string | null; department: string | null; title: string; reportsTo: string | null; joinedOn: string | null }) {
  const s = await createClient();
  const { error } = await s.rpc("staff_set_position", { p_user: userId, p_position: p.position, p_department: p.department, p_title: p.title || null, p_reports_to: p.reportsTo, p_joined_on: p.joinedOn || null });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}

/** The checklists one person handles (0162; the owner or a manager): the active lists ticked for them, or null to put them
 *  back on their position's lists. Revalidates the screens that show lists. */
export async function setStaffChecklists(userId: string, lists: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("staff_checklists_set", { p_profile: userId, p_on: lists });
  if (error) return { error: error.message };
  ["/staff", "/tasks", "/home"].forEach((p) => revalidatePath(p)); return { ok: true as const };
}
