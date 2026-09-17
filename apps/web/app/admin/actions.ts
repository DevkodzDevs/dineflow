"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/admin", "layout");
export async function issueKey(plan: "monthly" | "yearly", restaurantId: string | null) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_issue_key", { p_plan: plan, p_days: plan === "yearly" ? 365 : 30, p_restaurant_id: restaurantId });
  if (error) return { error: error.message }; bump(); return { ok: true, code: data as string };
}
export async function setMembership(restaurantId: string, status: "trial" | "active" | "expired" | "suspended", days: number | null) {
  const s = await createClient();
  const { error } = await s.rpc("admin_set_membership", { p_restaurant_id: restaurantId, p_status: status, p_days: days });
  if (error) return { error: error.message }; bump(); return { ok: true };
}

export async function actAs(restaurantId: string) {
  const s = await createClient(); const { error } = await s.rpc("admin_act_as", { p_restaurant: restaurantId });
  if (error) return { error: error.message }; revalidatePath("/", "layout"); return { ok: true };
}
export async function stopActing() { const s = await createClient(); await s.rpc("admin_stop_acting"); revalidatePath("/", "layout"); return { ok: true }; }
export async function setMasterPassword(pw: string) {
  const s = await createClient(); const { error } = await s.rpc("master_set_password", { p_new: pw });
  if (error) return { error: error.message }; return { ok: true };
}

export type NewProperty = { id: string; slug: string; code: string; login_email: string; temp_password: string; owner_name: string; contact_email: string | null; demo_seeded: boolean };

/**
 * Master control can create a property itself — no public sign-up needed. It comes with its own
 * owner login, so the property can be signed into as itself rather than only through Master control.
 * The temporary password comes back exactly once; it is stored only as a hash and cannot be read
 * again. If it is lost, issue a new one with resetPropertyPassword.
 */
export async function createProperty(
  name: string, type: "restaurant" | "hotel" | "resort", demo: boolean,
  ownerEmail?: string, ownerName?: string, contactEmail?: string,
) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_create_property", {
    p_name: name, p_type: type, p_demo: demo,
    p_owner_email: ownerEmail?.trim() || null, p_owner_name: ownerName?.trim() || null,
    p_contact_email: contactEmail?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as NewProperty) };
}

export type PropertyDetail = {
  property: Record<string, string | number | boolean | null>;
  tax: Record<string, string | number | boolean | null>;
  users: { name: string; login_id: string; contact_email: string | null; role: string;
           is_active: boolean; must_change_password: boolean;
           temp_password: string | null; temp_password_issued: string | null;
           temp_password_expires: string | null; temp_password_lockout: string | null;
           temp_password_locked_out: boolean; temp_password_expired: boolean;
           last_sign_in_at: string | null; created_at: string }[];
  contents: Record<string, number>;
};

/** Everything Master control holds about one property, for the detail dialog. Read only. */
export async function propertyDetail(restaurantId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_property_detail", { p_restaurant_id: restaurantId });
  if (error) return { error: error.message };
  return { ok: true, detail: data as PropertyDetail };
}

/**
 * Is this sign-in id usable and free? The database applies the same normalising rules the form
 * shows, so the address reported back is exactly the one that would be created.
 */
export async function checkLoginId(raw: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_login_id_available", { p_id: raw });
  if (error) return { error: error.message };
  return data as { ok: boolean; address: string | null; note: string };
}

/** Master control edits a property's details. Only changed fields need to be sent. */
export async function updateProperty(restaurantId: string, fields: Record<string, string>) {
  const s = await createClient();
  const { error } = await s.rpc("admin_update_property", { p_restaurant_id: restaurantId, p_fields: fields });
  if (error) return { error: error.message };
  bump();
  return { ok: true };
}

/** Set or correct where this property's one-time password codes are posted. */
export async function setContactEmail(restaurantId: string, contactEmail: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_set_contact_email", {
    p_restaurant_id: restaurantId, p_contact_email: contactEmail.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { contact_email: string | null }) };
}

export type DeletePreview = {
  name: string; type: string; logins: number; menu_items: number; orders: number; bills: number;
  invoices: number; bookings: number; guests: number; rooms: number; staff: number;
  tax_docs: number; tax_filings: number; sealed_months: number;
};

/** What deleting this property would destroy. Counts only — this call changes nothing. */
export async function deletePreview(restaurantId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_delete_preview", { p_restaurant_id: restaurantId });
  if (error) return { error: error.message };
  return { ok: true, ...(data as DeletePreview) };
}

/**
 * Delete a property, everything it holds and the logins that belong to it. Irreversible.
 * The name has to be passed back, so the database refuses a delete aimed at the wrong id.
 */
export async function deleteProperty(restaurantId: string, confirmName: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_delete_property", {
    p_restaurant_id: restaurantId, p_confirm_name: confirmName,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { name: string }) };
}

/** A fresh temporary password for a property whose owner is locked out. Shown once, like the first. */
export async function resetPropertyPassword(restaurantId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_reset_property_password", { p_restaurant_id: restaurantId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { login_email: string; temp_password: string }) };
}

/** Six ready-made properties with their own owner logins, 60 days of history, one district. */
export async function installEstate() {
  const s = await createClient();
  const { data, error } = await s.rpc("install_sample_estate");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { properties: { name: string; type: string; email: string; password: string }[] }) };
}

/** Master only: which modules this property's people can open. NULL = everything the type allows. */
export async function setModules(restaurantId: string, modules: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("master_set_modules", { p_restaurant_id: restaurantId, p_modules: modules });
  if (error) return { error: error.message };
  revalidatePath("/admin"); return { ok: true as const };
}
