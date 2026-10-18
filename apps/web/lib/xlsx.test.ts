import { describe, it, expect } from "vitest";
import { xlsx, crc32, colName, sheetName, zip } from "./xlsx";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("xlsx writer", () => {
  it("crc32 matches the standard value", () => {
    expect(crc32(new TextEncoder().encode("hello")).toString(16)).toBe("3610a686");
  });
  it("column letters", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
  it("sheet names obey Excel's rules and stay unique", () => {
    const t = new Set<string>();
    expect(sheetName("Sales: by day [IST]", t)).toBe("Sales  by day  IST");
    expect(sheetName("A very long sheet name that goes past thirty-one", t)).toHaveLength(31);
    expect(sheetName("Items", t)).toBe("Items"); expect(sheetName("items", t)).toBe("items (2)");
  });
  it("a zip with a local header per file and an end record", () => {
    const z = zip([["a.txt", new TextEncoder().encode("hi")], ["b/c.txt", new TextEncoder().encode("there")]]);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const end = z.length - 22; expect(new DataView(z.buffer).getUint32(end, true)).toBe(0x06054b50);
    expect(new DataView(z.buffer).getUint16(end + 10, true)).toBe(2);
  });
  it("the workbook holds its sheets, numbers as numbers, text escaped, the header bold", () => {
    const b = xlsx([{ name: "Items", rows: [["Dish", "Qty", "₹"], ["Fish & chips <hot>", 3, 450.5], ["=cmd|' /C calc'!A0", null, 0]] }, { name: "Staff", rows: [["Name"]] }]);
    const s = text(b);
    expect(s).toContain("xl/worksheets/sheet1.xml"); expect(s).toContain("xl/worksheets/sheet2.xml");
    expect(s).toContain('<sheet name="Items" sheetId="1"'); expect(s).toContain('<sheet name="Staff" sheetId="2"');
    expect(s).toContain('<c r="B2"><v>3</v></c>'); expect(s).toContain('<c r="C2"><v>450.5</v></c>');
    expect(s).toContain("Fish &amp; chips &lt;hot&gt;");
    expect(s).toContain('<c r="A1" t="inlineStr" s="1">');
    // a would-be formula is only ever text: inline strings are never evaluated
    expect(s).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=cmd|');
    expect(s).not.toContain("<f>");
  });
});
