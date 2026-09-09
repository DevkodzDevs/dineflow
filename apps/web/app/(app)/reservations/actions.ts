"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/reservations", "/orders", "/dashboard"].forEach((p) => revalidatePath(p));

export async function setReservation(id: string, status: "confirmed" | "seated" | "completed" | "cancelled" | "no_show", tableId?: string | null) {
  const s = await createClient();
  const { error } = await s.rpc("reservation_set", { p_id: id, p_status: status, p_table: tableId ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function addWalkIn(v: { name: string; phone: string; date: string; time: string; party: number; note: string }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user!.id).maybeSingle();
  const rid = p?.restaurant_id ?? (await s.rpc("admin_acting_as")).data;
  const { data: last } = await s.from("reservations").select("reservation_no").order("reservation_no", { ascending: false }).limit(1).maybeSingle();
  const { error } = await s.from("reservations").insert({ restaurant_id: rid, reservation_no: (last?.reservation_no ?? 0) + 1, guest_name: v.name, guest_phone: v.phone, on_date: v.date, at_time: v.time, party_size: v.party, note: v.note, status: "confirmed", source: "phone" });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function saveOffer(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { title: String(fd.get("title")), kind: String(fd.get("kind")), value: Number(fd.get("value") || 0), scope: String(fd.get("scope")), min_order: Number(fd.get("min_order") || 0), from_time: (fd.get("from_time") as string) || null, to_time: (fd.get("to_time") as string) || null, code: (fd.get("code") as string) || null, is_active: fd.get("is_active") === "on" };
  const { error } = await (id ? s.from("offers").update(row).eq("id", id) : s.from("offers").insert(row));
  if (error) return { error: error.message }; revalidatePath("/reservations"); revalidatePath("/settings/storefront"); return { ok: true };
}
export async function deleteOffer(id: string) { const s = await createClient(); await s.from("offers").delete().eq("id", id); revalidatePath("/settings/storefront"); return { ok: true }; }
export async function replyReview(id: string, reply: string) {
  const s = await createClient(); const { error } = await s.from("reviews").update({ reply, replied_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message }; revalidatePath("/reservations"); return { ok: true };
}
