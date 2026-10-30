"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { wrote } from "@/lib/wrote";
import { z } from "zod/v4";
import { askJson, VOICE } from "@/lib/ai";
import { requireSession } from "@/lib/auth";
const bump = () => ["/reservations", "/orders", "/tables", "/dashboard"].forEach((p) => revalidatePath(p));

export async function setReservation(id: string, status: "confirmed" | "seated" | "completed" | "cancelled" | "no_show", tableId?: string | null) {
  const s = await createClient();
  const { error } = await s.rpc("reservation_set", { p_id: id, p_status: status, p_table: tableId ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function addWalkIn(v: { name: string; phone: string; date: string; time: string; party: number; note: string; table?: string; stay?: string }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user!.id).maybeSingle();
  const rid = p?.restaurant_id ?? (await s.rpc("admin_acting_as")).data;
  const { data: last } = await s.from("reservations").select("reservation_no").order("reservation_no", { ascending: false }).limit(1).maybeSingle();
  // a table chosen now is held for them when their time comes; none — one that seats them is given then (0154). Another
  // property's table is refused by the same-property trigger. A guest staying here names their stay (0157, booking_id) —
  // another property's stay is refused the same way.
  const { error } = await s.from("reservations").insert({ restaurant_id: rid, reservation_no: (last?.reservation_no ?? 0) + 1, guest_name: v.name, guest_phone: v.phone, on_date: v.date, at_time: v.time, party_size: v.party, note: v.note, status: "confirmed", source: "phone", table_id: v.table || null, booking_id: v.stay || null });
  if (error) return { error: error.message }; await holdDue(s); bump(); return { ok: true };
}
export async function saveOffer(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { title: String(fd.get("title")), kind: String(fd.get("kind")), value: Number(fd.get("value") || 0), scope: String(fd.get("scope")), min_order: Number(fd.get("min_order") || 0), from_time: (fd.get("from_time") as string) || null, to_time: (fd.get("to_time") as string) || null, code: (fd.get("code") as string) || null, is_active: fd.get("is_active") === "on" };
  const { error } = await (id ? s.from("offers").update(row).eq("id", id) : s.from("offers").insert(row));
  if (error) return { error: error.message }; revalidatePath("/reservations"); revalidatePath("/settings/storefront"); return { ok: true };
}
export async function deleteOffer(id: string) {
  const s = await createClient(); const r = await s.from("offers").delete().eq("id", id).select("id");
  if (r.error?.code === "23503") return { error: "Used on past bills or bookings — switch it off instead of deleting." };
  const bad = wrote(r, "That offer could not be deleted."); if (bad) return bad; revalidatePath("/settings/storefront"); return { ok: true };
}
export async function replyReview(id: string, reply: string) {
  const s = await createClient(); const { error } = await s.from("reviews").update({ reply, replied_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message }; revalidatePath("/reservations"); return { ok: true };
}

/* ── AI: draft the public reply to a review ───────────────────────────────────────────────── */
const replySchema = z.object({ reply: z.string().max(400) });
/** A draft in the proprietor's voice for the person to edit and post. It is never posted from here. */
export async function draftReviewReply(id: string) {
  const session = await requireSession(); const s = await createClient();
  const { data: v } = await s.from("reviews").select("guest_name, rating, body").eq("id", id).maybeSingle();
  if (!v) return { error: "That review is gone." };
  const r = await askJson({
    schema: replySchema, effort: "low",
    system: `You draft the owner's public reply to a guest review of ${session.restaurant.name}, a ${session.restaurant.property_type} in India. ${VOICE} Two to four sentences. Thank them by name if there is one. If they raised a problem, name it plainly and say what changes — no excuses, no "we strive". If it was praise, be brief and specific to what they liked. Never offer money, discounts or free food. Never argue.`,
    user: `Guest: ${v.guest_name ?? "(no name)"}\nRating: ${v.rating} of 5\nReview: ${v.body ?? "(rating only, no words)"}`,
  });
  return r.ok ? { ok: true as const, reply: r.data.reply } : { error: r.error };
}
