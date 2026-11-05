"use client";
import { useMemo, useState } from "react";
import { Archive, Loader2, Search, RotateCcw } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { orderTables, withParents } from "@/lib/backup/plan";
import { NOT_RESTORED_NAMES } from "@/lib/backup/names";
import { when, n, useCommand, Note, Panel } from "../bits";
import type { DataServer, NodeFile, Backup } from "../types";
import s from "../Data.module.css";

type Line = { table: string; inBackup: number; missing: number; inserted: number; failed: number; error: string | null };
type Result = { lines: Line[]; missing: number; inserted: number; failed: number };

/** Restore from a backup that lives on a node (0173): the table list comes from the backup's record (its manifest); the node
 *  reads its own file and sends the rows back through the gateway, only for the tables Master control named. */
export function NodeRestore({ server: x, files, backups, fks, preselect }: { server: DataServer; files: NodeFile[]; backups: Backup[]; fks: { child: string; parent: string }[]; preselect: string | null }) {
  const usable = files.filter((f) => f.verify_ok !== false);
  const [name, setName] = useState(preselect && usable.some((f) => f.name === preselect) ? preselect : usable[0]?.name ?? "");
  const file = usable.find((f) => f.name === name) ?? null;
  const record = backups.find((b) => b.file_path === name || (file?.backup_id && b.id === file.backup_id)) ?? null;
  const tables = useMemo(() => Object.entries(record?.manifest?.tables ?? {}).map(([t, v]) => ({ name: t, rows: v.rows, restorable: !NOT_RESTORED_NAMES.has(t) && v.rows > 0 })).sort((a, b) => a.name.localeCompare(b.name)), [record]);
  const [chosen, setChosen] = useState<Set<string>>(new Set()); const [q, setQ] = useState(""); const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<Result | null>(null); const [done, setDone] = useState<Result | null>(null); const [err, setErr] = useState<string | null>(null);
  const { cmd, busy, start } = useCommand();
  const shown = tables.filter((t) => t.name.includes(q.trim().toLowerCase()));
  const toggle = (t: string) => setChosen((c) => { const y = new Set(c); if (y.has(t)) y.delete(t); else y.add(t); return y; });
  const ordered = () => { const avail = new Set(tables.map((t) => t.name)); return orderTables(withParents([...chosen], fks, avail), fks); };
  const go = async (apply: boolean) => {
    setErr(null); if (apply) setDone(null); else { setPreview(null); setDone(null); }
    const r = await start(x.id, apply ? "restore" : "restore_preview", { backup: name, tables: ordered(), ...(apply ? { confirm: "RESTORE" } : {}) });
    if ("error" in r && r.error) { setErr(r.error); return; }
    const c = r as { status: string; result: Record<string, unknown> | null; error: string | null };
    if (c.status !== "done") { setErr(c.error ?? "The server could not do it."); return; }
    const res = c.result as unknown as Result;
    if (apply) { setDone(res); setPreview(null); setConfirm(""); } else setPreview(res);
  };
  if (!usable.length) return <Panel title="Restore" sub={`From ${x.name}`}><div className={s.pad}><Note tone="warn">{x.name} holds no checked backup yet.</Note></div></Panel>;
  return (
    <>
      <Panel title="Restore" sub="Brings back rows that are missing now. A row that is there is never changed or deleted." data-data-restore>
        <div className={s.pad}>
          <label className={cn(s.label)}>From the backup on {x.name}
            <select value={name} onChange={(e) => { setName(e.target.value); setChosen(new Set()); setPreview(null); setDone(null); }} data-restore-backup>
              {usable.map((f) => <option key={f.name} value={f.name}>{when(f.stored_at ?? f.seen_at)} · {f.kind === "property" ? `Export · ${f.label ?? "property"}` : f.kind === "nightly" ? "Nightly" : "Manual"} · {fmtBytes(f.size_bytes)}</option>)}
            </select></label>
          {!x.online && <Note tone="warn">{x.name} is offline. The comparison runs when it is back — the job waits for it.</Note>}
          {!record && <Note tone="warn">This file's record is missing, so its tables cannot be listed. Check it on the server's dashboard first.</Note>}
          {record && <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="text-[13px] text-[var(--color-label-2)]">{tables.length} tables · {n(record.rows_total)} rows · {fmtBytes(record.size_bytes)}</div>
              <div className="flex gap-2 flex-wrap">
                <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-label-3)]" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a table" className="!pl-8 !h-10 w-44" data-restore-search /></label>
                <button type="button" className={s.key} onClick={() => setChosen(new Set(shown.filter((t) => t.restorable).map((t) => t.name)))} data-restore-all>Choose these</button>
                <button type="button" className={s.key} onClick={() => setChosen(new Set())}>None</button>
              </div>
            </div>
            <div className={s.checks} data-restore-tables>
              {shown.map((t) => (
                <label key={t.name} className={s.check} data-off={!t.restorable} title={t.restorable ? "" : "Sign-in state, codes and throttles are never restored"}>
                  <input type="checkbox" checked={chosen.has(t.name)} disabled={!t.restorable} onChange={() => toggle(t.name)} data-restore-table={t.name} /><span>{t.name}</span><em>{n(t.rows)}</em>
                </label>))}
            </div>
            <button type="button" className="btn btn-filled !h-11 justify-self-start" onClick={() => go(false)} disabled={!chosen.size || busy} data-restore-check>
              {busy && cmd?.op !== "restore" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />} {busy && cmd?.op !== "restore" ? (cmd?.status === "taken" ? `${x.name} is comparing…` : `Waiting for ${x.name}…`) : `See what is missing${chosen.size ? ` · ${chosen.size} tables` : ""}`}</button>
          </>}
          {err && <Note tone="bad" data-restore-error>{err}</Note>}
        </div>
      </Panel>
      {preview && <Panel title={preview.missing ? `${n(preview.missing)} rows are missing` : "Nothing is missing"} sub={`Compared by ${x.name} with the database now — tables these depend on were added`} data-restore-preview={preview.missing}>
        <Lines r={preview} kind="preview" />
        {preview.missing > 0 && <div className={s.pad}>
          <Note tone="warn">They go back exactly as they were in the backup. Stock, tickets and totals are not re-run. Every restore is written to the admin log.</Note>
          <div className="flex flex-wrap gap-2 items-end">
            <label className={cn(s.label, "min-w-[12rem]")}>Type RESTORE to go ahead<input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" autoCapitalize="characters" data-restore-confirm /></label>
            <button type="button" className="btn btn-danger !h-11" onClick={() => go(true)} disabled={confirm !== "RESTORE" || busy} data-restore-apply>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RotateCcw size={16} aria-hidden />} {busy ? "Bringing back…" : `Bring back ${n(preview.missing)} rows`}</button>
          </div></div>}
      </Panel>}
      {done && <Panel title={`${n(done.inserted)} rows brought back`} sub={done.failed ? `${n(done.failed)} could not go back — see below` : "Everything that was missing is back"} data-restore-done={done.inserted}><Lines r={done} kind="done" /></Panel>}
      <Note><Archive size={14} className="inline mr-1" aria-hidden />The rows travel from {x.name} to the database through the same checked gateway the node uses for everything else; only the tables you named are accepted.</Note>
    </>
  );
}
function Lines({ r, kind }: { r: Result; kind: "preview" | "done" }) {
  return (<div className={s.scrollX}><table className={s.table}>
    <thead><tr><th>Table</th><th className="r">In backup</th><th className="r">Missing</th>{kind === "done" && <><th className="r">Back</th><th className="r">Refused</th></>}</tr></thead>
    <tbody>{r.lines.map((l) => (<tr key={l.table} data-restore-line={l.table}><td><b>{l.table}</b>{l.error && <div className="text-[12px] text-[var(--color-red)] mt-1">{l.error}</div>}</td><td className="r">{n(l.inBackup)}</td><td className="r">{n(l.missing)}</td>{kind === "done" && <><td className="r">{n(l.inserted)}</td><td className="r">{n(l.failed)}</td></>}</tr>))}</tbody></table></div>);
}
