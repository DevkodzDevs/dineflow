import { NextResponse } from "next/server";
import { gatewayFor, signatureOk, methodOf, paise, settle, razorpay } from "@/lib/razorpay";

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
  let body: { event?: string; payload?: { payment?: { entity?: { id: string; amount: number; method?: string; order_id?: string; notes?: Record<string, string> } } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "not json" }, { status: 400 }); }

  const pay = body.payload?.payment?.entity;
  const token = pay?.notes?.pay_token;
  if (!pay || !token) return NextResponse.json({ ok: true, ignored: "no pay_token on this payment" });

  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  // one answer for "no secret" and "wrong signature": telling them apart told a caller the token exists
  if (!g.gw.webhook_secret || !signatureOk(g.gw.webhook_secret, raw, sig)) return NextResponse.json({ error: "bad signature" }, { status: 400 });

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
  return NextResponse.json({ ok: true, hint: "Point a Razorpay webhook for payment.captured at this URL. The secret goes in Settings." });
}
