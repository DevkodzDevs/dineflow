/**
 * Bill maths shared by web + mobile. All money is in rupees as JS numbers,
 * rounded to 2dp at each step so both apps print the same totals.
 */
export interface BillLine { price: number; qty: number }
export interface BillInput {
  lines: BillLine[];
  discountPct?: number;      // 0-100
  discountAmount?: number;   // flat, applied after pct
  serviceChargePct?: number; // 0-100 on post-discount subtotal
  gstRate: number;           // e.g. 5 → 2.5% CGST + 2.5% SGST
}
export interface BillResult {
  subtotal: number; discount: number; taxable: number; serviceCharge: number;
  cgst: number; sgst: number; roundOff: number; total: number;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeBill(i: BillInput): BillResult {
  const subtotal = r2(i.lines.reduce((s, l) => s + l.price * l.qty, 0));
  const pctDisc = r2(subtotal * ((i.discountPct ?? 0) / 100));
  const discount = r2(Math.min(subtotal, pctDisc + (i.discountAmount ?? 0)));
  const taxable = r2(subtotal - discount);
  const serviceCharge = r2(taxable * ((i.serviceChargePct ?? 0) / 100));
  const half = i.gstRate / 2;
  const cgst = r2((taxable + serviceCharge) * (half / 100));
  const sgst = r2((taxable + serviceCharge) * (half / 100));
  const raw = taxable + serviceCharge + cgst + sgst;
  const total = Math.round(raw);
  const roundOff = r2(total - raw);
  return { subtotal, discount, taxable, serviceCharge, cgst, sgst, roundOff, total };
}

export const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
