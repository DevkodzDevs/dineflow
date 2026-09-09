"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/channels", "/frontdesk", "/rooms"].forEach((p) => revalidatePath(p));
export async function saveOta(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { kind: String(fd.get("kind")), label: String(fd.get("label")), mode: String(fd.get("mode")), room_type_id: (fd.get("room_type_id") as string) || null, import_url: (fd.get("import_url") as string) || null, api_base: (fd.get("api_base") as string) || null, api_key: (fd.get("api_key") as string) || null, hotel_ref: (fd.get("hotel_ref") as string) || null, commission_pct: Number(fd.get("commission_pct") || 15), rate_offset_pct: Number(fd.get("rate_offset_pct") || 0), is_live: fd.get("is_live") === "on" };
  const { error } = await (id ? s.from("ota_channels").update(row).eq("id", id) : s.from("ota_channels").insert(row));
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function deleteOta(id: string) { const s = await createClient(); await s.from("ota_channels").delete().eq("id", id); bump(); return { ok: true }; }
export async function setRates(roomTypeId: string, from: string, to: string, rate: number | null, open: number | null, stop: boolean, min: number | null) {
  const s = await createClient(); const { error } = await s.rpc("set_rate_inventory", { p_room_type_id: roomTypeId, p_from: from, p_to: to, p_rate: rate, p_open: open, p_stop: stop, p_min: min });
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** Push menu (delivery) or rates+availability (OTA). Simulates and logs when no partner key is set. */
export async function pushChannel(id: string, kind: "menu" | "ari") {
  const s = await createClient(); const { data, error } = await s.rpc("push_channel", { p_channel_id: id, p_kind: kind });
  if (error) return { error: error.message }; bump(); return { ok: true, ...(data as { live: boolean; count: number; message: string }) };
}
/** Fires a realistic order at your own webhook so you can watch the whole flow. */
export async function sendTestOrder(token: string, base: string) {
  const res = await fetch(`${base}/api/webhooks/aggregator/${token}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: `TEST-${Date.now().toString().slice(-6)}`, customer_name: "Test customer", customer_phone: "9840000000", address: "12 Test Street", total: 605,
      items: [{ name: "Chicken biryani", qty: 2, price: 280 }, { name: "Butter naan", qty: 1, price: 45 }] }) });
  const j = await res.json().catch(() => ({}));
  revalidatePath("/online-orders"); revalidatePath("/channels");
  return res.ok ? { ok: true, ...j } : { error: j.error ?? `webhook returned ${res.status}` };
}
