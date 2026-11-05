"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, Archive, Loader2, ServerCog } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { ago, when, n, useNow, useCommand, Note } from "./bits";
import { StoragePanel, BackupNow, protection } from "./panels";
import { KIND_ICON } from "./ServerConnection";
import { type Overview, type Settings, type Backup, type DataServer, KIND_SHORT } from "./types";
import s from "./Data.module.css";

/** Back up now on whichever server is connected: the cloud runs it in one request; a node is asked and watched until it answers. */
export function BackupNowFor({ server, onDone }: { server: DataServer; onDone: (m: { ok: boolean; text: string }) => void }) {
  const router = useRouter(); const { cmd, busy, start } = useCommand();
  if (server.kind === "cloud") return <BackupNow onDone={onDone} />;
  const go = async () => {
    const r = await start(server.id, "backup", { kind: "manual" });
    if ("error" in r && r.error) { onDone({ ok: false, text: r.error }); return; }
    const res = (r as { status: string; result: Record<string, unknown> | null; error: string | null });
    if (res.status === "done") { const x = res.result ?? {}; onDone({ ok: true, text: `${server.name} backed up ${n(x.rows_total as number)} rows in ${x.tables} tables — ${fmtBytes(x.size_bytes as number)} in ${Math.round(((x.ms as number) ?? 0) / 1000)} s${x.checked ? ", checked" : ""}.` }); }
    else onDone({ ok: false, text: `${server.name} could not back up: ${res.error ?? "unknown error"}` });
    router.refresh();
  };
  return (
    <button type="button" onClick={go} disabled={busy} className="btn btn-filled !h-11 !px-5" data-backup-now title={server.online ? "" : `${server.name} is offline — the job waits for it`}>
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />}
      {busy ? (cmd?.status === "taken" ? `${server.name} is backing up…` : `Waiting for ${server.name}…`) : `Back up now · ${server.name}`}
    </button>
  );
}

export function OverviewClient({ overview, settings, servers, backups, env }: { overview: Overview; settings: Settings; servers: DataServer[]; backups: Backup[]; env: { cron: boolean; serviceRole: boolean } }) {
  const now = useNow(Date.parse(overview.at));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const active = servers.find((x) => x.active) ?? servers[0];
  const p = protection(backups, now);
  const nightly = active.kind === "cloud" ? settings.nightly && env.cron && env.serviceRole : active.nightly && !active.paused;
  const nightlyText = active.kind === "cloud" ? (!settings.nightly ? "Nightly off" : env.cron && env.serviceRole ? "Nightly 2:00 am" : "Nightly waits for Vercel keys") : active.paused ? "Paused" : active.nightly ? `Nightly 2:00 am on ${active.name}` : "Nightly off";
  const Icon = KIND_ICON[active.kind];
  return (
    <>
      <div className={s.guard} data-guard={p.tone} data-data-guard>
        <span className={s.guardIcon}>{p.tone === "ok" ? <ShieldCheck size={24} aria-hidden /> : <ShieldAlert size={24} aria-hidden />}</span>
        <div className={s.guardText}>
          <div className={s.guardTitle}>{p.title}</div>
          <div className={s.guardFacts}>
            <span data-guard-server><Icon size={12} aria-hidden />{KIND_SHORT[active.kind]} · {active.name}{active.kind !== "cloud" && <i className={s.dot} data-on={active.online ? "true" : "warn"} />}{active.kind !== "cloud" && (active.online ? "online" : "offline")}</span>
            <span><i className={s.dot} data-on={p.last ? "true" : "false"} />{p.last ? `Last: ${when(p.last.finished_at ?? p.last.started_at)} · ${fmtBytes(p.last.size_bytes)}` : "Nothing saved yet"}</span>
            <span data-guard-nightly={nightly ? "on" : "off"}><i className={s.dot} data-on={nightly ? "true" : "warn"} />{nightlyText}</span>
            <span><i className={s.dot} data-on={settings.offsite_on ? "true" : "warn"} />{settings.offsite_on ? "Outside copy on" : "No outside copy"}</span>
            <span><i className={s.dot} data-on={settings.last_download_at && now - new Date(settings.last_download_at).getTime() < 8 * 86400000 ? "true" : "warn"} />Downloaded {ago(settings.last_download_at, now)}</span>
          </div>
        </div>
        <div className={s.guardAct}><BackupNowFor server={active} onDone={setMsg} /></div>
      </div>
      {msg && <Note tone={msg.ok ? "ok" : "bad"} data-data-msg={msg.ok ? "ok" : "error"}>{msg.text}</Note>}

      {servers.length > 1 && <div className={s.srvGrid} data-overview-servers>
        {servers.map((x) => { const K = KIND_ICON[x.kind]; return (
          <Link key={x.id} href={`/admin/data/servers/${x.id}`} className={cn(s.srv, "hover:bg-[var(--color-fill)] transition-colors")} data-active={x.active} data-online={x.online} data-overview-server={x.kind}>
            <div className={s.srvHead}><span className={s.optIcon}><K size={18} aria-hidden /></span>
              <div className={s.srvName}><b>{x.name}</b><span>{KIND_SHORT[x.kind]}{x.active ? " · connected" : ""}{x.kind !== "cloud" ? ` · ${x.online ? "online" : x.last_seen_at ? `last seen ${ago(x.last_seen_at, now)}` : "never connected"}` : ""}</span></div></div>
            <div className={s.srvFacts}>
              <div className={s.srvFact}><i>Backups</i><b>{n(x.backups)}</b></div>
              <div className={s.srvFact}><i>Last</i><b>{x.last_backup ? ago(x.last_backup.at, now) : "—"}</b></div>
            </div>
          </Link>); })}
        <Link href="/admin/data/servers" className={s.addCard} data-overview-add><ServerCog size={22} aria-hidden /><span>Servers</span><span className="text-[12px] font-medium text-[var(--color-label-3)]">add, connect, control</span></Link>
      </div>}

      <StoragePanel o={overview} />
    </>
  );
}
