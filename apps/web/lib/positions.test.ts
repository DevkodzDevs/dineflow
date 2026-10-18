import { describe, it, expect } from "vitest";
import { POSITIONS, DEPARTMENTS, LEVELS, ROLES, hierarchyFor, suggestedRole, levelOf, rolesIMayAssign, PROPERTY_TYPES } from "@dineflow/shared";

describe("job positions", () => {
  it("every position has a unique key, a real department, a level 1–7 and a real role", () => {
    expect(new Set(POSITIONS.map((p) => p.key)).size).toBe(POSITIONS.length);
    for (const p of POSITIONS) {
      expect(DEPARTMENTS.some((d) => d.key === p.dept)).toBe(true);
      expect(LEVELS.some((l) => l.level === p.level)).toBe(true);
      expect((ROLES as readonly string[]).includes(p.role)).toBe(true);
      // a position only on property kinds its department exists in
      expect(p.types.every((t) => DEPARTMENTS.find((d) => d.key === p.dept)!.types.includes(t))).toBe(true);
    }
  });
  it("each kind of property has leadership, a kitchen brigade and a service brigade, top down", () => {
    for (const t of PROPERTY_TYPES) {
      const h = hierarchyFor(t);
      expect(h[0].key).toBe("management");
      expect(h[0].positions[0].level).toBe(1);
      for (const d of h) expect(d.positions.map((p) => p.level)).toEqual([...d.positions.map((p) => p.level)].sort((a, b) => a - b));
      const kitchen = h.find((d) => d.key === "kitchen")!.positions.map((p) => p.key);
      expect(kitchen.indexOf("sous_chef")).toBeLessThan(kitchen.indexOf("cdp"));
      expect(kitchen.indexOf("cdp")).toBeLessThan(kitchen.indexOf("dcdp"));
      expect(kitchen.indexOf("dcdp")).toBeLessThan(kitchen.indexOf("commis_1"));
      const service = h.find((d) => d.key === "service")!.positions.map((p) => p.key);
      expect(service.indexOf("senior_captain")).toBeLessThan(service.indexOf("captain"));
      expect(service.indexOf("captain")).toBeLessThan(service.indexOf("steward"));
    }
  });
  it("a hotel has front office and housekeeping; a restaurant has neither front office nor recreation; only a resort has recreation", () => {
    const keys = (t: (typeof PROPERTY_TYPES)[number]) => hierarchyFor(t).map((d) => d.key);
    expect(keys("hotel")).toEqual(expect.arrayContaining(["front_office", "housekeeping", "banquets"]));
    expect(keys("restaurant")).not.toContain("front_office");
    expect(keys("restaurant")).not.toContain("recreation");
    expect(keys("resort")).toContain("recreation");
    expect(keys("hotel")).not.toContain("recreation");
  });
  it("a Restaurant Manager heads a restaurant but is an outlet manager in a hotel", () => {
    const rm = POSITIONS.find((p) => p.key === "restaurant_manager")!;
    expect(levelOf(rm, "restaurant")).toBe(2);
    expect(levelOf(rm, "hotel")).toBe(3);
  });
  it("the suggested role never exceeds what the appointer may give", () => {
    const gm = POSITIONS.find((p) => p.key === "general_manager")!, chef = POSITIONS.find((p) => p.key === "commis_1")!;
    expect(suggestedRole(gm, rolesIMayAssign("owner"))).toBe("manager");
    expect(suggestedRole(gm, rolesIMayAssign("supervisor"))).toBe("supervisor_2");
    expect(suggestedRole(chef, rolesIMayAssign("supervisor_2"))).toBe("chef");
    expect(suggestedRole(null, rolesIMayAssign("owner"))).toBeNull();
  });
});

import { POSITION_ACCESS, positionModules, positionHome, sameModules, ROLE_ACCESS, MODULES_BY_TYPE, OPEN_HOMES, modulesFor, homeFor } from "@dineflow/shared";
describe("the control room (2026-10-18)", () => {
  it("is the owner's; a manager's only when ticked; nobody else's, ticked or not", () => {
    expect(modulesFor("restaurant", "owner", null, null)).toContain("dashboard");
    expect(modulesFor("restaurant", "manager", null, null)).not.toContain("dashboard");
    expect(modulesFor("restaurant", "manager", null, ["dashboard", "orders"])).toContain("dashboard");
    expect(modulesFor("restaurant", "manager", null, ["orders"])).not.toContain("dashboard");
    for (const r of ["supervisor", "supervisor_2", "waiter", "chef", "cashier", "employee", "housekeeping", "frontdesk", "store"] as const) {
      expect(modulesFor("hotel", r, null, null), r).not.toContain("dashboard");
      expect(modulesFor("hotel", r, null, ["dashboard", "scan"]), r).not.toContain("dashboard");
    }
  });
  it("everyone else has a home of their own — never nowhere", () => {
    expect(homeFor(modulesFor("restaurant", "waiter", null, null))).toBe("orders");
    expect(homeFor(modulesFor("restaurant", "chef", null, null))).toBe("kitchen");
    expect(homeFor(modulesFor("hotel", "frontdesk", null, null))).toBe("frontdesk");
    expect(homeFor(modulesFor("hotel", "housekeeping", null, null))).toBe("housekeeping");
    expect(homeFor(modulesFor("hotel", "employee", null, ["scan"]), "plumber")).toBe("work");
    expect(homeFor([], null)).toBe("work");
    expect(homeFor(modulesFor("hotel", "owner", null, null))).toBe("dashboard");
    for (const r of Object.keys(ROLE_ACCESS) as (keyof typeof ROLE_ACCESS)[]) for (const t of ["restaurant", "hotel", "resort"] as const) {
      const h = homeFor(modulesFor(t, r, null, null)); expect(h === "work" || modulesFor(t, r, null, null).includes(h), `${r}/${t} → ${h}`).toBe(true);
    }
  });
});
describe("what each position opens", () => {
  it("every position has an entry, and only known sections", () => {
    for (const p of POSITIONS) expect(POSITION_ACCESS[p.key], p.key).toBeDefined();
    for (const [k, a] of Object.entries(POSITION_ACCESS)) {
      expect(POSITIONS.some((p) => p.key === k), k).toBe(true);
      for (const m of a.open ?? []) expect(MODULES_BY_TYPE.resort.includes(m), `${k}: ${m}`).toBe(true);
    }
  });
  it("never more than the suggested role may ever have — so nothing is trimmed silently", () => {
    for (const p of POSITIONS) for (const m of POSITION_ACCESS[p.key].open ?? []) expect(ROLE_ACCESS[p.role].includes(m), `${p.key} (${p.role}): ${m}`).toBe(true);
  });
  it("a start screen is one of the position's own sections", () => {
    for (const [k, a] of Object.entries(POSITION_ACCESS)) if (a.home) expect(a.open?.includes(a.home) || OPEN_HOMES.includes(a.home), k).toBe(true);
  });
  it("the case studies: a commis sees the kitchen only, a cashier billing not the kitchen, a receptionist the front desk", () => {
    expect(positionModules("commis_2", "restaurant", MODULES_BY_TYPE)).toEqual(["kitchen", "scan"]);
    expect(positionModules("fnb_cashier", "restaurant", MODULES_BY_TYPE)).toContain("billing");
    expect(positionModules("fnb_cashier", "restaurant", MODULES_BY_TYPE)).not.toContain("kitchen");
    expect(positionModules("steward", "hotel", MODULES_BY_TYPE)).not.toContain("billing");
    expect(positionModules("front_office_associate", "hotel", MODULES_BY_TYPE)).toContain("frontdesk");
    expect(positionModules("general_manager", "hotel", MODULES_BY_TYPE)).toBeNull();
  });
  it("a section the property kind lacks is dropped (no Facilities screen in a hotel)", () => {
    expect(positionModules("spa_therapist", "hotel", MODULES_BY_TYPE)).toEqual(["guests", "scan"]);
    expect(positionModules("spa_therapist", "resort", MODULES_BY_TYPE)).toEqual(["facilities", "guests", "scan"]);
  });
  it("start screens fall back to the control room when not held", () => {
    expect(positionHome("cdp", ["dashboard", "kitchen"])).toBe("kitchen");
    expect(positionHome("cdp", ["dashboard", "orders"])).toBe("dashboard");
    expect(positionHome(null, ["kitchen"])).toBe("dashboard");
    // the people who clean start on the Cleaning board, which nobody has to be given (0111)
    for (const k of ["cleaner", "room_attendant", "public_area_attendant", "housekeeping_trainee"]) expect(positionHome(k, ["dashboard"]), k).toBe("cleaning");
    expect(positionHome("busser", ["dashboard", "orders"])).toBe("orders");
    // the people who fix, guard and grow start on the Work board (0113)
    for (const k of ["plumber", "electrician", "technician", "gardener", "carpenter", "security_guard", "chief_engineer", "asst_engineer", "security_manager", "kitchen_steward", "driver"]) expect(positionHome(k, ["dashboard"]), k).toBe("work");
  });
  it("comparing tick lists ignores order and the control room", () => {
    expect(sameModules(["kitchen", "scan"], ["scan", "dashboard", "kitchen"])).toBe(true);
    expect(sameModules(["kitchen"], ["kitchen", "menu"])).toBe(false);
    expect(sameModules(null, null)).toBe(true);
    expect(sameModules(null, ["kitchen"])).toBe(false);
  });
});

import { positionAccessOf } from "@dineflow/shared";
describe("position lookups are safe", () => {
  it("a prototype name finds nothing, so a crafted position cannot crash a screen", () => {
    for (const k of ["constructor", "__proto__", "prototype", "toString", "hasOwnProperty"]) {
      expect(positionAccessOf(k)).toBeUndefined();
      expect(positionModules(k, "hotel", MODULES_BY_TYPE)).toBeNull();
      expect(positionHome(k, ["kitchen"])).toBe("dashboard");
    }
  });
});
