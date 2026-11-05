import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { askJson, aiEnabled, VOICE } from "@/lib/ai";
import { FREE_LIMITS } from "./supabaseApi";
import { findings, rulesAnswer, SUGGESTED } from "./advisor-rules";
export { findings, rulesAnswer, SUGGESTED };

/**
 * The Data advisor (0173): looks at the whole picture — storage, servers, backups, clean-up, health — and says what to do.
 * The findings are rules and run every time (no key needed). With ANTHROPIC_API_KEY the question is answered by the model
 * over the same facts and findings; without it, the question is matched to the findings and answered from them. The advisor
 * never writes anything: every step it suggests is a link to the screen where a person presses the button.
 */
type Db = SupabaseClient;
type Server = { id: string; kind: string; name: string; online: boolean; active: boolean; paused: boolean; nightly: boolean; keep_count: number; backups: number; files: number; files_bytes: number; failed_24h: number; queued: number; last_seen_at: string | null;
  last_backup: { at: string; verify_ok: boolean | null; size_bytes: number | null } | null; last_report: { disk_free?: number; disk_total?: number; last_error?: string | null; host?: string } | null };
export type Facts = {
  at: string; db_bytes: number; files_bytes: number; rows: number; tables: number; users: number; properties: number; demos: number; top_tables: { name: string; bytes: number; rows: number }[];
  growth_per_day: number | null; days_to_full: number | null; servers: Server[]; active: Server;
  settings: { nightly: boolean; keep_count: number; include_files: boolean; offsite_on: boolean; offsite_kind: string; last_download_at: string | null; cleanup: Record<string, { on?: boolean; days?: number }> };
  env: { cron: boolean; serviceRole: boolean; ai: boolean };
  cleanup: { total: number; rules: Record<string, { rows: number; days: number }> };
  health: { connections: number; max_connections: number; cache_heap: number | null; longest_s: number; deadlocks: number; xid_pct: number; unused_indexes: number; dead_rows_top: { name: string; dead: number }[] } | null;
  records: { done: number; failed_7d: number; unchecked: number; check_failed: number; file_gone: number; last_nightly_at: string | null };
};
export type Finding = { level: "ok" | "warn" | "bad"; key: string; title: string; detail: string; fix?: string; href?: string };

const rpc = async <T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T | null> => { const { data, error } = await db.rpc(fn, args); return error ? null : (data as T); };

export async function collectFacts(db: Db, env: { cron: boolean; serviceRole: boolean }): Promise<Facts> {
  type Ov = { at: string; db_bytes: number; files_bytes: number; rows: number; users: number; tables: { name: string; bytes: number; rows: number }[]; properties: { demo: boolean }[]; history: { day: string; db_bytes: number }[] };
  const [ov, servers, settings, cleanup, health, records] = await Promise.all([
    rpc<Ov>(db, "data_overview"), rpc<Server[]>(db, "data_servers_get"), rpc<Facts["settings"]>(db, "data_settings_get"),
    rpc<{ total: number; rules: Record<string, { rows: number; days: number }> }>(db, "data_cleanup", { p_days: {}, p_apply: false, p_only: null }),
    rpc<{ connections: number; max_connections: number; cache_heap: number | null; longest_s: number; db: { deadlocks: number }; xid_age: number; unused_indexes: { count: number }; vacuum: { name: string; dead: number }[] }>(db, "data_server"),
    rpc<{ status: string; kind: string; started_at: string; verify_ok: boolean | null; on_disk: boolean | null }[]>(db, "data_records", { p_limit: 300 }),
  ]);
  const h = ov?.history ?? []; let growth: number | null = null, full: number | null = null;
  if (h.length >= 2) { const a = h[0], b = h[h.length - 1]; const days = Math.max(1, (Date.parse(b.day) - Date.parse(a.day)) / 86400000); growth = (Number(b.db_bytes) - Number(a.db_bytes)) / days; full = growth > 0 ? Math.round((FREE_LIMITS.db - Number(b.db_bytes)) / growth) : null; }
  const srv = servers ?? []; const active = srv.find((x) => x.active) ?? srv[0];
  const rec = records ?? []; const week = Date.now() - 7 * 86400000;
  return {
    at: ov?.at ?? new Date().toISOString(), db_bytes: ov?.db_bytes ?? 0, files_bytes: ov?.files_bytes ?? 0, rows: ov?.rows ?? 0, tables: ov?.tables.length ?? 0, users: ov?.users ?? 0,
    properties: ov?.properties.length ?? 0, demos: ov?.properties.filter((p) => p.demo).length ?? 0, top_tables: (ov?.tables ?? []).slice(0, 5).map((t) => ({ name: t.name, bytes: t.bytes, rows: t.rows })),
    growth_per_day: growth, days_to_full: full, servers: srv, active,
    settings: settings ?? { nightly: true, keep_count: 14, include_files: true, offsite_on: false, offsite_kind: "none", last_download_at: null, cleanup: {} },
    env: { cron: env.cron, serviceRole: env.serviceRole, ai: aiEnabled() },
    cleanup: cleanup ?? { total: 0, rules: {} },
    health: health ? { connections: health.connections, max_connections: health.max_connections, cache_heap: health.cache_heap, longest_s: health.longest_s, deadlocks: health.db?.deadlocks ?? 0, xid_pct: (health.xid_age / 2e9) * 100, unused_indexes: health.unused_indexes?.count ?? 0, dead_rows_top: (health.vacuum ?? []).slice(0, 3) } : null,
    records: { done: rec.filter((r) => r.status === "done").length, failed_7d: rec.filter((r) => r.status === "failed" && Date.parse(r.started_at) > week).length, unchecked: rec.filter((r) => r.status === "done" && r.verify_ok == null).length,
      check_failed: rec.filter((r) => r.verify_ok === false).length, file_gone: rec.filter((r) => r.on_disk === false).length, last_nightly_at: rec.find((r) => r.kind === "nightly" && r.status === "done")?.started_at ?? null },
  };
}

const Answer = z.object({ answer: z.string(), steps: z.array(z.string()).max(6), links: z.array(z.object({ label: z.string(), href: z.string() })).max(4) });
export type Reply = z.infer<typeof Answer> & { source: "model" | "rules" };

export async function advise(question: string, f: Facts, fs: Finding[]): Promise<Reply> {
  const q = question.trim().slice(0, 400);
  if (aiEnabled()) {
    const r = await askJson({
      schema: Answer, effort: "medium", maxTokens: 2500,
      system: `You are DineFlow's data advisor for the owner of a small hospitality platform in India (restaurants and hotels). You read facts about their database, backups and servers and answer plainly. ${VOICE} Rules: never invent a figure — use only the facts given; name the screen for every step (the links are the only screens that exist: /admin/data Overview, /admin/data/servers Servers, /admin/data/backups Backups, /admin/data/records Records, /admin/data/restore Restore, /admin/data/health Database health, /admin/data/cleanup Clean-up, /admin/data/offsite Outside copies & plans). Everything free comes first; paid options (Supabase Pro $25 a month, Amazon S3) are mentioned only when they are the honest answer. Keep "answer" to four sentences at most; "steps" are short imperative lines; "links" are from the list above. Money in rupees or dollars as given. The live database always stays on Supabase — a "server" only holds backups.`,
      user: `Question: ${q}\n\nFacts (JSON): ${JSON.stringify(f)}\n\nFindings already worked out, most serious first (JSON): ${JSON.stringify(fs)}`,
    });
    if (r.ok) return { ...r.data, source: "model" };
  }
  return { ...rulesAnswer(q, f, fs), source: "rules" };
}
