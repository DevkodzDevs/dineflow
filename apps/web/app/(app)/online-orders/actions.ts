"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/online-orders", "/kitchen", "/orders", "/dashboard"].forEach((p) => revalidatePath(p));
export async function acceptOnline(id: string) { const s = await createClient(); const { data, error } = await s.rpc("accept_online_order", { p_id: id }); if (error) return { error: error.message }; bump(); return { ok: true, orderId: data as string }; }
export async function rejectOnline(id: string, reason: string) { const s = await createClient(); const { error } = await s.from("online_orders").update({ status: "rejected", raw: { reason } }).eq("id", id); if (error) return { error: error.message }; bump(); return { ok: true }; }
export async function setOnlineStatus(id: string, status: string) { const s = await createClient(); await s.from("online_orders").update({ status }).eq("id", id); bump(); return { ok: true }; }
/** Map an unrecognised aggregator line to one of your dishes, so it matches from now on. */
export async function mapDish(menuItemId: string, channelKind: string, ref: string) {
  const s = await createClient();
  const { data: mi } = await s.from("menu_items").select("external_refs").eq("id", menuItemId).single();
  const refs = { ...((mi?.external_refs as Record<string, string>) ?? {}), [channelKind]: ref };
  const { error } = await s.from("menu_items").update({ external_refs: refs }).eq("id", menuItemId);
  if (error) return { error: error.message }; revalidatePath("/online-orders"); return { ok: true };
}
export async function saveChannel(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { kind: String(fd.get("kind")), label: String(fd.get("label")), outlet_ref: (fd.get("outlet_ref") as string) || null, api_base: (fd.get("api_base") as string) || null, api_key: (fd.get("api_key") as string) || null, commission_pct: Number(fd.get("commission_pct") || 0), prep_minutes: Number(fd.get("prep_minutes") || 20), auto_accept: fd.get("auto_accept") === "on", is_live: fd.get("is_live") === "on" };
  const { error } = await (id ? s.from("order_channels").update(row).eq("id", id) : s.from("order_channels").insert(row));
  if (error) return { error: error.message }; revalidatePath("/channels"); return { ok: true };
}
export async function deleteChannel(id: string) { const s = await createClient(); await s.from("order_channels").delete().eq("id", id); revalidatePath("/channels"); return { ok: true }; }
