import { NextResponse } from "next/server";
import { gatewayFor, signatureOk, methodOf, paise, settle, razorpay, serviceClient, prepayGatewayFor, prepaySettle } from "@/lib/razorpay";
import { qrCredit, type QrEntity, type PayEntity } from "@/lib/payqr";

/**
 * Razorpay webhook — one URL for every property:  POST https://<your-app>/api/webhooks/razorpay
 * Subscribe it to "payment.captured" in the Razorpay dashboard and paste the webhook secret into
 * Settings → Pay by scanning the bill. The order carries the bill's pay token in its notes, which
 * is how one URL serves many properties, each verified with its own secret.
 *
 * This is the safety net: if the guest closes the page between paying and the browser's confirm
 * call, the money has still moved, and this marks the bill paid.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  let body: { event?: string; payload?: { payment?: { entity?: { id: string; amount: number; method?: string; order_id?: string; status?: string; notes?: Record<string, string> } }; qr_code?: { entity?: QrEntity } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "not json" }, { status: 400 }); }

  const pay = body.payload?.payment?.entity;
  const qr = body.payload?.qr_code?.entity;
  // 0178: a dynamic UPI code carries the bill's token in its own notes (written by this server when it issued the code)
  const token = pay?.notes?.pay_token ?? qr?.notes?.pay_token;
  // 0181: a held online order's UPI code carries its own prepay_token instead — settle it and the counter sees the order
  const prepayToken = pay?.notes?.prepay_token ?? qr?.notes?.prepay_token;
  if (pay && qr && body.event === "qr_code.credited" && prepayToken && !token) {
    const g = await prepayGatewayFor(prepayToken);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    if (!g.gw.webhook_secret || !signatureOk(g.gw.webhook_secret, raw, sig)) return NextResponse.json({ error: "bad signature" }, { status: 400 });
    // the credited code must be the one issued for this order, and cover the whole amount (an online order is paid in full)
    const d = qrCredit(qr as QrEntity, pay as PayEntity, { qr_id: g.gw.qr_id, qr_amount: g.gw.qr_amount, total: g.gw.total, status: g.gw.pay_status === "paid" ? "paid" : "unpaid" });
    if (d.do !== "settle") return NextResponse.json({ ok: true, ignored: d.why ?? "not a full payment for this order" });
    const r = await prepaySettle(prepayToken, pay.id ?? "");
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, already: r.already, prepay: true });
  }
  if (!pay || !token) return NextResponse.json({ ok: true, ignored: "no pay_token on this payment" });

  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  // one answer for "no secret" and "wrong signature": telling them apart told a caller the token exists
  if (!g.gw.webhook_secret || !signatureOk(g.gw.webhook_secret, raw, sig)) return NextResponse.json({ error: "bad signature" }, { status: 400 });

  /* 0178: the counter's dynamic UPI QR was paid. The code must be the one issued and remembered for this bill; paid in full
     it settles the bill (the same path a card takes), paid in part (a split) it becomes the guest's "I've paid" note for the
     counter. Subscribe the webhook to qr_code.credited as well as payment.captured. */
  if (body.event === "qr_code.credited") {
    const d = qrCredit(qr, pay as PayEntity, g.gw);
    if (d.do === "ignore") return NextResponse.json({ ok: true, ignored: d.why });
    if (d.do === "claim") {
      const s = serviceClient();
      if (s) await s.rpc("pay_link_claim", { p_token: token, p_ref: pay.id });
      return NextResponse.json({ ok: true, claimed: true });
    }
    const r = await settle(token, "upi", pay.id);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, already: r.already, qr: true });
  }

  if (body.event !== "payment.captured") return NextResponse.json({ ok: true, ignored: body.event });
  if (pay.amount < paise(g.gw.total)) return NextResponse.json({ error: "payment short of the bill total" }, { status: 400 });
  // the payment's notes come from the guest's browser; the order's were written by the server for this
  // bill. Settle only when the order says so. Razorpay unreachable: answer 5xx and it retries later.
  if (!pay.order_id) return NextResponse.json({ ok: true, ignored: "payment has no order" });
  try {
    const order = await razorpay<{ notes?: Record<string, string> }>(g.gw, `/orders/${pay.order_id}`);
    if (order.notes?.pay_token !== token) return NextResponse.json({ ok: true, ignored: "order belongs to another bill" });
  } catch { return NextResponse.json({ error: "could not confirm the order" }, { status: 503 }); }

  const r = await settle(token, methodOf(pay.method), pay.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, already: r.already });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "Point a Razorpay webhook for payment.captured and qr_code.credited at this URL. The secret goes in Settings." });
}
