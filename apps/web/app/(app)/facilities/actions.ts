"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/facilities", "/frontdesk"].forEach((p) => revalidatePath(p, "layout"));
export async function saveFacility(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), kind: String(fd.get("kind") || "activity"), rate: Number(fd.get("rate") || 0), duration_minutes: Number(fd.get("duration_minutes") || 60), capacity: Number(fd.get("capacity") || 1) };
  const { error } = await (id ? s.from("facilities").update(row).eq("id", id) : s.from("facilities").insert(row)); if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function bookFacility(facilityId: string, startsAt: string, people: number, amount: number, bookingId: string | null, guestName: string) {
  const s = await createClient(); const { error } = await s.from("facility_bookings").insert({ facility_id: facilityId, starts_at: startsAt, people, amount, booking_id: bookingId, guest_name: guestName });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function cancelFacilityBooking(id: string) { const s = await createClient(); await s.from("facility_bookings").update({ status: "cancelled" }).eq("id", id); bump(); return { ok: true }; }
