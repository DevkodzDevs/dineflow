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

export type Gateway = { key_id: string; key_secret: string; webhook_secret: string | null; provider: string; total: number; bill_no: number; status: "unpaid" | "paid" | "void"; bill_id: string; name: string };

export async function gatewayFor(token: string): Promise<{ gw: Gateway } | { error: string; status: number }> {
  const s = serviceClient();
  if (!s) return { error: "Card payments are not switched on for this server: SUPABASE_SERVICE_ROLE_KEY is not set.", status: 503 };
  const { data, error } = await s.rpc("pay_link_gateway", { p_token: token });
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "This bill has no card gateway.", status: 404 };
  return { gw: data as Gateway };
}

/** One call to Razorpay's REST API with the property's own key pair. */
export async function razorpay<T>(gw: Pick<Gateway, "key_id" | "key_secret">, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
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
