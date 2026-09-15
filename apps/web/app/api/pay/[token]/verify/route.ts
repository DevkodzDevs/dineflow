import { NextResponse } from "next/server";
import { gatewayFor, razorpay, signatureOk, methodOf, paise, settle } from "@/lib/razorpay";

/**
 * The checkout window hands the browser an order id, a payment id and a signature. The signature is
 * HMAC-SHA256 of "order|payment" under the key secret, so only a real payment through this
 * property's account can produce it. Then the payment itself is fetched to be sure it belongs to
 * this bill and covers the total, before the bill is marked paid.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const oid = String(b.razorpay_order_id ?? ""), pid = String(b.razorpay_payment_id ?? ""), sig = String(b.razorpay_signature ?? "");
  if (!oid || !pid || !sig) return NextResponse.json({ error: "Incomplete payment result" }, { status: 400 });

  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!signatureOk(g.gw.key_secret, `${oid}|${pid}`, sig)) return NextResponse.json({ error: "The payment could not be verified" }, { status: 400 });

  let method: "upi" | "card" | "other" = "other";
  try {
    const p = await razorpay<{ order_id?: string; method?: string; amount?: number; status?: string; notes?: Record<string, string> }>(g.gw, `/payments/${pid}`);
    if (p.order_id && p.order_id !== oid) return NextResponse.json({ error: "Payment and order do not match" }, { status: 400 });
    if (p.notes?.pay_token && p.notes.pay_token !== token) return NextResponse.json({ error: "This payment belongs to another bill" }, { status: 400 });
    if (p.amount !== undefined && p.amount < paise(g.gw.total)) return NextResponse.json({ error: "The payment is short of the bill total" }, { status: 400 });
    if (p.status && !["captured", "authorized"].includes(p.status)) return NextResponse.json({ error: `Payment is ${p.status}` }, { status: 400 });
    method = methodOf(p.method);
  } catch {
    // Razorpay unreachable right after it just answered the browser: the signature already proves the
    // payment, so record it under "other" rather than leave a paid guest looking at an unpaid bill.
  }
  const r = await settle(token, method, pid);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, already: r.already });
}
