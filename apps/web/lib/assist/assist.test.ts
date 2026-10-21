import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { range, addDays, topicsFor, TOPIC_KEYS } from "./data";
import { noLinks } from "./diagnose";
import { intent } from "./intent";
import { redact } from "./protocol";
import { todayIST } from "@/lib/format";
import type { Session } from "@/lib/auth";

/** Columns Assist must never read: a secret, a link that works as a key, or an identity number. */
const SECRET = /api_key|key_secret|key_id|webhook_secret|webhook_token|export_token|import_url|pay_token|pay_claim|qr_token|punch_token|checkin_token|precheckin|password|otp|id_last4|id_type|\bemail\b|contact_email|\braw\b/;
const selects = (file: string) => [...readFileSync(resolve(__dirname, file), "utf8").matchAll(/\.select\("([^"]*)"/g)].map((m) => m[1]);

describe("Assist never reads a secret (2026-10-21)", () => {
  it("no select in the topics or the health check names a secret column", () => {
    const all = [...selects("data.ts"), ...selects("diagnose.ts")];
    expect(all.length).toBeGreaterThan(30);
    expect(all.filter((s) => SECRET.test(s))).toEqual([]);
  });
  it("every query in the topics is pinned to this property", () => {
    const src = readFileSync(resolve(__dirname, "data.ts"), "utf8");
    const from = (src.match(/s\.from\("/g) ?? []).length, pinned = (src.match(/\.eq\("restaurant_id", rid\)/g) ?? []).length;
    expect(pinned).toBe(from);
  });
  it("redact blanks key-shaped strings and leaves money, bills and dates alone", () => {
    expect(redact("key sk-ant-api03-AbCdEf123456_xyz here")).toBe("key [hidden] here");
    expect(redact("rzp_live_ABCdef123456 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N")).toBe("[hidden] and [hidden]");
    const plain = "Bill #1042 for ₹1,84,320 on 21 Oct — table T5, KOT 77.";
    expect(redact(plain)).toBe(plain);
  });
  it("a channel's error loses its link before Assist repeats it", () => {
    expect(noLinks("fetch failed: https://ota.example.com/ical/9f8e7d6c5b?token=abc")).toBe("fetch failed: [link]");
  });
});

describe("periods", () => {
  it("a bad, reversed or over-long custom range falls back to this month", () => {
    const t = todayIST();
    for (const [f, e] of [["2026-13-01", "2026-13-02"], ["2026-10-20", "2026-10-01"], ["2024-01-01", "2026-01-01"], [undefined, undefined]] as const) {
      expect(range("custom", f, e)).toMatchObject({ from: t.slice(0, 7) + "-01", to: t });
    }
    expect(range("custom", "2026-09-01", "2026-09-30")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("last month runs from its first to its last day; the financial year starts in April", () => {
    const r = range("last_month"); expect(r.from.endsWith("-01")).toBe(true); expect(addDays(r.to, 1).slice(0, 7)).toBe(todayIST().slice(0, 7));
    expect(range("this_financial_year").from).toMatch(/^\d{4}-04-01$/);
    expect(range("last_7_days")).toMatchObject({ from: addDays(todayIST(), -6), to: todayIST() });
  });
});

describe("who may read what", () => {
  const as = (role: string, type = "restaurant", allowed: string[] | null = null) => ({ profile: { role, allowed_modules: allowed }, restaurant: { property_type: type, enabled_modules: null } }) as unknown as Session;
  it("an owner reads every topic; payroll stays with the owner and manager", () => {
    expect(topicsFor(as("owner", "resort")).sort()).toEqual([...TOPIC_KEYS].sort());
    expect(topicsFor(as("manager"))).toContain("payroll");
    for (const r of ["waiter", "chef", "cashier", "housekeeping", "frontdesk", "store"]) expect(topicsFor(as(r, "resort"))).not.toContain("payroll");
  });
  it("a waiter reads the floor, not the books or the team", () => {
    const w = topicsFor(as("waiter"));
    expect(w).toEqual(expect.arrayContaining(["orders", "tables", "reservations", "customers"]));
    for (const k of ["collections", "expenses", "staff", "pantry", "payroll"]) expect(w).not.toContain(k);
  });
  it("a housekeeper reads rooms and housekeeping only", () => {
    expect(topicsFor(as("housekeeping", "hotel")).sort()).toEqual(["housekeeping", "rooms"]);
  });
});

describe("reading a request without a model", () => {
  it("documents, topics and periods", () => {
    expect(intent("Give me a PDF of last month's collections")).toMatchObject({ doc: true, topics: ["collections"], period: "last_month" });
    expect(intent("I need complete documentation about staff details, pantry details and room details")).toMatchObject({ doc: true, all: true, topics: ["staff", "pantry", "rooms"] });
    expect(intent("online orders this week")).toMatchObject({ topics: ["online"], period: "last_7_days" });
    expect(intent("salary report for this financial year")).toMatchObject({ doc: true, topics: ["payroll"], period: "this_financial_year" });
  });
  it("problems", () => {
    expect(intent("the app is not working, check for problems").health).toBe(true);
    expect(intent("why is the stock wrong?")).toMatchObject({ health: true, topics: ["pantry"] });
    expect(intent("what sold best today?").health).toBe(false);
  });
});
