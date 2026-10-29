import "server-only";
import { serviceClient } from "@/lib/razorpay";

/**
 * DineFlow charging a property for its membership (0151, 2026-10-29 — the owner's items 8 and 10), on DineFlow's own
 * Razorpay account: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in the server's environment (Vercel →
 * Settings → Environment Variables — never in the code, never in chat). The last step, extending the membership, is the
 * database's membership_paid, which only the service role may call, so SUPABASE_SERVICE_ROLE_KEY must be set too.
 * Missing any of them, online payment is simply off and /membership keeps the membership-key way, as before.
 * (A guest paying a property is a different flow on the property's own keys — lib/razorpay.ts.)
 */
export const platformKeys = () => {
  const key_id = process.env.RAZORPAY_KEY_ID, key_secret = process.env.RAZORPAY_KEY_SECRET;
  return key_id && key_secret ? { key_id, key_secret, webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null } : null;
};
/** Online payment can be offered only when the keys and the service role are both there. */
export const platformReady = () => !!platformKeys() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Mark a membership payment paid — the database checks the amount against the price and extends the membership once. */
export async function membershipPaid(orderId: string, paymentId: string, amountPaise: number) {
  const s = serviceClient();
  if (!s) return { error: "Payments are not set up on this server" };
  const { data, error } = await s.rpc("membership_paid", { p_order_id: orderId, p_payment_id: paymentId, p_amount_paise: amountPaise });
  if (error) return { error: error.message };
  return { ok: true as const, ...(data as { ends_at?: string; already?: boolean }) };
}
