import { describe, expect, it } from "vitest";
import { orderState, isLate } from "./service";

const at = (min: number) => new Date(Date.UTC(2026, 9, 15, 12, 0) - min * 60000).toISOString();
const NOW = Date.UTC(2026, 9, 15, 12, 0);

describe("where a table is", () => {
  it("reads a printed bill first, then food at the pass, then the fire, then a new ticket", () => {
    expect(orderState([{ status: "ready" }], true)).toBe("bill");
    expect(orderState([{ status: "pending" }, { status: "ready" }, { status: "preparing" }])).toBe("ready");
    expect(orderState([{ status: "pending" }, { status: "preparing" }])).toBe("cook");
    expect(orderState([{ status: "served" }, { status: "pending" }])).toBe("new");
    expect(orderState([{ status: "served" }, { status: "served" }])).toBe("eat");
  });
  it("ignores cancelled dishes, and an empty ticket is new", () => {
    expect(orderState([{ status: "served" }, { status: "cancelled" }])).toBe("eat");
    expect(orderState([])).toBe("new");
  });
  it("is late when a dish still waiting or cooking is past the kitchen's target — not a served one", () => {
    expect(isLate([{ status: "preparing", created_at: at(16) }], 15, at(0), NOW)).toBe(true);
    expect(isLate([{ status: "preparing", created_at: at(14) }], 15, at(0), NOW)).toBe(false);
    expect(isLate([{ status: "served", created_at: at(90) }], 15, at(0), NOW)).toBe(false);
    expect(isLate([{ status: "pending" }], 15, at(20), NOW)).toBe(true);
  });
});
