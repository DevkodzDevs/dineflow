import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { pinned } from "./scoped";
import { reach } from "./assist/data";
import { modulesFor } from "@dineflow/shared";

/** The tables whose read policy ends in `or is_platform_admin()` (pg_policies, 2026-10-21). */
const MASTER_SEES_ALL = ["addon_groups", "addons", "combo_items", "customers", "loyalty_ledger", "menu_item_addon_groups", "menu_variants", "night_audits", "purchase_order_items", "purchase_orders", "suppliers"];
const pages = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? pages(p) : /page\.tsx$/.test(f) ? [p] : []; });

describe("each login loads its own data (2026-10-21)", () => {
  it("the master re-reads, pinned to its property; everyone else keeps the parallel answer and makes no second call", async () => {
    const again = vi.fn(async (rid: string) => `pinned:${rid}`);
    expect(await pinned({ isAdmin: false, restaurant: { id: "r1" } }, "mine", again)).toBe("mine");
    expect(again).not.toHaveBeenCalled();
    expect(await pinned({ isAdmin: true, restaurant: { id: "r1" } }, "mine", again)).toBe("pinned:r1");
  });

  it("no page reads a master-visible table without pinning it", () => {
    const bad: string[] = [];
    for (const f of pages(resolve(__dirname, "../app"))) {
      const src = readFileSync(f, "utf8");
      // the read and the line after it (a long chain puts `.eq("restaurant_id", rid)` on the next line)
      const lines = src.split("\n");
      for (const t of MASTER_SEES_ALL) lines.forEach((line, i) => {
        if (!line.includes(`from("${t}").select(`)) return;
        if (!(line + lines[i + 1]).includes("restaurant_id") && !/pinned\(|optionReads|rid \? q\.eq\("restaurant_id"/.test(src)) bad.push(`${f.split(/[\\/]app[\\/]/).pop()}: ${t}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("Assist's background snapshot reads only what the person's sections show", () => {
    const of = (role: string, type = "hotel") => reach(modulesFor(type as "hotel", role as "owner", null, null));
    expect(of("owner")).toEqual({ money: true, kitchen: true, stock: true, floor: true, queue: true, rooms: true });
    expect(of("housekeeping")).toEqual({ money: false, kitchen: false, stock: false, floor: false, queue: false, rooms: true });
    expect(of("chef", "restaurant")).toMatchObject({ money: false, kitchen: true, stock: false, rooms: false });
    expect(of("waiter", "restaurant")).toMatchObject({ money: false, stock: false, floor: true, queue: true, rooms: false });
    expect(of("employee")).toEqual({ money: false, kitchen: false, stock: false, floor: false, queue: false, rooms: false });
  });

  it("the offline warm-up no longer copies whole tables to every device", () => {
    const src = readFileSync(resolve(__dirname, "offline/OfflineProvider.tsx"), "utf8");
    expect(src).not.toMatch(/\.from\("/);
    expect(src).not.toMatch(/getClient/);
  });

  it("the help-desk count is asked only where Help & support is shown", () => {
    const nav = readFileSync(resolve(__dirname, "../components/shell/Nav.tsx"), "utf8");
    expect(nav.match(/useSupportUnread\(path\)/g)).toBeNull();
    expect(nav.match(/useSupportUnread\(path, endFor\(role\)\.some\(\(i\) => i\.key === "help"\)\)/g)?.length).toBe(2);
  });
});
