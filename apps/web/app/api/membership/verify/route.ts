import { NextResponse } from "next/server";
import { razorpay, signatureOk } from "@/lib/razorpay";
import { platformKeys, membershipPaid } from "@/lib/platformPay";

/**
 * The checkout window's answer for a membership payment (0151): the signature is HMAC-SHA256 of "order|payment" under
 * DineFlow's key secret, so only a real payment through DineFlow's account makes it. Then Razorpay is asked for the order
 * (it must be one /api/membership/order made) and the payment (it must be that order's, captured — an authorized hold is
 * captured first). membership_paid checks the amount against the price and extends the membership once.
 */
export async function POST(req: Request) {
  const keys = platformKeys();
  if (!keys) return NextResponse.json({ error: "Online payment is not set up" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const oid = String(b.razorpay_order_id ?? ""), pid = String(b.razorpay_payment_id ?? ""), sig = String(b.razorpay_signature ?? "");
  if (!oid || !pid || !sig) return NextResponse.json({ error: "Incomplete payment result" }, { status: 400 });
  if (!signatureOk(keys.key_secret, `${oid}|${pid}`, sig)) return NextResponse.json({ error: "The payment could not be verified" }, { status: 400 });
  let amount = 0;
  try {
    const order = await razorpay<{ notes?: Record<string, string> }>(keys, `/orders/${oid}`);
    if (!order.notes?.membership_payment) return NextResponse.json({ error: "This payment is not a membership payment" }, { status: 400 });
    const p = await razorpay<{ order_id?: string; amount?: number; status?: string }>(keys, `/payments/${pid}`);
    if (p.order_id !== oid) return NextResponse.json({ error: "Payment and order do not match" }, { status: 400 });
    let status = p.status;
    if (status === "authorized") {
      try { status = (await razorpay<{ status?: string }>(keys, `/payments/${pid}/capture`, { method: "POST", body: JSON.stringify({ amount: p.amount, currency: "INR" }) })).status; }
      catch { status = (await razorpay<{ status?: string }>(keys, `/payments/${pid}`)).status; }
    }
    if (status !== "captured") return NextResponse.json({ error: status === "authorized" ? "Paid — your membership turns on in a minute." : `Payment is ${status ?? "not complete"}` }, { status: status === "authorized" ? 502 : 400 });
    amount = p.amount ?? 0;
  } catch {
    return NextResponse.json({ error: "Paid — your membership turns on in a minute." }, { status: 502 });
  }
  const r = await membershipPaid(oid, pid, amount);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, ends_at: r.ends_at ?? null });
}
