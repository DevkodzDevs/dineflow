"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, featureOn } from "@/lib/auth";
import { queueWhatsApp, publicBase } from "@/lib/whatsapp";
import { firstName } from "@/lib/wa";

export async function addWalkin(name: string, phone: string, party: number, note = "") {
  const s = await createClient();
  const { data, error } = await s.rpc("walkin_add", { p_name: name, p_phone: phone, p_party: party, p_note: note.trim() || null });
  if (error) return { error: error.message };
  revalidatePath("/pulse"); return { ok: true as const, ...(data as { id: string; token: string; token_no: number | null; quoted_min: number | null; position: number; table: string | null; table_id: string | null }) };
}
/** `more` (0180): the tables joined to the first one for a big party — seating marks every one of them. */
export async function setWalkin(id: string, status: "called" | "seated" | "left", tableId?: string, more: string[] = []) {
  const s = await createClient();
  const { error } = await s.rpc("walkin_set", { p_id: id, p_status: status, p_table: tableId ?? null, p_more: tableId ? more : [] });
  if (error) return { error: error.message };
  if (status === "called") await tellGuestReady(s, id);   // 0179: queued, best effort — the call above is done
  revalidatePath("/pulse"); return { ok: true as const };
}
/** "Your table is ready" on WhatsApp (0177 dineflow_table_ready) to a called guest who ticked it on the queue page — or whom the
 *  host added with a phone. Nothing without the add-on, the property's WhatsApp, the switch, or a usable number; the dedupe key
 *  means a second Table ready on the same guest sends nothing twice. An offline Table ready (the outbox's walkin_set) skips this. */
async function tellGuestReady(s: Awaited<ReturnType<typeof createClient>>, id: string) {
  try {
    const session = await requireSession(); if (!featureOn(session, "whatsapp")) return;
    const { data: w } = await s.from("walkins").select("name, phone, wa_ok, token, token_no").eq("id", id).maybeSingle();
    if (!w?.phone || !w.wa_ok) return;
    const slug = session.restaurant.booking_slug;
    const link = slug ? `${await publicBase()}/queue/${slug}?t=${w.token}` : "";
    await queueWhatsApp(s, session, { kind: "table_ready", to: w.phone, dedupe: `walkin:${id}:ready`,
      params: [firstName(w.name ?? "") || "Guest", session.restaurant.name, String(w.token_no ?? ""), link] });
  } catch { /* the guest is called either way */ }
}
/** The host sets a table for a waiting guest (0164): held for them until they are seated, leave, or someone else sits there.
 *  `more` (0180): up to two further tables joined to it for a big party; the answer's `table` reads "T4 + T5". */
export async function holdWalkin(id: string, tableId: string, more: string[] = []) {
  const s = await createClient();
  const { data, error } = await s.rpc("walkin_hold", { p_id: id, p_table: tableId, p_more: more });
  if (error) return { error: error.message };
  revalidatePath("/pulse"); return { ok: true as const, table: (data as { table: string }).table };
}
export async function quote(party: number) {
  const s = await createClient(); const { data } = await s.rpc("quote_wait", { p_party: party }); return data as number | null;
}
