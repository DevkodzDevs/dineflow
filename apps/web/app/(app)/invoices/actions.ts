"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wrote, GSTIN_RE } from "@/lib/wrote";
export async function diningInvoice(billId: string, guest: { name?: string; phone?: string; gstin?: string }) {
  const s = await createClient(); const { data, error } = await s.rpc("generate_dining_invoice", { p_bill_id: billId, p_guest_name: guest.name || null, p_guest_phone: guest.phone || null, p_guest_gstin: guest.gstin || null });
  if (error) return { error: error.message }; revalidatePath("/invoices"); return { ok: true, id: data as string };
}
export async function stayInvoice(bookingId: string, gstin?: string) {
  const s = await createClient(); const { data, error } = await s.rpc("generate_stay_invoice", { p_booking_id: bookingId, p_guest_gstin: gstin || null });
  if (error) return { error: error.message }; revalidatePath("/invoices"); return { ok: true, id: data as string };
}
export async function updateInvoiceGuest(id: string, guest: { name?: string; phone?: string; gstin?: string }) {
  // a GSTIN on a tax invoice is the buyer's claim to input tax credit: it must at least be shaped like one
  const gstin = (guest.gstin ?? "").trim().toUpperCase() || null;
  if (gstin && !GSTIN_RE.test(gstin)) return { error: "That GSTIN does not look right — 15 characters, like 33ABCDE1234F1Z5." };
  const s = await createClient();
  const bad = wrote(await s.from("invoices").update({ guest_name: guest.name || null, guest_phone: guest.phone || null, guest_gstin: gstin }).eq("id", id).select("id"), "That invoice could not be changed.");
  if (bad) return bad; revalidatePath(`/invoices/${id}`); return { ok: true };
}
