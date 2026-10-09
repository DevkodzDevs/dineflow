import { describe, it, expect } from "vitest";
import { salesFacts, readyIdeas, inAudience } from "./marketing";

// 4 weeks: Tuesdays quiet (1 order), Saturdays busy (5), dinners (20:00 IST) much busier than lunch
const orders: { id: string; created_at: string; total: number }[] = [];
for (let w = 0; w < 4; w++) for (let d = 0; d < 7; d++) {
  const n = d === 2 ? 1 : d === 6 ? 5 : 3;
  for (let i = 0; i < n; i++) orders.push({ id: `${w}${d}${i}`, created_at: new Date(Date.UTC(2026, 8, 6 + w * 7 + d, 14, 30)).toISOString(), total: 600 });
}
const lines = [{ name: "Chicken Briyani", qty: 40 }, { name: "Curd rice", qty: 25 }, { name: "Parotta", qty: 10 }];
const people = { customers: 120, lapsed: 9, new_30d: 14, regulars: 30, with_points: 6 };

describe("salesFacts", () => {
  it("finds the quiet day, the busy day, the slow daypart and the top dish", () => {
    const f = salesFacts(orders, lines, people);
    expect(f).toMatchObject({ slowest_day: "Tuesday", busiest_day: "Saturday", slow_daypart: "lunch", avg_ticket: 600 });
    expect(f.top[0]).toEqual({ name: "Chicken Briyani", qty: 40 });
  });
  it("says nothing about days with too few orders to tell", () => {
    expect(salesFacts(orders.slice(0, 5), lines, people).slowest_day).toBeNull();
  });
});

describe("readyIdeas", () => {
  it("writes at most four campaigns, each for an audience the screen can list, in the house voice", () => {
    const ideas = readyIdeas(salesFacts(orders, lines, people), "manoooo");
    expect(ideas.length).toBe(4);
    expect(ideas[0]).toMatchObject({ audience: "lapsed" });
    expect(ideas.some((i) => i.title === "Fill your Tuesdays")).toBe(true);
    for (const i of ideas) { expect(i.message).toContain("{name}"); expect(i.message).not.toMatch(/!/); }
  });
});

describe("inAudience", () => {
  const now = Date.UTC(2026, 9, 9);
  it("matches the Customers filter chips", () => {
    expect(inAudience("lapsed", { visits: 2, last_visit_at: "2026-07-01", first_visit_at: "2026-05-01", points: 0 }, 50, now)).toBe(true);
    expect(inAudience("lapsed", { visits: 1, last_visit_at: "2026-07-01", first_visit_at: "2026-07-01", points: 0 }, 50, now)).toBe(false);
    expect(inAudience("points", { visits: 1, last_visit_at: null, first_visit_at: null, points: 60 }, 50, now)).toBe(true);
  });
});
