import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";
import { billHtml, kotHtml } from "./print/html";

describe("csvCell — spreadsheet formulas from guest-entered text", () => {
  it("neutralises a cell that would run as a formula", () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csvCell("+91 98400")).toBe(`"'+91 98400"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });
  it("leaves names and numbers — negative ones included — as they are", () => {
    expect(csvCell("Meera")).toBe(`"Meera"`);
    expect(csvCell(-12.5)).toBe(`"-12.5"`);
    expect(csvCell(null)).toBe(`""`);
  });
});

describe("print HTML — values from orders are text, never markup", () => {
  const evil = `<img src=x onerror="alert(document.cookie)">`;
  it("escapes item names, notes and the guest-facing fields on a bill", () => {
    const html = billHtml({
      restaurant: { name: "Tan & Co", address: evil, gstin: null, stateCode: "33" }, billNo: "BILL-1", when: "now",
      tableOrType: "T1", cashier: evil, items: [{ name: evil, qty: 1, price: 10, note: evil }],
      subtotal: 10, discount: 0, cgst: 0, sgst: 0, roundOff: 0, total: 10, gstRate: 5,
    } as Parameters<typeof billHtml>[0]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;");
    expect(html).toContain("Tan &amp; Co");
  });
  it("drops a QR source that is not an image data URL", () => {
    const html = billHtml({
      restaurant: { name: "R" }, billNo: "B", when: "w", tableOrType: "T", items: [], subtotal: 0, discount: 0,
      cgst: 0, sgst: 0, roundOff: 0, total: 0, qrPng: `javascript:alert(1)" onload="x`,
    } as Parameters<typeof billHtml>[0]);
    expect(html).not.toContain("javascript:");
  });
  it("escapes a kitchen ticket's items and notes", () => {
    const html = kotHtml({ kotNo: "K1", when: "w", tableOrType: evil, items: [{ name: evil, qty: 1, note: evil }] });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<IMG");
  });
});
