import { NextResponse } from "next/server";
import { prepayGatewayFor, prepayQrSet, razorpay } from "@/lib/razorpay";
import { paise, QR_LIFE_SECONDS } from "@/lib/payqr";
import { allow } from "@/lib/ratelimit";

/**
 * The dynamic UPI QR for a HELD online order (0181), the storefront's prepay. POST issues (or re-uses) a single-use UPI code
 * for the order's total and remembers it on the order; the pay page draws the image. When the guest pays it, Razorpay sends
 * qr_code.credited to /api/webhooks/razorpay and dine_prepay_settle marks the order paid, so the counter sees it. This is the
 * exact mirror of the bill's /api/pay/[token]/qr — same Razorpay helper, same lifetime — but keyed by the order's pay_token and
 * for the whole amount only (an online order is paid in full or not at all). Without a gateway the answer is 404.
 *
 * The token is the held order's own 32-hex secret (minted by dine_order, only the guest who placed the order has it); bounded
 * per token, never a secret in the answer, and nothing here marks anything paid.
 */
type QrCode = { id: string; image_url: string; status: string };

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{16,64}$/.test(token)) return NextResponse.json({ error: "Not a payment link." }, { status: 404 });
  if (!allow(`dineqr:${token}`, 12, 10 * 60_000)) return NextResponse.json({ error: "Too many codes for this order. Wait a moment." }, { status: 429 });
  const g = await prepayGatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const gw = g.gw;
  if (gw.pay_status !== "pending") return NextResponse.json({ error: "This order is not open for payment." }, { status: 409 });
  const want = Math.round(Number(gw.total) * 100) / 100;
  if (!(want > 0)) return NextResponse.json({ error: "This order has no amount." }, { status: 400 });
  const name = `ORD-${(gw.ref ?? "").toString().slice(0, 10) || "ONLINE"}`;
  try {
    // the code already issued for this order, while it is still active
    if (gw.qr_id && gw.qr_url && Number(gw.qr_amount) === want) {
      const cur = await razorpay<QrCode>(gw, `/payments/qr_codes/${gw.qr_id}`);
      if (cur.status === "active") return NextResponse.json({ id: cur.id, image_url: gw.qr_url, amount: want });
    }
    if (gw.qr_id) { try { await razorpay(gw, `/payments/qr_codes/${gw.qr_id}/close`, { method: "POST", body: "{}" }); } catch { /* already closed */ } }
    const qr = await razorpay<QrCode>(gw, "/payments/qr_codes", {
      method: "POST",
      body: JSON.stringify({ type: "upi_qr", name, usage: "single_use", fixed_amount: true, payment_amount: paise(want), description: `${name} · ${gw.name}`.slice(0, 80),
        close_by: Math.floor(Date.now() / 1000) + QR_LIFE_SECONDS, notes: { prepay_token: token, ref: name } }),
    });
    const r = await prepayQrSet(token, qr.id, qr.image_url, want);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ id: qr.id, image_url: qr.image_url, amount: want });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
