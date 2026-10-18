import type { Role, PropertyType } from "@dineflow/shared";

/** The property's default four on a phone. */
export const PRIMARY: Record<string, string[]> = {
  restaurant: ["dashboard", "orders", "kitchen", "billing"],
  hotel: ["dashboard", "frontdesk", "rooms", "orders"],
  resort: ["dashboard", "frontdesk", "rooms", "orders"],
};
/** What a role does all day comes first on its bar — Mews opens a housekeeper on room status, a
 *  captain app opens a waiter on tables. Owners, managers and supervisors keep the property default.
 *  "cleaning" is the Cleaning board (0111), not a module: the bar is offered it for the roles below. */
export const ROLE_PRIMARY: Partial<Record<Role, string[]>> = {
  waiter: ["orders", "kitchen", "pulse", "reservations"],
  chef: ["kitchen", "menu", "inventory", "work"],
  cashier: ["billing", "orders", "invoices", "dashboard"],
  housekeeping: ["cleaning", "housekeeping", "rooms", "work"],
  employee: ["work", "cleaning", "dashboard", "scan"],
  frontdesk: ["frontdesk", "rooms", "guests", "reservations"],
  store: ["inventory", "scan", "work", "labour"],
};
/** The generic roles (employee, supervisor 2) do what their department does: a plumber's day is the Work board, a
 *  cleaner's the Cleaning board (0113). */
export const DEPT_PRIMARY: Record<string, string[]> = {
  engineering: ["work", "scan", "dashboard"], security: ["work", "scan", "dashboard"], stores: ["inventory", "work", "scan"],
  housekeeping: ["cleaning", "work", "housekeeping", "rooms"], kitchen: ["kitchen", "work", "menu", "inventory"], service: ["orders", "cleaning", "work", "kitchen"],
};

/**
 * The four sections on a phone's bar, in order. The person's own pins win when any of them is still
 * a section they can open; otherwise their role's day; otherwise the property default. Anything they
 * may not open is dropped, and the gaps are filled from `allowed` in menu order. Never more than four.
 */
export function barFor(role: Role, type: PropertyType, allowed: string[], pins: string[] | null, dept?: string | null): string[] {
  const usable = (keys: string[]) => keys.filter((k) => allowed.includes(k));
  const day = (["employee", "supervisor_2"].includes(role) && dept && DEPT_PRIMARY[dept]) || ROLE_PRIMARY[role] || PRIMARY[type] || PRIMARY.restaurant;
  const want = pins && usable(pins).length ? usable(pins) : usable(day);
  return [...want, ...allowed.filter((k) => !want.includes(k))].slice(0, 4);
}
