"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wrote } from "@/lib/wrote";
import { requireSession } from "@/lib/auth";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { queueWhatsApp, drainOutbox } from "@/lib/whatsapp";
import { websiteLinks, websiteOptions, WEBSITE_LINK, WEBSITE_LINK_KEYS, WEBSITE_EXTRAS, type WebsiteLinkKey, type WebsiteLinks, type WebsiteOptions } from "@dineflow/shared";
const bump = () => revalidatePath("/", "layout");
export async function saveRestaurant(fd: FormData) {
  const s = await createClient();
  // the on-time promise: a window and a rate the owner owns. Orders snapshot both, so a change here
  // only ever affects the next order taken — never a promise already made.
  const promiseMinutes = Math.min(240, Math.max(5, Number(fd.get("promise_minutes") || 30)));
  const promisePct = Math.min(50, Math.max(0, Number(fd.get("promise_pct") || 0)));
  // kitchen control: the stations tickets route to, and the two clocks a ticket is coloured by.
  // "Late" can never come before "hurry", whatever was typed.
  const stations = [...new Set(String(fd.get("kds_stations") ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean))].slice(0, 12);
  const warnAt = Math.min(120, Math.max(1, Number(fd.get("kds_warn_minutes") || 10)));
  const lateAt = Math.min(240, Math.max(warnAt, Number(fd.get("kds_target_minutes") || 15)));
  /* late check-out (0171), hours in the form, minutes in the row; only a hotel or resort form carries the boxes, so a
     restaurant's save leaves the rule as it is. Full is never before half (the table refuses it too). */
  const late = fd.has("late_half_after_h") ? (() => {
    const toMin = (k: string, d: number) => { const raw = String(fd.get(k) ?? "").trim(), v = raw === "" ? d : Number(raw); return Math.min(1439, Math.max(0, Math.round((Number.isFinite(v) ? v : d) * 60))); };
    const half = toMin("late_half_after_h", 3), full = Math.max(half, toMin("late_full_after_h", 6));
    return { late_checkout_on: fd.get("late_checkout_on") === "on", late_half_after_min: half, late_full_after_min: full };
  })() : {};
  const { error } = await s.from("restaurants").update({
    kds_stations: stations, kds_warn_minutes: warnAt, kds_target_minutes: lateAt, stock_draw: fd.get("stock_draw") === "cook" ? "cook" : "ticket", stock_block: fd.get("stock_block") === "on", hk_inspect_required: fd.get("hk_inspect_required") === "on", ...late,
    promise_enabled: fd.get("promise_enabled") === "on", promise_minutes: promiseMinutes, promise_pct: promisePct,
    room_gst_rate_high: Number(fd.get("room_gst_rate_high") || 18), room_gst_threshold: Number(fd.get("room_gst_threshold") || 7500),
    facility_gst_rate: Number(fd.get("facility_gst_rate") || 18), name: String(fd.get("name")), logo_url: /^https:\/\//i.test(String(fd.get("logo_url") ?? "").trim()) ? String(fd.get("logo_url")).trim() : null, /* https only (2026-10-25 audit) */ brand_colour: (String(fd.get("brand_colour") ?? "").trim().match(/^#[0-9a-f]{6}$/i)?.[0]) ?? null, gstin: fd.get("gstin") || null, address: fd.get("address") || null, phone: fd.get("phone") || null, gst_rate: Number(fd.get("gst_rate")), service_charge_pct: Number(fd.get("service_charge_pct")), property_type: String(fd.get("property_type")), room_gst_rate: Number(fd.get("room_gst_rate") || 5), check_in_time: String(fd.get("check_in_time") || "12:00"), check_out_time: String(fd.get("check_out_time") || "11:00"), prep_buffer_pct: Number(fd.get("prep_buffer_pct") || 10), brief_whatsapp: (fd.get("brief_whatsapp") as string) || null }).eq("id", String(fd.get("id")));
  if (error) return { error: error.message }; bump(); return { ok: true };
}
/** Pay by scanning the bill: the UPI ID sits on the property; gateway keys go to an owner-only table,
 *  so they are never part of the session row every screen receives. A blank secret keeps the saved one;
 *  the word "clear" removes it; a blank key ID removes the gateway altogether. */
export async function savePayments(fd: FormData) {
  const s = await createClient(); const rid = String(fd.get("id"));
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const { error } = await s.from("restaurants").update({ upi_vpa: str("upi_vpa") || null, upi_payee: str("upi_payee") || null }).eq("id", rid);
  if (error) return { error: error.message };
  const keyId = str("razorpay_key_id"), secret = str("razorpay_key_secret"), hook = str("razorpay_webhook_secret");
  const { data: cur } = await s.from("payment_gateways").select("key_secret, webhook_secret").eq("restaurant_id", rid).maybeSingle();
  if (!keyId) {
    if (cur) { const { error: e } = await s.from("payment_gateways").delete().eq("restaurant_id", rid); if (e) return { error: e.message }; }
    bump(); return { ok: true };
  }
  const keep = (typed: string, saved: string | null | undefined) => (typed.toLowerCase() === "clear" ? null : typed || saved || null);
  const { error: e2 } = await s.from("payment_gateways").upsert(
    { restaurant_id: rid, provider: "razorpay", key_id: keyId, key_secret: keep(secret, cur?.key_secret), webhook_secret: keep(hook, cur?.webhook_secret), updated_at: new Date().toISOString() },
    { onConflict: "restaurant_id" });
  if (e2) return { error: e2.message }; bump(); return { ok: true };
}
/** Loyalty: what comes back as points and what a point is worth. Bounded so a typo cannot give the food away. */
export async function saveLoyalty(fd: FormData) {
  const s = await createClient(); const rid = String(fd.get("id"));
  const num = (k: string, lo: number, hi: number, dflt: number) => Math.min(hi, Math.max(lo, Number(fd.get(k) || dflt)));
  const { error } = await s.from("restaurants").update({
    loyalty_enabled: fd.get("loyalty_enabled") === "on",
    loyalty_earn_pct: num("loyalty_earn_pct", 0, 50, 5), loyalty_point_value: num("loyalty_point_value", 0.1, 100, 1), loyalty_min_redeem: num("loyalty_min_redeem", 0, 100000, 50),
  }).eq("id", rid);
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function saveTable(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), capacity: Number(fd.get("capacity") || 4), zone: String(fd.get("zone") || "Main"), sort_order: Number(fd.get("sort_order") || 0) };
  const { error } = await (id ? s.from("dining_tables").update(row).eq("id", id) : s.from("dining_tables").insert(row));
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function deleteTable(id: string) {
  const s = await createClient(); const r = await s.from("dining_tables").delete().eq("id", id).select("id");
  if (r.error?.code === "23503") return { error: "This table has orders, so it can't be deleted." };
  const bad = wrote(r, "That table could not be deleted."); if (bad) return bad; bump(); return { ok: true };
}

/** Fills the property with a realistic sample menu, pantry, rooms, bookings, labour and channels. */
export async function loadDemoData(): Promise<{ error?: string; ok?: boolean; dishes?: number; ingredients?: number; rooms?: number; bookings?: number; labourers?: number }> {
  const s = await createClient(); const { data, error } = await s.rpc("seed_demo_data");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as Record<string, number>) };
}
export async function removeDemoData() {
  const s = await createClient(); const { error } = await s.rpc("clear_demo_data");
  if (error) return { error: error.message }; revalidatePath("/", "layout"); return { ok: true };
}

/** For properties that run the on-premise Box: a token the Box uses to phone home. */
export async function issueBoxToken() {
  const s = await createClient(); const { data, error } = await s.rpc("box_issue_token");
  if (error) return { error: error.message }; revalidatePath("/settings"); return { ok: true, token: data as string };
}

/* ── the logo (migration 0083) ────────────────────────────────────────────────────────────────
   Uploaded to the public `brand` bucket under this property's folder, by the signed-in person:
   Storage's own policies allow an owner or manager to write only their own folder, and the bucket
   itself refuses anything over 1 MB or other than PNG, JPEG or WebP. These checks say so in words
   before Storage has to. The browser shrinks the picture first (LogoUpload), so a real logo arrives
   at a few dozen KB. */
const LOGO_MAX = 1024 * 1024;
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** What the first bytes say the file is — a renamed .exe is not a PNG because its name says so. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
async function clearOldLogos(s: Awaited<ReturnType<typeof createClient>>, rid: string, keep?: string) {
  const { data } = await s.storage.from("brand").list(rid, { limit: 100 });
  const old = (data ?? []).map((f) => `${rid}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await s.storage.from("brand").remove(old);
}
export async function uploadLogo(fd: FormData): Promise<{ url?: string; error?: string }> {
  const s = await createClient(); const rid = String(fd.get("id") ?? "");
  const file = fd.get("file");
  if (!rid || !(file instanceof File)) return { error: "Choose an image first." };
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > LOGO_MAX) return { error: `That image is ${(file.size / 1048576).toFixed(1)} MB after shrinking — the most a logo can be is 1 MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return { error: "Use a PNG, JPG or WebP image." };
  const path = `${rid}/logo-${Date.now()}.${LOGO_TYPES[type]}`;
  const up = await s.storage.from("brand").upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) return { error: /row-level security|unauthori[sz]ed|403/i.test(up.error.message) ? "Only an owner or a manager can change the logo." : up.error.message };
  const url = s.storage.from("brand").getPublicUrl(path).data.publicUrl;
  const { data: row, error } = await s.from("restaurants").update({ logo_url: url }).eq("id", rid).select("id").maybeSingle();
  if (error || !row) { await s.storage.from("brand").remove([path]); return { error: error?.message ?? "Only an owner or a manager can change the logo." }; }
  await clearOldLogos(s, rid, path);
  bump(); return { url };
}
export async function removeLogo(rid: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await createClient();
  const { data: row, error } = await s.from("restaurants").update({ logo_url: null }).eq("id", rid).select("id").maybeSingle();
  if (error || !row) return { error: error?.message ?? "Only an owner or a manager can change the logo." };
  await clearOldLogos(s, rid);
  bump(); return { ok: true };
}

/** Which ways attendance may be taken. set_attendance_settings refuses anyone but the owner. */
export async function saveAttendanceSettings(methods: string[], lat: number | null, lng: number | null, radius: number) {
  const s = await createClient();
  const { error } = await s.rpc("set_attendance_settings", { p_methods: methods, p_lat: lat, p_lng: lng, p_radius: radius });
  if (error) return { error: error.message };
  bump(); return { ok: true as const, error: null };
}

/** The TV screen's key (0103 `my_screen_key`, owner or manager); `rotate` makes every old screen link stop working. */
export async function screenKey(rotate = false) {
  const s = await createClient(); const { data, error } = await s.rpc("my_screen_key", { p_rotate: rotate });
  if (error) return { error: error.message }; return { ok: true, key: data as string };
}

/** Settings → WhatsApp (0177): the property's Business API credentials and switches, through wa_settings_set — the owner check
 *  and the add-on check are in the function. A blank token keeps the saved one, 'clear' removes it, a blank phone number id
 *  removes the row. The token is never read back: the page learns has_token and nothing more. */
export async function saveWhatsApp(fd: FormData): Promise<{ error: string } | { ok: true; has_token?: boolean; removed?: boolean }> {
  const s = await createClient();
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const on = (k: string) => fd.get(k) === "on";
  const lang = ["en", "ta", "hi"].includes(str("lang")) ? str("lang") : "en";
  const { data, error } = await s.rpc("wa_settings_set", {
    p_phone_number_id: str("phone_number_id"), p_access_token: str("access_token"), p_lang: lang,
    p_on_reservation: on("on_reservation"), p_on_booking: on("on_booking"), p_on_bill: on("on_bill"), p_on_day_close: on("on_day_close"),
    p_on_alert: on("on_alert"), p_on_shift_reminder: on("on_shift_reminder"), p_on_table_ready: on("on_table_ready"), p_on_order: on("on_order"),
    p_alert_discount_over: Math.max(0, Number(fd.get("alert_discount_over") || 500)),
  });
  if (error) return { error: error.message };
  revalidatePath("/settings"); return { ok: true, ...(data as { has_token?: boolean; removed?: boolean }) };
}
/** "Send me a test": queues dineflow_test to the number given (wa_queue — the owner only for a test) and, when this server holds
 *  the service-role key, runs the sender at once; otherwise the cloud's nightly sweeper does, and the answer says so. */
export async function sendWaTest(phone: string): Promise<{ error: string } | { ok: true; sent: boolean; note: string }> {
  const session = await requireSession(); const s = await createClient();
  if (session.profile.role !== "owner") return { error: "Only the owner can send a test." };
  const id = await queueWhatsApp(s, session, { kind: "test", to: phone, params: [session.restaurant.name], dedupe: `test:${Date.now()}` });
  if (!id) return { error: "Nothing was queued — check the number, the phone number id and token, and that the add-on is on." };
  if (!serviceRoleConfigured()) return { ok: true, sent: false, note: "Queued. This server cannot send it now (no service-role key); the cloud's nightly sweeper will." };
  const r = await drainOutbox(adminClient(), 20);
  revalidatePath("/settings");
  if (r.sent > 0 && !r.errors.length) return { ok: true, sent: true, note: "Sent. Check your phone." };
  if (r.errors.length) return { ok: true, sent: false, note: `WhatsApp refused it: ${r.errors[0]}` };
  return { ok: true, sent: false, note: "Queued; the next message from this server, or the nightly sweeper, will try again." };
}

/** 0185: create or change the property's own website from the checklist (Settings → Website). The owner check, the
 *  add-on check and which sections this kind of property may have are all in `website_save` — this only carries the ticks. */
export async function saveWebsite(sections: string[], headline: string, about: string, published: boolean, email = "", typed: Partial<Record<WebsiteLinkKey, string>> = {}, extras: Parameters<typeof websiteOptions>[0] = {}, domain = "") {
  /* the public email and the links (Instagram, Facebook, YouTube, Google Maps, WhatsApp): a name becomes its address, and
     anything that is not that service's own address is refused here with the reason — the database drops it regardless */
  const tidy = websiteLinks(typed), wrong = WEBSITE_LINK_KEYS.find((k) => tidy.errors[k]);
  if (wrong) return { error: `${WEBSITE_LINK[wrong].label}: ${tidy.errors[wrong]}.` };
  /* the extras this client switched on (websites.options): tidied here, refused with the reason, filtered again in the database */
  const chosen = websiteOptions(extras ?? {}), off = WEBSITE_EXTRAS.find((x) => chosen.errors[x.key]);
  if (off) return { error: `${off.label}: ${chosen.errors[off.key]}.` };
  if (chosen.options.enquiry && !tidy.links.whatsapp) return { error: "Enquiry form: add your WhatsApp number — that is where enquiries arrive." };
  const mail = String(email).trim().toLowerCase().slice(0, 120);
  if (mail && !/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/.test(mail)) return { error: "That email address does not look right." };
  const s = await createClient();
  const { data, error } = await s.rpc("website_save", {
    p_sections: sections.slice(0, 20).map(String), p_headline: headline.slice(0, 120) || null, p_about: about.slice(0, 1500) || null, p_published: !!published,
    p_email: mail || null, p_links: tidy.links, p_options: chosen.options, p_domain: String(domain ?? "").trim().slice(0, 160) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true as const, ...(data as { slug: string; sections: string[]; published: boolean; email: string | null; links: WebsiteLinks; options: WebsiteOptions; domain: string | null }) };
}

/* ── the website's own files (0185 bucket `site`; ninth pass) ─────────────────────────────────────────────────────
 * A photo, a film or a 3D file goes from the browser straight to storage, on an address signed here for this property's
 * own folder: a server action's body stops at 1 MB. The bucket's policies are the wall (owner and managers, their own
 * folder, the listed kinds, 12 MB); this only names the file and says no early, with a reason. */
const SITE_EXT: Record<string, Record<string, string>> = {
  photo: { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }, room: { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" },
  video: { "video/mp4": "mp4", "video/webm": "webm" }, model: { "model/gltf-binary": "glb" },
};
export async function siteUploadUrl(kind: "photo" | "room" | "video" | "model", type: string): Promise<{ path: string; token: string; url: string } | { error: string }> {
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) return { error: "Only the owner or a manager can add files to the website." };
  const ext = SITE_EXT[kind]?.[type]; if (!ext) return { error: "That kind of file cannot be used here." };
  const s = await createClient();
  const path = `${session.restaurant.id}/${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const signed = await s.storage.from("site").createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { error: /not found|bucket/i.test(signed.error?.message ?? "") ? "The website's file storage is not on this database yet. It arrives with the next update." : signed.error?.message ?? "The file could not be sent." };
  return { path, token: signed.data.token, url: s.storage.from("site").getPublicUrl(path).data.publicUrl };
}
/** The gallery and / or room photos, as lists of addresses. The database keeps only this property's own files (and what the gallery already had). */
export async function saveSiteMedia(photos: string[] | null, rooms: Record<string, string[]> | null): Promise<{ ok: true; photos?: string[] } | { error: string }> {
  const s = await createClient();
  const { data, error } = await s.rpc("website_media_save", { p_photos: photos ? photos.slice(0, 20).map(String) : null, p_rooms: rooms });
  if (error) return { error: /website_media_save|schema cache/i.test(error.message) ? "The website's photo storage is not on this database yet. It arrives with the next update." : error.message };
  revalidatePath("/settings");
  return { ok: true, photos: (data as { photos?: string[] } | null)?.photos };
}
/** A file that is no longer used is taken out of storage — only ever from this property's own folder. Best effort. */
export async function removeSiteFile(url: string): Promise<void> {
  try {
    const session = await requireSession(); const at = String(url).indexOf("/storage/v1/object/public/site/"); if (at < 0) return;
    const path = String(url).slice(at + "/storage/v1/object/public/site/".length);
    if (!path.startsWith(`${session.restaurant.id}/`) || path.includes("..")) return;
    await (await createClient()).storage.from("site").remove([path]);
  } catch { /* an orphan file costs a few hundred kB; a failed clean-up must never fail a save */ }
}
