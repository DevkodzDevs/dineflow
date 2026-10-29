import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { razorpay, paise, serviceClient } from "@/lib/razorpay";
import { platformKeys, platformReady } from "@/lib/platformPay";

/**
 * A property starts paying DineFlow (0151). The database decides who may (owner or manager) and what it costs (the plan for
 * this property's kind, monthly or yearly) — the browser only says which period. Then the Razorpay order is made on
 * DineFlow's keys, for exactly that amount, and recorded on the payment it was made for.
 */
export async function POST(req: Request) {
  const keys = platformKeys();
  if (!keys || !platformReady()) return NextResponse.json({ error: "Online payment is not set up yet — use a membership key." }, { status: 503 });
  const { period } = (await req.json().catch(() => ({}))) as { period?: string };
  const s = await createClient();
  const { data, error } = await s.rpc("membership_checkout_begin", { p_period: period === "year" ? "year" : "month" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const b = data as { id: string; amount: number; label: string; period: "month" | "year"; name: string };
  const what = `${b.label} plan · ${b.period === "year" ? "1 year" : "1 month"}`;
  try {
    const o = await razorpay<{ id: string; amount: number }>(keys, "/orders", {
      method: "POST",
      body: JSON.stringify({ amount: paise(b.amount), currency: "INR", receipt: `DF-${b.id.slice(0, 8)}`, notes: { membership_payment: b.id, property: b.name, plan: what } }),
    });
    const { error: e2 } = await serviceClient()!.rpc("membership_checkout_order", { p_id: b.id, p_order_id: o.id });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ order_id: o.id, amount: o.amount, key_id: keys.key_id, name: "DineFlow", description: `${what} · ${b.name}` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
