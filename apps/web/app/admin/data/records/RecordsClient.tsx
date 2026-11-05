"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, Check, X, Archive, Moon, Building2, History, ChevronRight } from "lucide-react";
import { Segmented, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { when, n, useNow, ago, Panel, Note, Tile } from "../bits";
import { KIND_ICON } from "../ServerConnection";
import { type RecordRow, type Activity, type DataServer, KIND_SHORT } from "../types";
import s from "../Data.module.css";

const KIND = { manual: { label: "Manual", Icon: Archive }, nightly: { label: "Nightly", Icon: Moon }, property: { label: "Export", Icon: Building2 } } as const;
const ACTION: Record<string, string> = {
  data_settings: "Changed the backup settings", data_cleanup: "Cleaned up old rows", data_restore: "Restored rows", data_backup_delete: "Deleted backup records",
  data_server_add: "Added a server", data_server_set: "Changed a server's settings", data_server_delete: "Removed a server", data_server_rotate: "Made a new server token",
  data_server_switch: "Changed the Server connection", data_server_restore: "Asked a server to restore", data_server_delete_files: "Asked a server to delete files", data_server_prune: "Asked a server to prune",
};

export function RecordsClient({ records, activity, servers, at }: { records: RecordRow[]; activity: Activity[]; servers: DataServer[]; at: string }) {
  const now = useNow(Date.parse(at));
  const [q, setQ] = useState(""); const [kind, setKind] = useState<"all" | "manual" | "nightly" | "property">("all"); const [srv, setSrv] = useState("all"); const [status, setStatus] = useState<"all" | "done" | "failed" | "bad">("all");
  const rows = useMemo(() => records.filter((r) =>
    (kind === "all" || r.kind === kind) && (srv === "all" || r.server_id === srv) &&
    (status === "all" || (status === "bad" ? r.verify_ok === false || r.on_disk === false : r.status === status)) &&
    (!q.trim() || `${r.label ?? ""} ${r.restaurant ?? ""} ${r.server} ${r.file_path ?? ""} ${r.sha256 ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [records, kind, srv, status, q]);
  const done = records.filter((r) => r.status === "done"); const bad = records.filter((r) => r.verify_ok === false || r.on_disk === false).length;
  const byServer = servers.map((x) => ({ x, n: done.filter((r) => r.server_id === x.id).length }));
  const csv = () => {
    const head = ["started_at", "kind", "status", "server", "server_kind", "label", "property", "size_bytes", "rows", "tables", "files", "checked", "on_disk", "sha256", "file_path"];
    const esc = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, "\"\"")}"` : t; };
    const body = rows.map((r) => [r.started_at, r.kind, r.status, r.server, r.server_kind, r.label, r.restaurant, r.size_bytes, r.rows_total, r.tables, r.files, r.verify_ok, r.on_disk, r.sha256, r.file_path].map(esc).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dineflow-backup-records-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className={s.tiles}>
        <Tile label="Backups made" icon={<Archive size={14} aria-hidden />} value={n(done.length)} sub={`${n(records.filter((r) => r.status === "failed").length)} failed · ${n(records.filter((r) => r.kind === "property").length)} exports`} data-tile="made" />
        <Tile label="Checked" icon={<Check size={14} aria-hidden />} value={n(done.filter((r) => r.verify_ok).length)} sub={`${n(done.filter((r) => r.verify_ok == null).length)} never checked`} tone="ok" data-tile="checked" />
        <Tile label="Need a look" icon={<X size={14} aria-hidden />} value={n(bad)} sub="failed a check, or the file is gone" tone={bad ? "bad" : "ok"} data-tile="bad" />
        <Tile label="Space held" icon={<History size={14} aria-hidden />} value={fmtBytes(done.reduce((a, r) => a + Number(r.size_bytes ?? 0), 0))} sub={`across ${servers.length} server${servers.length === 1 ? "" : "s"}`} data-tile="space" />
      </div>

      <Panel title="Every backup" sub={`${rows.length} of ${records.length} · newest first`} data-data-records
        right={<button type="button" className={s.key} onClick={csv} disabled={!rows.length} data-records-csv><Download size={14} aria-hidden /> CSV</button>}>
        <div className="px-[18px] pb-3 grid gap-2">
          <div className="flex gap-2 flex-wrap items-center">
            <label className="relative flex-1 min-w-[12rem]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-label-3)]" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find — a property, a server, a file, a checksum" className="!pl-8 !h-10 w-full" data-records-search /></label>
            <select value={srv} onChange={(e) => setSrv(e.target.value)} aria-label="Server" className="!h-10" data-records-server><option value="all">Every server</option>{byServer.map(({ x, n: c }) => <option key={x.id} value={x.id}>{x.name} · {c}</option>)}</select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Segmented value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "nightly", label: "Nightly" }, { value: "manual", label: "Manual" }, { value: "property", label: "Exports" }]} />
            <Segmented value={status} onChange={setStatus} options={[{ value: "all", label: "Any state" }, { value: "done", label: "Done" }, { value: "failed", label: "Failed" }, { value: "bad", label: "Need a look" }]} />
          </div>
        </div>
        {rows.length ? <div className={s.scrollX}><table className={s.table} data-records-table>
          <thead><tr><th>When</th><th>What</th><th>Server</th><th className="r">Size</th><th className="r">Rows</th><th>State</th></tr></thead>
          <tbody>{rows.map((r) => { const K = KIND[r.kind]; const SK = KIND_ICON[r.server_kind]; return (
            <tr key={r.id} data-record={r.kind}>
              <td className="whitespace-nowrap">{when(r.started_at)}<div className="text-[11.5px] text-[var(--color-label-3)]">{ago(r.started_at, now)}</div></td>
              <td><div className="flex items-center gap-1.5 font-semibold"><K.Icon size={13} aria-hidden />{K.label}{r.label && r.kind !== "property" ? ` · ${r.label}` : ""}{r.kind === "property" ? ` · ${r.restaurant ?? r.label ?? "property"}` : ""}</div>{r.file_path && <div className={cn(s.mono, "text-[var(--color-label-3)] text-[11px]")}>{r.file_path}</div>}</td>
              <td><Link href={r.server_id ? `/admin/data/servers/${r.server_id}` : "/admin/data/servers"} className="inline-flex items-center gap-1.5 font-semibold hover:underline"><SK size={13} aria-hidden />{r.server}</Link><div className="text-[11.5px] text-[var(--color-label-3)]">{KIND_SHORT[r.server_kind]}</div></td>
              <td className="r">{r.size_bytes ? fmtBytes(r.size_bytes) : "—"}</td>
              <td className="r">{r.rows_total ? n(r.rows_total) : "—"}{r.tables ? <div className="text-[11.5px] text-[var(--color-label-3)]">{r.tables} tables</div> : null}</td>
              <td><div className="flex gap-1 flex-wrap">
                {r.status === "failed" ? <span className={s.chip} data-tone="bad" title={r.error ?? ""}>failed</span> : r.status === "running" ? <span className={s.chip} data-tone="warn">running</span> : null}
                {r.status === "done" && (r.verify_ok ? <span className={s.chip} data-tone="ok" title={r.verify_note ?? ""}><Check size={11} aria-hidden /> checked</span> : r.verify_ok === false ? <span className={s.chip} data-tone="bad" title={r.verify_note ?? ""}><X size={11} aria-hidden /> check failed</span> : <span className={s.chip}>not checked</span>)}
                {r.on_disk === false && <span className={s.chip} data-tone="bad">file gone</span>}
                {r.offsite_ok && <span className={s.chip} data-tone="tint">outside copy</span>}
              </div>{r.status === "failed" && r.error && <div className="text-[11.5px] text-[var(--color-red)] mt-1 max-w-[28rem]">{r.error}</div>}</td>
            </tr>); })}</tbody></table></div>
          : <div className={s.pad}><Note>{records.length ? "Nothing matches." : "No backups yet."}</Note></div>}
      </Panel>

      <Panel title="Activity" sub="What was done to the data, by whom" data-data-activity>
        {activity.length ? <div className={s.list}>{activity.slice(0, 80).map((a) => (
          <div key={a.id} className={s.cmdRow} data-status="done" data-activity={a.action}>
            <span className={s.cmdIcon}><History size={15} aria-hidden /></span>
            <div className={s.cmdText}><b>{ACTION[a.action] ?? a.action.replace(/^data_/, "").replace(/_/g, " ")}</b><span>{describe(a, servers)}{a.by ? ` · ${a.by}` : ""}</span></div>
            <span className={s.cmdWhen}>{when(a.at)}</span>
          </div>))}</div> : <div className={s.pad}><Note>Nothing yet.</Note></div>}
      </Panel>
      <Link href="/admin/data/backups" className={cn(s.key, "justify-self-start")}>Backups <ChevronRight size={14} aria-hidden /></Link>
    </>
  );
}

function describe(a: Activity, servers: DataServer[]): string {
  const m = a.meta ?? {}; const name = (id: unknown) => servers.find((x) => x.id === id)?.name ?? "a removed server";
  switch (a.action) {
    case "data_restore": return `${m.table}: ${m.inserted} of ${m.given} rows back${m.server ? ` via ${name(m.server)}` : ""}`;
    case "data_cleanup": return Object.entries(m).map(([k, v]) => `${k} ${(v as { rows?: number })?.rows ?? ""}`).join(", ");
    case "data_server_switch": return `${name(m.from)} → ${name(m.to)}`;
    case "data_server_add": return `${m.name} (${m.kind})`;
    case "data_server_delete": return String(m.name ?? "");
    case "data_server_set": return Object.keys(m).filter((k) => k !== "note").map((k) => `${k} = ${m[k]}`).join(", ");
    case "data_server_restore": case "data_server_prune": case "data_server_delete_files": return `${name(a.target)} · ${(m.tables as string[])?.join(", ") ?? (m.names as string[])?.join(", ") ?? (m.keep ? `keep ${m.keep}` : "")}`;
    case "data_backup_delete": return `${m.count} record${m.count === 1 ? "" : "s"}`;
    case "data_settings": return Object.keys(m).filter((k) => m[k] != null && k !== "cleanup").join(", ") || "cleanup rules";
    default: return "";
  }
}
