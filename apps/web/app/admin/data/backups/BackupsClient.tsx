"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ShieldCheck, Trash2, Loader2, Check, X, RotateCcw, FileDown, ChevronRight } from "lucide-react";
import { ask, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { ago, when, n, useNow, useCommand, Note, Panel } from "../bits";
import { BackupsPanel } from "../BackupsPanel";
import { KIND_ICON } from "../ServerConnection";
import { type DataServer, type Settings, type Backup, type NodeFile, type Overview, type Env, KIND_SHORT } from "../types";
import s from "../Data.module.css";

export function BackupsClient({ server: x, settings, backups, files, properties, env, at }: { server: DataServer; servers: DataServer[]; settings: Settings; backups: Backup[]; files: NodeFile[]; properties: Overview["properties"]; env: Env; at: string }) {
  const router = useRouter(); const now = useNow(Date.parse(at));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { cmd, busy, start } = useCommand();
  const [rid, setRid] = useState(properties.find((p) => !p.demo)?.id ?? properties[0]?.id ?? "");
  const K = KIND_ICON[x.kind];
  const head = (
    <div className="flex items-center gap-3 flex-wrap" data-backups-for={x.kind}>
      <span className={s.optIcon}><K size={18} aria-hidden /></span>
      <div className="min-w-0 flex-1"><div className="text-[15px] font-bold">Backups on {x.name}</div><div className="text-[12.5px] text-[var(--color-label-2)]">{KIND_SHORT[x.kind]} · the connected server. Change it with Server connection above.</div></div>
      <Link href={`/admin/data/servers/${x.id}`} className={s.key}>Dashboard <ChevronRight size={14} aria-hidden /></Link>
    </div>
  );
  if (x.kind === "cloud") return (<>{head}{msg && <Note tone={msg.ok ? "ok" : "bad"} data-data-msg={msg.ok ? "ok" : "error"}>{msg.text}</Note>}<BackupsPanel backups={backups} settings={settings} env={env} properties={properties} onMsg={setMsg} now={now} /></>);

  const job = async (op: "backup" | "verify" | "delete", args: Record<string, unknown>, done: (r: Record<string, unknown>) => string) => {
    const r = await start(x.id, op, args);
    if ("error" in r && r.error) { setMsg({ ok: false, text: r.error }); return; }
    const c = r as { status: string; result: Record<string, unknown> | null; error: string | null };
    setMsg(c.status === "done" ? { ok: true, text: done(c.result ?? {}) } : { ok: false, text: c.error ?? "The job failed." }); router.refresh();
  };
  const full = files.filter((f) => f.kind !== "property"); const exports = files.filter((f) => f.kind === "property");
  return (
    <>
      {head}
      {msg && <Note tone={msg.ok ? "ok" : "bad"} data-data-msg={msg.ok ? "ok" : "error"}>{msg.text}</Note>}
      {busy && <Note data-backups-waiting><Loader2 size={14} className="animate-spin inline mr-1" aria-hidden /> {cmd?.status === "taken" ? `${x.name} is working…` : `Waiting for ${x.name}${x.online ? "" : " — it is offline; the job waits for it"}…`}</Note>}
      {!x.online && <Note tone="warn">{x.name} is {x.last_seen_at ? `offline (last heard ${ago(x.last_seen_at, now)})` : "not connected yet"}. Jobs queue up and run when it is back. <Link href={`/admin/data/servers/${x.id}`} className="font-bold underline">Its setup</Link></Note>}
      <div className={s.cols}>
        <Panel title="How backups run here" sub={`On ${x.name}'s own clock and disk`} data-data-settings>
          <div className={s.list}>
            <div className={s.item}><div className={s.itemName}><span>Nightly at 2:00 am</span></div><div className={s.itemFig}><span className={s.chip} data-tone={x.nightly && !x.paused ? "ok" : "warn"}>{x.paused ? "paused" : x.nightly ? "on" : "off"}</span></div></div>
            <div className={s.item}><div className={s.itemName}><span>Keeps the newest</span></div><div className={s.itemFig}><b>{x.keep_count}</b> full backups</div></div>
            <div className={s.item}><div className={s.itemName}><span>Stored files</span></div><div className={s.itemFig}>{settings.include_files ? `up to ${settings.files_cap_mb} MB` : "off"} (Data settings)</div></div>
            <div className={s.item}><div className={s.itemName}><span>Disk free</span></div><div className={s.itemFig}><b>{x.last_report?.disk_free != null ? fmtBytes(x.last_report.disk_free) : "—"}</b></div></div>
          </div>
          <div className={s.more}><Link href={`/admin/data/servers/${x.id}`} className={s.key}>Change these on the dashboard <ChevronRight size={14} aria-hidden /></Link></div>
        </Panel>
        <Panel title="Export one property" sub={`All of its data in one file, kept on ${x.name}`} data-data-export>
          <div className={s.pad}>
            <div className="flex flex-wrap gap-2 items-end">
              <label className={cn(s.label, "flex-1 min-w-[12rem]")}>Property<select value={rid} onChange={(e) => setRid(e.target.value)} data-export-property>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.demo ? " (demo)" : ""}</option>)}</select></label>
              <button type="button" className="btn btn-gray !h-11" disabled={!rid || busy} data-export-go onClick={() => { const p = properties.find((q) => q.id === rid)!; job("backup", { kind: "property", restaurant: { id: p.id, name: p.name, slug: null } }, (r) => `Exported ${n(r.rows_total as number)} rows · ${fmtBytes(r.size_bytes as number)} onto ${x.name}.`); }}>
                {busy && cmd?.op === "backup" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileDown size={16} aria-hidden />} Export</button>
            </div>
            <Note>Its rows from every table and its own files. Keys, tokens, codes and passwords are left out.</Note>
          </div>
        </Panel>
      </div>
      <Panel title="Backups" sub={`${full.length} full · ${exports.length} exports · as ${x.name} last reported`} data-data-backups
        right={<><button type="button" className={s.key} disabled={busy} onClick={() => job("verify", {}, (r) => `${r.checked} checked, ${r.ok} fine${(r.bad as unknown[])?.length ? `, ${(r.bad as unknown[]).length} damaged` : ""}.`)} data-act="verify-all"><ShieldCheck size={14} aria-hidden /> Check all</button>
          <button type="button" className="btn btn-filled !h-10" disabled={busy} onClick={() => job("backup", { kind: "manual" }, (r) => `Backed up ${n(r.rows_total as number)} rows — ${fmtBytes(r.size_bytes as number)}${r.checked ? ", checked" : ""}.`)} data-backup-now>{busy && cmd?.op === "backup" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Archive size={15} aria-hidden />} Back up now</button></>}>
        {files.length === 0 ? <div className={s.pad}><Note tone="warn">Nothing on {x.name} yet — press Back up now.</Note></div> : (
          <div className={s.list}>{files.map((f) => (
            <div key={f.name} className={s.bk} data-status={f.verify_ok === false ? "failed" : "done"} data-backup-row={f.kind ?? "file"}>
              <span className={s.bkIcon}><Archive size={17} aria-hidden /></span>
              <div className={s.bkText}>
                <div className={s.bkTitle}>{f.kind === "property" ? `Export · ${f.label ?? "property"}` : f.kind === "nightly" ? "Nightly" : "Manual"}
                  {f.verify_ok === true ? <span className={s.chip} data-tone="ok" title={f.verify_note ?? ""} data-checked="ok"><Check size={11} aria-hidden /> checked</span> : f.verify_ok === false ? <span className={s.chip} data-tone="bad" title={f.verify_note ?? ""} data-checked="bad"><X size={11} aria-hidden /> damaged</span> : <span className={s.chip}>not checked</span>}</div>
                <div className={s.bkMeta}>{when(f.stored_at ?? f.seen_at)} · {fmtBytes(f.size_bytes)}{f.rows_total ? ` · ${n(f.rows_total)} rows · ${f.tables} tables` : ""}</div>
              </div>
              <div className={s.bkActs}>
                <Link href={`/admin/data/restore?server=${x.id}&file=${encodeURIComponent(f.name)}`} className={s.key} data-act="restore"><RotateCcw size={14} aria-hidden /> Restore</Link>
                <button type="button" className={s.key} disabled={busy} onClick={() => job("verify", { names: [f.name] }, (r) => `${r.ok ? "Checked — all as written." : "Check failed."}`)} data-act="verify"><ShieldCheck size={14} aria-hidden /> Check</button>
                <button type="button" className={s.key} data-tone="bad" disabled={busy} aria-label="Delete" data-act="delete" onClick={async () => { if (await ask({ title: "Delete this backup on the server?", body: `${f.name} · ${fmtBytes(f.size_bytes)}. It goes from ${x.name}'s disk for good.`, ok: "Delete", tone: "danger", icon: "trash" })) job("delete", { names: [f.name] }, () => "Deleted."); }}><Trash2 size={14} aria-hidden /></button>
              </div>
            </div>))}</div>)}
      </Panel>
    </>
  );
}
