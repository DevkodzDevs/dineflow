/** A bill as its pay page shows it: what pay_link() returns. Never a secret. */
export type PayInfo = {
  bill_no: number; status: "unpaid" | "paid" | "void"; total: number; subtotal: number; discount: number; service: number; cgst: number; sgst: number; round_off: number;
  created_at: string; paid_at: string | null; claim_ref: string | null; where: string;
  lines: { name: string; qty: number; price: number }[];
  payments: { method: string; amount: number; ref: string | null }[];
  restaurant: { name: string; address: string | null; phone: string | null; gstin: string | null; logo_url: string | null; brand_colour: string | null };
  upi: { vpa: string; payee: string } | null;
  gateway: { kind: string; key_id: string } | null;
};
