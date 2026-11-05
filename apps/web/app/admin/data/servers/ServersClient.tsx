"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Plug, ChevronRight, Loader2, Check, ExternalLink } from "lucide-react";
import { Sheet, ask, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, ago, n, useNow, Note, Meter, Panel } from "../bits";
import { KIND_ICON } from "../ServerConnection";
import { Setup, type SetupInfo } from "./Setup";
import { type DataServer, type ServerKind, KIND_LABEL, CLOUD_ID } from "../types";
import s from "../Data.module.css";

const KIND_INTRO: Record<ServerKind, { title: string; sub: string; cost: string }> = {
  own: { title: "Own server", sub: "A machine you own that stays on — a mini PC, a Raspberry Pi, an old PC with a big disk. Backups live on its disk, away from the cloud.", cost: "Free · the machine and its power" },
  laptop: { title: "Laptop", sub: "Your laptop keeps the backups while it is on. It catches up with the nightly when it comes back.", cost: "Free" },
  cloud: { title: "Outside · Supabase", sub: "The live database's own storage. Backups here are quick but sit beside the data they protect — keep a copy elsewhere too.", cost: "Free to 1 GB · Pro $25 a month" },
};

export function ServersClient({ servers, at, addKind, setup }: { servers: DataServer[]; at: string; addKind: ServerKind | null; setup: SetupInfo }) {
  const router = useRouter(); const now = useNow(Date.parse(at));
  const [adding, setAdding] = useState<ServerKind | null>(addKind === "own" || addKind === "laptop" ? addKind : null);
  const [name, setName] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; token: string; name: string; kind: ServerKind } | null>(null);
  const add = async () => {
    if (!adding) return; setBusy("add"); setErr(null);
    const r = await api<{ id?: string; token?: string }>("server-add", { kind: adding, name });
    setBusy(null);
    if (r.error || !r.id || !r.token) { setErr(r.error ?? "Could not add the server."); return; }
    setMade({ id: r.id, token: r.token, name: name.trim(), kind: adding }); setName(""); router.refresh();
  };
  const connect = async (x: DataServer) => {
    const active = servers.find((y) => y.active) ?? servers[0];
    if (!(await ask({ title: `Connect to ${x.name}?`, body: `Back up now, the nightly backup and Restore will use ${x.name} (${KIND_LABEL[x.kind]}). The live database stays on Supabase. Backups already on ${active.name} stay there.${x.kind !== "cloud" && !x.online ? ` ${x.name} is offline right now, so its jobs wait until it comes back.` : ""}`, ok: `Connect`, cancel: `Keep ${active.name}`, tone: "danger", icon: "alert" }))) return;
    setBusy(x.id); const r = await api("active-server", { id: x.id === CLOUD_ID ? null : x.id }); setBusy(null);
    if (r.error) setErr(r.error); else router.refresh();
  };
  const close = () => { setAdding(null); setMade(null); setErr(null); try { window.history.replaceState(null, "", "/admin/data/servers"); } catch { /* ignore */ } };
  return (
    <>
      {err && <Note tone="bad" data-servers-error>{err}</Note>}
      {(["own", "laptop", "cloud"] as ServerKind[]).map((kind) => {
        const K = KIND_ICON[kind]; const list = servers.filter((x) => x.kind === kind); const intro = KIND_INTRO[kind];
        return (
          <Panel key={kind} title={intro.title} sub={intro.sub} right={<span className={s.chip} data-tone={kind === "cloud" ? undefined : "ok"}>{intro.cost}</span>} data-servers-kind={kind}>
            <div className="px-[18px] pb-[18px]">
              <div className={s.srvGrid}>
                {list.map((x) => {
                  const rep = x.last_report; const diskPct = rep?.disk_total ? Math.round(((rep.disk_total - (rep.disk_free ?? 0)) / rep.disk_total) * 100) : null;
                  return (
                    <div key={x.id} className={s.srv} data-active={x.active} data-online={x.online} data-server-card={x.id}>
                      <div className={s.srvHead}>
                        <span className={s.optIcon}><K size={18} aria-hidden /></span>
                        <div className={s.srvName}><b>{x.name}</b>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {x.kind !== "cloud" && <i className={s.dot} data-on={x.online ? "true" : x.last_seen_at ? "warn" : "false"} />}
                            {x.kind === "cloud" ? "always on" : x.online ? "online" : x.last_seen_at ? `offline · seen ${ago(x.last_seen_at, now)}` : "never connected — set it up"}
                            {x.paused && <span className={s.chip} data-tone="warn">paused</span>}
                          </span></div>
                        {x.active && <span className={s.chip} data-tone="tint"><Check size={11} aria-hidden /> connected</span>}
                      </div>
                      <div className={s.srvFacts}>
                        <div className={s.srvFact}><i>Backups</i><b>{n(x.backups)}{x.kind !== "cloud" ? ` · ${fmtBytes(x.files_bytes)}` : ""}</b></div>
                        <div className={s.srvFact}><i>Last backup</i><b>{x.last_backup ? `${ago(x.last_backup.at, now)}${x.last_backup.verify_ok ? " ✓" : ""}` : "none yet"}</b></div>
                        {x.kind !== "cloud" && <div className={s.srvFact}><i>Disk free</i><b>{rep?.disk_free != null ? fmtBytes(rep.disk_free) : "—"}</b>{diskPct != null && <Meter used={diskPct} max={100} label="Disk used" />}</div>}
                        {x.kind !== "cloud" && <div className={s.srvFact}><i>Machine</i><b title={rep?.os}>{rep?.host ?? "—"}</b></div>}
                        {x.kind === "cloud" && <div className={s.srvFact}><i>Keeps</i><b>{x.keep_count} newest</b></div>}
                        {x.kind === "cloud" && <div className={s.srvFact}><i>Nightly</i><b>{x.nightly ? "on" : "off"}</b></div>}
                      </div>
                      {x.failed_24h > 0 && <Note tone="warn">{x.failed_24h} job{x.failed_24h > 1 ? "s" : ""} failed in the last day — see its dashboard.</Note>}
                      <div className={s.srvActs}>
                        <Link href={`/admin/data/servers/${x.id}`} className={cn(s.key)} data-server-open>Dashboard <ChevronRight size={14} aria-hidden /></Link>
                        {!x.active && <button type="button" className={s.key} disabled={!!busy} onClick={() => connect(x)} data-server-connect>{busy === x.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plug size={14} aria-hidden />} Connect</button>}
                      </div>
                    </div>
                  );
                })}
                {kind !== "cloud" && <button type="button" className={s.addCard} onClick={() => { setAdding(kind); setMade(null); setErr(null); }} data-server-add={kind}>
                  <Plus size={22} aria-hidden /><span>{list.length ? `Add another ${kind === "own" ? "server" : "laptop"}` : `Set up ${kind === "own" ? "your own server" : "your laptop"}`}</span>
                  <span className="text-[12px] font-medium text-[var(--color-label-3)]">one file · no port · no database password</span></button>}
                {kind === "cloud" && <Link href="/admin/data/offsite" className={s.addCard} data-server-offsite><ExternalLink size={22} aria-hidden /><span>Outside copies &amp; plans</span><span className="text-[12px] font-medium text-[var(--color-label-3)]">Cloudflare R2 · Backblaze · Supabase Pro</span></Link>}
              </div>
            </div>
          </Panel>
        );
      })}

      <Sheet open={!!adding} onClose={close} title={made ? `${made.name} is added` : `Add ${adding === "own" ? "your own server" : "your laptop"}`} wide>
        {adding && !made && (
          <div className="grid gap-3" data-add-server>
            <Note>{KIND_INTRO[adding].sub}</Note>
            <label className={s.label}>A name for it<input value={name} onChange={(e) => setName(e.target.value)} placeholder={adding === "own" ? "Office server" : "Mano's laptop"} maxLength={60} autoFocus data-add-name /></label>
            <div className="flex gap-2"><button type="button" className="btn btn-filled !h-11" disabled={name.trim().length < 2 || busy === "add"} onClick={add} data-add-go>{busy === "add" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />} Add and show the setup</button>
              <button type="button" className="btn btn-gray !h-11" onClick={close}>Cancel</button></div>
          </div>
        )}
        {made && <Setup kind={made.kind} name={made.name} token={made.token} setup={setup} />}
        {made && <div className="mt-4 flex gap-2 flex-wrap"><Link href={`/admin/data/servers/${made.id}`} className="btn btn-filled !h-11" data-add-dashboard>Open its dashboard</Link><button type="button" className="btn btn-gray !h-11" onClick={close}>Done</button></div>}
      </Sheet>
    </>
  );
}
