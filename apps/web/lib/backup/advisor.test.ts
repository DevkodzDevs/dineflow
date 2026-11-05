import { describe, expect, it } from "vitest";
import { findings, rulesAnswer, SUGGESTED, type Facts } from "./advisor-rules";

const H = 3600000; const now = Date.parse("2026-11-05T12:00:00Z");
const cloud = { id: "c", kind: "cloud", name: "Cloud · Supabase", online: true, active: true, paused: false, nightly: true, keep_count: 14, backups: 3, files: 0, files_bytes: 0, failed_24h: 0, queued: 0, last_seen_at: null, last_backup: { at: new Date(now - 5 * H).toISOString(), verify_ok: true, size_bytes: 3.5e6 }, last_report: null };
const laptop = { id: "l", kind: "laptop", name: "Mano laptop", online: true, active: false, paused: false, nightly: true, keep_count: 30, backups: 2, files: 2, files_bytes: 7e6, failed_24h: 0, queued: 0, last_seen_at: new Date(now - 60000).toISOString(), last_backup: { at: new Date(now - 20 * H).toISOString(), verify_ok: true, size_bytes: 3.5e6 }, last_report: { disk_free: 200e9, disk_total: 512e9, host: "MANO" } };
const base: Facts = {
  at: new Date(now).toISOString(), db_bytes: 72e6, files_bytes: 8e5, rows: 52000, tables: 119, users: 31, properties: 6, demos: 0,
  top_tables: [{ name: "order_items", bytes: 9e6, rows: 6700 }, { name: "orders", bytes: 7e6, rows: 2500 }, { name: "stock_ledger", bytes: 5e6, rows: 13000 }],
  growth_per_day: 2e5, days_to_full: 2100, servers: [cloud, laptop], active: cloud,
  settings: { nightly: true, keep_count: 14, include_files: true, offsite_on: false, offsite_kind: "none", last_download_at: new Date(now - 2 * 86400000).toISOString(), cleanup: {} },
  env: { cron: true, serviceRole: true, ai: false }, cleanup: { total: 120, rules: { print_jobs: { rows: 120, days: 30 } } },
  health: { connections: 13, max_connections: 60, cache_heap: 99.9, longest_s: 0, deadlocks: 0, xid_pct: 1, unused_indexes: 3, dead_rows_top: [] },
  records: { done: 5, failed_7d: 0, unchecked: 0, check_failed: 0, file_gone: 0, last_nightly_at: new Date(now - 10 * H).toISOString() },
};

describe("the advisor's findings", () => {
  it("a healthy set-up reads as fine, with the copies counted", () => {
    const f = findings(base, now);
    expect(f.find((x) => x.key === "fresh")?.level).toBe("ok");
    expect(f.find((x) => x.key === "copies")?.detail).toMatch(/second copy/);
    expect(f.filter((x) => x.level === "bad")).toHaveLength(0);
  });
  it("no backup at all is serious and comes first", () => {
    const f = findings({ ...base, active: { ...cloud, last_backup: null }, servers: [{ ...cloud, last_backup: null }] }, now);
    expect(f[0]).toMatchObject({ key: "no-backup", level: "bad" });
    expect(f.find((x) => x.key === "one-place")?.level).toBe("warn");
  });
  it("a stale backup, missing Vercel keys and an old download are warnings with a fix", () => {
    const f = findings({ ...base, servers: [cloud], active: { ...cloud, last_backup: { ...cloud.last_backup, at: new Date(now - 60 * H).toISOString() } }, env: { cron: false, serviceRole: true, ai: false }, settings: { ...base.settings, last_download_at: null } }, now);
    expect(f.find((x) => x.key === "stale")).toMatchObject({ level: "warn" });
    expect(f.find((x) => x.key === "nightly-keys")?.detail).toMatch(/CRON_SECRET/);
    expect(f.find((x) => x.key === "download")?.fix).toMatch(/once a week/);
  });
  it("a node that is offline, paused or short of disk is called out", () => {
    const node = { ...laptop, active: true, online: false, paused: true, last_report: { disk_free: 5e9, disk_total: 512e9 } };
    const f = findings({ ...base, servers: [{ ...cloud, active: false }, node], active: node }, now);
    expect(f.map((x) => x.key)).toEqual(expect.arrayContaining(["node-offline", "node-paused", "disk-l"]));
    expect(f.find((x) => x.key === "disk-l")?.level).toBe("bad");
  });
  it("space and clean-up thresholds", () => {
    const f = findings({ ...base, db_bytes: 460e6, cleanup: { total: 5000, rules: { print_jobs: { rows: 5000, days: 30 } } } }, now);
    expect(f.find((x) => x.key === "space")).toMatchObject({ level: "warn" });
    expect(f.find((x) => x.key === "cleanup")?.title).toMatch(/5,000 old rows/);
    expect(findings({ ...base, db_bytes: 505e6 }, now).find((x) => x.key === "space")?.level).toBe("bad");   // 500 MiB is the limit
  });
  it("sorts serious first", () => {
    const f = findings({ ...base, db_bytes: 505e6, records: { ...base.records, check_failed: 1 } }, now);
    expect(f.map((x) => x.level[0]).join("")).toMatch(/^b+w*o*$/);
  });
});

describe("answers without a model", () => {
  const fs = findings(base, now);
  it("answers the suggested questions from the facts", () => {
    for (const q of SUGGESTED) { const a = rulesAnswer(q, base, fs); expect(a.answer.length).toBeGreaterThan(20); expect(a.links.length).toBeGreaterThan(0); }
  });
  it("space names the real figures", () => {
    const a = rulesAnswer("How much space is left?", base, fs);
    expect(a.answer).toMatch(/68\.7 MB/); expect(a.answer).toMatch(/14%/); expect(a.answer).toMatch(/order_items/);
  });
  it("servers: says the live database stays on Supabase", () => {
    expect(rulesAnswer("Which server should I use?", base, fs).answer).toMatch(/stays on Supabase/);
    expect(rulesAnswer("which server", { ...base, servers: [cloud] }, fs).steps[0]).toMatch(/Set up your laptop/);
  });
  it("safety: serious findings come first in the answer", () => {
    const facts = { ...base, active: { ...cloud, last_backup: null }, servers: [{ ...cloud, last_backup: null }] };
    const a = rulesAnswer("Is my data safe?", facts, findings(facts, now));
    expect(a.answer).toMatch(/^Not yet/); expect(a.steps[0]).toMatch(/No backup/);
  });
  it("clean-up lists each rule and what is never cleaned", () => {
    expect(rulesAnswer("What can I clean up?", base, fs).answer).toMatch(/120 print jobs older than 30 days/);
    expect(rulesAnswer("clean", base, fs).answer).toMatch(/never cleaned/);
  });
});
