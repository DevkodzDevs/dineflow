"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* Help & support, the property's side. Every write is one of 0096's RPCs, which check the caller
   themselves; screenshots go from the browser straight into the request's folder in the private
   `support` bucket (Storage's own rules check it), and attach() then records them on the message. */

const bump = (id?: string) => { revalidatePath("/help"); if (id) revalidatePath(`/help/${id}`); revalidatePath("/admin/support"); };

export async function raiseRequest(r: { kind: string; subject: string; body: string; priority: string; allow: boolean; topic: string | null; context: Record<string, string | number | boolean | null> }) {
  const s = await createClient();
  const { data, error } = await s.rpc("support_open", { p_kind: r.kind, p_subject: r.subject, p_body: r.body, p_priority: r.priority, p_allow_access: r.allow, p_context: r.context, p_topic: r.topic });
  if (error) return { error: error.message };
  bump();
  return { ok: true as const, ...(data as { id: string; no: number; restaurant_id: string; message_id: string }) };
}

export async function replyRequest(ticket: string, body: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("support_reply", { p_ticket: ticket, p_body: body });
  if (error) return { error: error.message };
  bump(ticket);
  return { ok: true as const, message_id: (data as { message_id: string }).message_id };
}

export async function attachShots(ticket: string, message: string, paths: string[]) {
  if (!paths.length) return { ok: true as const };
  const s = await createClient();
  const { error } = await s.rpc("support_attach", { p_message: message, p_paths: paths });
  if (error) return { error: error.message };
  bump(ticket);
  return { ok: true as const };
}

export async function setRequestStatus(ticket: string, status: "resolved" | "open") {
  const s = await createClient();
  const { error } = await s.rpc("support_set_status", { p_ticket: ticket, p_status: status });
  if (error) return { error: error.message };
  bump(ticket); return { ok: true as const };
}

export async function setRequestAccess(ticket: string, allow: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("support_set_access", { p_ticket: ticket, p_allow: allow });
  if (error) return { error: error.message };
  bump(ticket); return { ok: true as const };
}

export async function rateRequest(ticket: string, rating: number, note: string) {
  const s = await createClient();
  const { error } = await s.rpc("support_rate", { p_ticket: ticket, p_rating: rating, p_note: note || null });
  if (error) return { error: error.message };
  bump(ticket); return { ok: true as const };
}

/** the person who raised it has read the replies — clears the badge on Help & support */
export async function markSeen(ticket: string) {
  const s = await createClient();
  await s.rpc("support_seen", { p_ticket: ticket });
  revalidatePath("/help");
  return { ok: true as const };
}
