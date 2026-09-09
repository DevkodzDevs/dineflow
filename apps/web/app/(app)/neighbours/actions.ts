"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/neighbours", "/tomorrow", "/inventory", "/labour"].forEach((p) => revalidatePath(p));

export async function joinNetwork(v: { prices: boolean; surplus: boolean; labour: boolean; demand: boolean; radius: number; alias?: string }) {
  const s = await createClient();
  const { error } = await s.rpc("network_join", { p_prices: v.prices, p_surplus: v.surplus, p_labour: v.labour, p_demand: v.demand, p_radius: v.radius, p_alias: v.alias ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function saveLocation(v: { district: string; pincode: string; lat?: number | null; lng?: number | null }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user!.id).single();
  const { error } = await s.from("restaurants").update({ district: v.district || null, pincode: v.pincode || null, lat: v.lat ?? null, lng: v.lng ?? null }).eq("id", p!.restaurant_id);
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function postSurplus(v: { ingredient_id: string | null; item: string; qty: number; unit: string; best_before: string | null; price: number; note: string }) {
  const s = await createClient();
  const { error } = await s.rpc("surplus_post", { p_ingredient: v.ingredient_id, p_item: v.item, p_qty: v.qty, p_unit: v.unit, p_best_before: v.best_before, p_price: v.price, p_note: v.note });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function claimSurplus(id: string) {
  const s = await createClient(); const { data, error } = await s.rpc("surplus_claim", { p_id: id });
  if (error) return { error: error.message }; bump(); return { ok: true, ...(data as { contact: string; item: string }) };
}
export async function closeSurplus(id: string, status: "collected" | "cancelled") {
  const s = await createClient(); const { error } = await s.rpc("surplus_close", { p_id: id, p_status: status });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function offerStandby(labourerId: string, date: string, from: string | null, to: string | null, note: string) {
  const s = await createClient(); const { error } = await s.rpc("standby_offer", { p_labourer: labourerId, p_date: date, p_from: from, p_to: to, p_note: note });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function bookStandby(id: string) {
  const s = await createClient(); const { data, error } = await s.rpc("standby_book", { p_id: id });
  if (error) return { error: error.message }; bump(); return { ok: true, ...(data as { name: string; contact: string }) };
}
