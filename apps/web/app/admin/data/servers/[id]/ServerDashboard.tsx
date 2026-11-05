"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ShieldCheck, Scissors, Activity, KeyRound, Trash2, Loader2, Plug, Check, X, Clock, HardDrive, Cpu, MemoryStick, Timer, ChevronLeft, Download, RotateCcw, Wrench, Settings2 } from "lucide-react";
import { ask, Switch, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, ago, when, n, useNow, useCommand, Note, Panel, Tile, Meter } from "../../bits";
import { saveDataSettings } from "../../actions";
import { KIND_ICON } from "../../ServerConnection";
import { Setup, type SetupInfo } from "../Setup";
import { type DataServer, type NodeFile, type Command, type Settings, type Env, KIND_LABEL, KIND_SHORT, CLOUD_ID } from "../../types";
import s from "../../Data.module.css";

const OP_LABEL: Record<Command["op"], string> = { backup: "Backup", verify: "Check files", delete: "Delete files", prune: "Keep the newest", restore: "Restore", restore_preview: "Restore preview", report: "Report" };

export function ServerDashboard({ server: x, servers, files, commands, settings, at, setup, env, cloudHealth }: { server: DataServer; servers: DataServer[]; files: NodeFile[]; commands: Command[]; settings: Settings; at: string; setup: SetupInfo; env: Env; cloudHealth?: React.ReactNode }) {
  const router = useRouter(); const now = useNow(Date.parse(at)); const [pending, start] = useTransition();
  const { cmd, busy: cmdBusy, start: run } = useCommand();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null); const [showSetup, setShowSetup] = useState(!x.last_seen_at && x.kind !== "cloud");
  const [name, setName] = useState(x.name); const [note, setNote] = useState(x.note ?? "");
  const K = KIND_ICON[x.kind]; const rep = x.last_report; const isCloud = x.kind === "cloud";
  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  const set = (p: Record<string, unknown>) => { setBusy("set"); api("server-set", { id: x.id, p }).then((r) => { setBusy(null); if (r.error) say(false, r.error); else router.refresh(); }); };
  const job = async (op: Command["op"], args: Record<string, unknown> = {}, label = OP_LABEL[op]) => {
    const r = await run(x.id, op, args);
    if ("error" in r && r.error) { say(false, r.error); return; }
    const c = r as { status: string; result: Record<string, unknown> | null; error: string | null };
    if (c.status === "done") {
      const res = c.result ?? {};
      say(true, op === "backup" ? `Backed up ${n(res.rows_total as number)} rows — ${fmtBytes(res.size_bytes as number)}${res.checked ? ", checked" : ""}.`
        : op === "verify" ? `${res.checked} file${res.checked === 1 ? "" : "s"} checked, ${res.ok} fine${(res.bad as unknown[])?.length ? `, ${(res.bad as unknown[]).length} damaged` : ""}.`
        : op === "prune" || op === "delete" ? `${(res.deleted as unknown[])?.length ?? 0} file${(res.deleted as unknown[])?.length === 1 ? "" : "s"} deleted.`
        : `${label} done.`);
    } else say(false, `${label} failed: ${c.error ?? "unknown error"}`);
    router.refresh();
  };
  const rotate = async () => {
    if (!(await ask({ title: "Make a new token?", body: `${x.name} stops connecting until the new token is put in its .env and the node is restarted.`, ok: "New token", tone: "danger", icon: "alert" }))) return;
    setBusy("rotate"); const r = await api<{ token?: string }>("server-rotate", { id: x.id }); setBusy(null);
    if (r.error || !r.token) { say(false, r.error ?? "Could not make a token."); return; }
    setToken(r.token); setShowSetup(true); router.refresh();
  };
  const remove = async () => {
    if (!(await ask({ title: `Remove ${x.name}?`, body: "Its connection stops and its job history goes. The files on its disk are not touched — delete them there. Backup records stay, marked as from a removed server.", ok: "Remove", tone: "danger", icon: "trash" }))) return;
    setBusy("remove"); const r = await api("server-delete", { id: x.id, confirm: "REMOVE" }); setBusy(null);
    if (r.error) { say(false, r.error); return; }
    router.push("/admin/data/servers"); router.refresh();
  };
  const connect = async () => {
    const active = servers.find((y) => y.active) ?? servers[0];
    if (!(await ask({ title: `Connect to ${x.name}?`, body: `Back up now, the nightly backup and Restore will use ${x.name} (${KIND_LABEL[x.kind]}). The live database stays on Supabase. Backups already on ${active.name} stay there.`, ok: "Connect", cancel: `Keep ${active.name}`, tone: "danger", icon: "alert" }))) return;
    setBusy("connect"); const r = await api("active-server", { id: x.id === CLOUD_ID ? null : x.id }); setBusy(null);
    if (r.error) say(false, r.error); else router.refresh();
  };
  const delFile = async (f: NodeFile) => {
    if (!(await ask({ title: "Delete this file on the server?", body: `${f.name}${f.size_bytes ? ` · ${fmtBytes(f.size_bytes)}` : ""}. It goes from ${x.name}'s disk for good.`, ok: "Delete", tone: "danger", icon: "trash" }))) return;
    await job("delete", { names: [f.name] });
  };
  const diskPct = rep?.disk_total ? ((rep.disk_total - (rep.disk_free ?? 0)) / rep.disk_total) * 100 : null;
  const memPct = rep?.mem_total ? ((rep.mem_total - (rep.mem_free ?? 0)) / rep.mem_total) * 100 : null;
  const bad = files.filter((f) => f.verify_ok === false).length;
  return (
    <>
      <Link href="/admin/data/servers" className={cn(s.key, "justify-self-start")} data-server-back><ChevronLeft size={14} aria-hidden /> Servers</Link>
      <div className={s.hero} data-online={x.online} data-server-hero={x.kind}>
        <span className={s.heroIcon}><K size={26} aria-hidden /></span>
        <div className="min-w-0">
          <div className={s.heroName}>{x.name}
            {x.active && <span className={s.chip} data-tone="tint"><Check size={11} aria-hidden /> connected</span>}
            {!isCloud && <span className={s.chip} data-tone={x.online ? "ok" : "warn"}>{x.online ? "online" : x.last_seen_at ? "offline" : "never connected"}</span>}
            {x.paused && <span className={s.chip} data-tone="warn">paused</span>}</div>
          <div className={s.heroSub}>
            <span>{KIND_SHORT[x.kind]}</span>
            {!isCloud && <span>{x.last_seen_at ? `last heard ${ago(x.last_seen_at, now)}` : "waiting for its first poll"}</span>}
            {rep?.host && <span>{rep.host} · {rep.os}</span>}
            {x.version && <span>node v{x.version}</span>}
            {isCloud && <span>Supabase · always on</span>}
          </div>
        </div>
        <div className={s.heroActs}>
          {!x.active && <button type="button" className="btn btn-gray !h-11" onClick={connect} disabled={!!busy} data-server-connect>{busy === "connect" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plug size={16} aria-hidden />} Connect</button>}
          {!isCloud && <button type="button" className="btn btn-filled !h-11" onClick={() => job("backup", { kind: "manual" })} disabled={cmdBusy} data-server-backup>{cmdBusy && cmd?.op === "backup" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />} {cmdBusy && cmd?.op === "backup" ? (cmd?.status === "taken" ? "Backing up…" : "Waiting…") : "Back up now"}</button>}
          {isCloud && <Link href="/admin/data/backups" className="btn btn-filled !h-11"><Archive size={16} aria-hidden /> Backups</Link>}
        </div>
      </div>
      {msg && <Note tone={msg.ok ? "ok" : "bad"} data-server-msg={msg.ok ? "ok" : "error"}>{msg.text}</Note>}
      {cmdBusy && <Note data-server-waiting><Loader2 size={14} className="animate-spin inline mr-1" aria-hidden /> {cmd?.status === "taken" ? `${x.name} is working on it…` : `Waiting for ${x.name} to pick up the job${x.online ? "" : " — it is offline, so this waits until it is back"}…`}</Note>}

      {!isCloud && <div className={s.tiles}>
        <Tile label="Disk free" icon={<HardDrive size={14} aria-hidden />} value={rep?.disk_free != null ? fmtBytes(rep.disk_free) : "—"} sub={rep?.disk_total ? `of ${fmtBytes(rep.disk_total)} · backups in ${rep.dir ?? "its folder"}` : "no report yet"} tone={diskPct != null && diskPct > 90 ? "bad" : diskPct != null && diskPct > 75 ? "warn" : undefined} data-tile="disk">{diskPct != null && <Meter used={diskPct} max={100} label="Disk used" />}</Tile>
        <Tile label="Backups held" icon={<Archive size={14} aria-hidden />} value={n(files.length)} sub={`${fmtBytes(x.files_bytes)} · keeps the newest ${x.keep_count}${bad ? ` · ${bad} damaged` : ""}`} tone={bad ? "bad" : undefined} data-tile="files" />
        <Tile label="Memory" icon={<MemoryStick size={14} aria-hidden />} value={rep?.mem_free != null ? fmtBytes(rep.mem_free) : "—"} sub={rep?.mem_total ? `free of ${fmtBytes(rep.mem_total)} · ${rep.cpus ?? "?"} CPUs` : "—"} data-tile="mem">{memPct != null && <Meter used={memPct} max={100} label="Memory used" />}</Tile>
        <Tile label="Up for" icon={<Timer size={14} aria-hidden />} value={rep?.uptime_s != null ? `${Math.floor(rep.uptime_s / 86400)}d ${Math.floor((rep.uptime_s % 86400) / 3600)}h` : "—"} sub={rep?.started_at ? `node since ${when(rep.started_at)} · asks every ${rep.poll_seconds ?? 60}s` : "—"} data-tile="uptime" />
      </div>}

      {!isCloud && <div className={s.cols}>
        <Panel title="Controls" sub="What this server does on its own" right={<Settings2 size={16} className="text-[var(--color-label-3)]" aria-hidden />} data-server-controls>
          <div className={s.setRow}><div><div className={s.setName}>Nightly backup at 2:00 am</div><div className={s.setSub}>On this machine's clock · needs the node running</div></div><Switch on={x.nightly} onChange={(v) => set({ nightly: v })} name="Nightly backup on this server" /></div>
          <div className={s.setRow}><div><div className={s.setName}>Keep the newest</div><div className={s.setSub}>Older full backups are deleted after each nightly</div></div>
            <select value={x.keep_count} onChange={(e) => set({ keep_count: Number(e.target.value) })} disabled={!!busy} aria-label="Keep the newest" data-server-keep>{[7, 14, 30, 60, 90, 180, 365].map((k) => <option key={k} value={k}>{k} backups</option>)}</select></div>
          <div className={s.setRow}><div><div className={s.setName}>Pause</div><div className={s.setSub}>Stops the nightly and ignores new jobs until resumed</div></div><Switch on={x.paused} onChange={(v) => set({ paused: v })} name="Pause this server" /></div>
          <div className={s.pad + " pt-3"}>
            <label className={s.label}>Name<input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== x.name && name.trim().length >= 2 && set({ name })} maxLength={60} data-server-name /></label>
            <label className={s.label}>Note <span className={s.hint}>where it is, who looks after it</span><input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (x.note ?? "") && set({ note })} maxLength={300} data-server-note /></label>
          </div>
        </Panel>
        <Panel title="Actions" sub="Jobs this server does when it next asks (within a minute)" right={<Wrench size={16} className="text-[var(--color-label-3)]" aria-hidden />} data-server-actions>
          <div className={s.pad}>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className={s.key} disabled={cmdBusy} onClick={() => job("verify")} data-server-verify><ShieldCheck size={14} aria-hidden /> Check every file</button>
              <button type="button" className={s.key} disabled={cmdBusy} onClick={async () => { if (await ask({ title: `Keep only the newest ${x.keep_count}?`, body: "Older full backups on this server are deleted. Property exports are left alone.", ok: "Prune", tone: "danger", icon: "trash" })) job("prune", { keep: x.keep_count }); }} data-server-prune><Scissors size={14} aria-hidden /> Prune to {x.keep_count}</button>
              <button type="button" className={s.key} disabled={cmdBusy} onClick={() => job("report")} data-server-report><Activity size={14} aria-hidden /> Fresh report</button>
              <Link href={`/admin/data/restore?server=${x.id}`} className={s.key} data-server-restore><RotateCcw size={14} aria-hidden /> Restore from here</Link>
            </div>
            <div className="flex gap-2 flex-wrap pt-2 border-t border-[var(--color-separator)]">
              <button type="button" className={s.key} disabled={!!busy} onClick={rotate} data-server-rotate>{busy === "rotate" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <KeyRound size={14} aria-hidden />} Rotate token</button>
              <button type="button" className={s.key} onClick={() => setShowSetup((v) => !v)} data-server-setup-toggle><Download size={14} aria-hidden /> {showSetup ? "Hide setup" : "Setup"}</button>
              <button type="button" className={s.key} data-tone="bad" disabled={!!busy} onClick={remove} data-server-remove>{busy === "remove" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />} Remove server</button>
            </div>
            {rep?.last_error && <Note tone="warn">Last error on the node: {rep.last_error}</Note>}
          </div>
        </Panel>
      </div>}

      {!isCloud && showSetup && <Panel title="Setup" sub={`Put the node on ${x.name}`} data-server-setup><div className={s.pad}><Setup kind={x.kind} name={x.name} token={token} setup={setup} /></div></Panel>}

      {!isCloud && <Panel title="Files on this server" sub={files.length ? `${files.length} · as it last reported` : "Nothing yet"} data-server-files>
        {files.length ? <div className={s.list}>{files.map((f) => (
          <div key={f.name} className={s.bk} data-status={f.verify_ok === false ? "failed" : "done"} data-server-file>
            <span className={s.bkIcon}><Archive size={17} aria-hidden /></span>
            <div className={s.bkText}>
              <div className={s.bkTitle}>{f.kind === "property" ? `Export · ${f.label ?? "property"}` : f.kind === "nightly" ? "Nightly" : f.kind === "manual" ? "Manual" : "File"}
                {f.verify_ok === true ? <span className={s.chip} data-tone="ok" title={f.verify_note ?? ""}><Check size={11} aria-hidden /> checked</span> : f.verify_ok === false ? <span className={s.chip} data-tone="bad" title={f.verify_note ?? ""}><X size={11} aria-hidden /> damaged</span> : <span className={s.chip}>not checked</span>}</div>
              <div className={s.bkMeta}>{when(f.stored_at ?? f.seen_at)} · {fmtBytes(f.size_bytes)}{f.rows_total ? ` · ${n(f.rows_total)} rows · ${f.tables} tables` : ""} · {f.name}</div>
            </div>
            <div className={s.bkActs}>
              <Link href={`/admin/data/restore?server=${x.id}&file=${encodeURIComponent(f.name)}`} className={s.key} data-file-restore><RotateCcw size={14} aria-hidden /> Restore</Link>
              <button type="button" className={s.key} disabled={cmdBusy} onClick={() => job("verify", { names: [f.name] })} data-file-verify><ShieldCheck size={14} aria-hidden /> Check</button>
              <button type="button" className={s.key} data-tone="bad" disabled={cmdBusy} onClick={() => delFile(f)} aria-label="Delete file" data-file-delete><Trash2 size={14} aria-hidden /></button>
            </div>
          </div>))}</div>
          : <div className={s.pad}><Note>{x.last_seen_at ? "No backups on this server yet — press Back up now." : "The node has not connected yet. Follow the setup; it reports within a minute of starting."}</Note></div>}
      </Panel>}

      {!isCloud && <Panel title="Job log" sub="What Master control asked, and what came of it" data-server-jobs>
        {commands.length ? <div className={s.list}>{commands.map((c) => (
          <div key={c.id} className={s.cmdRow} data-status={c.status} data-job={c.op}>
            <span className={s.cmdIcon}>{c.status === "done" ? <Check size={15} aria-hidden /> : c.status === "failed" ? <X size={15} aria-hidden /> : c.status === "taken" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Clock size={15} aria-hidden />}</span>
            <div className={s.cmdText}><b>{OP_LABEL[c.op]}</b><span>{c.status === "failed" ? c.error : c.status === "done" ? summary(c) : c.status === "taken" ? "the server is on it" : "waiting for the server"}</span></div>
            <span className={s.cmdWhen}>{when(c.done_at ?? c.taken_at ?? c.created_at)}</span>
          </div>))}</div> : <div className={s.pad}><Note>No jobs yet.</Note></div>}
      </Panel>}

      {isCloud && <>
        <div className={s.tiles}>
          <Tile label="Backups held" icon={<Archive size={14} aria-hidden />} value={n(x.backups)} sub={`keeps the newest ${settings.keep_count}`} data-tile="files" />
          <Tile label="Last backup" icon={<Clock size={14} aria-hidden />} value={x.last_backup ? ago(x.last_backup.at, now) : "none"} sub={x.last_backup ? `${fmtBytes(x.last_backup.size_bytes)} · ${x.last_backup.verify_ok ? "checked" : "not checked"}` : "press Back up now"} tone={x.last_backup ? (x.last_backup.verify_ok ? "ok" : "warn") : "bad"} data-tile="last" />
          <Tile label="Nightly" icon={<Timer size={14} aria-hidden />} value={settings.nightly && env.cron && env.serviceRole ? "2:00 am" : settings.nightly ? "waiting" : "off"} sub={settings.nightly && !(env.cron && env.serviceRole) ? "needs CRON_SECRET and the service-role key on Vercel" : "Vercel Cron · 02:00 IST"} tone={settings.nightly && env.cron && env.serviceRole ? "ok" : "warn"} data-tile="nightly" />
          <Tile label="Answer time" icon={<Cpu size={14} aria-hidden />} value={`${env.roundTrip} ms`} sub="this page's database calls" tone={env.roundTrip > 1500 ? "bad" : env.roundTrip > 600 ? "warn" : "ok"} data-tile="roundtrip" />
        </div>
        <Panel title="Controls" sub="How the cloud's backups run" data-server-controls>
          <div className={s.setRow}><div><div className={s.setName}>Every night at 2:00 am</div><div className={s.setSub}>Vercel Cron calls /api/cron/backup</div></div><Switch on={settings.nightly} onChange={(v) => start(async () => { await saveDataSettings({ nightly: v }); router.refresh(); })} name="Nightly backup" /></div>
          <div className={s.setRow}><div><div className={s.setName}>Keep the newest</div><div className={s.setSub}>Older ones are deleted after each backup</div></div>
            <select value={settings.keep_count} onChange={(e) => start(async () => { await saveDataSettings({ keep_count: Number(e.target.value) }); router.refresh(); })} disabled={pending} aria-label="Keep the newest" data-server-keep>{[3, 7, 14, 30, 60].map((k) => <option key={k} value={k}>{k} backups</option>)}</select></div>
          <div className={s.setRow}><div><div className={s.setName}>Stored files too</div><div className={s.setSub}>Logos, menu photos, attendance photos — up to {settings.files_cap_mb} MB</div></div><Switch on={settings.include_files} onChange={(v) => start(async () => { await saveDataSettings({ include_files: v }); router.refresh(); })} name="Include stored files" /></div>
        </Panel>
        {cloudHealth}
      </>}
    </>
  );
}

function summary(c: Command): string {
  const r = c.result ?? {};
  switch (c.op) {
    case "backup": return r.rows_total != null ? `${n(r.rows_total as number)} rows · ${fmtBytes(r.size_bytes as number)}${r.checked ? " · checked" : ""}` : "done";
    case "verify": return `${r.checked ?? 0} checked · ${r.ok ?? 0} fine${(r.bad as unknown[])?.length ? ` · ${(r.bad as unknown[]).length} damaged` : ""}`;
    case "delete": case "prune": return `${(r.deleted as unknown[])?.length ?? 0} deleted`;
    case "restore": return `${n(r.inserted as number)} rows brought back${r.failed ? ` · ${r.failed} refused` : ""}`;
    case "restore_preview": return `${n(r.missing as number)} missing`;
    case "report": return `${(r.report as { host?: string })?.host ?? "machine"} reported`;
    default: return "done";
  }
}
