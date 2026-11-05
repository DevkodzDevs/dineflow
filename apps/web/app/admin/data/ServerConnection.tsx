"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cloud, Server as ServerIcon, Laptop, Check, Loader2, Plug, ChevronRight, Plus } from "lucide-react";
import { Sheet, ask, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, ago, Note } from "./bits";
import { type DataServer, type ServerKind, KIND_LABEL, CLOUD_ID } from "./types";
import s from "./Data.module.css";

export const KIND_ICON = { cloud: Cloud, own: ServerIcon, laptop: Laptop } as const;
const KIND_BLURB: Record<ServerKind, string> = {
  cloud: "Supabase's storage, where the live database is. Backups sit beside the data — quick, but in the same place.",
  own: "A machine you own that stays on. Backups are kept on its disk, away from the cloud.",
  laptop: "Your laptop keeps the backups while it is on; it catches up when it comes back.",
};

/** The Server connection key and its dialog: the three kinds, each with its servers; a different pick asks first (0173). */
export function ServerConnection({ servers, now }: { servers: DataServer[]; now: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const active = servers.find((x) => x.active) ?? servers.find((x) => x.kind === "cloud")!;
  const Icon = KIND_ICON[active.kind];
  const pick = async (to: DataServer) => {
    if (to.id === active.id) { setOpen(false); return; }
    const okGo = await ask({
      title: `Connect to ${to.name}?`,
      body: `From now on, Back up now, the nightly backup and Restore use ${to.name} (${KIND_LABEL[to.kind]}). The live database stays on Supabase — nothing moves. Backups already on ${active.name} stay there.${to.kind !== "cloud" && !to.online ? ` ${to.name} is offline right now, so its jobs wait until it comes back.` : ""}`,
      ok: `Connect to ${to.name}`, cancel: "Keep " + active.name, tone: "danger", icon: "alert",
    });
    if (!okGo) return;
    setBusy(to.id); setErr(null);
    const r = await api("active-server", { id: to.id === CLOUD_ID ? null : to.id });
    setBusy(null);
    if (r.error) { setErr(r.error); return; }
    setOpen(false); router.refresh();
  };
  return (
    <>
      <button type="button" className={s.conn} data-online={active.online} onClick={() => setOpen(true)} data-server-connection aria-haspopup="dialog">
        <span className={s.connIcon}><Icon size={16} aria-hidden /></span>
        <span className={s.connText}><span className={s.connCap}>Server connection</span><span className={s.connName}><i className={s.pulse} aria-hidden />{active.name}</span></span>
        <ChevronRight size={16} className="text-[var(--color-label-3)] shrink-0" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Server connection">
        <div className="grid gap-4" data-connection-dialog>
          <Note>Where backups are made, kept, checked and restored from. The live database always stays on Supabase.</Note>
          {err && <Note tone="bad">{err}</Note>}
          {(["cloud", "own", "laptop"] as ServerKind[]).map((kind) => {
            const K = KIND_ICON[kind]; const list = servers.filter((x) => x.kind === kind);
            return (
              <section key={kind} className="grid gap-2" data-connection-kind={kind}>
                <div className={s.kindHead}><h3>{KIND_LABEL[kind]}</h3><span>{KIND_BLURB[kind]}</span></div>
                <div className={s.opts}>
                  {list.map((x) => (
                    <button key={x.id} type="button" className={s.opt2} aria-pressed={x.active} disabled={!!busy} onClick={() => pick(x)} data-connection-option={x.id}>
                      <span className={s.optIcon}>{busy === x.id ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <K size={18} aria-hidden />}</span>
                      <span className="min-w-0">
                        <span className={s.optName}>{x.name}{x.active && <span className={s.chip} data-tone="tint"><Check size={11} aria-hidden /> connected</span>}
                          {kind !== "cloud" && <span className={s.chip} data-tone={x.online ? "ok" : "warn"}>{x.online ? "online" : x.last_seen_at ? `last seen ${ago(x.last_seen_at, now)}` : "never connected"}</span>}</span>
                        <span className={s.optSub}>{x.backups} backups{x.last_backup ? ` · last ${ago(x.last_backup.at, now)} · ${fmtBytes(x.last_backup.size_bytes)}` : ""}{x.kind !== "cloud" && x.last_report?.disk_free != null ? ` · ${fmtBytes(x.last_report.disk_free)} free` : ""}</span>
                      </span>
                      <span className={s.optRight}>{!x.active && <span className={cn(s.chip)}><Plug size={11} aria-hidden /> connect</span>}</span>
                    </button>
                  ))}
                  {kind !== "cloud" && <Link href={`/admin/data/servers?add=${kind}`} className={s.opt2} onClick={() => setOpen(false)} data-connection-add={kind}>
                    <span className={s.optIcon}><Plus size={18} aria-hidden /></span>
                    <span className="min-w-0"><span className={s.optName}>{list.length ? `Add another ${kind === "own" ? "server" : "laptop"}` : `Set up ${kind === "own" ? "your own server" : "your laptop"}`}</span>
                      <span className={s.optSub}>Free. One file to run, no port to open, no database password on the machine.</span></span>
                    <span className={s.optRight}><ChevronRight size={16} className="text-[var(--color-label-3)]" aria-hidden /></span>
                  </Link>}
                </div>
              </section>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
