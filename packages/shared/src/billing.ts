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
  /** The on-time promise, when the order took one. undefined/null = no promise was made, and every
   *  number below behaves exactly as it did before the promise existed. */
  promiseKept?: boolean | null;
  promisePct?: number;       // the rate the ORDER snapshotted, not the property's rate today
}
export interface BillResult {
  subtotal: number; discount: number; taxable: number; serviceCharge: number;
  cgst: number; sgst: number; roundOff: number; total: number;
  promiseFee: number;        // charged when the promise was kept
  promiseWaived: number;     // the food value given away when it was missed
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeBill(i: BillInput): BillResult {
  const subtotal = r2(i.lines.reduce((s, l) => s + l.price * l.qty, 0));
  const pctDisc = r2(subtotal * ((i.discountPct ?? 0) / 100));
  const discount = r2(Math.min(subtotal, pctDisc + (i.discountAmount ?? 0)));
  const afterDiscount = r2(subtotal - discount);
  /* Missing the promise makes the food free: taxable falls to zero, which takes the service charge
     and the GST with it, and no fee is charged for a promise that was not kept. */
  const missed = i.promiseKept === false;
  const taxable = missed ? 0 : afterDiscount;
  const promiseWaived = missed ? afterDiscount : 0;
  const promiseFee = i.promiseKept === true ? r2(afterDiscount * ((i.promisePct ?? 0) / 100)) : 0;
  const serviceCharge = r2(taxable * ((i.serviceChargePct ?? 0) / 100));
  const half = i.gstRate / 2;
  const cgst = r2((taxable + serviceCharge + promiseFee) * (half / 100));
  const sgst = r2((taxable + serviceCharge + promiseFee) * (half / 100));
  const raw = taxable + serviceCharge + promiseFee + cgst + sgst;
  const total = Math.round(raw);
  const roundOff = r2(total - raw);
  return { subtotal, discount, taxable, serviceCharge, cgst, sgst, roundOff, total, promiseFee, promiseWaived };
}

export const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
