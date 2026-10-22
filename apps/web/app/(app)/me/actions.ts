"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendContactVerification } from "@/lib/email";

export type MyDetails = {
  display_name: string; phone: string; contact_email: string; emergency_name: string; emergency_phone: string;
  about: string; languages: string[]; avatar_tone: string | null;
};
export type Saved = MyDetails & { contact_verified: boolean; email_changed: boolean };

/** Save the person's own details (0125 my_profile_save — their own row, only the self-editable columns). */
export async function saveMyProfile(d: MyDetails) {
  const s = await createClient();
  const { data, error } = await s.rpc("my_profile_save", {
    p_display_name: d.display_name, p_phone: d.phone, p_contact_email: d.contact_email, p_emergency_name: d.emergency_name,
    p_emergency_phone: d.emergency_phone, p_about: d.about, p_languages: d.languages, p_avatar_tone: d.avatar_tone,
  });
  if (error) return { error: error.message };
  revalidatePath("/me"); revalidatePath("/staff");
  const r = data as Record<string, unknown>;
  const str = (k: string) => (r[k] as string | null) ?? "";
  return { ok: true as const, saved: { display_name: str("display_name"), phone: str("phone"), contact_email: str("contact_email"), emergency_name: str("emergency_name"),
    emergency_phone: str("emergency_phone"), about: str("about"), languages: (r.languages as string[] | null) ?? [], avatar_tone: (r.avatar_tone as string | null) ?? null,
    contact_verified: !!r.contact_verified, email_changed: !!r.email_changed } satisfies Saved };
}

/** Send a code to the person's own contact email — the same RPC the Staff screen uses, which lets anyone ask for
 *  their own (0060/0098 staff_request_contact_otp: `me.id = t.id`). */
export async function sendMyCode() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Sign in again." };
  const { data, error } = await s.rpc("staff_request_contact_otp", { p_user: user.id });
  if (error) return { error: error.message };
  const r = data as { throttled: boolean; code?: string; sent_to: string; name?: string; property?: string };
  if (r.throttled) return { error: "Code just sent. Wait a minute to ask again." };
  const sent = await sendContactVerification(r.sent_to, r.code!, r.name ?? "there", r.property ?? "your property");
  if (!sent.ok) return { error: sent.error };
  return { ok: true as const, sent_to: r.sent_to, echoed: sent.echoed };
}

/** Check the code — a wrong one is an answer, not an error (0098). */
export async function verifyMyCode(code: string) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Sign in again." };
  const { data, error } = await s.rpc("staff_verify_contact", { p_user: user.id, p_code: code });
  if (error) return { error: error.message };
  const r = data as { ok?: boolean; error?: string } | null;
  if (r?.ok === false) return { error: r.error ?? "That code is not right." };
  revalidatePath("/me"); revalidatePath("/staff");
  return { ok: true as const };
}

/** Sign this account out of every other phone, tablet and till — this device stays signed in. */
export async function signOutOthers() {
  const s = await createClient();
  const { error } = await s.auth.signOut({ scope: "others" });
  if (error) return { error: error.message };
  return { ok: true as const };
}

export type MyCard = {
  name: string; listed: string; title: string | null; dept: string | null; deptLabel: string | null; access: string;
  staff_code: string | null; joined_on: string | null; reports_to: string | null; phone: string | null; email: string | null; verified: boolean;
  emergency: string | null; languages: string[]; about: string | null; avatar_tone: string | null;
};
/** The profile card the avatar opens (2026-10-23, the owner: "a click on the profile shows the name, the position, when they
 *  started here and more"): read when it opens, so no screen carries it. The person's own row, under their own RLS. */
export async function myCard(): Promise<{ card?: MyCard; error?: string }> {
  const { requireSession } = await import("@/lib/auth");
  const { DEPARTMENTS, POSITIONS, ROLE_LABEL } = await import("@dineflow/shared");
  const { myDept } = await import("../tasks/dept");
  const session = await requireSession(); const s = await createClient();
  if (session.actingAs) return { error: "Master control has no staff profile here." };
  const { data } = await s.from("profiles").select("full_name, display_name, phone, contact_email, contact_verified_at, role, position, position_title, department, staff_code, joined_on, reports_to, emergency_name, emergency_phone, about, languages, avatar_tone").eq("id", session.profile.id).maybeSingle();
  const p = (data ?? {}) as Record<string, unknown>; const str = (k: string) => (p[k] as string | null) ?? null;
  const role = (str("role") ?? session.profile.role) as keyof typeof ROLE_LABEL;
  const pos = POSITIONS.find((x) => x.key === str("position"));
  const dept = myDept(role, str("department") ?? pos?.dept ?? null);
  const boss = str("reports_to") ? (await s.from("profiles").select("full_name, position_title").eq("id", str("reports_to")!).maybeSingle()).data as { full_name: string; position_title: string | null } | null : null;
  const full = str("full_name") ?? session.profile.full_name;
  return { card: {
    name: str("display_name")?.trim() || full, listed: full, title: str("position_title") ?? pos?.title ?? null,
    dept, deptLabel: DEPARTMENTS.find((d) => d.key === dept)?.label ?? null, access: ROLE_LABEL[role] ?? role,
    staff_code: str("staff_code"), joined_on: str("joined_on"), reports_to: boss ? `${boss.full_name}${boss.position_title ? ` · ${boss.position_title}` : ""}` : null,
    phone: str("phone"), email: str("contact_email"), verified: !!p.contact_verified_at,
    emergency: [str("emergency_name"), str("emergency_phone")].filter(Boolean).join(" · ") || null,
    languages: (p.languages as string[] | null) ?? [], about: str("about"), avatar_tone: str("avatar_tone"),
  } };
}
