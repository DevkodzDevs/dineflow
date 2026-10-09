import { describe, it, expect } from "vitest";
import { suggestRate } from "./rates";

const T = "2026-10-12"; // a Monday
const day = (stay_date: string, booked: number, rate = 2000, total = 10, stop_sell = false) => ({ stay_date, booked, rate, total, stop_sell });

describe("suggestRate", () => {
  it("raises a nearly full night and rounds to ₹50", () => {
    expect(suggestRate(day("2026-10-14", 9), 2000, T)).toMatchObject({ rate: 2500, why: "nearly full" });
  });
  it("lowers an empty night close in, never below 70% of base", () => {
    expect(suggestRate(day("2026-10-13", 1), 2000, T)).toMatchObject({ rate: 1700 });
  });
  it("adds a little for a filling Friday or Saturday", () => {
    expect(suggestRate(day("2026-10-17", 5), 2000, T)?.why).toBe("weekend");
  });
  it("is quiet when the rate is already right, the night is closed, or too far out", () => {
    expect(suggestRate(day("2026-10-14", 9, 2500), 2000, T)).toBeNull();
    expect(suggestRate(day("2026-10-14", 9, 2000, 10, true), 2000, T)).toBeNull();
    expect(suggestRate(day("2026-11-20", 9), 2000, T)).toBeNull();
  });
  it("moves off the base rate, so accepting twice does not compound", () => {
    expect(suggestRate(day("2026-10-14", 9, 2500), 2000, T)).toBeNull();
    expect(suggestRate(day("2026-10-14", 5, 2500), 2000, T)).toMatchObject({ rate: 2000, why: "back to the usual rate" });
  });
});
