import { describe, expect, it } from "vitest";
import { lookFor, readThemeCookie, THEME_CHOICES } from "./themeLook";

describe("what the page wears for each theme choice", () => {
  it("colourful light and royal classic are the paper theme with their palette on top", () => {
    expect(lookFor("bright", false)).toEqual({ theme: "paper", palette: "bright" });
    expect(lookFor("bright", true)).toEqual({ theme: "paper", palette: "bright" });
    expect(lookFor("royal", false)).toEqual({ theme: "paper", palette: "royal" });
    expect(lookFor("royal", true)).toEqual({ theme: "paper", palette: "royal" });
  });
  it("the others wear their own name and no palette; follow-device is dark or paper only", () => {
    expect(lookFor("dark", true)).toEqual({ theme: "dark", palette: null });
    expect(lookFor("paper", false)).toEqual({ theme: "paper", palette: null });
    expect(lookFor("colour", true)).toEqual({ theme: "colour", palette: null });
    expect(lookFor("system", true)).toEqual({ theme: "paper", palette: null });
    expect(lookFor("system", false)).toEqual({ theme: "dark", palette: null });
  });
  it("reads every choice from the cookie, and anything else means follow the device", () => {
    for (const c of THEME_CHOICES) expect(readThemeCookie(`a=1; df-theme=${c}; b=2`)).toBe(c);
    expect(readThemeCookie("df-theme=neon")).toBe("system");
    expect(readThemeCookie("df-theme=brightest")).toBe("system");
    expect(readThemeCookie("")).toBe("system");
  });
});
