"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* Master control's side of Help & support. Every RPC checks is_platform_admin() itself (0096). */
const bump = (id?: string) => { revalidatePath("/admin/support"); if (id) revalidatePath(`/admin/support/${id}`); revalidatePath("/admin", "layout"); };

export async function answer(ticket: string, body: string, internal: boolean, status: string | null) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_support_reply", { p_ticket: ticket, p_body: body, p_internal: internal, p_status: status });
  if (error) return { error: error.message };
  bump(ticket);
  return { ok: true as const, message_id: (data as { message_id: string }).message_id };
}

export async function attach(ticket: string, message: string, paths: string[]) {
  if (!paths.length) return { ok: true as const };
  const s = await createClient();
  const { error } = await s.rpc("support_attach", { p_message: message, p_paths: paths });
  if (error) return { error: error.message };
  bump(ticket); return { ok: true as const };
}

export async function setTicket(ticket: string, status: string | null, priority: string | null) {
  const s = await createClient();
  const { error } = await s.rpc("admin_support_set", { p_ticket: ticket, p_status: status, p_priority: priority });
  if (error) return { error: error.message };
  bump(ticket); return { ok: true as const };
}

/** Take a screenshot off a request (0097): the message first — the thread then says one was removed —
 *  then the file itself, through the Storage API (a direct delete is refused by Storage). */
export async function dropFile(ticket: string, message: string, path: string) {
  const s = await createClient();
  const { error } = await s.rpc("admin_support_drop_file", { p_message: message, p_path: path });
  if (error) return { error: error.message };
  const { error: gone } = await s.storage.from("support").remove([path]);
  bump(ticket);
  return gone ? { error: `Taken off the request, but the file stays in storage: ${gone.message}` } : { ok: true as const };
}

/** Master control has read the property's latest word — it leaves the badge */
export async function seen(ticket: string) {
  const s = await createClient();
  await s.rpc("admin_support_seen", { p_ticket: ticket });
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}
