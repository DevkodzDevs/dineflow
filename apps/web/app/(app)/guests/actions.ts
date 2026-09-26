"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** What the desk should know before the guest reaches it: VIP, and how they like their stay. */
export async function saveGuestFlags(id: string, vip: boolean, preferences: string) {
  const s = await createClient(); const { error } = await s.from("guests").update({ vip, preferences: preferences.trim().slice(0, 300) || null }).eq("id", id);
  if (error) return { error: error.message }; ["/guests", "/frontdesk"].forEach((p) => revalidatePath(p)); return { ok: true };
}

/** The longer note — what happened last time, who to ask for, what went wrong and was put right. */
export async function saveGuestNotes(id: string, notes: string) {
  const s = await createClient();
  const { error } = await s.from("guests").update({ notes: notes.trim().slice(0, 2000) || null }).eq("id", id);
  if (error) return { error: error.message }; ["/guests", "/frontdesk"].forEach((p) => revalidatePath(p)); return { ok: true };
}
