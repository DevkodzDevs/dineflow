import { describe, expect, it } from "vitest";
import { creditFrom, scoreArticle, scoreFile } from "./dishPhotos";

const best = (dish: string, rows: [string, string][]) =>
  rows.map(([t, d], i) => ({ t, s: scoreArticle(dish, t, d, i) })).sort((a, b) => b.s - a.s)[0].t;

describe("which article is the dish", () => {
  it("prefers the dish over a film or a glass", () => {
    expect(best("Meen kuzhambu", [["Kuppathu Raja (2019 film)", "2019 film"], ["Kuzhambu", "Tamil dish"], ["Tamil cuisine", "Culinary style"]])).toBe("Kuzhambu");
    expect(best("Lime soda", [["Soda–lime glass", "Type of glass"], ["Lime soda", "Indian beverage"]])).toBe("Lime soda");
  });
  it("prefers the Indian filter coffee article over drip coffee", () => {
    expect(best("Filter coffee", [["Drip coffee", "Method of brewing coffee"], ["Coffee filter", "Filter used to brew coffee"], ["Indian filter coffee", "Coffee drink from South India"]])).toBe("Indian filter coffee");
  });
  it("reads menu spellings: briyani is biryani", () => {
    expect(best("Chicken Briyani", [["Thalassery cuisine", "Cuisine of Kerala"], ["Biryani", "Mixed rice dish"], ["Chicken (food)", "Meat"]])).toBe("Biryani");
  });
  it("a festival or a list scores below zero", () => {
    expect(scoreArticle("Pongal", "Pongal (festival)", "Hindu harvest festival", 0)).toBeLessThan(0);
    expect(scoreArticle("Pongal", "Pongal (dish)", "South Indian rice dish", 1)).toBeGreaterThan(3);
  });
});

describe("the credit", () => {
  it("names the author and licence, without HTML", () => {
    expect(creditFrom({ Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Ashwin Kumar</a>' }, LicenseShortName: { value: "CC BY-SA 2.0" } })).toBe("Photo: Ashwin Kumar · CC BY-SA 2.0 · Wikimedia Commons");
  });
  it("refuses a file that is not free", () => {
    expect(creditFrom({ Artist: { value: "Someone" }, LicenseShortName: { value: "Fair use" } })).toBeNull();
    expect(creditFrom({ NonFree: { value: "true" }, LicenseShortName: { value: "Logo" } })).toBeNull();
  });
});

describe("plurals and file names", () => {
  it("tacos is taco", () => {
    expect(best("Tacos", [["French tacos", "French fast food"], ["Taco", "Mexican dish"]])).toBe("Taco");
  });
  it("a file named for the whole dish scores 7, a partial one less", () => {
    expect(scoreFile("Hakka noodles", "Hakka Noodles, Veg Manchurian PK009")).toBe(7);
    expect(scoreFile("Hakka noodles", "Lanzhou beef noodles")).toBe(1.5);
  });
});
