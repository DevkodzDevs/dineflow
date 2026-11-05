import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runBackup, verifyStored, pruneBackups, deleteBackups, offsiteTest, offsiteCopy, restoreRows, backupContents, secrets } from "@/lib/backup/run";
import { supabaseBackups, projectRef } from "@/lib/backup/supabaseApi";

/**
 * Master control → Data's actions that take a while or hand back a file (0172). POST { op, … } — master only: no session
 * → 401, anyone else → 403 (the 0172 functions and the bucket's policies refuse them too). Ops:
 *   backup · verify {id} · download {id} · delete {ids} · contents {id} · restore {id, tables, apply, confirm}
 *   export {restaurant} · offsite-test · offsite-copy {id} · supabase-test · cleanup {apply, only, days}
 * 0173 (servers): servers · server-add {kind, name} → {id, token} (shown once) · server-set {id, p} · server-delete {id} ·
 *   server-rotate {id} · server-command {id, op, args} → {id} · command {id} · server-files {id} · server-commands {id} ·
 *   active-server {id | null} · records · activity
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Settings = { keep_count: number; include_files: boolean; files_cap_mb: number; offsite_on: boolean; cleanup: Record<string, { on?: boolean; days?: number }> };

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return bad("Sign in as Master control.", 401);
  const { data: isMaster } = await db.rpc("is_master");
  if (!isMaster) return bad("Master control only.", 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Bad request."); }
  const op = String(body.op ?? ""); const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  const settings = async () => { const { data, error } = await db.rpc("data_settings_get"); if (error) throw new Error(error.message); return data as Settings; };

  try {
    switch (op) {
      case "backup": {
        const s = await settings();
        const r = await runBackup(db, { kind: "manual", includeFiles: s.include_files, filesCapMb: s.files_cap_mb, label: typeof body.label === "string" ? body.label.slice(0, 80) : undefined });
        if (!r.ok) return NextResponse.json(r, { status: 500 });
        const pruned = await pruneBackups(db, s.keep_count).catch(() => 0);
        const checked = await verifyStored(db, r.id);
        const offsite = s.offsite_on ? await offsiteCopy(db, r.id) : null;
        return NextResponse.json({ ...r, pruned, checked, offsite });
      }
      case "verify": if (!id) return bad("Which backup?"); return NextResponse.json(await verifyStored(db, id));
      case "download": {
        if (!id) return bad("Which backup?");
        const { data: row } = await db.from("data_backups").select("file_path, status").eq("id", id).maybeSingle();
        if (!row?.file_path || row.status !== "done") return bad("That backup has no file.", 404);
        const name = row.file_path.split("/").pop()!;
        const { data, error } = await db.storage.from("backups").createSignedUrl(row.file_path, 600, { download: name });
        if (error || !data) return bad("The download link could not be made.", 500);
        await db.rpc("data_backup_log", { p_op: "downloaded", p_id: id, p: {} });
        return NextResponse.json({ url: data.signedUrl, name });
      }
      case "delete": {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
        if (!ids.length) return bad("Which backups?");
        return NextResponse.json({ deleted: await deleteBackups(db, ids) });
      }
      case "contents": if (!id) return bad("Which backup?"); return NextResponse.json(await backupContents(db, id));
      case "restore": {
        if (!id) return bad("Which backup?");
        const tables = Array.isArray(body.tables) ? body.tables.filter((x): x is string => typeof x === "string" && /^[a-z_][a-z0-9_]*$/.test(x)) : [];
        if (!tables.length) return bad("Choose at least one table.");
        const apply = body.apply === true;
        if (apply && body.confirm !== "RESTORE") return bad("Type RESTORE to bring the rows back.");
        return NextResponse.json(await restoreRows(db, id, tables, apply));
      }
      case "export": {
        const rid = typeof body.restaurant === "string" && UUID.test(body.restaurant) ? body.restaurant : null;
        if (!rid) return bad("Choose a property.");
        const { data: r } = await db.from("restaurants").select("id, name, slug").eq("id", rid).maybeSingle();
        if (!r) return bad("No such property.", 404);
        const s = await settings();
        const out = await runBackup(db, { kind: "property", restaurant: { id: r.id, name: r.name, slug: r.slug }, includeFiles: s.include_files, filesCapMb: s.files_cap_mb, label: r.name });
        if (!out.ok) return NextResponse.json(out, { status: 500 });
        const { data } = await db.storage.from("backups").createSignedUrl(out.path, 600, { download: out.path.split("/").pop()! });
        return NextResponse.json({ ...out, url: data?.signedUrl ?? null });
      }
      case "offsite-test": return NextResponse.json(await offsiteTest(db));
      case "offsite-copy": if (!id) return bad("Which backup?"); return NextResponse.json(await offsiteCopy(db, id));
      case "supabase-test": {
        const s = await secrets(db); const ref = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
        if (!ref) return NextResponse.json({ ok: false, status: 0, error: "This app is not on a Supabase cloud project." });
        if (!s.supabase_token) return NextResponse.json({ ok: false, status: 0, error: "Save an access token first." });
        return NextResponse.json({ ...(await supabaseBackups(s.supabase_token, ref)), ref });
      }
      case "cleanup": {
        const only = Array.isArray(body.only) ? body.only.filter((x): x is string => typeof x === "string" && /^[a-z_]+$/.test(x)) : null;
        const days = body.days && typeof body.days === "object" ? body.days : {};
        const { data, error } = await db.rpc("data_cleanup", { p_days: days, p_apply: body.apply === true, p_only: only && only.length ? only : null });
        if (error) return bad(error.message, 500);
        return NextResponse.json(data);
      }
      // ── 0173: servers ──
      case "servers": { const { data, error } = await db.rpc("data_servers_get"); if (error) return bad(error.message, 500); return NextResponse.json({ servers: data }); }
      case "server-add": {
        const kind = body.kind === "own" || body.kind === "laptop" ? body.kind : null; const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
        if (!kind) return bad("A server is your own server or a laptop."); if (name.length < 2) return bad("Give the server a name.");
        const { data, error } = await db.rpc("data_server_add", { p_kind: kind, p_name: name }); if (error) return bad(error.message, 400);
        return NextResponse.json(data);
      }
      case "server-set": { if (!id) return bad("Which server?"); const { data, error } = await db.rpc("data_server_set", { p_id: id, p: body.p ?? {} }); if (error) return bad(error.message, 400); return NextResponse.json({ servers: data }); }
      case "server-delete": { if (!id) return bad("Which server?"); if (body.confirm !== "REMOVE") return bad("Type REMOVE to remove the server."); const { data, error } = await db.rpc("data_server_delete", { p_id: id }); if (error) return bad(error.message, 400); return NextResponse.json({ servers: data }); }
      case "server-rotate": { if (!id) return bad("Which server?"); const { data, error } = await db.rpc("data_server_rotate", { p_id: id }); if (error) return bad(error.message, 400); return NextResponse.json(data); }
      case "server-command": {
        if (!id) return bad("Which server?");
        const op = typeof body.op === "string" ? body.op : ""; const args = body.args && typeof body.args === "object" ? body.args as Record<string, unknown> : {};
        if (op === "restore" && body.confirm !== "RESTORE") return bad("Type RESTORE to bring the rows back.");
        const { data, error } = await db.rpc("data_server_command", { p_id: id, p_op: op, p_args: args }); if (error) return bad(error.message, 400);
        return NextResponse.json({ id: data });
      }
      case "command": { if (!id) return bad("Which job?"); const { data, error } = await db.rpc("data_command_get", { p_id: id }); if (error) return bad(error.message, 500); if (!data) return bad("No such job.", 404); return NextResponse.json(data); }
      case "server-files": { if (!id) return bad("Which server?"); const { data, error } = await db.rpc("data_server_files", { p_id: id }); if (error) return bad(error.message, 500); return NextResponse.json({ files: data }); }
      case "server-commands": { if (!id) return bad("Which server?"); const { data, error } = await db.rpc("data_server_commands", { p_id: id, p_limit: 60 }); if (error) return bad(error.message, 500); return NextResponse.json({ commands: data }); }
      case "active-server": {
        const to = body.id === null || body.id === undefined ? null : id; if (body.id && !id) return bad("Which server?");
        const { data, error } = await db.rpc("data_active_server_set", { p_id: to }); if (error) return bad(error.message, 400); return NextResponse.json({ servers: data });
      }
      case "records": { const { data, error } = await db.rpc("data_records", { p_limit: 500 }); if (error) return bad(error.message, 500); return NextResponse.json({ records: data }); }
      case "activity": { const { data, error } = await db.rpc("data_activity", { p_limit: 200 }); if (error) return bad(error.message, 500); return NextResponse.json({ activity: data }); }
      default: return bad("Unknown action.");
    }
  } catch (e) {
    return bad((e as Error).message || "Something went wrong.", 500);
  }
}
