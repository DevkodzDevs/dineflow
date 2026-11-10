import { describe, it, expect } from "vitest";
import { saleLines, expenseLines, tallyVouchers, tallyLedgers, balances, withDefaults, DEFAULT_LEDGERS, type SaleDay, type Expense } from "./tally";

const L = DEFAULT_LEDGERS;
const day: SaleDay = { day: "2026-10-16", bills: 3, first: 101, last: 103, taxable: 1000, service: 50, cgst: 26.25, sgst: 26.25, round_off: -0.5, total: 1102, paid: { cash: 600, upi: 502 } };

describe("Tally export", () => {
  it("a day's sales voucher balances: payments debited, sales and tax credited", () => {
    const l = saleLines(day, L);
    expect(balances(l)).toBe(true);
    expect(l).toContainEqual({ ledger: "Cash", amount: -600 });
    expect(l).toContainEqual({ ledger: "UPI Collections", amount: -502 });
    expect(l).toContainEqual({ ledger: "Food Sales", amount: 1000 });
    expect(l).toContainEqual({ ledger: "Round Off", amount: -0.5 });
  });
  it("anything the named ledgers do not cover (a promise fee) is Other income, still balanced", () => {
    const l = saleLines({ ...day, total: 1132, paid: { card: 1132 } }, L);
    expect(balances(l)).toBe(true);
    expect(l).toContainEqual({ ledger: "Other Income", amount: 30 });
  });
  it("paid more than billed: the gap keeps the voucher balanced", () => {
    expect(balances(saleLines({ ...day, paid: { cash: 1200 } }, L))).toBe(true);
  });
  it("an expense: net and input GST debited, cash or bank credited", () => {
    const e: Expense = { id: "abcdef12-0000", day: "2026-10-16", category: "Gas cylinder", payee: "HP", amount: 1995, gst: 95, method: "upi", ref: "UPI9" };
    const l = expenseLines(e, L);
    expect(balances(l)).toBe(true);
    expect(l).toEqual([{ ledger: "Gas cylinder", amount: -1900 }, { ledger: "Input GST", amount: -95 }, { ledger: "Bank Account", amount: 1995 }]);
    expect(expenseLines({ ...e, gst: 0, method: "cash" }, L).at(-1)).toEqual({ ledger: "Cash", amount: 1995 });
  });
  it("the file: Tally's sign rule, dates, escaped names, a voucher a day and per expense", () => {
    const e: Expense = { id: "abcdef12-0000", day: "2026-10-16", category: "Tea & snacks", payee: null, amount: 120, gst: 0, method: "cash", ref: null };
    const { xml, count } = tallyVouchers("Sea View <Pvt>", [day, { ...day, day: "2026-10-17", total: 0, paid: {} }], [e], withDefaults({ sales: "Restaurant Sales" }));
    expect(count).toBe(2);   // the empty day is skipped
    expect(xml).toContain("<SVCURRENTCOMPANY>Sea View &lt;Pvt&gt;</SVCURRENTCOMPANY>");
    expect(xml).toContain('VCHTYPE="Sales"'); expect(xml).toContain("<DATE>20261016</DATE>");
    expect(xml).toContain("<LEDGERNAME>Restaurant Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-600.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Tea &amp; snacks</LEDGERNAME>");
  });
  it("the masters file names every ledger once, under its group", () => {
    const xml = tallyLedgers("", [{ id: "x", day: "2026-10-16", category: "Rent", payee: null, amount: 1, gst: 0, method: "bank", ref: null }], L);
    expect(xml).toContain('<LEDGER NAME="Output CGST" ACTION="Create"><NAME.LIST><NAME>Output CGST</NAME></NAME.LIST><PARENT>Duties &amp; Taxes</PARENT>');
    expect(xml).toContain('<LEDGER NAME="Rent" ACTION="Create">');
    expect(xml.match(/<LEDGER NAME="Cash"/g)).toHaveLength(1);
  });
});

import { stayLines, payMethodOf, type StayInvoice } from "./tally";
describe("Tally export — stays (0109)", () => {
  const stay: StayInvoice = { id: "i1", no: 412, kind: "stay", day: "2026-10-14", guest: "Ravi", gstin: null,
    lines: [{ sac: "996311", taxable: 8400 }, { sac: "999721", taxable: 350 }, { sac: "996331", taxable: 860 }],
    subtotal: 9610, discount: 0, cgst: 263, sgst: 263, round_off: 0, total: 10136, paid: 10093,
    payments: [{ amount: 5000, description: "Advance received" }, { amount: 5093, description: "Payment · UPI " }] };
  it("a stay voucher balances; room, food and services each to their own ledger; what is owed to debtors", () => {
    const l = stayLines(stay, DEFAULT_LEDGERS);
    expect(balances(l)).toBe(true);
    expect(l).toContainEqual({ ledger: "Room Revenue", amount: 8400 });
    expect(l).toContainEqual({ ledger: "Food Sales", amount: 860 });
    expect(l).toContainEqual({ ledger: "Guest Services", amount: 350 });
    expect(l).toContainEqual({ ledger: "UPI Collections", amount: -5093 });
    expect(l).toContainEqual({ ledger: "Other Collections", amount: -5000 });
    expect(l).toContainEqual({ ledger: "Sundry Debtors", amount: -43 });
  });
  it("a discount is debited and it still balances", () => {
    const l = stayLines({ ...stay, discount: 610, total: 9496, paid: 9496, cgst: 243, sgst: 243, payments: [{ amount: 9496, description: "Cash" }] }, DEFAULT_LEDGERS);
    expect(balances(l)).toBe(true);
    expect(l).toContainEqual({ ledger: "Discount Allowed", amount: -610 });
    expect(l).toContainEqual({ ledger: "Cash", amount: -9496 });
  });
  it("how it was paid is read from the words", () => {
    expect(["Payment · UPI", "GPay", "card payment", "Cash at desk", "Advance received"].map(payMethodOf)).toEqual(["upi", "upi", "card", "cash", "other"]);
  });
  it("the file carries a voucher per stay, numbered DF-R-<invoice>", () => {
    const { xml, count } = tallyVouchers("", [], [], DEFAULT_LEDGERS, [stay]);
    expect(count).toBe(1); expect(xml).toContain("<VOUCHERNUMBER>DF-R-412</VOUCHERNUMBER>"); expect(xml).toContain("<LEDGERNAME>Room Revenue</LEDGERNAME>");
  });
});

import { creditLines, type CreditVoucher } from "./tally";
describe("Tally export — credit notes and charges (2026-11-09)", () => {
  const cn: CreditVoucher = { id: "c1", no: 7, day: "2026-10-20", amount: 210, taxable: 200, cgst: 5, sgst: 5, method: "cash", bill_no: 412 };
  it("a credit note voucher balances: sales, CGST and SGST debited, the refund credited to where the money left", () => {
    const l = creditLines(cn, DEFAULT_LEDGERS);
    expect(balances(l)).toBe(true);
    expect(l).toEqual([{ ledger: "Food Sales", amount: -200 }, { ledger: "Output CGST", amount: -5 }, { ledger: "Output SGST", amount: -5 }, { ledger: "Cash", amount: 210 }]);
    expect(creditLines({ ...cn, method: "upi" }, DEFAULT_LEDGERS).at(-1)).toEqual({ ledger: "UPI Collections", amount: 210 });
    expect(creditLines({ ...cn, method: "card" }, DEFAULT_LEDGERS).at(-1)).toEqual({ ledger: "Card Collections", amount: 210 });
  });
  it("a paisa between the parts and the amount goes to Round off, and it still balances", () => {
    const l = creditLines({ ...cn, amount: 210.01 }, DEFAULT_LEDGERS);
    expect(balances(l)).toBe(true); expect(l).toContainEqual({ ledger: "Round Off", amount: -0.01 });
  });
  it("the file carries a Credit Note voucher per note, numbered DF-CN-<n>, on its day", () => {
    const { xml, count } = tallyVouchers("", [], [], DEFAULT_LEDGERS, [], [cn, { ...cn, id: "c2", no: 8, amount: 0 }]);
    expect(count).toBe(1);   // a zero note is skipped
    expect(xml).toContain('VCHTYPE="Credit Note"'); expect(xml).toContain("<VOUCHERNUMBER>DF-CN-7</VOUCHERNUMBER>"); expect(xml).toContain("<DATE>20261020</DATE>");
    expect(xml).toContain("<LEDGERNAME>Food Sales</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-200.00</AMOUNT>");
    expect(xml).toContain("<NARRATION>DineFlow credit note CN-0007 · bill #412 · refund by cash</NARRATION>");
  });
  it("packing & delivery charges are sales, not Other income; the voucher still balances", () => {
    const d: SaleDay = { day: "2026-10-16", bills: 2, first: 1, last: 2, taxable: 1000, service: 0, cgst: 27, sgst: 27, round_off: 0, total: 1094, paid: { upi: 1094 }, charges: 40 };
    const l = saleLines(d, DEFAULT_LEDGERS);
    expect(balances(l)).toBe(true);
    expect(l).toContainEqual({ ledger: "Food Sales", amount: 1040 });
    expect(l.find((x) => x.ledger === "Other Income")).toBeUndefined();
  });
});
