#!/usr/bin/env node
/**
 * DineFlow data node — runs on your own server or your laptop and keeps DineFlow's backups there. (0173, 2026-11-05)
 *
 * One file, Node 20 or newer, nothing to install. It never opens a port and never holds the database password: every
 * minute it asks the cloud "anything for me?" with its token (data_node_call), does what Master control queued — a backup,
 * a check, a delete, a prune, a restore, a report — and tells the cloud what happened. Backups are read straight from the
 * database by token (table by table, 2 000 rows a page) and written to this machine's disk as DineFlow backup files
 * (gzip of newline JSON, every table with a SHA-256, the sign-in list without password hashes, the public files).
 *
 * Settings — a `.env` beside this file, or environment variables:
 *   DINEFLOW_URL            https://<project>.supabase.co
 *   DINEFLOW_ANON_KEY       the project's anon key (public)
 *   DINEFLOW_NODE_TOKEN     this server's token (Master control → Data → Servers → Add; shown once)
 *   DINEFLOW_NODE_DIR       where backups go (default: ./dineflow-backups beside this file)
 *   DINEFLOW_POLL_SECONDS   how often to ask the cloud (default 60)
 *   DINEFLOW_NIGHTLY_HOUR   the hour (this machine's clock) for the nightly backup (default 2)
 *   DINEFLOW_FILES_DIR      where the copied photos and documents go when that switch is on for this server (0189; default ./dineflow-files)
 *   DINEFLOW_CLOUD_URL      the app's own address, e.g. https://www.dineflow.cloud — private files (documents, attendance) come through it (0189)
 * Run:  node dineflow-data-node.mjs            Check:  node dineflow-data-node.mjs --check
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, appendFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

export const VERSION = "1.2.0";
const FORMAT = "dineflow-backup", FORMAT_VERSION = 1, PAGE = 2000, CHUNK = 2000, RESTORE_CHUNK = 500;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── settings ──
function loadEnv() {
  const f = path.join(HERE, ".env");
  if (existsSync(f)) for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line); if (!m || line.trim().startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const e = process.env;
  return {
    url: (e.DINEFLOW_URL ?? "").replace(/\/$/, ""), anon: e.DINEFLOW_ANON_KEY ?? "", token: e.DINEFLOW_NODE_TOKEN ?? "",
    dir: path.resolve(e.DINEFLOW_NODE_DIR || path.join(HERE, "dineflow-backups")),
    filesDir: path.resolve(e.DINEFLOW_FILES_DIR || path.join(HERE, "dineflow-files")), cloud: String(e.DINEFLOW_CLOUD_URL ?? "").replace(/\/$/, ""),
    poll: Math.max(15, Number(e.DINEFLOW_POLL_SECONDS) || 60), nightlyHour: Math.min(23, Math.max(0, Number(e.DINEFLOW_NIGHTLY_HOUR ?? 2))),
  };
}
const cfg = loadEnv();

// ── log ──
const log = (...a) => {
  const line = `${new Date().toISOString()} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`;
  console.log(line);
  try { mkdirSync(cfg.dir, { recursive: true }); appendFileSync(path.join(cfg.dir, "node.log"), line + "\n"); } catch { /* the console has it */ }
};

// ── the cloud ──
export async function call(fn, args = {}, c = cfg) {
  const r = await fetch(`${c.url}/rest/v1/rpc/data_node_call`, {
    method: "POST", headers: { apikey: c.anon, authorization: `Bearer ${c.anon}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: c.token, p_fn: fn, p_args: args }), signal: AbortSignal.timeout(120_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || j?.hint || `the cloud answered ${r.status}`);
  if (j && typeof j === "object" && !Array.isArray(j) && j.error) throw new Error(j.error);
  return j;
}

// ── the backup file (the same shape apps/web/lib/backup/format.ts writes and reads) ──
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export function tableHash(rows) { const h = createHash("sha256"); for (const r of rows) h.update(JSON.stringify(r) + "\n"); return h.digest("hex"); }
export function buildBackup({ header, tables, users = [], files = [] }) {
  const lines = [JSON.stringify({ type: "header", format: FORMAT, version: FORMAT_VERSION, ...header })];
  const sums = {}; let total = 0;
  for (const t of tables) {
    lines.push(JSON.stringify({ type: "table", name: t.name, pk: t.pk, rows: t.rows.length }));
    for (let i = 0; i < t.rows.length; i += CHUNK) lines.push(JSON.stringify({ type: "rows", table: t.name, rows: t.rows.slice(i, i + CHUNK) }));
    sums[t.name] = { rows: t.rows.length, sha256: tableHash(t.rows) }; total += t.rows.length;
  }
  if (users.length) lines.push(JSON.stringify({ type: "users", rows: users }));
  for (const f of files) lines.push(JSON.stringify({ type: "file", ...f }));
  const kept = files.filter((f) => f.data);
  const footer = { type: "footer", tables: sums, users: users.length, files: kept.length, files_bytes: kept.reduce((s, f) => s + f.bytes, 0), rows_total: total };
  lines.push(JSON.stringify(footer));
  const raw = Buffer.from(lines.join("\n") + "\n", "utf8"); const gz = gzipSync(raw, { level: 9 });
  return { gz, raw: raw.length, sha256: sha256(gz), footer };
}
export function readBackup(gz) {
  let text; try { text = gunzipSync(gz).toString("utf8"); } catch { throw new Error("not a DineFlow backup (it does not unzip)"); }
  const lines = text.split("\n").filter(Boolean); let header = null, footer = null; const tables = new Map(); let users = []; const files = [];
  lines.forEach((line, i) => {
    const o = JSON.parse(line);
    if (i === 0) { if (o.type !== "header" || o.format !== FORMAT) throw new Error("not a DineFlow backup"); header = o; return; }
    if (o.type === "table") tables.set(o.name, { name: o.name, pk: o.pk ?? [], rows: [] });
    else if (o.type === "rows") tables.get(o.table).rows.push(...o.rows);
    else if (o.type === "users") users = o.rows;
    else if (o.type === "file") files.push(o);
    else if (o.type === "footer") footer = o;
  });
  if (!header) throw new Error("empty file");
  return { header, tables, users, files, footer };
}
export function verifyBackup(p) {
  const problems = [];
  if (!p.footer) problems.push("cut short — no footer");
  let rows = 0;
  for (const t of p.tables.values()) {
    rows += t.rows.length; const w = p.footer?.tables[t.name];
    if (!w) { problems.push(`${t.name}: not in the summary`); continue; }
    if (w.rows !== t.rows.length) problems.push(`${t.name}: ${t.rows.length} rows, summary says ${w.rows}`);
    else if (w.sha256 !== tableHash(t.rows)) problems.push(`${t.name}: rows differ from what was written`);
  }
  if (p.footer) for (const n of Object.keys(p.footer.tables)) if (!p.tables.has(n)) problems.push(`${n}: in the summary, not in the file`);
  let files = 0;
  for (const f of p.files) { if (!f.data) continue; files++; if (f.sha256 && sha256(Buffer.from(f.data, "base64")) !== f.sha256) problems.push(`file ${f.bucket}/${f.name} damaged`); }
  if (p.footer && p.footer.files !== files) problems.push(`files: ${files}, summary says ${p.footer.files}`);
  return { ok: problems.length === 0, problems, tables: p.tables.size, rows, files };
}
const NEVER_EXPORTED = new Set(["data_settings"]);
const SECRET_COLUMN = /(secret|token|password|passcode|otp|code_hash|api_key|key_id|webhook|private_key|signing)/i;
const stripSecrets = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLUMN.test(k))));
export function backupName(kind, at, slug) {
  const iso = at.toISOString(); const stamp = iso.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  if (kind === "property") return `property/${(slug || "property").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-${stamp}.json.gz`;
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/dineflow-${kind}-${stamp}.json.gz`;
}

// ── what is on this disk ──
const META = () => path.join(cfg.dir, "inventory.json");
let meta = { files: {}, lastNightlyDay: null };
function loadMeta() { try { meta = { files: {}, lastNightlyDay: null, ...JSON.parse(readFileSync(META(), "utf8")) }; } catch { meta = { files: {}, lastNightlyDay: null }; } }
function saveMeta() { try { mkdirSync(cfg.dir, { recursive: true }); writeFileSync(META(), JSON.stringify(meta, null, 1)); } catch (e) { log("could not save inventory.json:", e.message); } }
function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n); const st = statSync(p);
    if (st.isDirectory()) walk(p, base, out);
    else if (n.endsWith(".json.gz")) out.push({ name: path.relative(base, p).split(path.sep).join("/"), size: st.size, mtime: st.mtimeMs });
  }
  return out;
}
/** The inventory the cloud sees: every file, its size and checksum (cached by size + mtime), when it was checked. */
export function inventory() {
  const seen = new Set(); const list = [];
  for (const f of walk(cfg.dir)) {
    seen.add(f.name);
    const m = meta.files[f.name] ?? {};
    if (m.size !== f.size || m.mtime !== f.mtime || !m.sha256) {
      try { m.sha256 = sha256(readFileSync(path.join(cfg.dir, f.name))); } catch { m.sha256 = null; }
      m.size = f.size; m.mtime = f.mtime; m.stored_at ??= new Date(f.mtime).toISOString(); m.verified_at = null; m.verify_ok = null;
      meta.files[f.name] = m;
    }
    list.push({ name: f.name, size_bytes: f.size, sha256: m.sha256, stored_at: m.stored_at, verified_at: m.verified_at ?? null, verify_ok: m.verify_ok ?? null, verify_note: m.verify_note ?? null, backup_id: m.backup_id ?? null, kind: m.kind ?? null });
  }
  for (const n of Object.keys(meta.files)) if (!seen.has(n)) delete meta.files[n];
  saveMeta();
  return list;
}
const fullBackups = () => inventory().filter((f) => !f.name.startsWith("property/")).sort((a, b) => (b.stored_at ?? "").localeCompare(a.stored_at ?? ""));

async function report() {
  let disk = {};
  try { const s = await statfs(cfg.dir); disk = { disk_total: Number(s.blocks) * Number(s.bsize), disk_free: Number(s.bavail) * Number(s.bsize) }; } catch { /* some file systems do not say */ }
  return {
    host: os.hostname(), platform: process.platform, os: `${os.type()} ${os.release()}`, arch: os.arch(), node: process.version, cpus: os.cpus().length,
    load: os.loadavg().map((x) => Math.round(x * 100) / 100), mem_total: os.totalmem(), mem_free: os.freemem(), uptime_s: Math.round(os.uptime()),
    dir: cfg.dir, files_dir: cfg.filesDir, mirrored: mirrorStats(loadFilesIndex()), mirror_last: lastMirror,
    started_at: STARTED, poll_seconds: cfg.poll, nightly_hour: cfg.nightlyHour, last_error: lastError, ...disk,
  };
}
const STARTED = new Date().toISOString(); let lastError = null, lastMirror = null;

// ── the jobs ──
// A page that hits the database's statement timeout (the node reads as anon: 3 s) is fetched again in two halves, down to 250 rows —
// a big table on a slow moment then costs a few more calls instead of a failed backup (seen once from a container, 2026-11-22).
async function rowsPage(table, offset, limit, restaurant) {
  try { return await call("rows", { table, offset, limit, restaurant }); }
  catch (e) {
    if (!/timeout/i.test(e.message) || limit <= 250) throw e;
    const half = limit / 2; log(`${table}: a page of ${limit} timed out — trying ${half}`);
    const a = await rowsPage(table, offset, half, restaurant); if (a.length < half) return a;
    return a.concat(await rowsPage(table, offset + half, half, restaurant));
  }
}
async function readTable(t, restaurant) {
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    const page = await rowsPage(t.name, off, PAGE, restaurant);
    rows.push(...page); if (page.length < PAGE) return rows;
  }
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

export async function runBackup({ kind = "manual", label = null, restaurant = null, settings = {} }) {
  const t0 = Date.now(); let id = null;
  try {
    id = await call("log", { op: "start", p: { kind, label, restaurant_id: restaurant?.id ?? null } });
    const m = await call("tables");
    const rid = kind === "property" ? restaurant?.id ?? null : null;
    const chosen = m.tables.filter((t) => !NEVER_EXPORTED.has(t.name) && (!rid || t.rid || t.name === "restaurants"));
    const dumps = await pool(chosen, 4, async (t) => ({ name: t.name, pk: t.pk, rows: rid ? stripSecrets(await readTable(t, rid)) : await readTable(t, rid) }));
    const users = rid ? [] : await call("users");
    const files = []; let skipped = 0;
    const cap = (settings.include_files === false ? 0 : (settings.files_cap_mb ?? 25)) * 1048576; let used = 0;
    if (cap > 0) for (const o of m.objects.filter((o) => o.public && (!rid || o.name.startsWith(`${rid}/`)))) {
      const bytes = Number(o.bytes ?? 0);
      if (used + bytes > cap) { files.push({ bucket: o.bucket, name: o.name, bytes, mime: o.mime, skipped: `over the files limit` }); skipped++; continue; }
      try {
        const r = await fetch(`${cfg.url}/storage/v1/object/public/${o.bucket}/${o.name.split("/").map(encodeURIComponent).join("/")}`, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(String(r.status));
        const buf = Buffer.from(await r.arrayBuffer()); used += buf.length;
        files.push({ bucket: o.bucket, name: o.name, bytes: buf.length, mime: o.mime, sha256: sha256(buf), data: buf.toString("base64") });
      } catch { files.push({ bucket: o.bucket, name: o.name, bytes, mime: o.mime, skipped: "could not be read" }); skipped++; }
    }
    const at = new Date();
    const migration = dumps.find((d) => d.name === "_dineflow_migrations")?.rows.map((r) => String(r.name)).sort().at(-1) ?? null;
    const built = buildBackup({ header: { created_at: at.toISOString(), kind, source: cfg.url.match(/https:\/\/([a-z0-9]{20})\./)?.[1] ?? null, restaurant: restaurant ? { id: restaurant.id, name: restaurant.name } : null, migration, node: os.hostname() }, tables: dumps, users, files });
    const name = backupName(kind, at, restaurant?.slug ?? restaurant?.name);
    const full = path.join(cfg.dir, name); mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full + ".part", built.gz); renameSync(full + ".part", full);
    const check = verifyBackup(readBackup(readFileSync(full)));
    const st = statSync(full);
    meta.files[name] = { size: st.size, mtime: st.mtimeMs, sha256: built.sha256, stored_at: at.toISOString(), verified_at: new Date().toISOString(), verify_ok: check.ok, verify_note: check.ok ? `${check.tables} tables, ${check.rows} rows, ${check.files} files — all as written` : check.problems.slice(0, 3).join("; "), backup_id: id, kind };
    saveMeta();
    await call("log", { op: "done", id, p: { file_path: name, size_bytes: built.gz.length, raw_bytes: built.raw, tables: dumps.length, rows_total: built.footer.rows_total, files: built.footer.files, files_bytes: built.footer.files_bytes, sha256: built.sha256, manifest: { tables: built.footer.tables, users: built.footer.users, migration, skipped_files: skipped, node: os.hostname() } } });
    await call("log", { op: "verify", id, p: { ok: check.ok, note: meta.files[name].verify_note } });
    log(`backup ${name}: ${dumps.length} tables, ${built.footer.rows_total} rows, ${built.footer.files} files, ${(built.gz.length / 1048576).toFixed(2)} MB, ${Date.now() - t0} ms`);
    return { ok: true, backup_id: id, name, size_bytes: built.gz.length, rows_total: built.footer.rows_total, tables: dumps.length, files: built.footer.files, checked: check.ok, ms: Date.now() - t0 };
  } catch (e) {
    lastError = `${new Date().toISOString()} backup: ${e.message}`; log("backup failed:", e.message);
    if (id) await call("log", { op: "fail", id, p: { error: e.message } }).catch(() => {});
    throw e;
  }
}

export function verifyFiles(names) {
  const list = inventory(); const out = { checked: 0, ok: 0, bad: [] };
  for (const f of list) {
    if (names?.length && !names.includes(f.name)) continue;
    out.checked++;
    let res;
    try { res = verifyBackup(readBackup(readFileSync(path.join(cfg.dir, f.name)))); } catch (e) { res = { ok: false, problems: [e.message] }; }
    const m = meta.files[f.name]; m.verified_at = new Date().toISOString(); m.verify_ok = res.ok; m.verify_note = res.ok ? `${res.tables} tables, ${res.rows} rows, ${res.files} files — all as written` : res.problems.slice(0, 3).join("; ");
    if (res.ok) out.ok++; else out.bad.push({ name: f.name, note: m.verify_note });
  }
  saveMeta(); return out;
}
export function deleteFiles(names) {
  const deleted = [];
  for (const n of names ?? []) {
    if (n.includes("..") || path.isAbsolute(n)) continue;
    const p = path.join(cfg.dir, n);
    if (existsSync(p)) { unlinkSync(p); deleted.push(n); delete meta.files[n]; }
  }
  saveMeta(); return { deleted };
}
export function prune(keep) {
  const k = Math.max(1, Number(keep) || 30);
  return deleteFiles(fullBackups().slice(k).map((f) => f.name));
}
export async function restore(cmd) {
  const { backup, tables } = cmd.args; const apply = cmd.op === "restore";
  const p = readBackup(readFileSync(path.join(cfg.dir, backup)));
  const lines = []; let missing = 0, inserted = 0, failed = 0;
  for (const name of tables ?? []) {
    const t = p.tables.get(name); if (!t) { lines.push({ table: name, inBackup: 0, missing: 0, inserted: 0, failed: 0, error: "not in this backup" }); continue; }
    const line = { table: name, inBackup: t.rows.length, missing: 0, inserted: 0, failed: 0, error: null };
    for (let i = 0; i < t.rows.length; i += RESTORE_CHUNK) {
      const r = await call("restore", { command: cmd.id, table: name, rows: t.rows.slice(i, i + RESTORE_CHUNK), apply });
      line.missing += r.missing; line.inserted += r.inserted; line.failed += r.failed; line.error ??= r.error;
    }
    lines.push(line); missing += line.missing; inserted += line.inserted; failed += line.failed;
  }
  return { lines, missing, inserted, failed, apply };
}

async function runCommand(cmd, server, settings) {
  log(`job ${cmd.op} ${cmd.id}`, cmd.args);
  switch (cmd.op) {
    case "backup": return runBackup({ kind: cmd.args.kind ?? "manual", label: cmd.args.label ?? null, restaurant: cmd.args.restaurant ?? null, settings });
    case "verify": return verifyFiles(cmd.args.names);
    case "delete": return deleteFiles(cmd.args.names);
    case "prune": return prune(cmd.args.keep ?? server.keep_count);
    case "restore": case "restore_preview": return restore(cmd);
    case "report": return { report: await report(), files: inventory().length };
    case "mirror": return runMirror(server);   // 0189: copy the chosen buckets' files to this server
    default: throw new Error(`unknown job ${cmd.op}`);
  }
}

// ── the mirror (0189): this server's copy of every stored file in the buckets it was set to keep ──
// index.json remembers what was copied (the cloud's size and updated_at); a changed file is fetched again, one that left the cloud stays
// here (a copy is a copy) and is only no longer counted as the cloud's. Public buckets come straight from storage; private ones through
// the app's own route with this node's token — it answers 503 until the service-role key is on Vercel, and those files wait.
const FILES_INDEX = () => path.join(cfg.filesDir, "index.json");
let filesIndex = null;
export function loadFilesIndex() {
  if (filesIndex) return filesIndex;
  try { filesIndex = JSON.parse(readFileSync(FILES_INDEX(), "utf8")); if (!filesIndex || typeof filesIndex !== "object") filesIndex = {}; } catch { filesIndex = {}; }
  return filesIndex;
}
function saveFilesIndex() { try { mkdirSync(cfg.filesDir, { recursive: true }); writeFileSync(FILES_INDEX(), JSON.stringify(filesIndex, null, 1)); } catch (e) { log("could not save the files index:", e.message); } }
/** Which of the cloud's files this server does not have yet, or holds an older copy of. Pure — tested from apps/web. */
export function mirrorPlan(list, index) { return list.filter((f) => { const m = index?.[f.key]; return !m || m.size !== f.size || m.updated_at !== f.updated_at; }); }
/** What this server holds: copied files and their bytes. */
export function mirrorStats(index) { let files = 0, bytes = 0; for (const m of Object.values(index ?? {})) { files++; bytes += Number(m.size) || 0; } return { files, bytes }; }
/** A safe place under the files folder for a cloud object: never a step outside it, however the name is spelt. */
export function mirrorPath(root, bucket, name) {
  const parts = String(name).split("/").filter((x) => x && x !== "." && x !== "..");
  if (!parts.length) throw new Error("empty name");
  const base = path.join(root, bucket), dest = path.join(base, ...parts);
  if (dest !== base && !dest.startsWith(base + path.sep)) throw new Error("bad name " + name);
  return dest;
}
async function fetchObject(f) {
  if (!f.public && !cfg.cloud) return { skipped: "DINEFLOW_CLOUD_URL is not set beside this node" };
  const url = f.public ? `${cfg.url}/storage/v1/object/public/${f.bucket}/${f.name.split("/").map(encodeURIComponent).join("/")}`
    : `${cfg.cloud}/api/data-node/object?bucket=${encodeURIComponent(f.bucket)}&name=${encodeURIComponent(f.name)}`;
  const r = await fetch(url, { headers: f.public ? {} : { "x-dineflow-node": cfg.token }, signal: AbortSignal.timeout(120_000) });
  if (r.status === 503 && !f.public) { const j = await r.json().catch(() => ({})); return { skipped: j?.error || "the cloud cannot hand out private files yet" }; }
  if (!r.ok) throw new Error(`${f.bucket}/${f.name}: the cloud answered ${r.status}`);
  return { bytes: Buffer.from(await r.arrayBuffer()) };
}
export async function runMirror(server) {
  const buckets = Array.isArray(server?.mirror_buckets) ? server.mirror_buckets : [];
  loadFilesIndex(); mkdirSync(cfg.filesDir, { recursive: true });
  const out = { at: new Date().toISOString(), files: 0, bytes: 0, copied: 0, copied_bytes: 0, skipped_private: 0, failed: 0, note: null, buckets: {} };
  let privateNote = null;
  for (const bucket of buckets) {
    const seen = []; let after = "", exists = true;
    for (;;) {
      const page = await call("mirror_list", { bucket, after });
      if (!page?.exists) { exists = false; break; }
      for (const f of page.files) seen.push({ key: `${bucket}/${f.name}`, bucket, name: f.name, size: Number(f.size) || 0, updated_at: f.updated_at, public: !!page.public });
      if (page.files.length < 1000) break;
      after = page.files[page.files.length - 1].name;
    }
    let copied = 0;
    for (const f of mirrorPlan(seen, filesIndex)) {
      if (!f.public && privateNote) { out.skipped_private++; continue; }
      try {
        const r = await fetchObject(f);
        if (r.skipped) { privateNote = r.skipped; out.skipped_private++; continue; }
        const dest = mirrorPath(cfg.filesDir, f.bucket, f.name); mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, r.bytes);
        filesIndex[f.key] = { size: f.size, updated_at: f.updated_at, copied_at: new Date().toISOString() };
        copied++; out.copied++; out.copied_bytes += r.bytes.length;
      } catch (e) { out.failed++; log(`mirror ${f.key} failed:`, e.message); }
    }
    out.buckets[bucket] = { exists, in_cloud: seen.length, copied_now: copied };
    saveFilesIndex();
  }
  const st = mirrorStats(filesIndex); out.files = st.files; out.bytes = st.bytes;
  if (out.skipped_private) out.note = `${out.skipped_private} private file${out.skipped_private === 1 ? "" : "s"} waiting: ${privateNote}`;
  log(`mirror: ${out.copied} copied (${out.copied_bytes} bytes), ${out.skipped_private} waiting, ${out.failed} failed — ${out.files} files on this server`);
  lastMirror = out;
  return out;
}

// ── the loop ──
let deletedSinceLastPoll = [];
export async function tick() {
  const files = inventory();
  const r = await call("poll", { version: VERSION, report: await report(), files, deleted: deletedSinceLastPoll });
  deletedSinceLastPoll = [];
  const { server, settings, commands } = r;
  for (const cmd of commands ?? []) {
    try {
      const result = await runCommand(cmd, server, settings);
      if (result?.deleted) deletedSinceLastPoll.push(...result.deleted);
      await call("done", { id: cmd.id, ok: true, result });
    } catch (e) {
      lastError = `${new Date().toISOString()} ${cmd.op}: ${e.message}`; log(`job ${cmd.op} failed:`, e.message);
      await call("done", { id: cmd.id, ok: false, error: e.message }).catch(() => {});
    }
  }
  // the nightly, on this machine's clock: once a day, from the set hour, unless paused or switched off for this server
  const now = new Date(); const day = now.toISOString().slice(0, 10);
  if (server.nightly && !server.paused && now.getHours() >= cfg.nightlyHour && meta.lastNightlyDay !== day) {
    meta.lastNightlyDay = day; saveMeta();
    try { await runBackup({ kind: "nightly", settings }); const pr = prune(server.keep_count); deletedSinceLastPoll.push(...pr.deleted); if (pr.deleted.length) log(`pruned ${pr.deleted.length} to keep ${server.keep_count}`); }
    catch { /* logged inside */ }
    // 0189: the files follow the nightly backup when that switch is on; the result rides along in the next poll's report
    if (server.mirror_files) { try { await runMirror(server); } catch (e) { lastError = `${new Date().toISOString()} mirror: ${e.message}`; log("nightly mirror failed:", e.message); } }
  }
  return r;
}

async function main() {
  const missing = ["url", "anon", "token"].filter((k) => !cfg[k]);
  if (missing.length) { console.error(`Missing ${missing.map((k) => ({ url: "DINEFLOW_URL", anon: "DINEFLOW_ANON_KEY", token: "DINEFLOW_NODE_TOKEN" })[k]).join(", ")} — put them in .env beside this file.`); process.exit(2); }
  mkdirSync(cfg.dir, { recursive: true }); loadMeta();
  if (process.argv.includes("--check")) {
    try { const r = await call("poll", { version: VERSION, report: await report(), files: inventory() }); console.log(`Connected as "${r.server.name}" (${r.server.kind}). Backups go to ${cfg.dir}. ${r.commands.length} job(s) waiting.`); process.exit(0); }
    catch (e) { console.error("Not connected:", e.message); process.exit(1); }
  }
  log(`DineFlow data node ${VERSION} on ${os.hostname()} — backups in ${cfg.dir}, files in ${cfg.filesDir}, asking the cloud every ${cfg.poll}s`);
  for (;;) {
    try { const r = await tick(); if (r?.server?.paused) log("paused in Master control — waiting"); lastError = lastError && Date.now() - Date.parse(lastError.slice(0, 24)) > 3600_000 ? null : lastError; }
    catch (e) { lastError = `${new Date().toISOString()} poll: ${e.message}`; log("poll failed:", e.message); }
    await new Promise((res) => setTimeout(res, cfg.poll * 1000));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
