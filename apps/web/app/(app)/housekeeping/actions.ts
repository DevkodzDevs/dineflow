"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function setTask(id: string, status: "pending" | "in_progress" | "done") { const s = await createClient(); await s.from("housekeeping_tasks").update({ status }).eq("id", id); ["/housekeeping", "/rooms", "/frontdesk"].forEach((p) => revalidatePath(p)); return { ok: true }; }
export async function addTask(roomId: string, kind: string, notes: string) { const s = await createClient(); await s.from("housekeeping_tasks").insert({ room_id: roomId, kind, notes }); if (kind === "maintenance") await s.from("rooms").update({ status: "maintenance" }).eq("id", roomId).neq("status", "occupied"); revalidatePath("/housekeeping"); revalidatePath("/rooms"); return { ok: true }; }
