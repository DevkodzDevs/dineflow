"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/rooms", "/frontdesk", "/housekeeping"].forEach((p) => revalidatePath(p));
export async function saveRoom(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { number: String(fd.get("number")), floor: Number(fd.get("floor") || 1), room_type_id: fd.get("room_type_id") || null, notes: fd.get("notes") || null, sort_order: Number(fd.get("floor") || 1) * 100 + Number(String(fd.get("number")).replace(/\D/g, "") || 0) };
  const { error } = await (id ? s.from("rooms").update(row).eq("id", id) : s.from("rooms").insert(row)); if (error) return { error: error.message }; bump(); return { ok: true };
}
/**
 * Putting a room back on sale is also a statement about how it was left, so it says both. Without
 * that, "Mark ready" left the room available while housekeeping still had it down as dirty — and
 * the discrepancy report would carry that disagreement for the rest of the week with nobody able
 * to tell which side was wrong. A property that inspects still inspects: the room reads clean, the
 * front desk shows "awaits inspection", and check-in holds until a supervisor signs it off.
 */
export async function setRoomStatus(id: string, status: "available" | "cleaning" | "maintenance") {
  const s = await createClient();
  const row = status === "available" ? { status, condition: "clean" as const, condition_at: new Date().toISOString(), inspected_by: null } : { status };
  const { error } = await s.from("rooms").update(row).eq("id", id).neq("status", "occupied"); if (error) return { error: error.message };
  if (status !== "available") await s.from("housekeeping_tasks").insert({ room_id: id, kind: status === "cleaning" ? "clean" : "maintenance" });
  bump(); return { ok: true };
}
export async function deleteRoom(id: string) { const s = await createClient(); await s.from("rooms").delete().eq("id", id).eq("status", "available"); bump(); return { ok: true }; }
export async function saveRoomType(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), base_rate: Number(fd.get("base_rate") || 0), capacity: Number(fd.get("capacity") || 2) };
  const { error } = await (id ? s.from("room_types").update(row).eq("id", id) : s.from("room_types").insert(row)); if (error) return { error: error.message }; bump(); return { ok: true };
}
