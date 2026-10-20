"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Tick or untick one duty on today's run (0105 checklist_tick) — anyone the list is for (0122, 0123). */
export async function tick(checklist: string, item: number, done: boolean) {
  const s = await createClient();
  const { data, error } = await s.rpc("checklist_tick", { p_checklist: checklist, p_item: item, p_done: done });
  if (error) return { error: error.message };
  revalidatePath("/tasks"); return { ok: true as const, run: data as { done: Record<string, { name: string; at: string }>; completed_at: string | null } };
}

/** Write a list — owner, manager or supervisor (the function checks). `id` null makes a new one. Who it is for: teams
 *  (0122), jobs and positions (0123) — all three empty = everyone. */
export async function saveList(id: string | null, name: string, shift: string, items: string[], active = true, departments: string[] = [], jobs: string[] = [], positions: string[] = []) {
  const s = await createClient();
  const { data, error } = await s.rpc("checklist_save", { p_id: id, p_name: name, p_shift: shift, p_items: items, p_active: active, p_departments: departments, p_jobs: jobs, p_positions: positions });
  if (error) return { error: error.message };
  revalidatePath("/tasks"); return { ok: true as const, id: data as string };
}
