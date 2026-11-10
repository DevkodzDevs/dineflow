import { NextResponse } from "next/server";
import { gatewayFor, razorpay, serviceClient } from "@/lib/razorpay";
import { paise, qrName, QR_LIFE_SECONDS } from "@/lib/payqr";
import { allow } from "@/lib/ratelimit";

/**
 * The dynamic UPI QR for one bill (0178). POST issues (or re-uses) a Razorpay single-use UPI code for the amount asked —
 * the whole bill, or the UPI part of a split — and remembers it on the bill; the counter draws the image. When the guest
 * pays it, Razorpay sends qr_code.credited to /api/webhooks/razorpay and the bill settles by itself. DELETE closes the code
 * (the counter took cash instead). Without a gateway the answer is 404 and the counter keeps its plain UPI QR.
 *
 * The token is the bill's own (it is on every printed bill), so this is as public as /order: bounded per token, never a
 * secret in the answer, and nothing here marks anything paid.
 */
type QrCode = { id: string; image_url: string; status: string; payment_amount?: number; close_by?: number };

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qr:${token}`, 12, 10 * 60_000)) return NextResponse.json({ error: "Too many codes for this bill. Wait a moment." }, { status: 429 });
  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const gw = g.gw;
  if (gw.status !== "unpaid") return NextResponse.json({ error: "This bill is not open for payment." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { amount?: number };
  const want = Math.round(Number(body.amount ?? gw.total) * 100) / 100;
  if (!(want > 0) || want > Number(gw.total) + 0.01) return NextResponse.json({ error: "That amount is not part of this bill." }, { status: 400 });
  const billNo = qrName(gw.bill_no);
  try {
    // the code already issued for this amount, while it is still open
    if (gw.qr_id && gw.qr_url && Number(gw.qr_amount) === want) {
      const cur = await razorpay<QrCode>(gw, `/payments/qr_codes/${gw.qr_id}`);
      if (cur.status === "active") return NextResponse.json({ id: cur.id, image_url: gw.qr_url, amount: want });
    }
    // a different amount, or a code that closed: close the old one (best effort) and issue a new one
    if (gw.qr_id) { try { await razorpay(gw, `/payments/qr_codes/${gw.qr_id}/close`, { method: "POST", body: "{}" }); } catch { /* already closed */ } }
    const qr = await razorpay<QrCode>(gw, "/payments/qr_codes", {
      method: "POST",
      body: JSON.stringify({ type: "upi_qr", name: billNo, usage: "single_use", fixed_amount: true, payment_amount: paise(want), description: `${billNo} · ${gw.name}`.slice(0, 80),
        close_by: Math.floor(Date.now() / 1000) + QR_LIFE_SECONDS, notes: { pay_token: token, bill_no: billNo } }),
    });
    const s = serviceClient();
    if (!s) return NextResponse.json({ error: "no service role" }, { status: 503 });
    const { error } = await s.rpc("pay_link_qr_set", { p_token: token, p_id: qr.id, p_url: qr.image_url, p_amount: want });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: qr.id, image_url: qr.image_url, amount: want });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** The counter settled the bill another way: close the code so it cannot be paid as well. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qr:${token}`, 12, 10 * 60_000)) return NextResponse.json({ error: "Too many tries." }, { status: 429 });
  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.gw.qr_id) return NextResponse.json({ ok: true, none: true });
  try { await razorpay(g.gw, `/payments/qr_codes/${g.gw.qr_id}/close`, { method: "POST", body: "{}" }); } catch { /* closed already, or paid */ }
  const s = serviceClient();
  if (s && g.gw.status === "unpaid") await s.rpc("pay_link_qr_set", { p_token: token, p_id: null, p_url: null, p_amount: null });
  return NextResponse.json({ ok: true });
}
