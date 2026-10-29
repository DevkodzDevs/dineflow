import { NextResponse } from "next/server";
import { signatureOk } from "@/lib/razorpay";
import { platformKeys, membershipPaid } from "@/lib/platformPay";

/**
 * DineFlow's own Razorpay account tells us a membership payment was captured (0151) — the safety net for a payer who closed
 * the window before the browser could report back. Set this URL as the webhook in DineFlow's Razorpay dashboard, event
 * payment.captured, with RAZORPAY_WEBHOOK_SECRET as its secret. Signed with that secret over the raw body; anything that is
 * not a membership payment is acknowledged and ignored. Paid twice is paid once (membership_paid).
 */
export async function POST(req: Request) {
  const keys = platformKeys();
  const raw = await req.text();
  if (!keys?.webhook_secret) return NextResponse.json({ error: "not set up" }, { status: 503 });
  if (!signatureOk(keys.webhook_secret, raw, req.headers.get("x-razorpay-signature") ?? "")) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const ev = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> } } } };
  const p = ev.payload?.payment?.entity;
  if (ev.event !== "payment.captured" || !p?.order_id || !p.id) return NextResponse.json({ ok: true, ignored: true });
  const r = await membershipPaid(p.order_id, p.id, p.amount ?? 0);
  // "payment not found": a payment on the account that is not a membership — acknowledged, nothing to do
  if ("error" in r && !/not found/.test(r.error ?? "")) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
