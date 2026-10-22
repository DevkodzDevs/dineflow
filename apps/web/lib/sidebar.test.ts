import { describe, expect, it } from "vitest";
import { SIDEBAR_BOOT, SIDEBAR_STYLES, ICON_LOOKS, defaultSidebar, foldedOf } from "./sidebar";

describe("the sidebar's looks", () => {
  it("the boot script in <head> knows every look, and the defaults by width", () => {
    for (const s of SIDEBAR_STYLES) expect(SIDEBAR_BOOT).toContain(`"${s.key}"`);
    expect(SIDEBAR_BOOT).toContain("innerWidth<1280?'rail':'full'");
  });
  it("an iPad gets icons, a laptop the whole menu", () => {
    expect(defaultSidebar(834)).toBe("rail"); expect(defaultSidebar(1194)).toBe("rail"); expect(defaultSidebar(1280)).toBe("full"); expect(defaultSidebar(1920)).toBe("full");
  });
  it("folding goes to an icon look — the floating card keeps floating", () => {
    for (const s of SIDEBAR_STYLES) expect(ICON_LOOKS).toContain(foldedOf(s.key));
    expect(foldedOf("floating")).toBe("float-rail"); expect(foldedOf("full")).toBe("rail"); expect(foldedOf("compact")).toBe("rail");
  });
});
