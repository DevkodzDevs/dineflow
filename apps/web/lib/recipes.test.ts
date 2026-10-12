import { describe, expect, it } from "vitest";
import { RECIPE_LIBRARY, INGREDIENT_VOCAB, findStandardRecipe, fmtQty } from "@dineflow/shared";

/** The standard recipe library: every line names a pantry ingredient the vocabulary knows, in that
 *  ingredient's unit, with a positive amount; no dish is listed twice; and a menu name finds the right plate. */
describe("recipe library", () => {
  it("has well over a hundred dishes, each with real lines", () => {
    expect(RECIPE_LIBRARY.length).toBeGreaterThanOrEqual(190);
    for (const r of RECIPE_LIBRARY) {
      expect(r.lines.length, r.dish).toBeGreaterThan(0);
      expect(r.prep_minutes, r.dish).toBeGreaterThan(0);
    }
  });
  it("every line is in the vocabulary, in the vocabulary's unit, with a positive amount", () => {
    const bad: string[] = [];
    for (const r of RECIPE_LIBRARY) for (const l of r.lines) {
      const v = INGREDIENT_VOCAB[l.name];
      if (!v) bad.push(`${r.dish}: "${l.name}" is not in the vocabulary`);
      else if (v.unit !== l.unit) bad.push(`${r.dish}: ${l.name} is ${l.unit}, the pantry keeps it in ${v.unit}`);
      else if (v.category !== l.category) bad.push(`${r.dish}: ${l.name} says ${l.category}, the vocabulary says ${v.category}`);
      if (!(l.qty > 0)) bad.push(`${r.dish}: ${l.name} has no amount`);
    }
    expect(bad).toEqual([]);
  });
  it("no dish appears twice", () => {
    const seen = new Map<string, number>();
    for (const r of RECIPE_LIBRARY) seen.set(r.dish.toLowerCase(), (seen.get(r.dish.toLowerCase()) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([d]) => d)).toEqual([]);
  });
  it("amounts are plate-sized: a protein between 40 g and 1 kg, oil under 60 ml, rice under 250 g", () => {
    const bad: string[] = [];
    for (const r of RECIPE_LIBRARY) for (const l of r.lines) {
      const cat = INGREDIENT_VOCAB[l.name]?.category;
      if ((cat === "meat" || cat === "seafood") && (l.qty < 0.03 || l.qty > 1)) bad.push(`${r.dish}: ${l.name} ${l.qty} kg`);
      if (/oil$/i.test(l.name) && l.qty > 0.06) bad.push(`${r.dish}: ${l.name} ${l.qty} l`);
      if (/rice$/i.test(l.name) && l.unit === "kg" && l.qty > 0.25) bad.push(`${r.dish}: ${l.name} ${l.qty} kg`);
    }
    expect(bad).toEqual([]);
  });
  it("finds the plate a menu name means", () => {
    const f = (n: string) => findStandardRecipe(n)?.dish ?? null;
    expect(f("Chicken Biryani")).toBe("Chicken biryani");
    expect(f("Hyderabadi Chicken Dum Biryani")).toBe("Chicken biryani");
    expect(f("Veg Pulao")).toBe("Veg pulao");
    expect(f("Paneer Tikka Masala")).toBe("Paneer tikka masala");
    expect(f("Chicken Momos (8 pcs)")).toBe("Chicken momos (8 pcs)");
    expect(f("Vada Pav")).toBe("Vada pav");
    expect(f("Oreo Shake")).toBe("Oreo shake");
    expect(f("Tea")).toBe("Tea");
    expect(f("Veg Meals")).toBe("Veg meals (South Indian thali)");
    expect(f("Aloo Paratha")).toBe("Aloo paratha");
    expect(f("Fish Curry Meals")).toBe("Meen kuzhambu (fish curry)");
  });
  it("does not hand a dish the wrong plate on a style word alone", () => {
    expect(findStandardRecipe("Prawn pulao")).toBeNull();
    expect(findStandardRecipe("Mango juice")).toBeNull();
    expect(findStandardRecipe("Beer")).toBeNull();
  });
  it("prints a quantity the way a cook reads it", () => {
    expect(fmtQty(0.18, "kg")).toBe("180 g");
    expect(fmtQty(0.015, "l")).toBe("15 ml");
    expect(fmtQty(1.5, "kg")).toBe("1.5 kg");
    expect(fmtQty(2, "pcs")).toBe("2 pcs");
    expect(fmtQty(3, "g")).toBe("3 g");
    expect(fmtQty(0.5, "pcs")).toBe("0.5 pcs");
  });
});
