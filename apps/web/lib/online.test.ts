import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canSetOnline } from "./online";

describe("who may switch a dish on or off online (0132, 2026-10-22)", () => {
  it("the owner, a manager and a chef — whatever they hold", () => {
    for (const r of ["owner", "manager", "chef"]) expect(canSetOnline(r, [])).toBe(true);
  });
  it("a supervisor of either rank only with Online orders", () => {
    for (const r of ["supervisor", "supervisor_2"]) {
      expect(canSetOnline(r, ["dashboard", "online-orders"])).toBe(true);
      expect(canSetOnline(r, ["dashboard", "orders", "kitchen"])).toBe(false);
    }
  });
  it("nobody else, even holding Online orders", () => {
    for (const r of ["waiter", "cashier", "frontdesk", "store", "housekeeping", "employee"]) expect(canSetOnline(r, ["online-orders", "menu"])).toBe(false);
  });
  it("says exactly what the database function checks", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0132_online_availability.sql"), "utf8");
    expect(sql).toMatch(/auth_role\(\) in \('owner', 'manager', 'chef'\)/);
    expect(sql).toMatch(/auth_role\(\) in \('supervisor', 'supervisor_2'\) and has_module\('online-orders'\)/);
  });
});
