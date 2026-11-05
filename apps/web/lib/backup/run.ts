import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBackup, readBackup, verifyBackup, backupPath, stripSecrets, sha256, NEVER_EXPORTED, NOT_RESTORED, fmtBytes, type Kind, type Row, type TableDump, type FileDump, type Parsed } from "./format";
import { orderTables, withParents, toPrune, type Fk, type BackupRow } from "./plan";
import { s3Send, s3Test, withPrefix, type S3Target } from "./s3";
import { projectRef, FREE_LIMITS } from "./supabaseApi";

/**
 * Master control → Data's engine (0172). Every read and write goes through the master-only functions in 0172 and the
 * private `backups` bucket's master-only policies — with the master's own sign-in from the page, or the service role for
 * the nightly run (api/cron/backup). Nothing here writes a tenant table except a restore, through data_restore_rows.
 */
type Db = SupabaseClient;
type TableMeta = { name: string; pk: string[]; rid: boolean; columns: string[]; rows: number };
type ObjectMeta = { bucket: string; name: string; bytes: number | null; mime: string | null; public: boolean };
type Meta = { tables: TableMeta[]; fks: Fk[]; objects: ObjectMeta[] };

const PAGE = 2000;
const rpc = async <T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Run `fn` over `items`, `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function readTable(db: Db, t: TableMeta, restaurant: string | null): Promise<Row[]> {
  const rows: Row[] = [];
  for (let off = 0; ; off += PAGE) {
    const page = await rpc<Row[]>(db, "data_export_rows", { p_table: t.name, p_offset: off, p_limit: PAGE, p_restaurant: restaurant });
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** A stored file's bytes: a public bucket's from its public address (no policy in the way), a private one's with this sign-in. */
async function readObject(db: Db, o: ObjectMeta): Promise<Buffer | null> {
  if (o.public) {
    const url = db.storage.from(o.bucket).getPublicUrl(o.name).data.publicUrl;
    try { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* fall through */ }
  }
  const { data, error } = await db.storage.from(o.bucket).download(o.name);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

export type RunResult = { ok: true; id: string; path: string; size: number; raw: number; tables: number; rows: number; files: number; ms: number; skipped: number }
  | { ok: false; id: string | null; error: string; ms: number };

/** A full backup (manual / nightly) or one property's export, written to the backups bucket and recorded. */
export async function runBackup(db: Db, opts: { kind: Kind; restaurant?: { id: string; name: string; slug: string | null } | null; includeFiles: boolean; filesCapMb: number; label?: string }): Promise<RunResult> {
  const t0 = Date.now(); let id: string | null = null;
  try {
    id = await rpc<string>(db, "data_backup_log", { p_op: "start", p_id: null, p: { kind: opts.kind, label: opts.label ?? null, restaurant_id: opts.restaurant?.id ?? null } });
    const meta = await rpc<Meta>(db, "data_tables");
    const rid = opts.kind === "property" ? opts.restaurant?.id ?? null : null;
    if (opts.kind === "property" && !rid) throw new Error("Choose a property to export.");
    const chosen = meta.tables.filter((t) => !NEVER_EXPORTED.has(t.name) && (!rid || t.rid || t.name === "restaurants"));
    const dumps: TableDump[] = await pool(chosen, 4, async (t) => {
      const rows = await readTable(db, t, rid);
      return { name: t.name, pk: t.pk, rows: rid ? stripSecrets(rows) : rows };
    });
    const users = rid ? [] : await rpc<Row[]>(db, "data_auth_users");

    // the stored files — each under the cap, the lot under the cap; a private file the master cannot read is noted, not lost
    const files: FileDump[] = []; let skipped = 0;
    if (opts.includeFiles && opts.filesCapMb > 0) {
      const cap = opts.filesCapMb * 1048576; let used = 0;
      const objs = meta.objects.filter((o) => !rid || o.name.startsWith(`${rid}/`));
      for (const o of objs) {
        const bytes = Number(o.bytes ?? 0);
        if (used + bytes > cap) { files.push({ bucket: o.bucket, name: o.name, bytes, mime: o.mime, skipped: `over the ${opts.filesCapMb} MB for files` }); skipped++; continue; }
        const buf = await readObject(db, o);
        if (!buf) { files.push({ bucket: o.bucket, name: o.name, bytes, mime: o.mime, skipped: "could not be read" }); skipped++; continue; }
        used += buf.length;
        files.push({ bucket: o.bucket, name: o.name, bytes: buf.length, mime: o.mime, sha256: sha256(buf), data: buf.toString("base64") });
      }
    }

    const migrations = dumps.find((d) => d.name === "_dineflow_migrations")?.rows.map((r) => String(r.name)).sort();
    const at = new Date();
    const built = buildBackup({
      header: { created_at: at.toISOString(), kind: opts.kind, source: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), restaurant: opts.restaurant ? { id: opts.restaurant.id, name: opts.restaurant.name } : null, migration: migrations?.at(-1) ?? null },
      tables: dumps, users, files,
    });
    if (built.gz.length > FREE_LIMITS.file) throw new Error(`The backup is ${fmtBytes(built.gz.length)} — over the 50 MB a file Supabase takes. Lower the files limit or turn files off.`);
    const path = backupPath(opts.kind, at, opts.restaurant?.slug ?? opts.restaurant?.name);
    const up = await db.storage.from("backups").upload(path, built.gz, { contentType: "application/gzip", upsert: false });
    if (up.error) throw new Error(/bucket not found/i.test(up.error.message) ? "The backups bucket is missing — apply migration 0172." : up.error.message);
    await rpc(db, "data_backup_log", { p_op: "done", p_id: id, p: {
      file_path: path, size_bytes: built.gz.length, raw_bytes: built.raw, tables: dumps.length, rows_total: built.footer.rows_total,
      files: built.footer.files, files_bytes: built.footer.files_bytes, sha256: built.sha256,
      manifest: { tables: built.footer.tables, users: built.footer.users, migration: built.header.migration, skipped_files: skipped },
    } });
    return { ok: true, id, path, size: built.gz.length, raw: built.raw, tables: dumps.length, rows: built.footer.rows_total, files: built.footer.files, ms: Date.now() - t0, skipped };
  } catch (e) {
    const error = (e as Error).message || "The backup failed.";
    if (id) await db.rpc("data_backup_log", { p_op: "fail", p_id: id, p: { error } });
    return { ok: false, id, error, ms: Date.now() - t0 };
  }
}

type Stored = { id: string; kind: Kind; status: string; file_path: string | null; sha256: string | null; started_at: string };
export async function loadBackup(db: Db, id: string): Promise<{ row: Stored; buf: Buffer; parsed: Parsed }> {
  const { data: row, error } = await db.from("data_backups").select("id, kind, status, file_path, sha256, started_at").eq("id", id).maybeSingle();
  if (error || !row) throw new Error("That backup is not there any more.");
  if (row.status !== "done" || !row.file_path) throw new Error("That backup did not finish, so there is nothing to read.");
  const { data, error: dl } = await db.storage.from("backups").download(row.file_path);
  if (dl || !data) throw new Error("The backup file could not be read from storage.");
  const buf = Buffer.from(await data.arrayBuffer());
  return { row: row as Stored, buf, parsed: readBackup(buf) };
}

/** Check: the file is the one written (SHA-256), every table's rows match their checksum, every file its own. */
export async function verifyStored(db: Db, id: string) {
  let ok = false; let note = "";
  try {
    const { row, buf, parsed } = await loadBackup(db, id);
    const fileOk = !row.sha256 || sha256(buf) === row.sha256;
    const v = verifyBackup(parsed);
    ok = fileOk && v.ok;
    note = ok ? `${v.tables} tables, ${v.rows.toLocaleString("en-IN")} rows, ${v.files} files — all as written` : [fileOk ? null : "The file has changed since it was written.", ...v.problems].filter(Boolean).slice(0, 4).join(" ");
  } catch (e) { note = (e as Error).message; }
  await db.rpc("data_backup_log", { p_op: "verify", p_id: id, p: { ok, note } });
  return { ok, note };
}

/** Delete what toPrune says — the file first, then the row. */
export async function pruneBackups(db: Db, keep: number): Promise<number> {
  const { data } = await db.from("data_backups").select("id, kind, status, started_at, file_path").order("started_at", { ascending: false }).limit(500);
  const gone = toPrune((data ?? []) as BackupRow[], keep);
  if (!gone.length) return 0;
  return deleteBackups(db, gone.map((g) => g.id), gone);
}

export async function deleteBackups(db: Db, ids: string[], known?: { id: string; file_path: string | null }[]): Promise<number> {
  const rows = known ?? ((await db.from("data_backups").select("id, file_path").in("id", ids)).data ?? []);
  const paths = rows.map((r) => r.file_path).filter(Boolean) as string[];
  if (paths.length) {
    const { error } = await db.storage.from("backups").remove(paths);
    if (error) throw new Error(`The files could not be deleted: ${error.message}`);
  }
  return rpc<number>(db, "data_backup_forget", { p_ids: rows.map((r) => r.id) });
}

type Secrets = { offsite_on: boolean; kind: string; endpoint: string | null; region: string | null; bucket: string | null; prefix: string | null; key_id: string | null; secret: string | null; supabase_token: string | null };
export const secrets = (db: Db) => rpc<Secrets>(db, "data_secrets");
export function target(s: Secrets): S3Target | null {
  if (!s.endpoint || !s.bucket || !s.key_id || !s.secret) return null;
  return { endpoint: s.endpoint, region: s.region || "auto", bucket: s.bucket, keyId: s.key_id, secret: s.secret, prefix: s.prefix };
}

export async function offsiteTest(db: Db) {
  const t = target(await secrets(db));
  if (!t) return { ok: false, steps: [{ name: "Settings", ok: false, ms: 0, detail: "Fill in the address, bucket, access key and secret, and Save." }] };
  return s3Test(t);
}

export async function offsiteCopy(db: Db, id: string): Promise<{ ok: boolean; note: string }> {
  let ok = false; let note = "";
  try {
    const t = target(await secrets(db));
    if (!t) throw new Error("The off-site store is not set up.");
    const { row, buf } = await loadBackup(db, id);
    const key = withPrefix(t, row.file_path!);
    const r = await s3Send(t, "PUT", key, buf, "application/gzip");
    ok = r.ok; note = r.ok ? `${fmtBytes(buf.length)} → ${t.bucket}/${key}` : r.error ?? `failed (${r.status})`;
  } catch (e) { note = (e as Error).message; }
  await db.rpc("data_backup_log", { p_op: "offsite", p_id: id, p: { ok, note } });
  return { ok, note };
}

export type RestoreLine = { table: string; inBackup: number; missing: number; inserted: number; failed: number; error: string | null; added: boolean };
/** Preview (apply = false) or bring back (apply = true) the rows of `tables` — and of the tables they depend on — that are
 *  not in the database now. Rows already there are never touched. 500 rows a call. */
export async function restoreRows(db: Db, id: string, tables: string[], apply: boolean): Promise<{ lines: RestoreLine[]; missing: number; inserted: number; failed: number }> {
  const { parsed } = await loadBackup(db, id);
  const meta = await rpc<Meta>(db, "data_tables");
  const present = new Set([...parsed.tables.keys()].filter((t) => !NOT_RESTORED.has(t) && (parsed.tables.get(t)!.pk.length > 0)));
  const want = tables.filter((t) => present.has(t));
  const all = orderTables(withParents(want, meta.fks, present), meta.fks);
  const lines: RestoreLine[] = [];
  for (const name of all) {
    const rows = parsed.tables.get(name)!.rows;
    const line: RestoreLine = { table: name, inBackup: rows.length, missing: 0, inserted: 0, failed: 0, error: null, added: !want.includes(name) };
    for (let i = 0; i < rows.length; i += 500) {
      const r = await rpc<{ missing: number; inserted: number; failed: number; error: string | null }>(db, "data_restore_rows", { p_table: name, p_rows: rows.slice(i, i + 500), p_apply: apply });
      line.missing += r.missing; line.inserted += r.inserted; line.failed += r.failed; line.error ??= r.error;
    }
    if (!line.added || line.missing > 0) lines.push(line);
  }
  return { lines, missing: lines.reduce((s, l) => s + l.missing, 0), inserted: lines.reduce((s, l) => s + l.inserted, 0), failed: lines.reduce((s, l) => s + l.failed, 0) };
}

/** What each table holds in a backup, for Restore's checklist. */
export async function backupContents(db: Db, id: string) {
  const { parsed } = await loadBackup(db, id);
  return { header: parsed.header, tables: [...parsed.tables.values()].map((t) => ({ name: t.name, rows: t.rows.length, restorable: !NOT_RESTORED.has(t.name) && t.pk.length > 0 })).sort((a, b) => a.name.localeCompare(b.name)), users: parsed.users.length, files: parsed.files.filter((f) => f.data).length };
}
