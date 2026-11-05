/** Master control → Data: the shapes the pages hand their clients (0172 / 0173). */
export type Overview = {
  at: string; version: string; db_bytes: number; public_bytes: number; files_bytes: number; files: number; rows: number; users: number;
  schemas: { name: string; bytes: number }[];
  tables: { name: string; bytes: number; rows: number; rid: boolean; pk: boolean }[];
  buckets: { id: string; public: boolean; limit: number | null; files: number; bytes: number }[];
  largest: { bucket: string; name: string; bytes: number | null; at: string }[];
  properties: { id: string; name: string; type: string; demo: boolean; rows: number; bytes: number }[];
  history: { day: string; db_bytes: number; files_bytes: number; rows_total: number }[];
};
export type Server = {
  version: string; started_at: string; now: string; timezone: string; statement_timeout: string; max_connections: number; connections: number; active: number; idle_tx: number;
  by_app: { app: string; n: number }[]; longest_s: number; cache_heap: number | null; cache_index: number | null;
  db: { commits: number; rollbacks: number; deadlocks: number; temp_bytes: number; conflicts: number; stats_reset: string | null };
  xid_age: number; vacuum: { name: string; live: number; dead: number; last_autovacuum: string | null; last_vacuum: string | null }[];
  unused_indexes: { count: number; bytes: number }; slow: { query: string; calls: number; mean_ms: number; total_s: number }[];
};
export type Settings = {
  keep_count: number; nightly: boolean; include_files: boolean; files_cap_mb: number;
  offsite_on: boolean; offsite_kind: "none" | "r2" | "b2" | "s3" | "other"; offsite_endpoint: string | null; offsite_region: string | null; offsite_bucket: string | null; offsite_prefix: string | null; offsite_key_id: string | null;
  offsite_secret_set: boolean; offsite_secret_hint: string | null; supabase_token_set: boolean; supabase_token_hint: string | null;
  cleanup: Record<string, { on?: boolean; days?: number }>; last_download_at: string | null; updated_at: string; active_server: string;
};
export type Backup = {
  id: string; kind: "manual" | "nightly" | "property"; status: "running" | "done" | "failed"; label: string | null; restaurant_id: string | null;
  started_at: string; finished_at: string | null; file_path: string | null; size_bytes: number | null; raw_bytes: number | null; tables: number | null; rows_total: number | null;
  files: number | null; files_bytes: number | null; verified_at: string | null; verify_ok: boolean | null; verify_note: string | null;
  offsite_at: string | null; offsite_ok: boolean | null; offsite_note: string | null; error: string | null; server_id?: string | null; sha256?: string | null;
  manifest?: { tables?: Record<string, { rows: number; sha256: string }> } | null;
};
export type Env = { cron: boolean; serviceRole: boolean; region: string | null; ref: string | null; roundTrip: number; anonKey: string; url: string };

export type ServerKind = "cloud" | "own" | "laptop";
export type Report = {
  host?: string; platform?: string; os?: string; arch?: string; node?: string; cpus?: number; load?: number[]; mem_total?: number; mem_free?: number;
  uptime_s?: number; dir?: string; started_at?: string; poll_seconds?: number; nightly_hour?: number; last_error?: string | null; disk_total?: number; disk_free?: number;
};
export type DataServer = {
  id: string; kind: ServerKind; name: string; token_hint: string | null; keep_count: number; nightly: boolean; paused: boolean; note: string | null; version: string | null;
  created_at: string; last_seen_at: string | null; last_report: Report | null; online: boolean; files: number; files_bytes: number; queued: number; failed_24h: number;
  backups: number; last_backup: { id: string; at: string; size_bytes: number | null; rows_total: number | null; verify_ok: boolean | null; kind: string } | null; active: boolean;
};
export type NodeFile = {
  name: string; size_bytes: number | null; sha256: string | null; stored_at: string | null; verified_at: string | null; verify_ok: boolean | null; verify_note: string | null;
  seen_at: string; backup_id: string | null; kind: string | null; rows_total: number | null; tables: number | null; label: string | null; restaurant_id: string | null;
};
export type Command = {
  id: string; server_id: string; op: "backup" | "verify" | "delete" | "prune" | "restore" | "restore_preview" | "report"; args: Record<string, unknown>;
  status: "queued" | "taken" | "done" | "failed"; created_at: string; taken_at: string | null; done_at: string | null; result: Record<string, unknown> | null; error: string | null;
};
export type RecordRow = Backup & { restaurant: string | null; server: string; server_kind: ServerKind; on_disk: boolean | null };
export type Activity = { id: string; at: string; action: string; target: string | null; meta: Record<string, unknown> | null; by: string | null };

export const CLOUD_ID = "00000000-0000-4000-8000-000000000001";
export const KIND_LABEL: Record<ServerKind, string> = { cloud: "Outside · Supabase", own: "Own server", laptop: "Laptop" };
export const KIND_SHORT: Record<ServerKind, string> = { cloud: "Cloud", own: "Own server", laptop: "Laptop" };
