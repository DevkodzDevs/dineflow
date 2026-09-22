"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@dineflow/shared";
import { z } from "zod";

const bump = () => ["/billing", "/orders", "/reports", "/dashboard"].forEach((p) => revalidatePath(p));

/** promiseKept is the cashier's word on an on-time promise. Left undefined the bill decides for itself.
 *  `guest` is who the bill is for and what they bring to it: a phone (which makes them a customer),
 *  points to redeem, a coupon code. All optional; the server checks every one of them. */
export async function generateBill(orderId: string, discountPct: number, discountAmount: number, promiseKept?: boolean | null,
  guest?: { phone?: string; name?: string; redeem?: number; coupon?: string }) {
  const s = await createClient();
  const { data, error } = await s.rpc("generate_bill", {
    p_order_id: orderId, p_discount_pct: discountPct, p_discount_amount: discountAmount, p_promise_kept: promiseKept ?? null,
    p_customer_phone: guest?.phone?.trim() || null, p_customer_name: guest?.name?.trim() || null,
    p_redeem_points: Math.max(0, Number(guest?.redeem ?? 0)), p_coupon: guest?.coupon?.trim() || null,
  });
  if (error) return { error: error.message }; bump(); revalidatePath("/customers"); return { ok: true, billId: data as string };
}
export type Customer = { id: string; name: string | null; phone: string; visits: number; total_spend: number; points: number; last_visit_at: string | null; tags: string[]; notes: string | null; point_value: number; min_redeem: number; loyalty: boolean };
/** Who a phone number is, if we know them. Null when we do not — never an error. */
export async function lookupCustomer(phone: string) {
  if (phone.replace(/\D/g, "").length < 10) return { ok: true as const, customer: null };
  const s = await createClient(); const { data, error } = await s.rpc("customer_lookup", { p_phone: phone });
  if (error) return { error: error.message }; return { ok: true as const, customer: (data ?? null) as Customer | null };
}
export type Coupon = { id: string; title: string; code: string; kind: string; value: number; pct: number; amount: number };
/** Does this code apply to this bill, today, at this hour? The server says, in words the cashier can repeat. */
export async function checkCoupon(code: string, subtotal: number) {
  const s = await createClient(); const { data, error } = await s.rpc("coupon_check", { p_code: code.trim(), p_subtotal: subtotal });
  if (error) return { error: error.message }; return { ok: true as const, coupon: data as Coupon };
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
