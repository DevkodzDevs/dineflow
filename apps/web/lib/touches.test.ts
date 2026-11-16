import { describe, expect, it } from "vitest";
import { importProgress, sankeyLayout, seamStep, shouldRing, starTone, tillSlots } from "./touches";

describe("the money flow's layout", () => {
  it("scales each side to its own total, biggest first, dropping rows of nothing", () => {
    const l = sankeyLayout([{ name: "Takeaway", amount: 100 }, { name: "Dine-in", amount: 300 }, { name: "Delivery", amount: 0 }], [{ name: "UPI", amount: 250 }, { name: "Cash", amount: 250 }], { height: 200, top: 0, gap: 10 });
    expect(l.left.map((b) => b.name)).toEqual(["Dine-in", "Takeaway"]);
    expect(l.leftTotal).toBe(400); expect(l.rightTotal).toBe(500);
    // 190px usable (one gap), shares .75 / .25
    expect(l.left[0].h).toBeCloseTo(142.5); expect(l.left[1].h).toBeCloseTo(47.5); expect(l.left[1].y).toBeCloseTo(152.5);
    expect(l.right[0].h).toBeCloseTo(95); expect(l.right[1].y).toBeCloseTo(105);
  });
  it("a side with nothing lays out as nothing, and the till slots carry the shares without gaps", () => {
    const l = sankeyLayout([], [{ name: "Cash", amount: 10 }], { height: 100, top: 5, gap: 10 });
    expect(l.left).toEqual([]); expect(l.leftTotal).toBe(0);
    expect(tillSlots(l.right, 5, 100)).toEqual([{ y: 5, h: 100 }]);
    const two = sankeyLayout([{ name: "a", amount: 1 }, { name: "b", amount: 3 }], [], { height: 100, top: 0, gap: 0 });
    expect(tillSlots(two.left, 0, 100)).toEqual([{ y: 0, h: 75 }, { y: 75, h: 25 }]);
  });
  it("a sliver still shows: a band is at least 2px tall", () => {
    const l = sankeyLayout([{ name: "big", amount: 100000 }, { name: "tiny", amount: 1 }], [], { height: 200, top: 0, gap: 10 });
    expect(l.left[1].h).toBe(2);
  });
});

describe("the constellation's tone", () => {
  it("coral up to two stars, amber at three, blue from four; nothing before a tap", () => {
    expect(starTone(0)).toBe("none"); expect(starTone(1)).toBe("low"); expect(starTone(2)).toBe("low");
    expect(starTone(3)).toBe("mid"); expect(starTone(4)).toBe("high"); expect(starTone(5)).toBe("high");
  });
});

describe("the booking seam", () => {
  it("the needle sits on the first step not done, and the thread reaches it", () => {
    expect(seamStep([true, true, false, false])).toEqual({ current: 2, pct: 2 / 3 });
    expect(seamStep([true, false, true, false])).toEqual({ current: 1, pct: 1 / 3 });
    expect(seamStep([false, false, false, false])).toEqual({ current: 0, pct: 0 });
  });
  it("with every step done the needle rests on the last; one step is sewn at once; no steps is nothing", () => {
    expect(seamStep([true, true, true, true])).toEqual({ current: 3, pct: 1 });
    expect(seamStep([false])).toEqual({ current: 0, pct: 1 });
    expect(seamStep([])).toEqual({ current: 0, pct: 0 });
  });
});

describe("the bell", () => {
  it("rings only when the count goes up after the first reading", () => {
    expect(shouldRing(null, 3)).toBe(false);
    expect(shouldRing(0, 1)).toBe(true);
    expect(shouldRing(2, 5)).toBe(true);
    expect(shouldRing(3, 3)).toBe(false);
    expect(shouldRing(3, 0)).toBe(false);
  });
});

describe("the import's orbit", () => {
  it("counts finished pages, read or failed, over every page; nothing asked is 0", () => {
    expect(importProgress([])).toBe(0);
    expect(importProgress([{ status: "reading" }, { status: "done" }, { status: "error" }, { status: "reading" }])).toBe(0.5);
    expect(importProgress([{ status: "done" }])).toBe(1);
  });
});
