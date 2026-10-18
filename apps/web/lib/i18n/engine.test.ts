import { describe, expect, it } from "vitest";
import { makeTranslator, norm, isPluralTail, DATE_WORDS } from "./engine";

const t = makeTranslator({
  strings: { "Save expense": "செலவைச் சேமி", Guest: "விருந்தினர்", Housekeeping: "ஹவுஸ்கீப்பிங்", UPI: "UPI", bours: "", "Room clean": "அறை சுத்தம்" },
  patterns: [["{0} min ago", "{0} நிமி முன்"], ["{0} is on it", "{0} செய்கிறார்"], ["Room {0} · {1}", "அறை {0} · {1}"], ["{0} · {1}", "never"], ["Give {0} to {1}", "{1}-க்கு {0} கொடு"], ["{0} section{1}", "{0} பகுதி{1}"]],
  words: DATE_WORDS.ta,
});

describe("the whole-app language: what a piece of text becomes", () => {
  it("matches the text exactly, whitespace collapsed, and keeps the node's own spaces", () => {
    expect(t("Save expense")).toBe("செலவைச் சேமி");
    expect(t("  Save\n   expense ")).toBe("  செலவைச் சேமி ");
    expect(norm(" a \n b ")).toBe("a b");
  });
  it("sets a trailing colon or full stop aside", () => {
    expect(t("Guest:")).toBe("விருந்தினர்:");
  });
  it("fills a template, translating a value that is itself a known word, and lets the values move", () => {
    expect(t("12 min ago")).toBe("12 நிமி முன்");
    expect(t("Meena Krishnan is on it")).toBe("Meena Krishnan செய்கிறார்");
    expect(t("Room 104 · Housekeeping")).toBe("அறை 104 · ஹவுஸ்கீப்பிங்");
    expect(t("Give Room clean to Kannan")).toBe("Kannan-க்கு அறை சுத்தம் கொடு");
    expect(t("3 sections")).toBe("3 பகுதி");
    const sep = makeTranslator({ strings: { Clean: "சுத்தம்" }, patterns: [["{0} Room {1}", "{0} அறை {1}"]] });
    expect(sep("Clean · Room 107")).toBe("சுத்தம் · அறை 107");
    expect(t("1 section")).toBe("1 பகுதி");
  });
  it("never uses a template that is nothing but values and punctuation, or one whose value is a sentence", () => {
    expect(t("Ravi · Kannan")).toBeNull();
    const short = makeTranslator({ strings: {}, patterns: [["{0} to {1}", "{0} முதல் {1} வரை"]] });
    expect(short("9:00 to 21:00")).toBe("9:00 முதல் 21:00 வரை");
    expect(short("11 dishes have no recipe, so no plate cost — add recipes in Menu to place them.")).toBeNull();
  });
  it("puts month and day names into a date", () => {
    expect(t("Sun, 18 Oct")).toBe("ஞாயி, 18 அக்");
    expect(t("Sunday")).toBe("ஞாயிறு");
    expect(t("Oct")).toBeNull();
  });
  it("leaves names, numbers, prices and words it does not know alone", () => {
    expect(t("Ravi Kumar")).toBeNull();
    expect(t("₹1,250.00")).toBeNull();
    expect(t("UPI")).toBeNull();
  });
  it("lets the second half of a split word go empty, and spots a glued-on plural", () => {
    expect(t("bours")).toBe("");
    expect(isPluralTail("s")).toBe(true);
    expect(isPluralTail("es")).toBe(true);
    expect(isPluralTail("so")).toBe(false);
  });
});
