import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The server's side of a card payment through Razorpay.
 *
 * The property's keys live in an owner-only table; the server reads them through a function that
 * answers the service role alone. No service-role key on this server means no card payments here —
 * the pay page then offers UPI and the counter, which is exactly what the property had before.
 */
export const serviceClient = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } }) : null;
};

export type Gateway = { key_id: string; key_secret: string; webhook_secret: string | null; provider: string; total: number; bill_no: number; status: "unpaid" | "paid" | "void"; bill_id: string; name: string;
  /** 0178: the dynamic UPI code issued for this bill, if any */
  qr_id?: string | null; qr_url?: string | null; qr_amount?: number | null };

export async function gatewayFor(token: string): Promise<{ gw: Gateway } | { error: string; status: number }> {
  const s = serviceClient();
  // a guest sees this: say what it means for them, and log the reason for whoever runs the server
  if (!s) { console.error("[razorpay] SUPABASE_SERVICE_ROLE_KEY is not set — card payments are off"); return { error: "Card payment is off right now. Pay at the counter.", status: 503 }; }
  const { data, error } = await s.rpc("pay_link_gateway", { p_token: token });
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "This bill has no card gateway.", status: 404 };
  return { gw: data as Gateway };
}

/** One call to Razorpay's REST API with the property's own key pair. */
export async function razorpay<T>(gw: Pick<Gateway, "key_id" | "key_secret">, path: string, init?: RequestInit): Promise<T> {
  // RAZORPAY_API_BASE: a stand-in gateway for the checkout probes only; unset in every real environment
  const r = await fetch(`${process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1"}${path}`, {
    ...init,
    headers: { authorization: "Basic " + Buffer.from(`${gw.key_id}:${gw.key_secret}`).toString("base64"), "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!r.ok) throw new Error(j?.error?.description ?? `Razorpay answered ${r.status}`);
  return j as T;
}

/** Constant-time check of an HMAC-SHA256 hex signature, as Razorpay signs checkout results and webhooks. */
export const signatureOk = (secret: string, payload: string, signature: string) => {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Razorpay's payment.method → the bill's payment_method, so the day-close still adds up by kind. */
export const methodOf = (m: string | undefined): "upi" | "card" | "other" => (m === "upi" ? "upi" : m === "card" ? "card" : "other");

export const paise = (rupees: number) => Math.round(Number(rupees) * 100);

export async function settle(token: string, method: "upi" | "card" | "other", ref: string) {
  const s = serviceClient();
  if (!s) return { error: "no service role" };
  const { data, error } = await s.rpc("pay_link_settle", { p_token: token, p_method: method, p_ref: ref });
  if (error) return { error: error.message };
  return { ok: true as const, already: !!(data as { already?: boolean })?.already };
}

/* ── 0181: the same rail for a held online order (prepay before the counter sees it) ───────────────────
   Parallel to the bill helpers above, keyed by the online_orders row's own pay_token. Same gateway credentials,
   same Razorpay REST helper and webhook URL; a different settle target (dine_prepay_settle, not the bill). */
export type PrepayGateway = {
  key_id: string; key_secret: string; webhook_secret: string | null; provider: string;
  total: number; name: string; order_id: string; ref: string | null; pay_status: "pending" | "paid";
  qr_id?: string | null; qr_url?: string | null; qr_amount?: number | null;
};

/** The gateway + total for one held order, by its pay_token. 404 when the token is not a held order (so the webhook
 *  can try the bill rail first and this second). Service role only; the function checks the role itself. */
export async function prepayGatewayFor(token: string): Promise<{ gw: PrepayGateway } | { error: string; status: number }> {
  const s = serviceClient();
  if (!s) { console.error("[razorpay] SUPABASE_SERVICE_ROLE_KEY is not set — online prepay is off"); return { error: "Online payment is off right now.", status: 503 }; }
  const { data, error } = await s.rpc("dine_prepay_gateway", { p_token: token });
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "This order is not open for payment.", status: 404 };
  return { gw: data as PrepayGateway };
}

/** Mark a held order paid and let the counter see it. Idempotent. Service role only. */
export async function prepaySettle(token: string, ref: string) {
  const s = serviceClient();
  if (!s) return { error: "no service role" };
  const { data, error } = await s.rpc("dine_prepay_settle", { p_token: token, p_ref: ref });
  if (error) return { error: error.message };
  return { ok: true as const, already: !!(data as { already?: boolean })?.already };
}

/** Remember the UPI code issued for a held order, so the webhook can check it and a reloaded pay page shows the same one. */
export async function prepayQrSet(token: string, id: string | null, url: string | null, amount: number | null) {
  const s = serviceClient();
  if (!s) return { error: "no service role" };
  const { error } = await s.rpc("dine_prepay_qr_set", { p_token: token, p_id: id, p_url: url, p_amount: amount });
  if (error) return { error: error.message };
  return { ok: true as const };
}
