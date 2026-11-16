import { describe, expect, it } from "vitest";
import { isThemeChoice, lookFor, readThemeCookie, THEME_CHOICES } from "./themeLook";

describe("what the page wears for each theme choice", () => {
  it("royal classic is the paper theme with its palette on top, whatever the device says", () => {
    expect(lookFor("royal", false)).toEqual({ theme: "paper", palette: "royal" });
    expect(lookFor("royal", true)).toEqual({ theme: "paper", palette: "royal" });
  });
  it("ember is the dark theme with its palette on top, whatever the device says", () => {
    expect(lookFor("ember", false)).toEqual({ theme: "dark", palette: "ember" });
    expect(lookFor("ember", true)).toEqual({ theme: "dark", palette: "ember" });
  });
  it("dark and paper wear their own name and no palette; follow-device is dark or paper only", () => {
    expect(lookFor("dark", true)).toEqual({ theme: "dark", palette: null });
    expect(lookFor("paper", false)).toEqual({ theme: "paper", palette: null });
    expect(lookFor("system", true)).toEqual({ theme: "paper", palette: null });
    expect(lookFor("system", false)).toEqual({ theme: "dark", palette: null });
  });
  it("there are four themes and follow-device, in the picker's order", () => {
    expect(THEME_CHOICES).toEqual(["dark", "paper", "royal", "ember", "system"]);
  });
  it("reads every choice from the cookie, and anything else means follow the device", () => {
    for (const c of THEME_CHOICES) expect(readThemeCookie(`a=1; df-theme=${c}; b=2`)).toBe(c);
    expect(readThemeCookie("df-theme=neon")).toBe("system");
    expect(readThemeCookie("df-theme=embers")).toBe("system");
    expect(readThemeCookie("")).toBe("system");
  });
  it("the retired colourful themes (0117, 0118) are no longer choices — a cookie or saved value still carrying one follows the device", () => {
    expect(readThemeCookie("df-theme=colour")).toBe("system");
    expect(readThemeCookie("df-theme=bright")).toBe("system");
    expect(isThemeChoice("colour")).toBe(false);
    expect(isThemeChoice("bright")).toBe(false);
    expect(isThemeChoice("royal")).toBe(true);
    expect(isThemeChoice(null)).toBe(false);
  });
});
