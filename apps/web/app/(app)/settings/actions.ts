"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  const { error } = await s.from("restaurants").update({
    kds_stations: stations, kds_warn_minutes: warnAt, kds_target_minutes: lateAt, hk_inspect_required: fd.get("hk_inspect_required") === "on",
    promise_enabled: fd.get("promise_enabled") === "on", promise_minutes: promiseMinutes, promise_pct: promisePct,
    room_gst_rate_high: Number(fd.get("room_gst_rate_high") || 18), room_gst_threshold: Number(fd.get("room_gst_threshold") || 7500),
    facility_gst_rate: Number(fd.get("facility_gst_rate") || 18), name: String(fd.get("name")), logo_url: String(fd.get("logo_url") ?? "").trim() || null, brand_colour: (String(fd.get("brand_colour") ?? "").trim().match(/^#[0-9a-f]{6}$/i)?.[0]) ?? null, gstin: fd.get("gstin") || null, address: fd.get("address") || null, phone: fd.get("phone") || null, gst_rate: Number(fd.get("gst_rate")), service_charge_pct: Number(fd.get("service_charge_pct")), property_type: String(fd.get("property_type")), room_gst_rate: Number(fd.get("room_gst_rate") || 12), check_in_time: String(fd.get("check_in_time") || "12:00"), check_out_time: String(fd.get("check_out_time") || "11:00"), prep_buffer_pct: Number(fd.get("prep_buffer_pct") || 10), brief_whatsapp: (fd.get("brief_whatsapp") as string) || null }).eq("id", String(fd.get("id")));
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
export async function deleteTable(id: string) { const s = await createClient(); await s.from("dining_tables").delete().eq("id", id); bump(); return { ok: true }; }

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
