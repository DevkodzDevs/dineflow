"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@dineflow/shared";
import { z } from "zod";
import { requireSession, featureOn } from "@/lib/auth";
import { queueWhatsApp, publicBase } from "@/lib/whatsapp";
import { waDate, firstName } from "@/lib/wa";

const bump = () => ["/billing", "/orders", "/reports", "/dashboard"].forEach((p) => revalidatePath(p));

/** promiseKept is the cashier's word on an on-time promise. Left undefined the bill decides for itself.
 *  `guest` is who the bill is for and what they bring to it: a phone (which makes them a customer),
 *  points to redeem, a coupon code. All optional; the server checks every one of them. */
export async function generateBill(orderId: string, discountPct: number, discountAmount: number, promiseKept?: boolean | null,
  guest?: { phone?: string; name?: string; redeem?: number; coupon?: string }, serviceCharge?: boolean) {
  const s = await createClient();
  const { data, error } = await s.rpc("generate_bill", {
    p_order_id: orderId, p_discount_pct: discountPct, p_discount_amount: discountAmount, p_promise_kept: promiseKept ?? null,
    p_customer_phone: guest?.phone?.trim() || null, p_customer_name: guest?.name?.trim() || null,
    p_redeem_points: Math.max(0, Number(guest?.redeem ?? 0)), p_coupon: guest?.coupon?.trim() || null,
    // 0146: the cashier's service-charge switch; left out, the server's default (on at the till, off for an online order)
    ...(serviceCharge === undefined ? {} : { p_service_charge: serviceCharge }),
  });
  if (error) return { error: error.message };
  if (discountPct > 0 || discountAmount > 0 || guest?.coupon) await alertOwner(s, "discount", data as string);   // 0177: over the owner's line only
  bump(); revalidatePath("/customers"); return { ok: true, billId: data as string };
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
/** Through void_bill (0087): a role check, a reason, a name on the bill, the order back on the floor, a line in the audit trail. */
export async function voidBill(billId: string, reason: string) {
  const s = await createClient(); const { error } = await s.rpc("void_bill", { p_bill_id: billId, p_reason: reason });
  if (error) return { error: error.message };
  await alertOwner(s, "void", billId, reason);   // 0177: every void, to the owner's brief number
  bump(); revalidatePath("/controls"); revalidatePath("/audit"); return { ok: true };
}
/** A refund on a paid bill (0146 issue_credit_note): a numbered credit note, its GST in proportion, cash refunds counted
 *  out of the drawer, a line in the audit trail. The bill itself is never changed. */
export async function issueCreditNote(billId: string, amount: number, reason: string, method: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("issue_credit_note", { p_bill_id: billId, p_amount: amount, p_reason: reason, p_method: method });
  if (error) return { error: error.message };
  bump(); revalidatePath("/controls"); revalidatePath("/audit"); revalidatePath("/tax"); revalidatePath("/invoices");
  return { ok: true as const, note: data as { id: string; cn_no: number; amount: number; cgst: number; sgst: number } };
}
export async function settleBill(billId: string, payments: unknown) {
  const parsed = z.array(paymentSchema).min(1).safeParse(payments);
  if (!parsed.success) return { error: "Enter at least one payment" };
  const s = await createClient();
  const { error } = await s.rpc("settle_bill", { p_bill_id: billId, p_payments: parsed.data });
  if (error) return { error: error.message };
  await tellCustomerPaid(s, billId);   // 0177: the e-bill link, when the bill has a customer with a number
  bump(); return { ok: true };
}
/** `shift` rides along from shiftClose so the owner's day-close message can say what the till was expected to hold and what was counted. */
export async function closeDay(date: string, notes: string, shift?: { counted: number; expected: number }) {
  const s = await createClient(); const { error } = await s.rpc("close_day", { p_date: date, p_notes: notes || null });
  if (error) return { error: error.message };
  await tellOwnerDayClosed(s, date, shift);   // 0177
  bump(); return { ok: true };
}

/* ── 0177: WhatsApp, queued after the write (never inline, never fatal) ─────────────────────────────────────────────
   Each helper returns quietly when the add-on is off, the number is missing or wa_queue says no. The figures are read back
   from the rows the RPC just wrote, through the caller's own client. */
const inr = (n: unknown) => Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function waSession() { try { const session = await requireSession(); return featureOn(session, "whatsapp") ? session : null; } catch { return null; } }
type Db = Awaited<ReturnType<typeof createClient>>;
/** The paid bill's link (/pay/<token>, the same page the till's QR opens) to the customer on the bill. */
async function tellCustomerPaid(s: Db, billId: string) {
  try {
    const session = await waSession(); if (!session) return;
    const { data: b } = await s.from("bills").select("bill_no, total, pay_token, customer_id").eq("id", billId).maybeSingle();
    if (!b?.pay_token || !b.customer_id) return;
    const { data: c } = await s.from("customers").select("name, phone").eq("id", b.customer_id).maybeSingle();
    if (!c?.phone) return;
    await queueWhatsApp(s, session, { kind: "bill", to: c.phone, dedupe: `bill:${billId}:paid`,
      params: [firstName(c.name ?? "") || "Guest", session.restaurant.name, inr(b.total), `${await publicBase()}/pay/${b.pay_token}`] });
  } catch { /* the bill is paid either way */ }
}
/** A void (always) or a discount (over Settings → WhatsApp's line — wa_queue compares p_amount) to the owner's brief number. */
async function alertOwner(s: Db, what: "void" | "discount", billId: string, reason?: string) {
  try {
    const session = await waSession(); const to = session?.restaurant.brief_whatsapp; if (!session || !to) return;
    const { data: b } = await s.from("bills").select("bill_no, total, discount_amount, discount_pct").eq("id", billId).maybeSingle();
    if (!b) return;
    const who = session.profile.full_name || "staff";
    if (what === "void") {
      await queueWhatsApp(s, session, { kind: "alert", to, dedupe: `void:${billId}`, params: [session.restaurant.name, `Bill ${b.bill_no} voided: ${(reason ?? "").trim() || "no reason"}`, inr(b.total), who] });
    } else if (Number(b.discount_amount) > 0) {
      const pct = Number(b.discount_pct) > 0 ? ` (${Number(b.discount_pct)}%)` : "";
      await queueWhatsApp(s, session, { kind: "alert", to, dedupe: `discount:${billId}`, amount: Number(b.discount_amount),
        params: [session.restaurant.name, `Bill ${b.bill_no}: discount of ₹${inr(b.discount_amount)}${pct} on ₹${inr(b.total)}`, inr(b.discount_amount), who] });
    }
  } catch { /* the trail has it either way */ }
}
/** The day's figures to the owner's brief number: sales and bills from day_closes, cash expected vs counted (from the shift close when there was one), voids. */
async function tellOwnerDayClosed(s: Db, date: string, shift?: { counted: number; expected: number }) {
  try {
    const session = await waSession(); const to = session?.restaurant.brief_whatsapp; if (!session || !to) return;
    const rid = session.restaurant.id;
    const { data: d } = await s.from("day_closes").select("total_sales, orders_count, cash").eq("restaurant_id", rid).eq("business_date", date).maybeSingle();
    if (!d) return;
    const from = new Date(`${date}T00:00:00+05:30`); const until = new Date(from.getTime() + 86_400_000);
    const { count } = await s.from("bills").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).eq("status", "void").gte("voided_at", from.toISOString()).lt("voided_at", until.toISOString());
    const expected = shift ? shift.expected : Number(d.cash);
    await queueWhatsApp(s, session, { kind: "day_close", to, dedupe: `day_close:${date}:${Math.round(Number(d.total_sales))}:${shift ? Math.round(shift.counted) : "day"}`,
      params: [session.restaurant.name, waDate(date), inr(d.total_sales), String(d.orders_count ?? 0), inr(expected), shift ? `₹${inr(shift.counted)}` : "not counted", String(count ?? 0)] });
  } catch { /* the day is closed either way */ }
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
  const v = data as { id: string; variance: number; summary: string };
  // keeps the Reports day-close in step; the counted and expected cash ride along for the owner's WhatsApp (0177)
  await closeDay(date, note, { counted: countedCash, expected: countedCash - float - Number(v.variance ?? 0) });
  revalidatePath("/billing"); return { ok: true as const, ...(data as { id: string; variance: number; summary: string }) };
}
export type ShiftExpected = { since: string; cash: number; upi: number; card: number; other: number; total: number; bills: number; unpaid: number; open_orders: number; room_charges: number; top: { name: string; qty: number }[] };
