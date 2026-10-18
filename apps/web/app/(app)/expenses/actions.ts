"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const bump = () => ["/expenses", "/controls", "/reports", "/tax"].forEach((p) => revalidatePath(p));

/** One expense through expense_add (0105): the role, the amounts and the date are checked there; cash paid today also
 *  leaves the drawer. */
export async function addExpense(e: { spent_on: string; category: string; payee: string; amount: number; gst: number; method: string; ref: string; note: string }) {
  const s = await createClient();
  const { data, error } = await s.rpc("expense_add", { p_spent_on: e.spent_on || null, p_category: e.category, p_payee: e.payee || null, p_amount: e.amount, p_gst: e.gst || 0, p_method: e.method, p_ref: e.ref || null, p_note: e.note || null });
  if (error) return { error: error.message };
  bump(); return { ok: true as const, id: data as string };
}

/** Strike one out (owner or manager), with a reason; cash goes back into the drawer. */
export async function voidExpense(id: string, reason: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("expense_void", { p_id: id, p_reason: reason });
  if (error) return { error: error.message };
  bump(); return { ok: true as const, n: Number(data ?? 0) };
}
