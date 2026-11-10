"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { wrote } from "@/lib/wrote";
import { z } from "zod/v4";
import { askJson, VOICE } from "@/lib/ai";
import { requireSession, featureOn } from "@/lib/auth";
import { queueWhatsApp } from "@/lib/whatsapp";
import { waDate, waTime, firstName } from "@/lib/wa";
const bump = () => ["/reservations", "/orders", "/tables", "/dashboard"].forEach((p) => revalidatePath(p));

export async function setReservation(id: string, status: "confirmed" | "seated" | "completed" | "cancelled" | "no_show", tableId?: string | null) {
  const s = await createClient();
  const { error } = await s.rpc("reservation_set", { p_id: id, p_status: status, p_table: tableId ?? null });
  if (error) return { error: error.message };
  if (status === "confirmed") await tellGuestConfirmed(s, id);   // 0177: queued, best effort — the write above is done
  bump(); return { ok: true };
}
/** 0177: a confirmed reservation → the guest's WhatsApp (dineflow_reservation), queued through wa_queue after the write. Nothing
 *  when the add-on, the settings or the switch is off, or there is no number; never fails the action. */
async function tellGuestConfirmed(s: Awaited<ReturnType<typeof createClient>>, id: string) {
  try {
    const session = await requireSession(); if (!featureOn(session, "whatsapp")) return;
    const { data: v } = await s.from("reservations").select("guest_name, guest_phone, on_date, at_time, party_size, reservation_no").eq("id", id).maybeSingle();
    if (!v?.guest_phone) return;
    await queueWhatsApp(s, session, { kind: "reservation", to: v.guest_phone, dedupe: `reservation:${id}:confirmed`,
      params: [firstName(v.guest_name ?? "") || "Guest", session.restaurant.name, waDate(v.on_date), waTime(v.at_time), String(v.party_size ?? 2), String(v.reservation_no ?? "")] });
  } catch { /* the reservation is confirmed either way */ }
}
export async function addWalkIn(v: { name: string; phone: string; date: string; time: string; party: number; note: string; table?: string; stay?: string }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user!.id).maybeSingle();
  const rid = p?.restaurant_id ?? (await s.rpc("admin_acting_as")).data;
  // a table chosen must still be free then (2026-11-04): no other live booking on it within 90 min that day — the sheet offers
  // only free tables, this catches one booked from another screen meanwhile
  if (v.table) {
    const { data: near } = await s.from("reservations").select("at_time, dining_tables(name)").eq("table_id", v.table).eq("on_date", v.date).in("status", ["requested", "confirmed", "seated"]);
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const clash = ((near ?? []) as unknown as { at_time: string; dining_tables: { name: string } | null }[]).find((r) => Math.abs(toMin(r.at_time) - toMin(v.time)) < 90);
    if (clash) return { error: `${clash.dining_tables?.name ?? "That table"} is booked at ${clash.at_time.slice(0, 5)} — pick another table or Auto.` };
  }
  const { data: last } = await s.from("reservations").select("reservation_no").order("reservation_no", { ascending: false }).limit(1).maybeSingle();
  // a table chosen now is held for them when their time comes; none — one that seats them is given then (0154). Another
  // property's table is refused by the same-property trigger. A guest staying here names their stay (0157, booking_id) —
  // another property's stay is refused the same way.
  const { data: made, error } = await s.from("reservations").insert({ restaurant_id: rid, reservation_no: (last?.reservation_no ?? 0) + 1, guest_name: v.name, guest_phone: v.phone, on_date: v.date, at_time: v.time, party_size: v.party, note: v.note, status: "confirmed", source: "phone", table_id: v.table || null, booking_id: v.stay || null }).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (made?.id && v.phone) await tellGuestConfirmed(s, made.id);   // 0177: a booking taken by phone is confirmed at once
  await holdDue(s); bump(); return { ok: true };
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
