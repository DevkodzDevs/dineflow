"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { GST_STATES } from "@dineflow/shared";

const bump = () => ["/tax", "/settings", "/billing", "/invoices", "/admin/compliance"].forEach((p) => revalidatePath(p));
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dateOrNull = (v: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The registration the property files under, and the CA who signs for it. */
export async function saveTaxProfile(fd: FormData) {
  // The screen says only the owner or a manager may change these; hold that here too, not just on the button.
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) return { error: "Only the owner or a manager can change the tax profile." };
  const s = await createClient();
  const gstin = str(fd, "gstin").toUpperCase(), pan = str(fd, "pan").toUpperCase();
  // GSTIN: 2-digit state · 10-character PAN · entity number · Z · check character
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return { error: "That GSTIN is not in the 15-character format, e.g. 33ABCDE1234F1Z5." };
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { error: "That PAN is not in the 10-character format, e.g. ABCDE1234F." };
  if (gstin && pan && gstin.slice(2, 12) !== pan) return { error: "Characters 3 to 12 of a GSTIN are the PAN. The two you entered do not match." };
  const scheme = str(fd, "gst_scheme");
  if (!["regular", "composition", "unregistered"].includes(scheme)) return { error: "Choose a GST scheme." };
  if (scheme !== "unregistered" && !gstin) return { error: "A registered business needs its GSTIN here." };
  const chosen = str(fd, "gst_state_code");
  if (chosen && !GST_STATES[chosen]) return { error: "Choose a state from the list." };
  if (chosen && gstin && gstin.slice(0, 2) !== chosen) return { error: `The GSTIN starts with ${gstin.slice(0, 2)} (${GST_STATES[gstin.slice(0, 2)]?.name ?? "unknown state"}) but the state chosen is ${chosen} (${GST_STATES[chosen].name}). Pick "From the GSTIN" or correct one of them.` };
  const state = chosen || (gstin ? gstin.slice(0, 2) : "");
  const { error } = await s.from("restaurants").update({
    gstin: gstin || null, legal_name: str(fd, "legal_name") || null, pan: pan || null, gst_scheme: scheme, gst_state_code: state || null,
    gst_monthly: str(fd, "gst_period") !== "quarterly", fssai_no: str(fd, "fssai_no") || null,
    ca_name: str(fd, "ca_name") || null, ca_firm: str(fd, "ca_firm") || null, ca_membership_no: str(fd, "ca_membership_no") || null,
    ca_email: str(fd, "ca_email") || null, ca_phone: str(fd, "ca_phone") || null,
  }).eq("id", session.restaurant.id);
  if (error) return { error: error.message };
  bump(); return { ok: true };
}

/** One statutory document: what it is, its number, when it expires, and where the signed copy lives. */
export async function saveDoc(fd: FormData) {
  const s = await createClient(); const id = str(fd, "id");
  const row = {
    kind: str(fd, "kind") || "other", title: str(fd, "title"), number: str(fd, "number") || null, issuer: str(fd, "issuer") || null,
    issued_on: dateOrNull(str(fd, "issued_on")), expires_on: dateOrNull(str(fd, "expires_on")), period: str(fd, "period") || null,
    url: str(fd, "url") || null, notes: str(fd, "notes") || null,
  };
  if (!row.title) return { error: "Give the document a title." };
  if (row.url && !/^https?:\/\//i.test(row.url)) return { error: "The link should start with http:// or https://." };
  const { error } = await (id ? s.from("compliance_docs").update(row).eq("id", id) : s.from("compliance_docs").insert(row));
  if (error) return { error: error.message };
  bump(); return { ok: true };
}
export async function deleteDoc(id: string) {
  const s = await createClient(); const { error } = await s.from("compliance_docs").delete().eq("id", id);
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** Records that a return was filed: the date and the acknowledgement number from the portal. */
export async function markFiled(form: string, period: string, dueOn: string, filedOn: string, ack: string) {
  const s = await createClient(); const session = await requireSession();
  const filed = dateOrNull(filedOn); if (!filed) return { error: "Enter the date it was filed." };
  if (!dateOrNull(dueOn) || !form || !period) return { error: "That return could not be identified." };
  // restaurant_id is part of the conflict key, so it is set here rather than left to the insert trigger.
  const { error } = await s.from("compliance_filings").upsert(
    { restaurant_id: session.restaurant.id, form, period, due_on: dueOn, filed_on: filed, ack_no: ack.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "restaurant_id,form,period" });
  if (error) return { error: error.message };
  bump(); return { ok: true };
}
export async function unmarkFiled(form: string, period: string) {
  const s = await createClient(); const { error } = await s.from("compliance_filings").delete().eq("form", form).eq("period", period);
  if (error) return { error: error.message }; bump(); return { ok: true };
}
