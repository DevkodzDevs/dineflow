import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parentOf, step } from "./back";

const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : []; });

describe("Back (2026-10-22)", () => {
  it("goes one level up when there is no screen behind it", () => {
    expect(parentOf("/orders/new", "/dashboard")).toBe("/orders");
    expect(parentOf("/billing/3f2a", "/dashboard")).toBe("/billing");
    expect(parentOf("/frontdesk/night-audit", "/home")).toBe("/frontdesk");
    expect(parentOf("/settings/printers", "/dashboard")).toBe("/settings");
    expect(parentOf("/orders", "/dashboard")).toBe("/dashboard");
    expect(parentOf("/housekeeping", "/home")).toBe("/home");
    expect(parentOf("/admin/support/12", "/admin")).toBe("/admin/support");
  });
  it("keeps a trail of the screens this tab showed", () => {
    let t = step([], "/dashboard"); t = step(t, "/orders"); t = step(t, "/menu");
    expect(t).toEqual(["/dashboard", "/orders", "/menu"]);
    expect(step(t, "/menu")).toBe(t);                                        // a refresh changes nothing
    expect(step(t, "/orders", true)).toEqual(["/dashboard", "/orders"]);     // a step back takes the last off
    expect(step(t, "/orders")).toEqual(["/dashboard", "/orders", "/menu", "/orders"]);   // the menu to the screen before is a new screen
    expect(step(["/a"], "/b", true)).toEqual(["/a", "/b"]);                  // forward after a back, or a back off the trail: added
    expect(step(["/orders/new"], "/orders", false, true)).toEqual(["/orders"]);   // up a level stands in for the screen it left
  });
  it("opened straight onto a deep page, Back climbs: /orders/new → /orders → home", () => {
    let t = step([], "/orders/new"); const up1 = t.length > 1 ? t[t.length - 2] : parentOf("/orders/new", "/dashboard");
    t = step(t, up1, false, true); const up2 = t.length > 1 ? t[t.length - 2] : parentOf(up1, "/dashboard");
    expect([up1, up2]).toEqual(["/orders", "/dashboard"]);
  });
  it("is the top bar's alone: no staff screen draws a back link of its own", () => {
    // allowed: the kitchen TV board covers the whole screen, top bar too, so it keeps its ✕; "Back to normal" resets the kitchen pace
    const ALLOW = /kitchen[\\/]board[\\/]BoardClient|online-orders[\\/]KitchenPace/;
    const own = files(resolve(__dirname, "../app/(app)")).filter((f) => !ALLOW.test(f) && /aria-label="Back|>Back to /.test(readFileSync(f, "utf8")));
    expect(own.map((f) => f.split(/[\\/]app[\\/]/).pop())).toEqual([]);
  });
  it("is in the top bar, with the person's home, and in Master control's header", () => {
    expect(readFileSync(resolve(__dirname, "../components/shell/TopBar.tsx"), "utf8")).toMatch(/<BackButton home=\{home\} \/>/);
    expect(readFileSync(resolve(__dirname, "../app/(app)/layout.tsx"), "utf8")).toMatch(/<TopBar home=\{`\/\$\{landingFor\(/);
    expect(readFileSync(resolve(__dirname, "../app/admin/layout.tsx"), "utf8")).toMatch(/<BackButton home="\/admin" tone="dark" \/>/);
  });
});
