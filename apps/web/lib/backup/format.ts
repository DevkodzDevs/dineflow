import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * DineFlow's own backup file (0172, Master control → Data): one gzip of newline-separated JSON, readable with any tool.
 *
 *   {"type":"header", format, version, created_at, kind, source, restaurant, migration}
 *   {"type":"table", name, pk, rows}                      — then the table's rows in pages of CHUNK:
 *   {"type":"rows", table, rows:[…]}
 *   {"type":"users", rows:[…]}                            — the sign-in list, no password hashes (full backups only)
 *   {"type":"file", bucket, name, bytes, mime, sha256, data | skipped}   — a stored file, base64, or why it is not in
 *   {"type":"footer", tables:{name:{rows, sha256}}, users, files, files_bytes, rows_total}
 *
 * Each table's checksum is SHA-256 over its rows, each as JSON, one per line — so Check (verifyBackup) proves every row
 * came back exactly as it went in, and the file's own SHA-256 (kept in data_backups) proves the file is the one written.
 */
export const FORMAT = "dineflow-backup";
export const VERSION = 1;
export const CHUNK = 2000;

export type Kind = "manual" | "nightly" | "property";
export type Row = Record<string, unknown>;
export type TableDump = { name: string; pk: string[]; rows: Row[] };
export type FileDump = { bucket: string; name: string; bytes: number; mime: string | null; sha256?: string; data?: string; skipped?: string };
export type Header = {
  type: "header"; format: typeof FORMAT; version: number; created_at: string; kind: Kind; source: string | null;
  restaurant: { id: string; name: string } | null; migration: string | null;
};
export type TableSum = { rows: number; sha256: string };
export type Footer = { type: "footer"; tables: Record<string, TableSum>; users: number; files: number; files_bytes: number; rows_total: number };
export type Parsed = { header: Header; tables: Map<string, TableDump>; users: Row[]; files: FileDump[]; footer: Footer | null };

export const sha256 = (s: string | Buffer | Uint8Array) => createHash("sha256").update(s).digest("hex");

/** The checksum of a table: its rows as JSON, one per line, in the order they were read. */
export function tableHash(rows: Row[]): string {
  const h = createHash("sha256");
  for (const r of rows) h.update(JSON.stringify(r) + "\n");
  return h.digest("hex");
}

export function buildBackup(input: { header: Omit<Header, "type" | "format" | "version">; tables: TableDump[]; users?: Row[]; files?: FileDump[] }) {
  const header: Header = { type: "header", format: FORMAT, version: VERSION, ...input.header };
  const lines: string[] = [JSON.stringify(header)];
  const sums: Record<string, TableSum> = {};
  let total = 0;
  for (const t of input.tables) {
    lines.push(JSON.stringify({ type: "table", name: t.name, pk: t.pk, rows: t.rows.length }));
    for (let i = 0; i < t.rows.length; i += CHUNK) lines.push(JSON.stringify({ type: "rows", table: t.name, rows: t.rows.slice(i, i + CHUNK) }));
    sums[t.name] = { rows: t.rows.length, sha256: tableHash(t.rows) };
    total += t.rows.length;
  }
  const users = input.users ?? [];
  if (users.length) lines.push(JSON.stringify({ type: "users", rows: users }));
  const files = input.files ?? [];
  for (const f of files) lines.push(JSON.stringify({ type: "file", ...f }));
  const kept = files.filter((f) => f.data);
  const footer: Footer = { type: "footer", tables: sums, users: users.length, files: kept.length, files_bytes: kept.reduce((s, f) => s + f.bytes, 0), rows_total: total };
  lines.push(JSON.stringify(footer));
  const text = Buffer.from(lines.join("\n") + "\n", "utf8");
  const gz = gzipSync(text, { level: 9 });
  return { gz, raw: text.length, sha256: sha256(gz), footer, header };
}

export class NotABackup extends Error {}

export function readBackup(gz: Buffer | Uint8Array): Parsed {
  let text: string;
  try { text = gunzipSync(gz).toString("utf8"); } catch { throw new NotABackup("This file is not a DineFlow backup (it does not unzip)."); }
  const lines = text.split("\n").filter(Boolean);
  let header: Header | null = null; let footer: Footer | null = null;
  const tables = new Map<string, TableDump>(); let users: Row[] = []; const files: FileDump[] = [];
  for (const [i, line] of lines.entries()) {
    let o: Record<string, unknown>;
    try { o = JSON.parse(line); } catch { throw new NotABackup(`Line ${i + 1} of the backup is broken.`); }
    if (i === 0) {
      if (o.type !== "header" || o.format !== FORMAT) throw new NotABackup("This file is not a DineFlow backup.");
      if (Number(o.version) > VERSION) throw new NotABackup(`This backup is version ${o.version}; this app reads up to ${VERSION}.`);
      header = o as unknown as Header; continue;
    }
    if (o.type === "table") tables.set(String(o.name), { name: String(o.name), pk: (o.pk as string[]) ?? [], rows: [] });
    else if (o.type === "rows") {
      const t = tables.get(String(o.table));
      if (!t) throw new NotABackup(`Rows for ${o.table} come before its table line.`);
      for (const r of o.rows as Row[]) t.rows.push(r);
    } else if (o.type === "users") users = o.rows as Row[];
    else if (o.type === "file") { const { type: _t, ...f } = o; void _t; files.push(f as unknown as FileDump); }
    else if (o.type === "footer") footer = o as unknown as Footer;
  }
  if (!header) throw new NotABackup("This file is empty.");
  return { header, tables, users, files, footer };
}

/** Every table's rows and checksum against the footer, every file against its own checksum. */
export function verifyBackup(p: Parsed): { ok: boolean; problems: string[]; tables: number; rows: number; files: number } {
  const problems: string[] = [];
  if (!p.footer) problems.push("The end of the backup is missing — it was cut short.");
  let rows = 0;
  for (const t of p.tables.values()) {
    rows += t.rows.length;
    const want = p.footer?.tables[t.name];
    if (!want) { problems.push(`${t.name} is not in the backup's summary.`); continue; }
    if (want.rows !== t.rows.length) problems.push(`${t.name}: ${t.rows.length} rows, the summary says ${want.rows}.`);
    else if (want.sha256 !== tableHash(t.rows)) problems.push(`${t.name}: the rows are not the ones that were written.`);
  }
  if (p.footer) for (const name of Object.keys(p.footer.tables)) if (!p.tables.has(name)) problems.push(`${name} is in the summary but not in the file.`);
  if (p.footer && p.footer.users !== p.users.length) problems.push(`Sign-ins: ${p.users.length}, the summary says ${p.footer.users}.`);
  let files = 0;
  for (const f of p.files) {
    if (!f.data) continue;
    files++;
    if (f.sha256 && sha256(Buffer.from(f.data, "base64")) !== f.sha256) problems.push(`File ${f.bucket}/${f.name} is damaged.`);
  }
  if (p.footer && p.footer.files !== files) problems.push(`Files: ${files}, the summary says ${p.footer.files}.`);
  return { ok: problems.length === 0, problems, tables: p.tables.size, rows, files };
}

/** A column a one-property export leaves out: keys, tokens, codes, passwords — it may be handed to the property. */
export const SECRET_COLUMN = /(secret|token|password|passcode|otp|code_hash|api_key|key_id|webhook|private_key|signing)/i;
export const stripSecrets = (rows: Row[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLUMN.test(k))));

/** Never in a backup file: the backup settings themselves hold the off-site key and the Supabase token. */
export const NEVER_EXPORTED = new Set(["data_settings"]);

/** Never restored (the database refuses them too): sign-in state, throttles, codes, the migration list, who is master. */
export const NOT_RESTORED = new Set(["_dineflow_migrations", "platform_admins", "admin_context", "admin_session_context", "outlet_session",
  "rate_hits", "feedback_ip_hits", "data_backups", "data_settings", "storage_snapshots", "temp_passwords", "password_otps", "contact_otps", "sync_state"]);

export { fmtBytes } from "./bytes";

/** The file's place in the bucket: by month for the full ones, under property/ for an export. */
export function backupPath(kind: Kind, at: Date, slug?: string | null): string {
  const iso = at.toISOString(); const stamp = iso.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  if (kind === "property") return `property/${(slug || "property").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-${stamp}.json.gz`;
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/dineflow-${kind}-${stamp}.json.gz`;
}
