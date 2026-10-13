/**
 * UPI payment requests — the `upi://pay` link every Indian UPI app (Google Pay, PhonePe, Paytm, BHIM,
 * a bank's own app) opens with the payee and the amount filled in. The same format the guest's Pay
 * page builds (app/pay/[token]/PayClient.tsx): parameters joined by hand, because URLSearchParams
 * writes a space as "+" and some apps then show the payee as "Hotel+Name".
 */

const enc = (s: string) => encodeURIComponent(s);

/** A UPI ID: a handle, "@", and the bank or app's name — `name@okhdfc`, `9876543210@ybl`. */
export function validVpa(vpa: string | null | undefined): vpa is string {
  return typeof vpa === "string" && /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(vpa.trim());
}

/**
 * The `upi://pay?…` link for a payment of `amount` to `vpa`, or null when there is nothing a UPI app
 * could act on — no valid UPI ID, or nothing to pay. The note (`tn`) is cut to 50 characters, the
 * most every app shows.
 */
export function upiUri({ vpa, payee, amount, note }: { vpa: string | null | undefined; payee: string; amount: number; note?: string }): string | null {
  if (!validVpa(vpa) || !(Number(amount) > 0)) return null;
  const q = [`pa=${enc(vpa.trim())}`, `pn=${enc(payee.trim().slice(0, 50))}`, `am=${Number(amount).toFixed(2)}`, "cu=INR"];
  if (note) q.push(`tn=${enc(note.slice(0, 50))}`);
  return `upi://pay?${q.join("&")}`;
}
