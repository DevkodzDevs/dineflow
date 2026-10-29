/**
 * Bill maths shared by web + mobile. All money is in rupees as JS numbers,
 * rounded to 2dp at each step so both apps print the same totals.
 *
 * The database raises the bill (generate_bill, 0146) and these functions are its preview, so they make the same sum the
 * same way: `billTax` is the database's bill_tax line for line, and `r2` rounds as Postgres does (half away from zero —
 * the plain Math.round(n * 100) / 100 turned 2.475 into 2.47 because 2.475 * 100 is 247.49999… in a float).
 */
export interface BillLine { price: number; qty: number; gstRate?: number | null }   // gstRate: the dish's own; null = the bill's
export interface BillInput {
  lines: BillLine[];
  discountPct?: number;      // 0-100
  discountAmount?: number;   // flat, applied after pct
  serviceChargePct?: number; // 0-100 on post-discount subtotal
  gstRate: number;           // e.g. 5 → 2.5% CGST + 2.5% SGST — the property's rate, for a dish without its own
  /** The on-time promise, when the order took one. undefined/null = no promise was made, and every
   *  number below behaves exactly as it did before the promise existed. */
  promiseKept?: boolean | null;
  promisePct?: number;       // the rate the ORDER snapshotted, not the property's rate today
  /** 0146: packing & delivery an online order brought with it — taxed with the food */
  charges?: number;
  /** 0146: the cashier's service-charge switch (default on) */
  serviceCharge?: boolean;
  /** 0146: false when no GST may be charged — no GSTIN, composition, or an operator paying it under section 9(5) */
  collectGst?: boolean;
}
export type TaxLine = { rate: number; base: number; cgst: number; sgst: number };
export interface BillResult {
  subtotal: number; discount: number; taxable: number; serviceCharge: number;
  cgst: number; sgst: number; roundOff: number; total: number;
  promiseFee: number;        // charged when the promise was kept
  promiseWaived: number;     // the food value given away when it was missed
  charges: number;           // packing & delivery
  taxLines: TaxLine[];       // the tax per rate, as the bill records it
}
/** Rounds to paise the way Postgres's round(n, 2) does: half away from zero. The tiny nudge undoes a float's
 *  representation error (2.475 is stored as 2.47499999…) without moving any real value. */
export const r2 = (n: number) => { const a = Math.abs(n); const v = Math.round(a * 100 + 1e-6) / 100; return n < 0 ? -v : v; };

/** The database's bill_tax (0146): the base shared out over the rates in proportion to each rate's value — the largest
 *  takes the paise — and each part taxed at its own rate, half CGST and half SGST. collect false: no tax, every rate 0. */
export function billTax(groups: { rate: number; amount: number }[], base: number, collect: boolean): { lines: TaxLine[]; cgst: number; sgst: number } {
  const by = new Map<number, number>();
  for (const g of groups) by.set(Number(g.rate), (by.get(Number(g.rate)) ?? 0) + Number(g.amount || 0));
  let rates = [...by.keys()].sort((a, b) => a - b); let amts = rates.map((r) => by.get(r)!);
  if (!rates.length) { rates = [0]; amts = [0]; }
  const tot = amts.reduce((a, b) => a + b, 0);
  let big = 0; amts.forEach((a, i) => { if (a > amts[big]) big = i; });
  let given = 0; amts.forEach((a, i) => { if (i !== big) given += tot > 0 ? r2((base * a) / tot) : 0; });
  const lines: TaxLine[] = []; let cg = 0;
  rates.forEach((rate, i) => {
    const b = i === big ? r2(base - given) : tot > 0 ? r2((base * amts[i]) / tot) : 0;
    const rt = collect ? rate : 0;
    const c = r2((b * rt) / 2 / 100);
    if (b !== 0 || amts[i] !== 0) lines.push({ rate: rt, base: b, cgst: c, sgst: c });
    cg += c;
  });
  cg = r2(cg);
  return { lines, cgst: cg, sgst: cg };
}

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
  const serviceCharge = i.serviceCharge === false ? 0 : r2(taxable * ((i.serviceChargePct ?? 0) / 100));
  const charges = r2(i.charges ?? 0);
  const base = r2(taxable + serviceCharge + promiseFee + charges);
  // the dishes' value per rate — a dish without its own rate is at the bill's
  const groups = i.lines.map((l) => ({ rate: l.gstRate ?? i.gstRate, amount: l.price * l.qty }));
  const tax = billTax(groups.length ? groups : [{ rate: i.gstRate, amount: 0 }], base, (i.collectGst ?? true) && (i.gstRate > 0 || i.lines.some((l) => (l.gstRate ?? 0) > 0)));
  const raw = base + tax.cgst + tax.sgst;
  const total = Math.round(raw);
  const roundOff = r2(total - raw);
  return { subtotal, discount, taxable, serviceCharge, cgst: tax.cgst, sgst: tax.sgst, roundOff, total, promiseFee, promiseWaived, charges, taxLines: tax.lines };
}

/** `whole` drops the paise from a price that has none — a menu says ₹280, not ₹280.00. A price
 *  that does carry paise keeps them whatever the flag says; a bill total always keeps them. */
export const formatINR = (n: number, opts?: { whole?: boolean }) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, ...(opts?.whole && Number.isInteger(n) ? { minimumFractionDigits: 0 } : {}) }).format(n);
