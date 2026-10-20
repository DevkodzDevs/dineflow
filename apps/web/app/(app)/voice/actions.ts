"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Feedback & complaints (0124). Every write is a definer RPC that checks the caller; RLS decides what each side reads. */
export type Reply = { id: string; side: "owner" | "staff"; body: string; by_name: string | null; created_at: string };

/** Send an item to the owner — any staff but the owner (voice_send checks; ten a day). */
export async function sendVoice(kind: string, about: string | null, subject: string, body: string, anonymous: boolean) {
  const s = await createClient();
  const { data, error } = await s.rpc("voice_send", { p_kind: kind, p_about: about, p_subject: subject, p_body: body, p_anonymous: anonymous });
  if (error) return { error: error.message };
  revalidatePath("/voice"); return { ok: true as const, id: data as string };
}

/** Add to an item's thread — the owner on any item of the property, the author on their own. */
export async function replyVoice(id: string, body: string) {
  const s = await createClient();
  const { error } = await s.rpc("voice_reply", { p_id: id, p_body: body });
  if (error) return { error: error.message };
  revalidatePath("/voice"); return { ok: true as const };
}

/** The owner moves an item along (new · seen · in_progress · resolved); the author is told. */
export async function setVoiceStatus(id: string, status: string) {
  const s = await createClient();
  const { error } = await s.rpc("voice_set_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/voice"); return { ok: true as const };
}

/** The thread of one item, oldest first, and the item marked read for whoever opened it. */
export async function openVoice(id: string) {
  const s = await createClient();
  const [{ data, error }] = await Promise.all([
    s.from("staff_voice_replies").select("id, side, body, by_name, created_at").eq("voice_id", id).order("created_at"),
    s.rpc("voice_seen", { p_id: id }),
  ]);
  if (error) return { error: error.message };
  revalidatePath("/voice"); return { ok: true as const, replies: (data ?? []) as Reply[] };
}
