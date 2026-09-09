"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/", "layout");
export async function saveRestaurant(fd: FormData) {
  const s = await createClient();
  const { error } = await s.from("restaurants").update({ name: String(fd.get("name")), logo_url: String(fd.get("logo_url") ?? "").trim() || null, brand_colour: (String(fd.get("brand_colour") ?? "").trim().match(/^#[0-9a-f]{6}$/i)?.[0]) ?? null, gstin: fd.get("gstin") || null, address: fd.get("address") || null, phone: fd.get("phone") || null, gst_rate: Number(fd.get("gst_rate")), service_charge_pct: Number(fd.get("service_charge_pct")), property_type: String(fd.get("property_type")), room_gst_rate: Number(fd.get("room_gst_rate") || 12), check_in_time: String(fd.get("check_in_time") || "12:00"), check_out_time: String(fd.get("check_out_time") || "11:00"), prep_buffer_pct: Number(fd.get("prep_buffer_pct") || 10), brief_whatsapp: (fd.get("brief_whatsapp") as string) || null }).eq("id", String(fd.get("id")));
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
