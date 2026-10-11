import { describe, expect, it } from "vitest";
import { dishMatch } from "./tillSearch";

const rank = (q: string, names: string[]) => names.map((n) => [n, dishMatch(n, q)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([n]) => n);
const MENU = ["Chicken Biryani", "Chicken 65", "Chettinad pepper chicken", "Paneer butter masala", "Butter naan", "Masala dosa", "Mutton biryani", "Curd rice", "Lime soda"];

describe("the till's search", () => {
  it("initials find the dish: cb, pbm, md", () => {
    expect(rank("cb", MENU)[0]).toBe("Chicken Biryani");
    expect(rank("pbm", MENU)[0]).toBe("Paneer butter masala");
    expect(rank("md", MENU)[0]).toBe("Masala dosa");
  });
  it("the start of the name beats the start of a word, which beats the middle", () => {
    expect(rank("chick", MENU)).toEqual(["Chicken 65", "Chicken Biryani", "Chettinad pepper chicken"]);
    expect(rank("biry", MENU)).toEqual(["Chicken Biryani", "Mutton biryani"]);
    expect(rank("65", MENU)).toEqual(["Chicken 65"]);
  });
  it("word starts in order: 'chi bir' is Chicken Biryani, 'but' finds both butters", () => {
    expect(rank("chi bir", MENU)[0]).toBe("Chicken Biryani");
    expect(rank("but", MENU).sort()).toEqual(["Butter naan", "Paneer butter masala"]);
  });
  it("nothing typed, or nothing near, is no match", () => {
    expect(dishMatch("Lime soda", "  ")).toBe(0);
    expect(dishMatch("Lime soda", "xyz")).toBe(0);
  });
});
