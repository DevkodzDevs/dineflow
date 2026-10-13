import { describe, expect, it } from "vitest";
import { upiUri, validVpa } from "./upi";

describe("UPI payment links", () => {
  it("accepts a real UPI ID and refuses what is not one", () => {
    expect(validVpa("manooo@okhdfc")).toBe(true);
    expect(validVpa("9876543210@ybl")).toBe(true);
    expect(validVpa("hotel.name-1@paytm")).toBe(true);
    expect(validVpa("")).toBe(false);
    expect(validVpa(null)).toBe(false);
    expect(validVpa("no-at-sign")).toBe(false);
    expect(validVpa("a@1bank")).toBe(false);
  });
  it("builds the link the Pay page builds: %20 not +, two decimals, INR", () => {
    expect(upiUri({ vpa: "tan@okicici", payee: "Tan Resort", amount: 1817, note: "BILL-1393 Tan Resort" }))
      .toBe("upi://pay?pa=tan%40okicici&pn=Tan%20Resort&am=1817.00&cu=INR&tn=BILL-1393%20Tan%20Resort");
  });
  it("gives nothing to scan without a UPI ID or an amount", () => {
    expect(upiUri({ vpa: null, payee: "X", amount: 100 })).toBeNull();
    expect(upiUri({ vpa: "xy@ybl", payee: "X", amount: 0 })).toBeNull();
  });
  it("keeps the note to the 50 characters apps show", () => {
    const u = upiUri({ vpa: "xy@ybl", payee: "X", amount: 1, note: "n".repeat(80) })!;
    expect(decodeURIComponent(u.split("tn=")[1]).length).toBe(50);
  });
});
