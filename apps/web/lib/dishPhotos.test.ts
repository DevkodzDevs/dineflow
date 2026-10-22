import { describe, expect, it } from "vitest";
import { creditFrom, photoAt, scoreArticle, scoreFile } from "./dishPhotos";

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

describe("a photo at the size it is shown", () => {
  const t960 = "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Masala_Dosa_2023.jpg/960px-Masala_Dosa_2023.jpg?utm_source=commons.wikimedia.org";
  it("asks Wikimedia for the smallest step it serves that covers the width", () => {
    expect(photoAt(t960, 330)).toBe("https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Masala_Dosa_2023.jpg/330px-Masala_Dosa_2023.jpg?utm_source=commons.wikimedia.org");
    expect(photoAt(t960, 120)).toContain("/250px-Masala_Dosa_2023.jpg");
    expect(photoAt(t960, 400)).toContain("/500px-Masala_Dosa_2023.jpg");   // 400 is not a step Wikimedia serves
    expect(photoAt("https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Can.png/640px-Can.png", 330)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Can.png/330px-Can.png");
  });
  it("never asks for a bigger file than the one stored", () => {
    expect(photoAt(t960, 1200)).toBe(t960);
    expect(photoAt("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/250px-X.jpg", 330)).toContain("/250px-X.jpg");
  });
  it("asks for an original Commons photo as a thumbnail (DishImage falls back if it is narrower)", () => {
    expect(photoAt("https://upload.wikimedia.org/wikipedia/commons/7/71/LIME_SODA_TREB_Can.png?utm_source=x", 330))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/LIME_SODA_TREB_Can.png/330px-LIME_SODA_TREB_Can.png?utm_source=x");
    const svg = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Icon.svg";
    expect(photoAt(svg, 330)).toBe(svg);   // a drawing is left as it is
  });
  it("leaves the property's own upload and nothing alone", () => {
    const own = "https://abc.supabase.co/storage/v1/object/public/menu/r1/dish-1.webp";
    expect(photoAt(own, 330)).toBe(own);
    expect(photoAt(null, 330)).toBeNull();
    expect(photoAt(undefined, 330)).toBeUndefined();
  });
});
