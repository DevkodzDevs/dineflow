import { describe, it, expect } from "vitest";
import { parseLock, lockValue, allowedFor, isAllowed, lockRedirect, lockable, LOCK_PAGES, NEVER_LOCK } from "./displayLock";
import { ALL_SECTIONS } from "@/components/shell/sections";

const RID = "9d046762-81a0-4fa9-a68d-3bd698566885";

describe("display lock (0141)", () => {
  it("reads only a well-formed cookie for a lockable page", () => {
    expect(parseLock(`billing.work.${RID}`)).toEqual({ key: "billing", mode: "work", rid: RID });
    expect(parseLock(`order-board.view.${RID}`)).toEqual({ key: "order-board", mode: "view", rid: RID });
    expect(parseLock(lockValue({ key: "orders", mode: "work", rid: RID }))).toEqual({ key: "orders", mode: "work", rid: RID });
    for (const bad of [undefined, "", "billing", `billing.kiosk.${RID}`, `billing.work.not-a-uuid`, `settings.work.${RID}`, `lock.view.${RID}`, `../x.work.${RID}`, `nope.work.${RID}`])
      expect(parseLock(bad), String(bad)).toBeNull();
  });

  it("a view lock shows its one page; a work lock its page and its own steps", () => {
    expect(allowedFor({ key: "dashboard", mode: "view" })).toEqual(["/dashboard"]);
    expect(allowedFor({ key: "billing", mode: "work" })).toEqual(["/billing", "/orders", "/invoices"]);
    expect(isAllowed({ key: "orders", mode: "work" }, "/orders/new?table=4")).toBe(true);   // the till
    expect(isAllowed({ key: "orders", mode: "work" }, "/billing/5c6c7279")).toBe(true);     // the bill
    expect(isAllowed({ key: "orders", mode: "work" }, "/settings")).toBe(false);
    expect(isAllowed({ key: "orders", mode: "view" }, "/orders/new")).toBe(true);           // its own sub-pages
    expect(isAllowed({ key: "orders", mode: "view" }, "/billing")).toBe(false);
    expect(isAllowed({ key: "kitchen", mode: "work" }, "/kitchen/board")).toBe(true);
    expect(isAllowed({ key: "orders", mode: "work" }, "/ordersx")).toBe(false);             // a prefix is not a page
  });

  it("the middleware sends anything else back, and never touches signing in or out", () => {
    const c = `billing.work.${RID}`;
    expect(lockRedirect(c, "/settings")).toBe("/billing");
    expect(lockRedirect(c, "/")).toBe("/billing");
    expect(lockRedirect(c, "/lock")).toBe("/billing");
    expect(lockRedirect(c, "/orders/new")).toBeNull();
    for (const p of ["/login", "/logout", "/account/password", "/join", "/offline"]) expect(lockRedirect(c, p), p).toBeNull();
    expect(lockRedirect(undefined, "/settings")).toBeNull();
    expect(lockRedirect("garbage", "/settings")).toBeNull();
  });

  it("knows every page the menu has, at the same address — and never the lock's own page or settings", () => {
    const byKey = new Map(ALL_SECTIONS.map((s) => [s.key, s.href]));
    for (const [key, href] of Object.entries(LOCK_PAGES)) expect(byKey.get(key), key).toBe(href);
    for (const s of ALL_SECTIONS) if (!NEVER_LOCK.includes(s.key)) expect(lockable(s.key), s.key).toBe(true);
    for (const k of NEVER_LOCK) expect(lockable(k), k).toBe(false);
  });
});
