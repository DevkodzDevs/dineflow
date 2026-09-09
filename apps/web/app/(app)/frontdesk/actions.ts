"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bookingSchema, paymentSchema } from "@dineflow/shared";
import { z } from "zod";
const bump = () => ["/frontdesk", "/rooms", "/housekeeping", "/guests", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function createBooking(input: unknown) {
  const p = bookingSchema.safeParse(input); if (!p.success) return { error: p.error.issues[0].message };
  const s = await createClient(); const d = p.data;
  const { data, error } = await s.rpc("create_booking", { p_guest: d.guest, p_room_id: d.room_id, p_check_in: d.check_in, p_check_out: d.check_out, p_adults: d.adults, p_children: d.children, p_rate: d.rate, p_advance: d.advance, p_source: d.source, p_notes: d.notes ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true, id: data as string };
}
export async function checkIn(id: string) { const s = await createClient(); const { error } = await s.rpc("check_in", { p_booking_id: id }); if (error) return { error: error.message }; bump(); return { ok: true }; }
export async function checkOut(id: string, payments: unknown) {
  const p = z.array(paymentSchema).safeParse(payments); if (!p.success) return { error: "Enter payment" };
  const s = await createClient(); const { data, error } = await s.rpc("check_out", { p_booking_id: id, p_payments: p.data }); if (error) return { error: error.message }; bump(); revalidatePath("/invoices"); return { ok: true, invoiceId: data as string | null };
}
export async function cancelBooking(id: string) {
  const s = await createClient(); const { data: b } = await s.from("bookings").update({ status: "cancelled" }).eq("id", id).eq("status", "reserved").select("room_id").single();
  if (b) await s.from("rooms").update({ status: "available" }).eq("id", b.room_id).eq("status", "reserved"); bump(); return { ok: true };
}
export async function addCharge(bookingId: string, kind: "extra" | "discount", description: string, amount: number) {
  const s = await createClient(); const { error } = await s.from("booking_charges").insert({ booking_id: bookingId, kind, description, amount: kind === "discount" ? -Math.abs(amount) : amount });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function postOrderToRoom(orderId: string, bookingId: string) {
  const s = await createClient(); const { error } = await s.rpc("post_order_to_room", { p_order_id: orderId, p_booking_id: bookingId }); if (error) return { error: error.message };
  ["/orders", "/billing", "/kitchen"].forEach((p) => revalidatePath(p)); bump(); return { ok: true };
}
