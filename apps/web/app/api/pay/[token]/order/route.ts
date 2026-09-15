import { NextResponse } from "next/server";
import { gatewayFor, razorpay, paise } from "@/lib/razorpay";

/** Creates the Razorpay order for one bill, so the amount is fixed server-side before the checkout opens. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await gatewayFor(token);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const gw = g.gw;
  if (gw.status === "paid") return NextResponse.json({ error: "This bill is already paid." }, { status: 409 });
  if (gw.status !== "unpaid") return NextResponse.json({ error: "This bill is not open for payment." }, { status: 409 });
  const billNo = `BILL-${String(gw.bill_no).padStart(4, "0")}`;
  try {
    const o = await razorpay<{ id: string; amount: number }>(gw, "/orders", {
      method: "POST",
      body: JSON.stringify({ amount: paise(gw.total), currency: "INR", receipt: billNo, notes: { pay_token: token, bill_no: billNo } }),
    });
    return NextResponse.json({ order_id: o.id, amount: o.amount, key_id: gw.key_id, name: gw.name, description: billNo });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
