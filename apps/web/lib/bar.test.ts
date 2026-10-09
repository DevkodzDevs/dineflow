import { describe, it, expect } from "vitest";
import { modulesFor, type Role, type PropertyType } from "@dineflow/shared";
import { barFor } from "./bar";

/** The menu order the bar fills gaps from — the same order as the sidebar's ITEMS. */
const ORDER = ["dashboard", "tomorrow", "scan", "frontdesk", "rooms", "housekeeping", "guests", "facilities", "reservations", "pulse", "orders", "online-orders", "customers", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "tax", "staff", "settings"];
const allowedFor = (role: Role, type: PropertyType) => { const m = modulesFor(type, role, null, null); return ORDER.filter((k) => m.includes(k)); };

describe("the phone bar", () => {
  it("gives an owner the property default", () => {
    expect(barFor("owner", "restaurant", allowedFor("owner", "restaurant"), null)).toEqual(["dashboard", "orders", "kitchen", "billing"]);
    expect(barFor("owner", "hotel", allowedFor("owner", "hotel"), null)).toEqual(["dashboard", "frontdesk", "rooms", "orders"]);
  });
  it("puts each role's day first, and only sections the role can open", () => {
    for (const [role, type] of [["waiter", "restaurant"], ["chef", "restaurant"], ["cashier", "restaurant"], ["housekeeping", "hotel"], ["frontdesk", "hotel"], ["store", "resort"]] as [Role, PropertyType][]) {
      const allowed = allowedFor(role, type);
      const bar = barFor(role, type, allowed, null);
      expect(bar.length).toBe(Math.min(4, allowed.length));
      expect(bar.every((k) => allowed.includes(k))).toBe(true);
      expect(new Set(bar).size).toBe(bar.length);
    }
    expect(barFor("housekeeping", "hotel", allowedFor("housekeeping", "hotel"), null)[0]).toBe("housekeeping");
    expect(barFor("waiter", "restaurant", allowedFor("waiter", "restaurant"), null)[0]).toBe("orders");
    expect(barFor("chef", "restaurant", allowedFor("chef", "restaurant"), null)[0]).toBe("kitchen");
  });
  it("uses the person's pins, drops pins they cannot open, and falls back when none are usable", () => {
    const allowed = allowedFor("owner", "hotel");
    expect(barFor("owner", "hotel", allowed, ["reports", "housekeeping"])).toEqual(["reports", "housekeeping", "dashboard", "tomorrow"]);
    expect(barFor("owner", "hotel", allowed, ["nope", "staff"])[0]).toBe("staff");
    expect(barFor("owner", "hotel", allowed, ["nope"])).toEqual(["dashboard", "frontdesk", "rooms", "orders"]);
  });
});
