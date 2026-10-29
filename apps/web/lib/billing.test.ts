import { describe, it, expect } from "vitest";
import { computeBill, billTax, r2 } from "@dineflow/shared";

/* The bill's preview against the bill the database raised (0146 dry run, 2026-10-29): the same lines, the same totals. */
describe("computeBill = generate_bill", () => {
  it("rounds as Postgres does", () => {
    expect(r2(2.475)).toBe(2.48);
    expect(r2(-2.475)).toBe(-2.48);
    expect(r2(1.005)).toBe(1.01);
    expect(r2(0.1 + 0.2)).toBe(0.3);
  });

  it("one rate: exactly the old sum", () => {
    for (let i = 1; i <= 400; i++) for (const rate of [5, 12, 18, 28]) {
      const base = r2(i * 7.37);
      expect(billTax([{ rate, amount: 100 }], base, true).cgst).toBe(r2((base * (rate / 2)) / 100));
    }
  });

  it("two rates share the base by value, the largest takes the paise", () => {
    expect(billTax([{ rate: 5, amount: 1000 }, { rate: 18, amount: 200 }], 1080, true)).toEqual({
      cgst: 38.7, sgst: 38.7, lines: [{ rate: 5, base: 900, cgst: 22.5, sgst: 22.5 }, { rate: 18, base: 180, cgst: 16.2, sgst: 16.2 }] });
    expect(billTax([{ rate: 5, amount: 1000 }, { rate: 18, amount: 200 }], 1080, false).cgst).toBe(0);
  });

  it("a till bill: naan at the property's 5%, a dish at 18%, 10% service charge", () => {
    const b = computeBill({ lines: [{ price: 45, qty: 2 }, { price: 220, qty: 2, gstRate: 18 }], serviceChargePct: 10, gstRate: 5 });
    expect(b).toMatchObject({ subtotal: 530, serviceCharge: 53, cgst: 46.04, sgst: 46.04, roundOff: -0.08, total: 675 });
    expect(b.taxLines).toEqual([{ rate: 5, base: 99, cgst: 2.48, sgst: 2.48 }, { rate: 18, base: 484, cgst: 43.56, sgst: 43.56 }]);
  });

  it("a QR order: the offer's money off, no service charge — the guest's ₹276", () => {
    const b = computeBill({ lines: [{ price: 45, qty: 1 }, { price: 220, qty: 1, gstRate: 18 }], discountAmount: 26.5, serviceChargePct: 10, serviceCharge: false, gstRate: 5 });
    expect(b).toMatchObject({ discount: 26.5, serviceCharge: 0, cgst: 18.83, total: 276 });
  });

  it("an aggregator order (section 9(5)): no GST", () => {
    const b = computeBill({ lines: [{ price: 45, qty: 1 }, { price: 220, qty: 1, gstRate: 18 }], gstRate: 5, serviceCharge: false, collectGst: false });
    expect(b).toMatchObject({ cgst: 0, sgst: 0, total: 265 });
  });

  it("packing & delivery is taxed with the food", () => {
    const b = computeBill({ lines: [{ price: 200, qty: 1 }], gstRate: 5, charges: 40 });
    expect(b).toMatchObject({ charges: 40, cgst: 6, sgst: 6, total: 252 });
  });

  it("a caller that zeroes the rate (no GSTIN) still gets no tax", () => {
    expect(computeBill({ lines: [{ price: 100, qty: 1 }], gstRate: 0 }).total).toBe(100);
  });
});
