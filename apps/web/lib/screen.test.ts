import { describe, it, expect } from "vitest";
import { menuPages, freshTokens } from "./screen";

describe("TV screen menu pages", () => {
  const cat = (name: string, n: number) => ({ name, items: Array.from({ length: n }, (_, i) => `${name}${i + 1}`) });
  const plan = (pages: ReturnType<typeof menuPages<string>>) => pages.map((p) => p.map((s) => `${s.cat}${s.parts > 1 ? ` ${s.part}/${s.parts}` : ""}×${s.items.length}`).join(" + "));
  it("short categories share a page, one row each", () => {
    expect(plan(menuPages([cat("Starters", 3), cat("Breads", 4), cat("Desserts", 2)], 4, 2))).toEqual(["Starters×3 + Breads×4", "Desserts×2"]);
  });
  it("a long category is cut into full pages, in order, nothing lost", () => {
    const pages = menuPages([cat("Mains", 19), cat("Drinks", 3)], 4, 2);
    expect(plan(pages)).toEqual(["Mains 1/3×8", "Mains 2/3×8", "Mains 3/3×3 + Drinks×3"]);
    expect(pages.flat().flatMap((s) => s.items)).toHaveLength(22);
  });
  it("a category needing two rows does not squeeze into one left over", () => {
    expect(plan(menuPages([cat("A", 2), cat("B", 6)], 4, 2))).toEqual(["A×2", "B×6"]);
  });
  it("skips empty categories and survives silly sizes", () => {
    expect(plan(menuPages([cat("Empty", 0), cat("Desserts", 2)], 0, 0))).toEqual(["Desserts 1/2×1", "Desserts 2/2×1"]);
    expect(menuPages([], 4, 2)).toEqual([]);
  });
  it("only tokens that were not ready before glow", () => {
    expect(freshTokens([3, 4], [3, 4, 7, 9])).toEqual([7, 9]);
    expect(freshTokens([], [])).toEqual([]);
  });
});
