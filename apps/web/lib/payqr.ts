/**
 * The dynamic UPI QR (0178): what the webhook does when Razorpay says a QR was credited. Pure, so it is tested without
 * a server — the route hands it the payload and the bill's gateway row and acts on the answer.
 *
 *   settle  — the credited code is the one issued for this bill and the money covers the whole bill: mark it paid
 *   claim   — the code is ours but asked for only a part (a split bill): tell the counter, as a guest's "I've paid" does
 *   ignore  — not our code, not enough money, no token: do nothing (and say why, for the log)
 */
export type QrEntity = { id?: string; notes?: Record<string, string>; payment_amount?: number; payments_amount_received?: number; status?: string } | undefined;
export type PayEntity = { id?: string; amount?: number; method?: string; status?: string; notes?: Record<string, string> } | undefined;
export type QrGateway = { qr_id?: string | null; qr_amount?: number | null; total: number; status: "unpaid" | "paid" | "void" };

export const paise = (rupees: number) => Math.round(Number(rupees) * 100);

export function qrCredit(qr: QrEntity, pay: PayEntity, gw: QrGateway): { do: "settle" | "claim" | "ignore"; why?: string } {
  if (!qr?.id || !pay?.id) return { do: "ignore", why: "no qr or payment entity" };
  if (gw.status === "paid") return { do: "ignore", why: "already paid" };
  if (gw.status !== "unpaid") return { do: "ignore", why: `bill is ${gw.status}` };
  // the code must be the one the server issued and remembered for this bill — a payment's notes come from anywhere
  if (!gw.qr_id || gw.qr_id !== qr.id) return { do: "ignore", why: "not the code issued for this bill" };
  if (pay.status && pay.status !== "captured") return { do: "ignore", why: `payment is ${pay.status}` };
  const got = Number(pay.amount ?? 0);
  if (!(got > 0)) return { do: "ignore", why: "no amount" };
  if (got >= paise(gw.total)) return { do: "settle" };
  return { do: "claim", why: `paid ${got} of ${paise(gw.total)} paise` };
}

/** Razorpay wants a name on a QR, short and plain: the bill number. */
export const qrName = (billNo: number) => `BILL-${String(billNo).padStart(4, "0")}`;
/** Close the code by itself after this long, so a bill settled in cash at the counter cannot still be paid an hour later. */
export const QR_LIFE_SECONDS = 2 * 60 * 60;
