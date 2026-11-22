"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { runBackup } from "@/lib/backup/run";
import { fmtBytes } from "@/lib/backup/bytes";
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
/** An outlet takes the membership and end date of the outlet its chain started from (0109). */
export async function matchChain(restaurantId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_match_chain_membership", { p_restaurant: restaurantId });
  if (error) return { error: error.message }; bump(); return { ok: true as const, result: data as { membership: string; ends: string | null } };
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
  /** How many non-owner logins the property has — a count only; their details stay in the property's own Staff screen. */
  staff_count?: number;
};

/** Everything Master control holds about one property, for the detail dialog. Read only.
 *  Only the owner account(s) leave the server (2026-10-30, the owner: "show only the owner section — other staff details
 *  only in the owner's control / manager page"); staff logins, contacts and temporary passwords are dropped here, so they
 *  never reach the master's browser, and the dialog gets a head-count instead. */
export async function propertyDetail(restaurantId: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_property_detail", { p_restaurant_id: restaurantId });
  if (error) return { error: error.message };
  const d = data as PropertyDetail;
  const all = Array.isArray(d?.users) ? d.users : [];
  const owners = all.filter((u) => u.role === "owner");
  return { ok: true, detail: { ...d, users: owners, staff_count: all.length - owners.length } as PropertyDetail };
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
 * Delete a property, everything it holds and the logins that belong to it. Irreversible — so (0192, 2026-11-22, the owner:
 * "take a backup of its important data first, then delete it completely, carefully") the backup comes first: the same
 * export Data → Backups makes for one property (every row of its tables with secrets left out, its own stored files up to
 * the files cap), written to the backups bucket and recorded there as "Before delete", then copied into File Manager →
 * Deleted properties → "<name> · <when>" with an about.md beside it. If any of that fails, nothing is deleted.
 * The name has to be passed back, so the database refuses a delete aimed at the wrong id.
 */
export type DeleteResult = { ok: true; name: string; backup: { folder: string; bytes: number; rows: number; tables: number; files: number; skipped: number } };
export async function deleteProperty(restaurantId: string, confirmName: string): Promise<DeleteResult | { error: string }> {
  const admin = await requireAdmin();
  const s = await createClient();
  const { data: r } = await s.from("restaurants").select("id, name, slug, property_type, created_at").eq("id", restaurantId).maybeSingle();
  if (!r) return { error: "No such property." };
  if (r.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) return { error: "The name typed does not match the property." };
  const { data: settings } = await s.rpc("data_settings_get");
  const st = (settings ?? {}) as { include_files?: boolean; files_cap_mb?: number };
  const out = await runBackup(s, { kind: "property", restaurant: { id: r.id, name: r.name, slug: r.slug }, includeFiles: st.include_files ?? true, filesCapMb: st.files_cap_mb ?? 40, label: `Before delete: ${r.name}` });
  if (!out.ok) return { error: `Nothing was deleted — the backup failed first: ${out.error}` };
  const dl = await s.storage.from("backups").download(out.path);
  if (dl.error || !dl.data) return { error: `Nothing was deleted — the backup could not be read back: ${dl.error?.message ?? "no file"}` };
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const counts = await deletePreview(r.id);
  const stamp = Date.now().toString(36); const slug = (r.slug || "property").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const bpath = `master/deleted-${stamp}-${slug}.json.gz`, apath = `master/deleted-${stamp}-${slug}-about.md`;
  const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" }).format(new Date());
  const lines = "error" in counts ? [] : ([["logins", counts.logins], ["menu items", counts.menu_items], ["orders", counts.orders], ["bills", counts.bills], ["invoices", counts.invoices], ["bookings", counts.bookings], ["guests", counts.guests], ["rooms", counts.rooms], ["staff records", counts.staff], ["tax documents", counts.tax_docs], ["tax filings", counts.tax_filings], ["sealed months", counts.sealed_months]] as const).map(([k, n]) => `- ${n} ${k}`);
  const about = [`# ${r.name}`, "", `Deleted from Master control on ${when} (India) by ${admin.email || admin.label || "the master"}.`, "",
    `- Kind: ${r.property_type}`, `- Property id: ${r.id}`, `- Joined: ${String(r.created_at).slice(0, 10)}`,
    `- Backup: ${slug}-backup.json.gz — ${out.tables} tables, ${out.rows.toLocaleString("en-IN")} rows, ${out.files} stored file${out.files === 1 ? "" : "s"} (${fmtBytes(out.size)})${out.skipped ? `; ${out.skipped} file${out.skipped === 1 ? "" : "s"} skipped (over the files cap, or not readable from Master control)` : ""}`,
    "", "## What went with it", ...lines, "",
    "## Bringing it back", "The same backup is listed in Master control → Data → Backups as \"Before delete\". Open it there and Restore brings back the rows that are missing — the property row first, then everything that hangs off it. Keys, tokens, passwords and codes were left out of the export, so the owner signs in on a fresh password.", ""].join("\n");
  const up1 = await s.storage.from("files").upload(bpath, buf, { contentType: "application/gzip", upsert: false });
  if (up1.error) return { error: `Nothing was deleted — the backup could not be kept in File Manager: ${/not found|bucket/i.test(up1.error.message) ? "apply migration 0192 first" : up1.error.message}` };
  const aboutBuf = Buffer.from(about, "utf8");
  const up2 = await s.storage.from("files").upload(apath, aboutBuf, { contentType: "text/markdown; charset=utf-8", upsert: false });
  if (up2.error) { await s.storage.from("files").remove([bpath]).catch(() => null); return { error: `Nothing was deleted — about.md could not be written: ${up2.error.message}` }; }
  const kept = await s.rpc("files_keep_deleted_property", { p_restaurant_id: r.id, p_name: r.name, p_type: r.property_type, p_backup_path: bpath, p_backup_bytes: buf.length, p_about_path: apath, p_about_bytes: aboutBuf.length,
    p_summary: { backup_id: out.id, tables: out.tables, rows: out.rows, files: out.files, skipped: out.skipped } });
  if (kept.error) { await s.storage.from("files").remove([bpath, apath]).catch(() => null); return { error: `Nothing was deleted — File Manager refused the backup: ${kept.error.message}` }; }
  const folder = (kept.data as { folder_name: string }).folder_name;
  const { data, error } = await s.rpc("admin_delete_property", { p_restaurant_id: restaurantId, p_confirm_name: confirmName });
  if (error) return { error: `${error.message} — the backup is kept in File Manager → Deleted properties → ${folder}` };
  revalidatePath("/", "layout"); revalidatePath("/admin/files");
  return { ok: true, name: (data as { name: string }).name, backup: { folder, bytes: buf.length, rows: out.rows, tables: out.tables, files: out.files, skipped: out.skipped } };
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
  // each new owner's password is its own (0099), shown once; a login that already existed comes back null
  return { ok: true, ...(data as { properties: { name: string; type: string; email: string; password: string | null }[] }) };
}

/** Master only: which modules this property's people can open. NULL = everything the type allows. */
export async function setModules(restaurantId: string, modules: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("master_set_modules", { p_restaurant_id: restaurantId, p_modules: modules });
  if (error) return { error: error.message };
  revalidatePath("/admin"); return { ok: true as const };
}
/** 0175, master only: the property's own add-on list. NULL = follow its plan. */
export async function setFeatures(restaurantId: string, features: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("master_set_features", { p_restaurant_id: restaurantId, p_features: features });
  if (error) return { error: error.message };
  revalidatePath("/admin"); revalidatePath("/", "layout"); return { ok: true as const };   // the property's shell reads the list on its next request
}
/** 0175, master only: the add-ons a plan includes. NULL = the defaults (features.ts). */
export async function setPlanFeatures(key: string, features: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("admin_set_plan_features", { p_key: key, p_features: features });
  if (error) return { error: error.message };
  revalidatePath("/admin"); revalidatePath("/", "layout"); return { ok: true as const };
}
/** 0151: a plan's prices (Master control → Keys → Plans & prices). Empty = not sold online for that period. */
export async function setPlan(key: string, label: string, monthly: number | null, yearly: number | null, active: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("admin_set_plan", { p_key: key, p_label: label, p_monthly: monthly, p_yearly: yearly, p_active: active });
  if (error) return { error: error.message }; bump(); revalidatePath("/membership"); revalidatePath("/"); return { ok: true };   // "/": the front page's pricing
}

/** 0185, master only: a website plan's name, prices and the extras it includes (Keys → Website plans). Empty price = "ask us". */
export async function setWebsitePlanDef(key: string, label: string, month: number | null, year: number | null, features: string[]) {
  const s = await createClient();
  const { error } = await s.rpc("admin_set_website_plan", { p_key: key, p_label: label, p_month: month, p_year: year, p_features: features });
  if (error) return { error: error.message };
  revalidatePath("/admin"); revalidatePath("/settings"); return { ok: true as const };
}
/** 0185, master only: put a property on a website plan. Takes effect at once — its page and its Settings follow the plan. */
export async function setWebsitePlan(restaurantId: string, plan: string) {
  const s = await createClient();
  const { error } = await s.rpc("master_set_website_plan", { p_restaurant_id: restaurantId, p_plan: plan });
  if (error) return { error: error.message };
  revalidatePath("/admin"); revalidatePath("/settings"); return { ok: true as const };
}
