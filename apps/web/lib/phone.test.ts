import { describe, it, expect } from "vitest";
import { phone10, isMobile, okPhone } from "./phone";

describe("phone10 — an Indian mobile, ten digits", () => {
  it("keeps digits only and stops at ten", () => {
    expect(phone10("98400 12345")).toBe("9840012345");
    expect(phone10("98400-123456789")).toBe("9840012345");
    expect(phone10("abc")).toBe("");
  });
  it("drops a pasted +91 or a trunk 0 in front of ten digits", () => {
    expect(phone10("+91 98400 12345")).toBe("9840012345");
    expect(phone10("09840012345")).toBe("9840012345");
  });
  it("does not eat the start of a number while it is being typed", () => {
    expect(phone10("91234567891")).toBe("9123456789");   // an 11th digit typed after 912… is dropped, not the 91
  });
  it("isMobile: ten digits starting 6–9", () => {
    expect(isMobile("9840012345")).toBe(true);
    expect(isMobile("6000000000")).toBe(true);
    expect(isMobile("5840012345")).toBe(false);
    expect(isMobile("984001234")).toBe(false);
  });
  it("okPhone: empty is fine for an optional box", () => {
    expect(okPhone("")).toBe(true);
    expect(okPhone(null)).toBe(true);
    expect(okPhone("98400")).toBe(false);
  });
});
