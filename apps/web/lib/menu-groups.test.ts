import { describe, it, expect } from "vitest";
import { modulesFor } from "@dineflow/shared";
import { ITEMS, freshFor, myDayFor, modOf, menuGroups } from "@/components/shell/sections";

/** What a person's menu reads as: each heading with its rows' keys. */
const menu = (role: Parameters<typeof freshFor>[0], type: "restaurant" | "hotel" | "resort", dept: string | null = null) => {
  const mods = modulesFor(type, role, null, null);
  const rows = [...ITEMS.filter((i) => mods.includes(modOf(i))), ...freshFor(role, dept)];
  const day = myDayFor(role);
  return menuGroups(rows, day ? [day] : []).map((g) => [g.title, g.items.map((i) => i.key)] as const);
};

describe("the menu's headings (2026-10-21)", () => {
  it("an owner of a restaurant: every row under its heading, no hotel group, Settings left for the last group", () => {
    const m = menu("owner", "restaurant");
    expect(m.map(([t]) => t)).toEqual([null, "Guests & tables", "Orders & kitchen", "Menu & stock", "Team & work", "Money", "Reports & insights", "Business & growth", "Devices"]);
    // 0141: Display lock, the owner's and managers' own heading
    expect(m.find(([t]) => t === "Devices")?.[1]).toEqual(["lock"]);
    expect(menu("waiter", "restaurant").map(([t]) => t)).not.toContain("Devices");
    const flat = m.flatMap(([, k]) => k);
    expect(flat).not.toContain("settings");
    expect(flat).not.toContain("frontdesk");
    expect(m.find(([t]) => t === "Orders & kitchen")?.[1]).toEqual(["orders", "online-orders", "kitchen", "order-board", "billing"]);
  });
  it("a resort owner gets Rooms & stays second, and no row is lost to a More group", () => {
    const m = menu("owner", "resort");
    expect(m[1][0]).toBe("Rooms & stays");
    expect(m.map(([t]) => t)).not.toContain("More");
  });
  it("every row a person may open appears exactly once", () => {
    for (const role of ["owner", "manager", "waiter", "chef", "cashier", "housekeeping", "frontdesk"] as const) {
      for (const type of ["restaurant", "hotel", "resort"] as const) {
        const mods = modulesFor(type, role, null, null);
        const want = [...ITEMS.filter((i) => mods.includes(modOf(i)) && i.key !== "settings"), ...freshFor(role, null)].map((i) => i.key);
        const got = menu(role, type).flatMap(([, k]) => k).filter((k) => k !== "home");
        expect(got.slice().sort()).toEqual(want.slice().sort());
      }
    }
  });
  it("Tables comes first under Guests & tables for anyone who holds Orders", () => {
    for (const role of ["owner", "waiter"] as const) expect(menu(role, "restaurant").find(([t]) => t === "Guests & tables")?.[1][0]).toBe("tables");
  });
  it("staff find My day first; a waiter's menu has no empty heading", () => {
    const m = menu("waiter", "restaurant");
    expect(m[0][1][0]).toBe("home");
    expect(m.every(([, k]) => k.length > 0)).toBe(true);
  });
});
