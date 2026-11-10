import { describe, it, expect } from "vitest";
import { qrCredit, qrName } from "./payqr";

/** The dynamic UPI QR (0178): the webhook's decision when Razorpay says a code was credited. */
describe("qr_code.credited (0178)", () => {
  const gw = { qr_id: "qr_1", qr_amount: 383, total: 383, status: "unpaid" as const };
  const qr = { id: "qr_1", notes: { pay_token: "t" } };
  it("the issued code, paid in full and captured, settles the bill", () => {
    expect(qrCredit(qr, { id: "pay_1", amount: 38300, status: "captured" }, gw)).toEqual({ do: "settle" });
    expect(qrCredit(qr, { id: "pay_1", amount: 38300 }, gw).do).toBe("settle");   // no status on the entity: Razorpay credits only captured money
  });
  it("a part of the bill (a split) is a claim for the counter, never a settlement", () => {
    expect(qrCredit(qr, { id: "pay_1", amount: 20000, status: "captured" }, { ...gw, qr_amount: 200 }).do).toBe("claim");
  });
  it("another code, a paid or void bill, an uncaptured or empty payment are ignored", () => {
    expect(qrCredit({ id: "qr_2" }, { id: "pay_1", amount: 38300 }, gw).do).toBe("ignore");
    expect(qrCredit(qr, { id: "pay_1", amount: 38300 }, { ...gw, qr_id: null }).do).toBe("ignore");
    expect(qrCredit(qr, { id: "pay_1", amount: 38300 }, { ...gw, status: "paid" }).do).toBe("ignore");
    expect(qrCredit(qr, { id: "pay_1", amount: 38300 }, { ...gw, status: "void" }).do).toBe("ignore");
    expect(qrCredit(qr, { id: "pay_1", amount: 38300, status: "authorized" }, gw).do).toBe("ignore");
    expect(qrCredit(qr, { id: "pay_1", amount: 0 }, gw).do).toBe("ignore");
    expect(qrCredit(undefined, { id: "pay_1", amount: 38300 }, gw).do).toBe("ignore");
    expect(qrCredit(qr, undefined, gw).do).toBe("ignore");
  });
  it("a paise rounding error never blocks a full payment", () => {
    expect(qrCredit(qr, { id: "p", amount: 38300 }, { ...gw, total: 382.999 }).do).toBe("settle");
  });
  it("the code's name is the bill number", () => { expect(qrName(24)).toBe("BILL-0024"); });
});
