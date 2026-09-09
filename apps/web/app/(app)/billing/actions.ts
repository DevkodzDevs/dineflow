"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@dineflow/shared";
import { z } from "zod";

const bump = () => ["/billing", "/orders", "/reports", "/dashboard"].forEach((p) => revalidatePath(p));

export async function generateBill(orderId: string, discountPct: number, discountAmount: number) {
  const s = await createClient();
  const { data, error } = await s.rpc("generate_bill", { p_order_id: orderId, p_discount_pct: discountPct, p_discount_amount: discountAmount });
  if (error) return { error: error.message }; bump(); return { ok: true, billId: data as string };
}
export async function voidBill(billId: string) {
  const s = await createClient(); const { error } = await s.from("bills").update({ status: "void" }).eq("id", billId).eq("status", "unpaid");
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function settleBill(billId: string, payments: unknown) {
  const parsed = z.array(paymentSchema).min(1).safeParse(payments);
  if (!parsed.success) return { error: "Enter at least one payment" };
  const s = await createClient();
  const { error } = await s.rpc("settle_bill", { p_bill_id: billId, p_payments: parsed.data });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function closeDay(date: string, notes: string) {
  const s = await createClient(); const { error } = await s.rpc("close_day", { p_date: date, p_notes: notes || null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** Shift close: what the tills should hold, and the one-paragraph summary once counted. */
export async function shiftExpected() {
  const s = await createClient(); const { data, error } = await s.rpc("shift_expected");
  if (error) return { error: error.message }; return { ok: true as const, expected: data as ShiftExpected };
}
export async function shiftClose(countedCash: number, float: number, note: string, date: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("shift_close", { p_counted_cash: countedCash, p_float: float, p_note: note || null });
  if (error) return { error: error.message };
  await closeDay(date, note);   // keeps the Reports day-close in step
  revalidatePath("/billing"); return { ok: true as const, ...(data as { id: string; variance: number; summary: string }) };
}
export type ShiftExpected = { since: string; cash: number; upi: number; card: number; other: number; total: number; bills: number; unpaid: number; open_orders: number; room_charges: number; top: { name: string; qty: number }[] };
