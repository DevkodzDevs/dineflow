import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURES, FEATURE_KEYS, DEFAULT_FEATURES, featuresFor, featuresForType, hasFeature, featureForPath, FEATURE_ROUTES } from "@dineflow/shared";
import { rowsFor, freshFor, seesFresh, endFor, ITEMS } from "@/components/shell/sections";
import { modulesFor } from "@dineflow/shared";

/** Add-ons (0175): the review of 2026-11-09 called these unwanted; now each is a switch in Master control. */
describe("add-ons (0175)", () => {
  it("every key is unique, every default is a real key, and the sensitive one is off by default", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
    for (const k of DEFAULT_FEATURES) expect(FEATURE_KEYS).toContain(k);
    for (const f of FEATURES.filter((x) => x.sensitive)) expect(f.on).toBe(false);
    expect(DEFAULT_FEATURES).not.toContain("ota-push");      // buttons for a connection that is not built
    expect(DEFAULT_FEATURES).not.toContain("white-label");   // a paid thing: the master turns it on
  });

  it("the database's default_features() (0177, the latest to define it) names exactly the keys features.ts marks on", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0177_whatsapp.sql"), "utf8");
    const body = /function public\.default_features\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/.exec(sql);
    expect(body, "default_features() found in 0177").toBeTruthy();
    const inSql = [...body![1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...DEFAULT_FEATURES].sort());
  });

  it("the property's own list wins, then the plan's, then the defaults; a kind never gets what it cannot have", () => {
    expect(featuresFor("restaurant", null, null)).toEqual(DEFAULT_FEATURES.filter((k) => k !== "night-audit"));
    expect(featuresFor("hotel", null, null)).toEqual(DEFAULT_FEATURES);
    expect(featuresFor("hotel", null, ["audit", "night-audit"])).toEqual(["audit", "night-audit"]);
    expect(featuresFor("hotel", ["audit"], ["audit", "night-audit"])).toEqual(["audit"]);
    expect(featuresFor("restaurant", ["night-audit", "audit", "nonsense"], null)).toEqual(["audit"]);
    expect(featuresForType("restaurant").some((f) => f.key === "night-audit")).toBe(false);
  });

  it("no list means nothing is switched off (a caller with no property)", () => {
    expect(hasFeature(null, "audit")).toBe(true);
    expect(hasFeature(undefined, "audit")).toBe(true);
    expect(hasFeature([], "audit")).toBe(false);
  });

  it("every screen add-on has a route, and the route finder prefers the deeper path", () => {
    for (const f of FEATURES.filter((x) => x.kind === "screen")) expect(Object.values(FEATURE_ROUTES), f.key).toContain(f.key);
    expect(featureForPath("/frontdesk/night-audit")).toBe("night-audit");
    expect(featureForPath("/frontdesk")).toBeNull();
    expect(featureForPath("/frontdesk/abc")).toBeNull();
    expect(featureForPath("/intelligence")).toBe("intelligence");
    expect(featureForPath("/tables/anything")).toBe("tables");
    expect(featureForPath("/orders")).toBeNull();
  });

  it("the menu drops a switched-off add-on and nothing else; the page's guard answers the same", () => {
    const mods = modulesFor("hotel", "owner", null, null);
    const all = rowsFor(mods, "owner", null, null).map((i) => i.key);
    expect(all).toContain("tables"); expect(all).toContain("connections");
    const off = rowsFor(mods, "owner", null, ["audit"]).map((i) => i.key);
    expect(off).not.toContain("tables"); expect(off).not.toContain("connections");
    expect(off).toEqual(all.filter((k) => k !== "tables" && k !== "connections"));   // modules untouched
    expect(freshFor("owner", null, null).map((i) => i.key)).toContain("intelligence");
    expect(freshFor("owner", null, ["controls"]).map((i) => i.key)).toEqual(["controls", "work"]);   // Work is no add-on: always
    expect(seesFresh("intelligence", "owner", null, ["controls"])).toBe(false);
    expect(seesFresh("work", "owner", null, [])).toBe(true);
    expect(endFor("waiter", []).map((i) => i.key)).toEqual(["me"]);
    expect(endFor("owner", ["voice"]).map((i) => i.key)).toEqual(["me", "voice", "help"]);
    // every ITEMS row that is an add-on is a screen add-on
    for (const i of ITEMS) { const f = FEATURES.find((x) => x.key === i.key); if (f) expect(f.kind).toBe("screen"); }
  });
});
