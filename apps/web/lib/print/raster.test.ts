import { describe, expect, it } from "vitest";
import { BAND_ROWS, fold, graphemes, needsRaster, packRow, rasterCommand, thresholdRows, trimBlankTail, wrapText } from "./rasterCore";
import { buildBill, buildKot, type BillData } from "./escpos";

const dec = new TextDecoder();
const text = (b: Uint8Array) => dec.decode(b);

describe("raster bit-packing", () => {
  it("a 576-px row packs to 72 bytes, MSB first", () => {
    const bits = new Uint8Array(576); bits[0] = 1; bits[7] = 1; bits[8] = 1; bits[575] = 1;
    const row = packRow(bits);
    expect(row.length).toBe(72);
    expect(row[0]).toBe(0b1000_0001);
    expect(row[1]).toBe(0b1000_0000);
    expect(row[71]).toBe(0b0000_0001);
    expect(Array.from(row.slice(2, 71)).every((b) => b === 0)).toBe(true);
  });
  it("a width that is not a multiple of 8 pads the last byte with white", () => {
    const row = packRow([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10);
    expect(Array.from(row)).toEqual([0xff, 0xc0]);
  });
  it("384 px (58 mm) packs to 48 bytes", () => {
    expect(packRow(new Uint8Array(384)).length).toBe(48);
  });
});

describe("GS v 0 raster command", () => {
  it("writes the exact header for a 576 × 24 image: 1D 76 30 00 48 00 18 00", () => {
    const rows = Array.from({ length: 24 }, () => new Uint8Array(72));
    const cmd = rasterCommand(576, rows);
    expect(Array.from(cmd.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, 0x18, 0x00]);
    expect(cmd.length).toBe(8 + 24 * 72);
  });
  it("row data follows the header in order", () => {
    const a = new Uint8Array(48).fill(0xaa), b = new Uint8Array(48).fill(0x55);
    const cmd = rasterCommand(384, [a, b]);
    expect(Array.from(cmd.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x02, 0x00]);
    expect(cmd[8]).toBe(0xaa); expect(cmd[8 + 48]).toBe(0x55);
  });
  it("a tall image is split into two bands, the second carrying the remainder", () => {
    const rows = Array.from({ length: BAND_ROWS + 44 }, () => new Uint8Array(72));
    const cmd = rasterCommand(576, rows);
    expect(cmd.length).toBe(2 * 8 + (BAND_ROWS + 44) * 72);
    // first band: 256 rows → yL yH = 00 01
    expect(Array.from(cmd.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, BAND_ROWS & 0xff, BAND_ROWS >> 8]);
    const second = 8 + BAND_ROWS * 72;
    expect(Array.from(cmd.slice(second, second + 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, 44, 0x00]);
  });
  it("a band may be as tall as 255 × 256 rows when asked", () => {
    const n = 255 * 256;
    const rows = Array.from({ length: n }, () => new Uint8Array(1));
    const cmd = rasterCommand(8, rows, n);
    expect(cmd.length).toBe(8 + n);
    expect(cmd[6]).toBe(0x00); expect(cmd[7]).toBe(0xff);
  });
});

describe("wrapping by grapheme", () => {
  const mono = (s: string) => graphemes(s).length * 10;   // 10 px a grapheme
  it("breaks on spaces and keeps every character", () => {
    const lines = wrapText(mono, "Chicken biryani with extra raita", 160);   // 16 graphemes a line
    expect(lines).toEqual(["Chicken biryani", "with extra raita"]);
    expect(lines.join(" ")).toBe("Chicken biryani with extra raita");
    expect(lines.every((l) => mono(l) <= 160)).toBe(true);
  });
  it("a word wider than the paper is broken between graphemes, losing nothing", () => {
    const word = "Supercalifragilistic";
    const lines = wrapText(mono, word, 80);
    expect(lines.join("")).toBe(word);
    expect(lines.every((l) => mono(l) <= 80)).toBe(true);
    expect(lines.length).toBe(3);
  });
  it("Tamil combining sequences are never split mid-grapheme", () => {
    const name = "மசால் தோசை";                       // 10 code points, 6 graphemes
    expect(Array.from(name).length).toBe(10);
    expect(graphemes(name)).toEqual(["ம", "சா", "ல்", " ", "தோ", "சை"]);
    const lines = wrapText(mono, name.replace(" ", ""), 30);   // one long word, 3 graphemes a line
    expect(lines).toEqual(["மசால்", "தோசை"]);
    for (const l of lines) expect(graphemes(l).join("")).toBe(l);   // each line is whole graphemes
    expect(lines.join("")).toBe(name.replace(" ", ""));
  });
  it("Devanagari with a virama and matras holds together", () => {
    const g = graphemes("पनीर टिक्का");
    expect(g).toEqual(["प", "नी", "र", " ", "टि", "क्का"]);
  });
  it("empty text is one empty line", () => {
    expect(wrapText(mono, "", 100)).toEqual([""]);
  });
});

describe("auto-detection", () => {
  it("English, digits and Latin-1 stay on the text path", () => {
    expect(needsRaster("Chicken biryani 2 x 280.00 — café")).toBe(false);
  });
  it("Tamil, Devanagari and the rupee sign after folding", () => {
    expect(needsRaster("மசால் தோசை")).toBe(true);
    expect(needsRaster("पनीर टिक्का")).toBe(true);
    expect(needsRaster("₹280")).toBe(false);   // folded to Rs
  });
  it("fold turns typographic punctuation into what code page 0 can print", () => {
    expect(fold("COURSE 2 · HELD — fire ‘now’ “please” … ₹5 2×3")).toBe('COURSE 2 · HELD - fire \'now\' "please" ... Rs5 2x3');
  });
});

describe("threshold and trim", () => {
  it("dark pixels become ink, light and transparent ones paper", () => {
    const w = 8, h = 2, px = new Uint8ClampedArray(w * h * 4).fill(255);
    px.set([0, 0, 0, 255], 0);              // (0,0) black
    px.set([0, 0, 0, 0], 4);                // (1,0) transparent → white
    px.set([120, 120, 120, 255], 8 * 4);    // (0,1) grey → ink (< 160)
    const rows = thresholdRows(px, w, h);
    expect(Array.from(rows[0])).toEqual([0b1000_0000]);
    expect(Array.from(rows[1])).toEqual([0b1000_0000]);
  });
  it("trailing blank rows are cut back to a small margin", () => {
    const ink = new Uint8Array([0xff]), blank = new Uint8Array([0]);
    const rows = [ink, ...Array.from({ length: 100 }, () => blank)];
    expect(trimBlankTail(rows, 8).length).toBe(9);
  });
});

describe("the text path", () => {
  const bill: BillData = { restaurant: { name: "Anna Mess", gstin: "33AAAAA0000A1Z5", gstScheme: "regular", stateCode: "33" }, title: "Tax invoice", billNo: "BILL-0012", when: "09/11/2026, 13:02", tableOrType: "T4", items: [{ name: "Masala dosa", qty: 2, price: 90 }], subtotal: 180, discount: 0, cgst: 4.5, sgst: 4.5, roundOff: 0, total: 189 };
  it("prints the legal title under the header", () => {
    const s = text(buildBill(bill));
    expect(s).toContain("GSTIN 33AAAAA0000A1Z5\n");
    expect(s.indexOf("TAX INVOICE")).toBeGreaterThan(s.indexOf("GSTIN"));
    expect(s.indexOf("TAX INVOICE")).toBeLessThan(s.indexOf("BILL-0012"));
  });
  it("prints no title line when none is given", () => {
    expect(text(buildBill({ ...bill, title: undefined }))).not.toContain("TAX INVOICE");
  });
  it("folds an em dash on a KOT heading instead of writing UTF-8 bytes", () => {
    const s = text(buildKot({ kotNo: "KOT 3", when: "19:04", tableOrType: "T1", heading: "COURSE 2 · HELD — fire from the kitchen screen", items: [{ name: "Lime soda", qty: 1 }] }));
    expect(s).toContain("HELD - fire");
  });
  it("a KOT line's local name prints under the dish", () => {
    const s = text(buildKot({ kotNo: "KOT 3", when: "19:04", tableOrType: "T1", items: [{ name: "Masala dosa", qty: 2, localName: "மசால் தோசை" }] }));
    expect(s.indexOf("மசால் தோசை")).toBeGreaterThan(s.indexOf("Masala dosa"));
  });
});
