"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Ask for leave for oneself (0127 leave_request — the function checks dates, overlap and who is asking). */
export async function askLeave(from: string, to: string, kind: string, reason: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("leave_request", { p_from: from, p_to: to, p_kind: kind, p_reason: reason || null });
  if (error) return { error: error.message };
  revalidatePath("/home"); revalidatePath("/staff");
  return { ok: true as const, id: data as string };
}

/** Withdraw one's own leave while it waits, or before an approved one starts (0127 leave_cancel). */
export async function cancelLeave(id: string) {
  const s = await createClient();
  const { error } = await s.rpc("leave_cancel", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/home"); revalidatePath("/staff");
  return { ok: true as const };
}

/** Approve or refuse someone's leave — the owner, a manager, or their team's supervisor (0127 leave_decide checks). */
export async function decideLeave(id: string, approve: boolean, note: string) {
  const s = await createClient();
  const { error } = await s.rpc("leave_decide", { p_id: id, p_approve: approve, p_note: note || null });
  if (error) return { error: error.message };
  revalidatePath("/staff"); revalidatePath("/home");
  return { ok: true as const };
}
