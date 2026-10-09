import type { Role, PropertyType } from "@dineflow/shared";

/** The property's default four on a phone. */
export const PRIMARY: Record<string, string[]> = {
  restaurant: ["dashboard", "orders", "kitchen", "billing"],
  hotel: ["dashboard", "frontdesk", "rooms", "orders"],
  resort: ["dashboard", "frontdesk", "rooms", "orders"],
};
/** What a role does all day comes first on its bar — Mews opens a housekeeper on room status, a
 *  captain app opens a waiter on tables. Owners, managers and supervisors keep the property default. */
export const ROLE_PRIMARY: Partial<Record<Role, string[]>> = {
  waiter: ["orders", "kitchen", "pulse", "reservations"],
  chef: ["kitchen", "menu", "inventory", "dashboard"],
  cashier: ["billing", "orders", "invoices", "dashboard"],
  housekeeping: ["housekeeping", "rooms", "scan", "dashboard"],
  frontdesk: ["frontdesk", "rooms", "guests", "reservations"],
  store: ["inventory", "scan", "labour", "dashboard"],
};

/**
 * The four sections on a phone's bar, in order. The person's own pins win when any of them is still
 * a section they can open; otherwise their role's day; otherwise the property default. Anything they
 * may not open is dropped, and the gaps are filled from `allowed` in menu order. Never more than four.
 */
export function barFor(role: Role, type: PropertyType, allowed: string[], pins: string[] | null): string[] {
  const usable = (keys: string[]) => keys.filter((k) => allowed.includes(k));
  const want = pins && usable(pins).length ? usable(pins) : usable(ROLE_PRIMARY[role] ?? PRIMARY[type] ?? PRIMARY.restaurant);
  return [...want, ...allowed.filter((k) => !want.includes(k))].slice(0, 4);
}
