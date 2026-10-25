/**
 * Display lock (0141, 2026-10-25 — the owner): a device pinned to one page.
 *
 *   view — a static screen: nothing on it can be touched; it only scrolls (a TV, a board, a customer display).
 *   work — the page and its own steps work (Billing → the till → the bill), but the menu, Back and every other page are
 *          gone.
 *
 * Which pages may be locked, and how, is the property's setting (`restaurants.display_lock`, set on /lock by the owner or
 * a manager). The lock itself is this device's: an httpOnly cookie `df-lock` = `<page key>.<mode>.<property id>`, set and
 * cleared only by the server actions in app/(app)/lock/actions.ts. The middleware reads it (any other page → the locked
 * one); the (app) layout reads it (no sidebar, top bar, tab bar or Back); DisplayLock.tsx guards in the browser.
 *
 * Pure: the middleware imports it, so no React, no icons, nothing from the server.
 */
export type LockMode = "view" | "work";
export type Lock = { key: string; mode: LockMode; rid: string };
export const LOCK_COOKIE = "df-lock";

/** Every page that can be locked, by its menu key (sections.ts — a test keeps the two in step). */
export const LOCK_PAGES: Record<string, string> = {
  dashboard: "/dashboard", tomorrow: "/tomorrow", scan: "/scan", frontdesk: "/frontdesk", rooms: "/rooms",
  housekeeping: "/housekeeping", guests: "/guests", facilities: "/facilities", reservations: "/reservations", pulse: "/pulse",
  "pulse-qr": "/pulse/qr", orders: "/orders", "online-orders": "/online-orders", customers: "/customers", kitchen: "/kitchen",
  "order-board": "/kitchen/board", billing: "/billing", invoices: "/invoices", menu: "/menu", inventory: "/inventory",
  labour: "/labour", proof: "/proof", neighbours: "/neighbours", channels: "/channels", reports: "/reports", tax: "/tax",
  staff: "/staff", tables: "/tables", intelligence: "/intelligence", controls: "/controls", audit: "/audit", chain: "/chain",
  payroll: "/payroll", expenses: "/expenses", tasks: "/tasks", cleaning: "/cleaning", work: "/work", "work-records": "/work-records",
  home: "/home",
};
/** Never lockable: where the lock is set and released, the settings, the account. */
export const NEVER_LOCK = ["settings", "lock", "me", "voice", "help", "connections"];

/**
 * A work lock's own steps: the pages a job on this page goes through. Orders → the till (/orders/new) → the bill
 * (/billing/…) → the invoice; Billing → the till and the invoice; a table → its order and bill. Anything else on a page
 * not listed here stays on that page (its own sub-pages count — /frontdesk/night-audit is Front desk's).
 */
const FLOW: Record<string, string[]> = {
  orders: ["/orders", "/billing", "/tables", "/invoices"],
  tables: ["/tables", "/orders", "/billing", "/invoices"],
  billing: ["/billing", "/orders", "/invoices"],
  "online-orders": ["/online-orders", "/orders", "/billing", "/invoices"],
  frontdesk: ["/frontdesk", "/invoices"],
  reservations: ["/reservations", "/orders"],
  kitchen: ["/kitchen"],
};

const KEY = /^[a-z][a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const lockable = (key: string) => key in LOCK_PAGES && !NEVER_LOCK.includes(key);

export function parseLock(v: string | null | undefined): Lock | null {
  if (!v) return null;
  const [key, mode, rid] = decodeURIComponent(v).split(".");
  if (!key || !KEY.test(key) || !lockable(key) || (mode !== "view" && mode !== "work") || !rid || !UUID.test(rid)) return null;
  return { key, mode, rid };
}
export const lockValue = (l: Lock) => `${l.key}.${l.mode}.${l.rid}`;
export const lockHref = (key: string) => LOCK_PAGES[key] ?? "/dashboard";

/** The paths a locked device may show: a view lock its one page; a work lock that page and its steps. */
export function allowedFor(l: Pick<Lock, "key" | "mode">): string[] {
  const home = lockHref(l.key);
  if (l.mode === "view") return [home];
  return Array.from(new Set([home, ...(FLOW[l.key] ?? [])]));
}
const under = (path: string, p: string) => path === p || path.startsWith(p + "/");
export const isAllowed = (l: Pick<Lock, "key" | "mode">, path: string) => {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  return allowedFor(l).some((p) => under(clean, p));
};

/** Paths the lock never redirects: signing in and out, the account's forced password change, the offline page. The
 *  public pages are answered before the middleware gets here. */
const PASS = ["/login", "/logout", "/signup", "/join", "/forgot", "/reset", "/auth", "/account/password", "/offline", "/get"];

/** Where the middleware sends a request on a locked device: null to let it through, else the locked page. */
export function lockRedirect(cookie: string | null | undefined, path: string): string | null {
  const l = parseLock(cookie);
  if (!l) return null;
  if (PASS.some((p) => under(path, p))) return null;
  return isAllowed(l, path) ? null : lockHref(l.key);
}
