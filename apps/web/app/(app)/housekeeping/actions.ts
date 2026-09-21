"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/housekeeping", "/rooms", "/frontdesk", "/dashboard"].forEach((p) => revalidatePath(p));

export async function setTask(id: string, status: "pending" | "in_progress" | "done") { const s = await createClient(); await s.from("housekeeping_tasks").update({ status }).eq("id", id); bump(); return { ok: true }; }
export async function addTask(roomId: string, kind: string, notes: string) { const s = await createClient(); await s.from("housekeeping_tasks").insert({ room_id: roomId, kind, notes }); if (kind === "maintenance") await s.from("rooms").update({ status: "maintenance" }).eq("id", roomId).neq("status", "occupied"); bump(); return { ok: true }; }

/** Housekeeping's word from the corridor: dirty, clean, or pickup (a touch-up after a short occupancy). */
export async function setCondition(roomId: string, condition: "dirty" | "clean" | "pickup") {
  const s = await createClient(); const { error } = await s.rpc("set_room_condition", { p_room_id: roomId, p_condition: condition });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
/** The supervisor's signature. A fail writes the reason onto a fresh clean ticket for the attendant. */
export async function inspectRoom(roomId: string, pass: boolean, note?: string) {
  const s = await createClient(); const { error } = await s.rpc("inspect_room", { p_room_id: roomId, p_pass: pass, p_note: note?.trim() || null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
/** Today's task sheet: a stayover service for every room with a guest tonight, a clean for any dirty room without one. */
export async function buildSheet() {
  const s = await createClient(); const { data, error } = await s.rpc("hk_build_sheet");
  if (error) return { error: error.message }; bump(); return { ok: true, added: (data as number) ?? 0 };
}
