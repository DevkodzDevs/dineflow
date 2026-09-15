"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/", "layout");
export async function saveRestaurant(fd: FormData) {
  const s = await createClient();
  const { error } = await s.from("restaurants").update({ name: String(fd.get("name")), logo_url: String(fd.get("logo_url") ?? "").trim() || null, brand_colour: (String(fd.get("brand_colour") ?? "").trim().match(/^#[0-9a-f]{6}$/i)?.[0]) ?? null, gstin: fd.get("gstin") || null, address: fd.get("address") || null, phone: fd.get("phone") || null, gst_rate: Number(fd.get("gst_rate")), service_charge_pct: Number(fd.get("service_charge_pct")), property_type: String(fd.get("property_type")), room_gst_rate: Number(fd.get("room_gst_rate") || 12), check_in_time: String(fd.get("check_in_time") || "12:00"), check_out_time: String(fd.get("check_out_time") || "11:00"), prep_buffer_pct: Number(fd.get("prep_buffer_pct") || 10), brief_whatsapp: (fd.get("brief_whatsapp") as string) || null }).eq("id", String(fd.get("id")));
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
