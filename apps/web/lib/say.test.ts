import { describe, expect, it } from "vitest";
import { WORDS, say, readLang, catIcon, scriptOf, allOf, type Word } from "./say";

describe("the Dining screens' words", () => {
  it("has English, Tamil and Hindi for every word, none blank", () => {
    for (const [k, w] of Object.entries(WORDS)) {
      for (const lang of ["en", "ta", "hi"] as const) expect(w[lang].trim(), `${k}.${lang}`).not.toBe("");
    }
  });
  it("puts no second line under English, or where the word is the same in both (UPI, WhatsApp)", () => {
    expect(say("take_order", "en")).toEqual({ en: "Take order", alt: null });
    expect(say("take_order", "ta")).toEqual({ en: "Take order", alt: "ஆர்டர் எடு" });
    expect(say("paid", "hi").alt).toBe("भुगतान हुआ");
    expect(say("upi" as Word, "ta").alt).toBeNull();
  });
  it("reads the device's cookie, and anything else is English", () => {
    expect(readLang("ta")).toBe("ta");
    expect(readLang("hi")).toBe("hi");
    expect(readLang("ta-all")).toBe("ta-all");
    expect(readLang("hi-all")).toBe("hi-all");
    expect(readLang("fr")).toBe("en");
    expect(readLang(undefined)).toBe("en");
  });
  it("in a whole-app language gives the word alone, with no English and no second line", () => {
    expect(say("take_order", "ta-all")).toEqual({ en: "ஆர்டர் எடு", alt: null });
    expect(say("paid", "hi-all")).toEqual({ en: "भुगतान हुआ", alt: null });
    expect(scriptOf("ta-all")).toBe("ta"); expect(scriptOf("hi")).toBe("hi");
    expect(allOf("hi-all")).toBe("hi"); expect(allOf("ta")).toBeNull(); expect(allOf("en")).toBeNull();
  });
  it("guesses a category's picture from its name", () => {
    expect(catIcon("Breads & Rice")).toBe("Wheat");
    expect(catIcon("Biryani")).toBe("CookingPot");
    expect(catIcon("Cool drinks")).toBe("CupSoda");
    expect(catIcon("Desserts")).toBe("IceCreamCone");
    expect(catIcon("Starters")).toBe("Drumstick");
    expect(catIcon("Chef's specials")).toBe("UtensilsCrossed");
  });
});
