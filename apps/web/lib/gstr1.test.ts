import { describe, it, expect } from "vitest";
import { buildGstr1, spread, istDate, monthWindow, ddmmyyyy, fp, gstr1FileName, r2, type Gstr1Input, type Gstr1Bill, type Gstr1Invoice, type Gstr1CreditNote } from "./gstr1";

const GSTIN = "33ABCDE1234F1Z5", BUYER = "33PQRSX5678K1ZA", BUYER2 = "29LMNOP1234Q1Z7";
const bill = (o: Partial<Gstr1Bill> & { no: number }): Gstr1Bill => ({
  id: `b${o.no}`, date: "2026-10-05", total: 1050, byOperator: false,
  parts: [{ rate: 5, taxable: 1000, cgst: 25, sgst: 25 }],
  items: [{ hsn: null, name: "Thali", qty: 2, value: 600, rate: 5 }, { hsn: null, name: "Dosa", qty: 4, value: 400, rate: 5 }],
  ...o,
});
const base = (): Gstr1Input => ({
  gstin: GSTIN, stateCode: "33", month: "2026-10", defaultRate: 5,
  bills: [], invoices: [], creditNotes: [], documents: { bills: [], invoices: [], creditNotes: [] },
});
const two = (n: number) => Math.round(n * 100) === n * 100 || Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
const everyAmount = (v: unknown): number[] => (typeof v === "number" ? [v] : Array.isArray(v) ? v.flatMap(everyAmount) : v && typeof v === "object" ? Object.values(v).flatMap(everyAmount) : []);

describe("GSTR-1 JSON — helpers", () => {
  it("spread: proportional, two decimals, the paise on the largest, sums exactly", () => {
    expect(spread(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);   // equal weights: the first is "largest"
    expect(spread(100, [1, 1, 2])).toEqual([25, 25, 50]);
    const eq = spread(50.01, [0, 0]); expect(eq.sort()).toEqual([25, 25.01]);   // all-zero weights share equally
    expect(spread(0, [3])).toEqual([0]); expect(spread(10, [])).toEqual([]);
    const s = spread(1234.57, [7, 3, 11]); expect(r2(s.reduce((a, b) => a + b, 0))).toBe(1234.57);
  });
  it("IST month boundaries: a bill paid at 01:00 IST on 1 November is November, 23:59 IST on 31 October is October", () => {
    expect(istDate("2026-10-31T19:30:00Z")).toBe("2026-11-01");
    expect(istDate("2026-10-31T18:29:59Z")).toBe("2026-10-31");
    expect(istDate("2026-09-30T18:30:00Z")).toBe("2026-10-01");
    const w = monthWindow("2026-10");
    expect(w).toEqual({ from: "2026-10-01", to: "2026-11-01", fromTs: "2026-10-01T00:00:00+05:30", toTs: "2026-11-01T00:00:00+05:30" });
    expect(monthWindow("2026-12").toTs).toBe("2027-01-01T00:00:00+05:30");
    expect(new Date(w.fromTs).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });
  it("dates and names the portal's way", () => {
    expect(ddmmyyyy("2026-10-05")).toBe("05-10-2026"); expect(fp("2026-10")).toBe("102026");
    expect(gstr1FileName(GSTIN, "2026-03")).toBe("GSTR1-33ABCDE1234F1Z5-032026.json");
  });
});

describe("GSTR-1 JSON — the file", () => {
  it("header, and a bill outside the month is left out", () => {
    const { json, summary } = buildGstr1({ ...base(), bills: [bill({ no: 1 }), bill({ no: 2, date: "2026-11-01" })] });
    expect(json.gstin).toBe(GSTIN); expect(json.fp).toBe("102026"); expect(json.hash).toBe("hash"); expect(json.version).toMatch(/^GST/);
    expect(summary.b2cs.count).toBe(1); expect(json.b2cs).toEqual([{ sply_ty: "INTRA", rt: 5, typ: "OE", pos: "33", txval: 1000, iamt: 0, camt: 25, samt: 25, csamt: 0 }]);
  });
  it("b2cs sums per rate; a bill with two rates lands in both rows; totals reconcile to the paisa", () => {
    const bills = [
      bill({ no: 1, total: 1050 }),
      bill({ no: 2, total: 1413, parts: [{ rate: 5, taxable: 700.33, cgst: 17.51, sgst: 17.51 }, { rate: 18, taxable: 600.1, cgst: 54.01, sgst: 54.01 }], items: [{ hsn: "2202", name: "Cola", qty: 3, value: 600.1, rate: 18 }, { hsn: null, name: "Meal", qty: 1, value: 700.33, rate: 5 }] }),
    ];
    const { json, summary } = buildGstr1({ ...base(), bills });
    expect(json.b2cs.map((r) => [r.rt, r.txval, r.camt, r.samt])).toEqual([[5, 1700.33, 42.51, 42.51], [18, 600.1, 54.01, 54.01]]);
    expect(summary.totals).toEqual({ taxable: 2300.43, cgst: 96.52, sgst: 96.52 });
    const hsnTx = r2(json.hsn.data.reduce((a, r) => a + r.txval, 0)); expect(hsnTx).toBe(2300.43);
    expect(json.hsn.data.find((r) => r.hsn_sc === "2202")).toMatchObject({ uqc: "NOS", qty: 3, txval: 600.1, rt: 18, camt: 54.01, desc: "Cola" });
    expect(json.hsn.data.find((r) => r.hsn_sc === "996331" && r.rt === 5)).toMatchObject({ uqc: "OTH", qty: 7, txval: 1700.33, camt: 42.51 });
    expect(everyAmount(json).every(two)).toBe(true);
  });
  it("b2b: grouped by buyer GSTIN, one inv per invoice with items per rate, dated DD-MM-YYYY; its bill is not in b2cs again", () => {
    const inv: Gstr1Invoice = { id: "i1", no: 7, kind: "dining", date: "2026-10-09", billId: "b1", buyerGstin: ` ${BUYER.toLowerCase()} `, buyerName: "Acme", total: 1050, taxable: 1000, cgst: 25, sgst: 25,
      lines: [{ sac: "996331", description: "Thali", qty: 2, taxable: 600, rate: 5, gst: 30 }, { sac: "996331", description: "Dosa", qty: 4, taxable: 400, rate: 5, gst: 20 }] };
    const inv2: Gstr1Invoice = { ...inv, id: "i2", no: 8, billId: null, kind: "stay", date: "2026-10-12", total: 3420, taxable: 3000, cgst: 210, sgst: 210,
      lines: [{ sac: "996311", description: "Room", qty: 2, taxable: 2000, rate: 12, gst: 240 }, { sac: "999721", description: "Spa", qty: 1, taxable: 1000, rate: 18, gst: 180 }] };
    const inv3: Gstr1Invoice = { ...inv, id: "i3", no: 9, billId: "b2", buyerGstin: BUYER2, date: "2026-10-20" };
    const { json, summary } = buildGstr1({ ...base(), bills: [bill({ no: 1 }), bill({ no: 2 }), bill({ no: 3 })], invoices: [inv, inv2, inv3] });
    expect(json.b2b.map((g) => g.ctin)).toEqual([BUYER2, BUYER]);
    const acme = json.b2b.find((g) => g.ctin === BUYER)!;
    expect(acme.inv.map((i) => i.inum)).toEqual(["INV-00007", "INV-00008"]);
    expect(acme.inv[0]).toMatchObject({ idt: "09-10-2026", val: 1050, pos: "33", rchrg: "N", inv_typ: "R", itms: [{ num: 1, itm_det: { txval: 1000, rt: 5, iamt: 0, camt: 25, samt: 25, csamt: 0 } }] });
    expect(acme.inv[1].itms.map((x) => x.itm_det)).toEqual([{ txval: 2000, rt: 12, iamt: 0, camt: 120, samt: 120, csamt: 0 }, { txval: 1000, rt: 18, iamt: 0, camt: 90, samt: 90, csamt: 0 }]);
    expect(json.b2b.find((g) => g.ctin === BUYER2)!.inv[0].pos).toBe("29");
    // three bills, two have B2B invoices: one bill left in b2cs
    expect(summary.b2cs.count).toBe(1); expect(json.b2cs[0].txval).toBe(1000);
    expect(summary.b2b).toEqual({ count: 3, taxable: 5000, cgst: 260, sgst: 260 });
    expect(summary.totals).toEqual({ taxable: 6000, cgst: 285, sgst: 285 });
    expect(r2(json.hsn.data.reduce((a, r) => a + r.txval, 0))).toBe(6000);
    expect(json.hsn.data.find((r) => r.hsn_sc === "996311")).toMatchObject({ desc: "Accommodation", qty: 2, txval: 2000, rt: 12 });
  });
  it("a stay invoice with a header-only discount: the items are held to the header, to the paisa", () => {
    const inv: Gstr1Invoice = { id: "s1", no: 20, kind: "stay", date: "2026-10-03", billId: null, buyerGstin: null, buyerName: null, total: 9496, taxable: 9000, cgst: 243, sgst: 243,
      lines: [{ sac: "996311", description: "Room", qty: 3, taxable: 8400, rate: 5, gst: 420 }, { sac: "999721", description: "Laundry", qty: 1, taxable: 350, rate: 18, gst: 63 }, { sac: "996331", description: "Dinner", qty: 1, taxable: 860, rate: 5, gst: 43 }] };
    const { json, summary } = buildGstr1({ ...base(), invoices: [inv] });
    expect(r2(json.b2cs.reduce((a, r) => a + r.txval, 0))).toBe(9000);
    expect(r2(json.b2cs.reduce((a, r) => a + r.camt + r.samt, 0))).toBe(486);
    expect(summary.b2cs).toEqual({ count: 1, taxable: 9000, cgst: 243, sgst: 243 });
    expect(everyAmount(json).every(two)).toBe(true);
  });
  it("9(5): Swiggy / Zomato bills are out of b2cs and hsn, reported in the summary; table 14(b) only with the operator's GSTIN", () => {
    const eco = bill({ no: 5, byOperator: true, operator: "Zomato", total: 420, parts: [{ rate: 0, taxable: 420, cgst: 0, sgst: 0 }] });
    const a = buildGstr1({ ...base(), bills: [bill({ no: 1 }), eco] });
    expect(a.json.b2cs).toHaveLength(1); expect(a.json.b2cs[0].txval).toBe(1000); expect(a.json.nil).toBeUndefined(); expect(a.json.supeco).toBeUndefined();
    expect(a.summary.eco).toEqual({ count: 1, value: 420, operators: ["Zomato"] });
    expect(r2(a.json.hsn.data.reduce((s, r) => s + r.txval, 0))).toBe(1000);
    const b = buildGstr1({ ...base(), bills: [eco], operatorGstins: { Zomato: BUYER2 } });
    expect(b.json.supeco).toEqual({ paytx: [{ etin: BUYER2, suppval: 420, igst: 0, cgst: 0, sgst: 0, cess: 0 }] });
  });
  it("credit notes: to a registered buyer → cdnr (ntty C); to a walk-in → netted in b2cs; both in the totals", () => {
    const inv: Gstr1Invoice = { id: "i1", no: 7, kind: "dining", date: "2026-10-09", billId: "b1", buyerGstin: BUYER, buyerName: "Acme", total: 1050, taxable: 1000, cgst: 25, sgst: 25, lines: [] };
    const cn1: Gstr1CreditNote = { id: "c1", no: 3, date: "2026-10-10", amount: 210, taxable: 200, cgst: 5, sgst: 5, parts: [{ rate: 5, taxable: 200, cgst: 5, sgst: 5 }], buyerGstin: BUYER };
    const cn2: Gstr1CreditNote = { id: "c2", no: 4, date: "2026-10-11", amount: 105, taxable: 100, cgst: 2.5, sgst: 2.5, parts: null, buyerGstin: null };
    const cn3: Gstr1CreditNote = { ...cn2, id: "c3", no: 5, date: "2026-11-02" };
    const { json, summary } = buildGstr1({ ...base(), bills: [bill({ no: 1 }), bill({ no: 2 })], invoices: [inv], creditNotes: [cn1, cn2, cn3] });
    expect(json.cdnr).toEqual([{ ctin: BUYER, nt: [{ ntty: "C", nt_num: "CN-0003", nt_dt: "10-10-2026", val: 210, pos: "33", rchrg: "N", inv_typ: "R", itms: [{ num: 1, itm_det: { txval: 200, rt: 5, iamt: 0, camt: 5, samt: 5, csamt: 0 } }] }] }]);
    expect(json.b2cs).toEqual([{ sply_ty: "INTRA", rt: 5, typ: "OE", pos: "33", txval: 900, iamt: 0, camt: 22.5, samt: 22.5, csamt: 0 }]);
    expect(summary.cdnr).toEqual({ count: 1, taxable: 200, cgst: 5, sgst: 5 }); expect(summary.netted).toEqual({ count: 1, taxable: 100, cgst: 2.5, sgst: 2.5 });
    expect(summary.totals).toEqual({ taxable: 1700, cgst: 42.5, sgst: 42.5 });
  });
  it("0% value goes to nil, not to a 0% b2cs row", () => {
    const { json, summary } = buildGstr1({ ...base(), bills: [bill({ no: 1, total: 300, parts: [{ rate: 0, taxable: 300, cgst: 0, sgst: 0 }], items: [] })] });
    expect(json.b2cs).toEqual([]); expect(json.nil).toEqual({ inv: [{ sply_ty: "INTRAB2C", expt_amt: 0, nil_amt: 300, ngsup_amt: 0 }] }); expect(summary.nil).toBe(300);
  });
  it("an older bill (no items, no tax lines) still reaches hsn under 996331", () => {
    const { json } = buildGstr1({ ...base(), bills: [bill({ no: 1, items: [], parts: [{ rate: 5, taxable: 1000, cgst: 25, sgst: 25 }] })] });
    expect(json.hsn.data).toEqual([{ num: 1, hsn_sc: "996331", desc: "Restaurant service", uqc: "OTH", qty: 0, txval: 1000, rt: 5, iamt: 0, camt: 25, samt: 25, csamt: 0 }]);
  });
  it("doc_issue: from, to, how many, cancelled (voided and gaps), net — bills and invoices under 1, credit notes under 5", () => {
    const { json } = buildGstr1({ ...base(), documents: { bills: [{ no: 101, cancelled: false }, { no: 102, cancelled: true }, { no: 104, cancelled: false }], invoices: [12, 13], creditNotes: [3] } });
    expect(json.doc_issue.doc_det).toEqual([
      { doc_num: 1, docs: [{ num: 1, from: "BILL-0101", to: "BILL-0104", totnum: 4, cancel: 2, net_issue: 2 }, { num: 2, from: "INV-00012", to: "INV-00013", totnum: 2, cancel: 0, net_issue: 2 }] },
      { doc_num: 5, docs: [{ num: 1, from: "CN-0003", to: "CN-0003", totnum: 1, cancel: 0, net_issue: 1 }] },
    ]);
    expect(buildGstr1(base()).json.doc_issue.doc_det).toEqual([]);
  });
  it("an empty month is a valid, empty file", () => {
    const { json, summary, fileName } = buildGstr1(base());
    expect(json.b2b).toEqual([]); expect(json.b2cs).toEqual([]); expect(json.cdnr).toEqual([]); expect(json.hsn.data).toEqual([]);
    expect(summary.totals).toEqual({ taxable: 0, cgst: 0, sgst: 0 }); expect(fileName).toBe("GSTR1-33ABCDE1234F1Z5-102026.json");
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});
