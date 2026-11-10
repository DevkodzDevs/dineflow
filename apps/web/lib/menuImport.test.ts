import { describe, expect, it } from "vitest";
import { findExisting, matchCategory, mergePhotos, menuPhotoSchema, newCategories, normName, parseVariants, pricesToVariants, taxFor, toImportDishes, type ImportDish } from "@/lib/menuImport";

/** "Menu photo to a working POS in two minutes" (2026-11-09): the pure parts of the import — several photos merged,
 *  sections matched, sizes read from a price cell, tax derived — checked without a model or a database. */
const dish = (p: Partial<ImportDish> & { name: string }): ImportDish => ({
  name_local: "", category: "", price: 0, variants: [], is_veg: true, gst_rate: null, hsn: null, description: "", spicy: false, jain: false, confidence: 0.9, ...p,
});

describe("menu import — sizes from a price cell", () => {
  it("reads unlabelled prices by the card's convention: two are Half/Full, three Small/Medium/Large", () => {
    expect(parseVariants("120/220")).toEqual([{ name: "Half", price: 120 }, { name: "Full", price: 220 }]);
    expect(parseVariants("₹60 / ₹90 / ₹120")).toEqual([{ name: "Small", price: 60 }, { name: "Medium", price: 90 }, { name: "Large", price: 120 }]);
  });
  it("reads labelled prices in either order and expands the short forms", () => {
    expect(parseVariants("Half ₹90 Full ₹160")).toEqual([{ name: "Half", price: 90 }, { name: "Full", price: 160 }]);
    expect(parseVariants("S 80 M 110 L 150")).toEqual([{ name: "Small", price: 80 }, { name: "Medium", price: 110 }, { name: "Large", price: 150 }]);
    expect(parseVariants("Qtr 90 / Half 160 / Full 300")).toEqual([{ name: "Quarter", price: 90 }, { name: "Half", price: 160 }, { name: "Full", price: 300 }]);
    expect(parseVariants("90 Half 160 Full")).toEqual([{ name: "Half", price: 90 }, { name: "Full", price: 160 }]);
  });
  it("one price is not a size, and nothing is not a price", () => {
    expect(parseVariants("₹180")).toEqual([]);
    expect(parseVariants("")).toEqual([]);
    expect(parseVariants("Rs. 250")).toEqual([]);
  });
  it("the model's price list becomes a price and sizes, the sell price the lowest size", () => {
    expect(pricesToVariants([{ label: "", price: 180 }])).toEqual({ price: 180, variants: [] });
    expect(pricesToVariants([{ label: "half", price: 120 }, { label: "FULL", price: 220 }])).toEqual({ price: 120, variants: [{ name: "Half", price: 120 }, { name: "Full", price: 220 }] });
    expect(pricesToVariants([{ label: "", price: 60 }, { label: "", price: 90 }, { label: "", price: 120 }]).variants.map((v) => v.name)).toEqual(["Small", "Medium", "Large"]);
    // the same size twice (a page read twice) is one size
    expect(pricesToVariants([{ label: "Half", price: 120 }, { label: "Half", price: 120 }])).toEqual({ price: 120, variants: [] });
  });
});

describe("menu import — categories", () => {
  const have = ["Starters", "Main course", "Rice & Biryani", "Beverages"];
  it("matches a section by name, ignoring case, spaces, & / and, and a plural", () => {
    expect(matchCategory("STARTERS", have)).toBe("Starters");
    expect(matchCategory("starter", have)).toBe("Starters");
    expect(matchCategory("Rice and Biryani", have)).toBe("Rice & Biryani");
    expect(matchCategory("  Main   Course ", have)).toBe("Main course");
  });
  it("matches a heading one side holds whole, proposes the rest as new", () => {
    expect(matchCategory("Mains", have)).toBe("Main course");
    expect(matchCategory("Biryani", have)).toBe(null);          // "Rice & Biryani" does not start with it
    expect(matchCategory("Desserts", have)).toBe(null);
    expect(matchCategory("", have)).toBe(null);
  });
  it("lists the new sections a batch needs, once each, in order", () => {
    const rows = [{ category: "Desserts" }, { category: "starters" }, { category: "DESSERTS" }, { category: "Chinese" }, { category: "" }];
    expect(newCategories(rows, have)).toEqual(["Desserts", "Chinese"]);
  });
});

describe("menu import — several photos merged", () => {
  it("collapses the same dish across pages, keeping the surer price and filling blanks from the other", () => {
    const front = [dish({ name: "Masala Dosa", price: 80, confidence: 0.6, category: "Tiffin" }), dish({ name: "Filter coffee", price: 30 })];
    const back = [dish({ name: "masala dosa", price: 90, confidence: 0.95, description: "Crisp, with potato masala" }), dish({ name: "Ghee roast", price: 120 })];
    const merged = mergePhotos([front, back]);
    expect(merged.map((d) => d.name)).toEqual(["masala dosa", "Filter coffee", "Ghee roast"]);   // the pages' order, first appearance; the surer reading's spelling
    expect(merged[0]).toMatchObject({ name: "masala dosa", price: 90, category: "Tiffin", description: "Crisp, with potato masala", confidence: 0.95 });
  });
  it("keeps the first reading's price when it is the surer one, and a size list beats none", () => {
    const a = [dish({ name: "Chicken Biryani", price: 220, confidence: 0.9 })];
    const b = [dish({ name: "Chicken biryani", price: 180, confidence: 0.5, variants: [{ name: "Half", price: 180 }, { name: "Full", price: 320 }] })];
    const m = mergePhotos([a, b]);
    expect(m).toHaveLength(1);
    expect(m[0].price).toBe(220);
    expect(m[0].variants).toEqual([{ name: "Half", price: 180 }, { name: "Full", price: 320 }]);
  });
  it("collapses a dish printed twice on one page, and ignores veg/non-veg suffixes and brackets when comparing", () => {
    expect(normName("Paneer Butter Masala (Veg)")).toBe("paneer butter masala");
    expect(normName("  Chicken-65 ")).toBe("chicken 65");
    expect(mergePhotos([[dish({ name: "Idli" }), dish({ name: "IDLI" })]])).toHaveLength(1);
  });
});

describe("menu import — already on the menu", () => {
  const items = [
    { id: "1", name: "Chicken 65", category: "Starters", price: 240 },
    { id: "2", name: "Chicken 65", category: "Chinese", price: 260 },
    { id: "3", name: "Filter coffee", category: null, price: 30 },
  ];
  it("finds the dish by normalised name, in the same section when it sits in several", () => {
    expect(findExisting({ name: "chicken-65", category: "Chinese" }, items)?.id).toBe("2");
    expect(findExisting({ name: "Chicken 65", category: "Snacks" }, items)?.id).toBe("1");
    expect(findExisting({ name: "Filter Coffee", category: "Beverages" }, items)?.id).toBe("3");
    expect(findExisting({ name: "Mutton chukka", category: "" }, items)).toBe(null);
  });
});

describe("menu import — tax", () => {
  const regular = { gst_rate: 5, gst_scheme: "regular" };
  it("leaves cooked and poured things on the property's rate (service, SAC 996331 at bill time)", () => {
    expect(taxFor({ name: "Masala dosa", category: "Tiffin", packaged_goods: false }, regular)).toEqual({ gst_rate: null, hsn: null });
    expect(taxFor({ name: "Fresh lime soda", category: "Beverages", packaged_goods: false }, regular)).toEqual({ gst_rate: null, hsn: null });
    expect(taxFor({ name: "Masala soda", category: "Beverages", packaged_goods: true }, regular)).toEqual({ gst_rate: null, hsn: null });
  });
  it("marks packaged water 18% (2201) and an aerated drink 40% (2202) on the regular scheme only", () => {
    expect(taxFor({ name: "Mineral water 1 L", category: "Beverages", packaged_goods: true }, regular)).toEqual({ gst_rate: 18, hsn: "2201" });
    expect(taxFor({ name: "Bisleri", category: "", packaged_goods: false }, regular)).toEqual({ gst_rate: 18, hsn: "2201" });
    expect(taxFor({ name: "Coke 300 ml", category: "Cold drinks", packaged_goods: true }, regular)).toEqual({ gst_rate: 40, hsn: "2202" });
    expect(taxFor({ name: "Thums Up", category: "", packaged_goods: true }, regular)).toEqual({ gst_rate: 40, hsn: "2202" });
    expect(taxFor({ name: "Mineral water", category: "", packaged_goods: true }, { gst_rate: 5, gst_scheme: "composition" })).toEqual({ gst_rate: null, hsn: null });
  });
});

describe("menu import — the model's answer, checked", () => {
  it("the schema refuses a dish with no price list and accepts a full one; toImportDishes derives the rest", () => {
    expect(menuPhotoSchema.safeParse({ dishes: [{ name: "Idli", name_local: "", category: "", prices: [], is_veg: true, packaged_goods: false, description: "", spicy: false, jain: false, confidence: 1 }] }).success).toBe(false);
    const read = menuPhotoSchema.parse({ dishes: [
      { name: "Chicken biryani", name_local: "சிக்கன் பிரியாணி", category: "Biryani", prices: [{ label: "Half", price: 180 }, { label: "Full", price: 320 }], is_veg: false, packaged_goods: false, description: "Seeraga samba rice", spicy: true, jain: false, confidence: 0.9 },
      { name: "Sprite", name_local: "", category: "Beverages", prices: [{ label: "", price: 40 }], is_veg: true, packaged_goods: true, description: "", spicy: false, jain: false, confidence: 1 },
      { name: "   ", name_local: "", category: "", prices: [{ label: "", price: 0 }], is_veg: true, packaged_goods: false, description: "", spicy: false, jain: false, confidence: 0 },
    ] });
    const rows = toImportDishes(read, { gst_rate: 5, gst_scheme: "regular" });
    expect(rows).toHaveLength(2);   // the blank name is dropped
    expect(rows[0]).toMatchObject({ name: "Chicken biryani", name_local: "சிக்கன் பிரியாணி", price: 180, variants: [{ name: "Half", price: 180 }, { name: "Full", price: 320 }], is_veg: false, gst_rate: null, hsn: null, spicy: true });
    expect(rows[1]).toMatchObject({ name: "Sprite", price: 40, variants: [], gst_rate: 40, hsn: "2202" });
  });
});
