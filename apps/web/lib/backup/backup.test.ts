import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { buildBackup, readBackup, verifyBackup, tableHash, stripSecrets, backupPath, fmtBytes, sha256, CHUNK, NotABackup } from "./format";
import { orderTables, withParents, toPrune, type BackupRow } from "./plan";
import { sign, s3Test, s3Error, objectUrl, encodeKey, EMPTY_SHA } from "./s3";
import { supabaseBackups, projectRef } from "./supabaseApi";

const header = { created_at: "2026-11-05T02:00:00.000Z", kind: "manual" as const, source: "abcdefghijklmnopqrst", restaurant: null, migration: "0172_data_storage_backups.sql" };

describe("the backup file", () => {
  it("round-trips every table, the sign-ins and the files, and checks clean", () => {
    const orders = Array.from({ length: CHUNK + 7 }, (_, i) => ({ id: `o${i}`, total: i * 10, note: i % 3 ? null : "ok · ₹" }));
    const file = Buffer.from("logo-bytes");
    const b = buildBackup({ header, tables: [{ name: "orders", pk: ["id"], rows: orders }, { name: "plans", pk: ["key"], rows: [] }],
      users: [{ id: "u1", email: "a@b.in" }], files: [{ bucket: "brand", name: "r1/logo.png", bytes: file.length, mime: "image/png", sha256: sha256(file), data: file.toString("base64") }, { bucket: "app-files", name: "big.exe", bytes: 9e7, mime: null, skipped: "over the cap" }] });
    expect(b.sha256).toBe(sha256(b.gz));
    const p = readBackup(b.gz);
    expect(p.header.kind).toBe("manual");
    expect(p.tables.get("orders")!.rows).toEqual(orders);
    expect(p.tables.get("plans")!.rows).toEqual([]);
    expect(p.users).toHaveLength(1);
    expect(p.files.find((f) => f.name === "r1/logo.png")!.data).toBe(file.toString("base64"));
    const v = verifyBackup(p);
    expect(v).toMatchObject({ ok: true, tables: 2, rows: CHUNK + 7, files: 1 });
    expect(b.footer).toMatchObject({ rows_total: CHUNK + 7, users: 1, files: 1, files_bytes: file.length });
  });

  it("finds a changed row, a missing table, a cut-off end and a damaged file", () => {
    const b = buildBackup({ header, tables: [{ name: "t", pk: ["id"], rows: [{ id: 1 }, { id: 2 }] }], files: [{ bucket: "b", name: "f", bytes: 1, mime: null, sha256: sha256("x"), data: Buffer.from("x").toString("base64") }] });
    const p = readBackup(b.gz);
    p.tables.get("t")!.rows[1] = { id: 3 };
    expect(verifyBackup(p).problems.join(" ")).toMatch(/not the ones that were written/);
    const q = readBackup(b.gz); q.tables.delete("t");
    expect(verifyBackup(q).problems.join(" ")).toMatch(/in the summary but not in the file/);
    const r = readBackup(b.gz); r.footer = null;
    expect(verifyBackup(r).ok).toBe(false);
    const s = readBackup(b.gz); s.files[0].data = Buffer.from("y").toString("base64");
    expect(verifyBackup(s).problems.join(" ")).toMatch(/damaged/);
  });

  it("refuses a file that is not a DineFlow backup", () => {
    expect(() => readBackup(Buffer.from("plain text"))).toThrow(NotABackup);
    expect(() => readBackup(gzipSync(Buffer.from('{"type":"header","format":"other"}\n')))).toThrow(/not a DineFlow backup/);
    expect(() => readBackup(gzipSync(Buffer.from('{"type":"header","format":"dineflow-backup","version":99}\n')))).toThrow(/version 99/);
  });

  it("a table's checksum follows its rows and their order", () => {
    expect(tableHash([{ a: 1 }, { a: 2 }])).not.toBe(tableHash([{ a: 2 }, { a: 1 }]));
    expect(tableHash([])).toBe(EMPTY_SHA);
  });

  it("a one-property export leaves keys, tokens and codes out", () => {
    const [r] = stripSecrets([{ id: 1, name: "Cafe", checkin_token: "t", key_secret: "s", box_token: "b", code_hash: "h", api_key: "k", password_hint: "p", phone: "98" }]);
    expect(Object.keys(r).sort()).toEqual(["id", "name", "phone"]);
  });

  it("names the file by month, or under property/", () => {
    const at = new Date("2026-11-05T20:30:05.123Z");
    expect(backupPath("nightly", at)).toBe("2026/11/dineflow-nightly-20261105-203005.json.gz");
    expect(backupPath("property", at, "Tan Resort!")).toBe("property/tan-resort--20261105-203005.json.gz");
    expect(fmtBytes(72797331)).toBe("69.4 MB"); expect(fmtBytes(512)).toBe("512 B"); expect(fmtBytes(803840)).toBe("785 KB");
  });
});

describe("restore order and what goes", () => {
  const fks = [{ child: "order_items", parent: "orders" }, { child: "orders", parent: "restaurants" }, { child: "orders", parent: "dining_tables" }, { child: "dining_tables", parent: "restaurants" }, { child: "a", parent: "b" }, { child: "b", parent: "a" }];
  it("puts parents first and still lists a cycle", () => {
    const o = orderTables(["order_items", "orders", "restaurants", "dining_tables", "a", "b", "plans"], fks);
    expect(o.indexOf("restaurants")).toBeLessThan(o.indexOf("dining_tables"));
    expect(o.indexOf("dining_tables")).toBeLessThan(o.indexOf("orders"));
    expect(o.indexOf("orders")).toBeLessThan(o.indexOf("order_items"));
    expect(o).toHaveLength(7); expect(o.slice(-2)).toEqual(["a", "b"]);
  });
  it("adds every table a chosen one depends on, if the backup has it", () => {
    expect(withParents(["order_items"], fks).sort()).toEqual(["dining_tables", "order_items", "orders", "restaurants"]);
    expect(withParents(["order_items"], fks, new Set(["order_items", "orders"])).sort()).toEqual(["order_items", "orders"]);
  });
  it("keeps the newest N full backups; old failures and old property exports go", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    const day = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    const rows: BackupRow[] = [
      ...[0, 1, 2, 3, 4].map((d) => ({ id: `n${d}`, kind: "nightly" as const, status: "done" as const, started_at: day(d), file_path: `p${d}` })),
      { id: "m", kind: "manual", status: "done", started_at: day(1.5), file_path: "m" },
      { id: "f-old", kind: "manual", status: "failed", started_at: day(9), file_path: null },
      { id: "f-new", kind: "manual", status: "failed", started_at: day(1), file_path: null },
      { id: "x-old", kind: "property", status: "done", started_at: day(40), file_path: "x" },
      { id: "x-new", kind: "property", status: "done", started_at: day(3), file_path: "y" },
    ];
    expect(toPrune(rows, 3, now).map((r) => r.id).sort()).toEqual(["f-old", "n2", "n3", "n4", "x-old"]);
    expect(toPrune(rows, 0, now).filter((r) => r.kind === "nightly" || r.kind === "manual").length).toBeGreaterThan(0);
    expect(toPrune(rows, 0, now).some((r) => r.id === "n0")).toBe(false);   // the newest is never pruned
  });
});

describe("the off-site copy (S3 Signature V4)", () => {
  it("signs AWS's own published example exactly (GET /test.txt, bytes=0-9)", () => {
    const h = sign({ method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt", headers: { range: "bytes=0-9" }, region: "us-east-1",
      keyId: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", now: new Date("2013-05-24T00:00:00Z") });
    expect(h.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(h.authorization).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
  });
  it("addresses an object path-style and encodes the key", () => {
    expect(objectUrl({ endpoint: "https://acc.r2.cloudflarestorage.com/", region: "auto", bucket: "df", keyId: "k", secret: "s" }, "2026/11/a b+c.json.gz"))
      .toBe("https://acc.r2.cloudflarestorage.com/df/2026/11/a%20b%2Bc.json.gz");
    expect(encodeKey("x/(y)")).toBe("x/%28y%29");
  });
  it("Test connection writes, reads back and deletes against a store", async () => {
    const store = new Map<string, Buffer>(); const seen: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const m = init.method ?? "GET"; seen.push(m);
      if (!String((init.headers as Record<string, string>).authorization).startsWith("AWS4-HMAC-SHA256 Credential=key/")) return new Response("<Code>InvalidAccessKeyId</Code>", { status: 403 });
      if (m === "PUT") { store.set(url, Buffer.from(init.body as Uint8Array)); return new Response("", { status: 200 }); }
      if (m === "GET") return store.has(url) ? new Response(new Uint8Array(store.get(url)!), { status: 200 }) : new Response("<Code>NoSuchKey</Code>", { status: 404 });
      if (m === "DELETE") { store.delete(url); return new Response(null, { status: 204 }); }
      return new Response("", { status: 405 });
    }) as unknown as typeof fetch;
    const r = await s3Test({ endpoint: "https://s3.example.com", region: "auto", bucket: "b", keyId: "key", secret: "sec", prefix: "dineflow" }, fake);
    expect(r.ok).toBe(true); expect(r.steps.map((s) => s.name)).toEqual(["Write a test file", "Read it back", "Delete it"]);
    expect(seen).toEqual(["PUT", "GET", "DELETE"]); expect(store.size).toBe(0);
    const bad = await s3Test({ endpoint: "https://s3.example.com", region: "auto", bucket: "b", keyId: "nope", secret: "sec" }, fake);
    expect(bad.ok).toBe(false); expect(bad.steps).toHaveLength(1); expect(bad.steps[0].detail).toMatch(/key was refused/);
  });
  it("says what a store's refusal means", () => {
    expect(s3Error(404, "<Error><Code>NoSuchBucket</Code></Error>")).toMatch(/bucket does not exist/);
    expect(s3Error(403, "<Code>AccessDenied</Code>")).toMatch(/not allowed/);
    expect(s3Error(0, "")).toMatch(/did not answer/);
  });
});

describe("Supabase's own backups", () => {
  it("reads the project ref from the address", () => {
    expect(projectRef("https://abcdefghijklmnopqrst.supabase.co")).toBe("abcdefghijklmnopqrst");
    expect(projectRef("http://localhost:54321")).toBeNull();
  });
  it("lists a Pro plan's daily backups, newest first", async () => {
    const f = (async () => new Response(JSON.stringify({ region: "ap-south-1", pitr_enabled: false, walg_enabled: true,
      backups: [{ inserted_at: "2026-11-03T20:00:00Z", status: "COMPLETED", is_physical_backup: true }, { inserted_at: "2026-11-04T20:00:00Z", status: "COMPLETED", is_physical_backup: true }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await supabaseBackups("t", "abcdefghijklmnopqrst", f);
    expect(r.ok && r.backups[0].at).toBe("2026-11-04T20:00:00Z");
    expect(r.ok && r.region).toBe("ap-south-1");
  });
  it("turns a refused token into words", async () => {
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const r = await supabaseBackups("bad", "abcdefghijklmnopqrst", f);
    expect(r.ok).toBe(false); expect(!r.ok && r.error).toMatch(/refused/);
  });
});
