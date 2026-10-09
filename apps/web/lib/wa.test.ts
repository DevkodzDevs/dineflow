import { describe, it, expect } from "vitest";
import { waHref, waDate, waTime } from "./wa";

describe("waHref", () => {
  it("puts 91 in front of a ten-digit Indian mobile, whatever it was typed with", () => {
    expect(waHref("98430 22118", "hi")).toBe("https://wa.me/919843022118?text=hi");
    expect(waHref("+91 98430-22118", "hi")).toBe("https://wa.me/919843022118?text=hi");
    expect(waHref("09843022118", "hi")).toBe("https://wa.me/919843022118?text=hi");
  });
  it("gives no link without a usable number", () => {
    expect(waHref(null, "hi")).toBeNull();
    expect(waHref("12345", "hi")).toBeNull();
  });
  it("encodes the message", () => {
    expect(waHref("9843022118", "Table for 2 · 7:30 pm & more")).toBe("https://wa.me/919843022118?text=Table%20for%202%20%C2%B7%207%3A30%20pm%20%26%20more");
  });
});

describe("message dates and times", () => {
  it("reads as a guest would", () => {
    expect(waDate("2026-10-09")).toMatch(/Fri.*9.*Oct/);
    expect(waTime("19:30:00")).toBe("7:30 pm");
    expect(waTime("12:05")).toBe("12:05 pm");
    expect(waTime("00:15")).toBe("12:15 am");
  });
});
