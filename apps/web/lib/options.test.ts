import { describe, expect, it } from "vitest";
import { defaultVariant, hasOptions, lineKey, lineName, linePrice, optionProblem, tilePrice, type Optioned } from "@dineflow/shared";

const biryani: Optioned = {
  id: "b", name: "Biryani", price: 200,
  variants: [{ id: "h", name: "Half", price: 120 }, { id: "f", name: "Full", price: 220, is_default: true }],
  addon_groups: [
    { id: "g1", name: "Extras", min: 0, max: 2, addons: [{ id: "c", name: "Extra cheese", price: 30 }, { id: "e", name: "Egg", price: 20 }] },
    { id: "g2", name: "Choose your bread", min: 1, max: 1, addons: [{ id: "r", name: "Roti", price: 0 }, { id: "n", name: "Naan", price: 15 }] },
  ],
};
const dosa: Optioned = { id: "d", name: "Dosa", price: 80 };

describe("menu options", () => {
  it("knows which dishes ask a question", () => {
    expect(hasOptions(biryani)).toBe(true);
    expect(hasOptions(dosa)).toBe(false);
  });
  it("takes the default variant, else the first", () => {
    expect(defaultVariant(biryani)?.name).toBe("Full");
    expect(defaultVariant({ ...biryani, variants: [{ id: "h", name: "Half", price: 120 }] })?.name).toBe("Half");
    expect(defaultVariant(dosa)).toBeNull();
  });
  it("prices a line the way the server does: variant replaces, add-ons add", () => {
    expect(linePrice(biryani, biryani.variants![0], [biryani.addon_groups![0].addons[0], biryani.addon_groups![1].addons[0]])).toBe(150);
    expect(linePrice(biryani, null, [])).toBe(200);
    expect(linePrice(dosa, null, [])).toBe(80);
  });
  it("shows a tile 'from' its cheapest size", () => {
    expect(tilePrice(biryani)).toEqual({ price: 120, from: true });
    expect(tilePrice(dosa)).toEqual({ price: 80, from: false });
    expect(tilePrice({ ...dosa, variants: [{ id: "x", name: "Only", price: 90 }] })).toEqual({ price: 90, from: false });
  });
  it("keys a line by every choice, in a stable order", () => {
    expect(lineKey("b", "h", ["e", "c"])).toBe(lineKey("b", "h", ["c", "e"]));
    expect(lineKey("b", "h", ["c"])).not.toBe(lineKey("b", "f", ["c"]));
    expect(lineKey("b", null, [])).toBe("b||");
  });
  it("names the line after its variant", () => {
    expect(lineName(biryani, biryani.variants![0])).toBe("Biryani · Half");
    expect(lineName(dosa, null)).toBe("Dosa");
  });
  it("asks for a required group and refuses too many", () => {
    expect(optionProblem(biryani, [])).toBe('Biryani needs 1 choice from "Choose your bread"');
    expect(optionProblem(biryani, [{ id: "r", name: "Roti", price: 0 }])).toBeNull();
    expect(optionProblem(biryani, [{ id: "r", name: "Roti", price: 0 }, { id: "n", name: "Naan", price: 15 }])).toBe('"Choose your bread" allows at most 1 for Biryani');
    expect(optionProblem(dosa, [])).toBeNull();
  });
});
