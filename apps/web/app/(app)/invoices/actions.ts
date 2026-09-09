"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function diningInvoice(billId: string, guest: { name?: string; phone?: string; gstin?: string }) {
  const s = await createClient(); const { data, error } = await s.rpc("generate_dining_invoice", { p_bill_id: billId, p_guest_name: guest.name || null, p_guest_phone: guest.phone || null, p_guest_gstin: guest.gstin || null });
  if (error) return { error: error.message }; revalidatePath("/invoices"); return { ok: true, id: data as string };
}
export async function stayInvoice(bookingId: string, gstin?: string) {
  const s = await createClient(); const { data, error } = await s.rpc("generate_stay_invoice", { p_booking_id: bookingId, p_guest_gstin: gstin || null });
  if (error) return { error: error.message }; revalidatePath("/invoices"); return { ok: true, id: data as string };
}
export async function updateInvoiceGuest(id: string, guest: { name?: string; phone?: string; gstin?: string }) {
  const s = await createClient(); await s.from("invoices").update({ guest_name: guest.name || null, guest_phone: guest.phone || null, guest_gstin: guest.gstin || null }).eq("id", id); revalidatePath(`/invoices/${id}`); return { ok: true };
}
