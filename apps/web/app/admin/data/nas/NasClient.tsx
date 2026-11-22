"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HardDrive, Plus, Archive, Images, Loader2, Check, RefreshCw, ChevronRight, Wifi, ShieldCheck } from "lucide-react";
import { Sheet, Switch, ask, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, ago, n, useNow, Note, Meter, Panel, Tile } from "../bits";
import type { SetupInfo } from "../servers/Setup";
import { NasSetup, BRANDS, BRAND_LABEL, NAS_PATH, type NasBrand } from "./NasSetup";
import type { DataServer, MirrorReport } from "../types";
import s from "../Data.module.css";

/** A NAS is a server (0173) of kind `nas` with a brand and the two switches of 0189. The mirror report is the node's last word on the
 *  copied files: how many, how big, when, and what it could not fetch. */
export type NasServer = DataServer & {
  brand: NasBrand | null; mirror_files: boolean; mirror_buckets: string[];
  mirror_at: string | null; mirror_report: MirrorReport | null;
};
/** The newest word on the copied files: a Copy now (mirror_report, through the job) or the nightly (ridden along in the poll report). */
export const mirrorOf = (x: NasServer): MirrorReport | null => {
  const a = x.mirror_report, b = x.last_report?.mirror_last ?? null;
  if (!a) return b; if (!b) return a;
  return (b.at ?? "") > (x.mirror_at ?? "") ? b : a;
};
/** What a NAS may copy: the buckets, in the owner's words. */
export const BUCKETS: { id: string; label: string; what: string; public: boolean }[] = [
  { id: "brand", label: "Logos", what: "each property's logo", public: true },
  { id: "menu", label: "Dish photos", what: "the pictures on the menu", public: true },
  { id: "site", label: "Website images", what: "the property's own website", public: true },
  { id: "compliance", label: "Documents", what: "GST, FSSAI, licences and filings from Tax & compliance", public: false },
  { id: "attendance", label: "Attendance photos", what: "the punch-in selfies", public: false },
  { id: "support", label: "Support files", what: "what was attached to a help ticket", public: false },
];

export function NasClient({ servers, at, setup, serviceRole, adding: adding0 = false }: { servers: NasServer[]; at: string; setup: SetupInfo; serviceRole: boolean; adding?: boolean }) {
  const router = useRouter(); const now = useNow(Date.parse(at));
  const nas = servers.filter((x) => x.kind === "nas");
  const [adding, setAdding] = useState(adding0); const [brand, setBrand] = useState<NasBrand | null>(null); const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; token: string; name: string; brand: NasBrand } | null>(null);
  const online = nas.filter((x) => x.online).length;
  const lastCopy = nas.map((x) => x.last_backup?.at).filter(Boolean).sort().pop() ?? null;
  const filesTotal = nas.reduce((a, x) => a + (mirrorOf(x)?.files ?? 0), 0);

  const add = async () => {
    if (!brand) return; setBusy("add"); setErr(null);
    const r = await api<{ id?: string; token?: string }>("server-add", { kind: "nas", name, brand });
    setBusy(null);
    if (r.error || !r.id || !r.token) { setErr(r.error ?? "Could not add the NAS."); return; }
    setMade({ id: r.id, token: r.token, name: name.trim(), brand }); setName(""); router.refresh();
  };
  const set = async (x: NasServer, p: Record<string, unknown>, label: string) => {
    setBusy(x.id + label); const r = await api("server-set", { id: x.id, p }); setBusy(null);
    if (r.error) setErr(r.error); else router.refresh();
  };
  const run = async (x: NasServer, op: "backup" | "mirror", label: string) => {
    setBusy(x.id + op); const r = await api("server-command", { id: x.id, op, args: op === "backup" ? { kind: "manual", label } : {} }); setBusy(null);
    if (r.error) setErr(r.error); else router.refresh();
  };
  const close = () => { setAdding(false); setMade(null); setBrand(null); setErr(null); try { window.history.replaceState(null, "", "/admin/data/nas"); } catch { /* ignore */ } };

  return (
    <>
      {err && <Note tone="bad" data-nas-error>{err}</Note>}
      {/* the hero: what the NAS is doing for the data, in one line each */}
      <div className={s.hero} data-online={nas.length ? String(online > 0) : "false"} data-nas-hero>
        <span className={s.heroIcon}><HardDrive size={26} aria-hidden /></span>
        <div className="min-w-0">
          <div className={s.heroName}>{nas.length === 0 ? "No NAS yet" : nas.length === 1 ? nas[0].name : `${nas.length} NAS`}</div>
          <div className={s.heroSub}>{nas.length === 0 ? "A NAS at the restaurant keeps a copy of every backup and every file, on your own disk, every night."
            : `${online} of ${nas.length} online · last backup copy ${lastCopy ? ago(lastCopy, now) : "never"} · ${n(filesTotal)} files copied`}</div>
        </div>
        <div className={s.heroActs}>
          <button type="button" className={s.key} onClick={() => setAdding(true)} data-nas-add><Plus size={14} aria-hidden /> Add a NAS</button>
          {nas.length > 0 && <Link className={s.key} href="/admin/data/records"><Archive size={14} aria-hidden /> Every backup record</Link>}
        </div>
      </div>

      {nas.length > 0 && (
        <div className={s.tiles} data-nas-tiles>
          <Tile label="Backups on NAS" value={n(nas.reduce((a, x) => a + x.backups, 0))} sub={lastCopy ? `newest ${ago(lastCopy, now)}` : "none yet"} icon={<Archive size={14} aria-hidden />} tone={lastCopy ? "ok" : "warn"} />
          <Tile label="Files copied" value={n(filesTotal)} sub={fmtBytes(nas.reduce((a, x) => a + (mirrorOf(x)?.bytes ?? 0), 0))} icon={<Images size={14} aria-hidden />} />
          <Tile label="Disk free" value={nas[0]?.last_report?.disk_free != null ? fmtBytes(nas[0].last_report.disk_free) : "—"} sub={nas[0]?.last_report?.disk_total ? `of ${fmtBytes(nas[0].last_report.disk_total)}` : "no report yet"} icon={<HardDrive size={14} aria-hidden />} />
          <Tile label="Private files" value={serviceRole ? "copy" : "wait"} sub={serviceRole ? "documents, attendance, support" : "needs SUPABASE_SERVICE_ROLE_KEY on Vercel"} icon={<ShieldCheck size={14} aria-hidden />} tone={serviceRole ? "ok" : "warn"} />
        </div>
      )}

      {nas.map((x) => {
        const rep = x.last_report; const diskPct = rep?.disk_total ? Math.round(((rep.disk_total - (rep.disk_free ?? 0)) / rep.disk_total) * 100) : null;
        const m = mirrorOf(x);
        return (
          <Panel key={x.id} title={x.name} sub={<span className="flex items-center gap-1.5 flex-wrap"><i className={s.dot} data-on={x.online ? "true" : x.last_seen_at ? "warn" : "false"} />{x.online ? "online" : x.last_seen_at ? `offline · seen ${ago(x.last_seen_at, now)}` : "never connected — set it up"}{x.brand && <> · {BRAND_LABEL[x.brand]}</>}{rep?.host && <> · {rep.host}</>}{x.paused && <span className={s.chip} data-tone="warn">paused</span>}</span>}
            right={<span className={s.chip} data-tone={x.active ? "tint" : undefined}>{x.active ? <><Check size={11} aria-hidden /> connected</> : "kept"}</span>} data-nas-card={x.id}>
            <div className="px-[18px] pb-[18px] grid gap-3">
              <div className={s.srvFacts} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div className={s.srvFact}><i>Backups here</i><b>{n(x.backups)}{x.last_backup ? ` · ${ago(x.last_backup.at, now)}` : ""}</b></div>
                <div className={s.srvFact}><i>Files copied</i><b>{m ? `${n(m.files ?? 0)} · ${fmtBytes(m.bytes ?? 0)}` : "none yet"}</b></div>
                <div className={s.srvFact}><i>Disk</i><b>{rep?.disk_free != null ? `${fmtBytes(rep.disk_free)} free` : "—"}</b>{diskPct !== null && <Meter used={diskPct} max={100} />}</div>
                <div className={s.srvFact}><i>Folder</i><b>{rep?.dir ?? (x.brand ? NAS_PATH[x.brand] : "—")}</b></div>
              </div>

              {/* the two switches — each its own, the second needs the first's node but not the first's switch */}
              <div className="rounded-[16px] bg-[var(--color-fill)] overflow-hidden" data-nas-switches>
                <label className={cn(s.setRow, "!border-t-0 cursor-pointer")} data-nas-switch="backups">
                  <div><div className={s.setName}><Archive size={14} className="inline mr-1.5 -mt-0.5" aria-hidden />Backups on this NAS</div>
                    <div className={s.setSub}>Every night at {rep?.nightly_hour ?? 2}:00 on the NAS's clock, keeping the newest {x.keep_count}; Back up now and Restore use it when it is connected.</div></div>
                  {/* on a phone the keep-select and the switch take the next line, so the words keep their width */}
                  <span className="flex items-center gap-2 flex-none max-[480px]:basis-full max-[480px]:justify-end">
                    <select className="!min-h-9 !py-0 !text-[13px]" value={x.keep_count} onChange={(e) => void set(x, { keep_count: Number(e.target.value) }, "keep")} aria-label="Keep the newest" data-nas-keep>
                      {[7, 14, 30, 60, 90, 180, 365].map((k) => <option key={k} value={k}>keep {k}</option>)}</select>
                    <Switch on={x.nightly} onChange={(v) => void set(x, { nightly: v }, "nightly")} name="Backups on this NAS" />
                  </span>
                </label>
                <label className={cn(s.setRow, "cursor-pointer")} data-nas-switch="files">
                  <div><div className={s.setName}><Images size={14} className="inline mr-1.5 -mt-0.5" aria-hidden />Photos & documents on this NAS</div>
                    <div className={s.setSub}>A copy of every stored file — logos, dish photos, website images, the documents from Tax & compliance, attendance photos, support files — after each nightly and on <b>Copy now</b>. {m?.skipped_private ? `${n(m.skipped_private)} private files wait for the service-role key on Vercel.` : ""}</div></div>
                  <Switch on={x.mirror_files} onChange={(v) => void set(x, { mirror_files: v }, "mirror")} name="Photos and documents on this NAS" />
                </label>
                {x.mirror_files && (
                  <div className={cn(s.setRow, "!pt-2")} data-nas-buckets>
                    <div className="flex flex-wrap gap-1.5">
                      {BUCKETS.map((b) => { const on = x.mirror_buckets.includes(b.id); return (
                        <button key={b.id} type="button" className="chip" data-on={on} aria-pressed={on} title={b.what} onClick={() => void set(x, { mirror_buckets: on ? x.mirror_buckets.filter((k) => k !== b.id) : [...x.mirror_buckets, b.id] }, "buckets")}
                          style={on ? { background: "var(--color-label)", color: "var(--color-bg)" } : undefined}>{on && <Check size={12} aria-hidden />} {b.label}{!b.public && !serviceRole ? " · waits" : ""}</button>); })}
                    </div>
                  </div>
                )}
                <div className={cn(s.setRow, "!border-t")} data-nas-lan>
                  <div><div className={s.setName}><Wifi size={14} className="inline mr-1.5 -mt-0.5" aria-hidden />Run DineFlow on this NAS when the internet is down</div>
                    <div className={s.setSub}>The till, the kitchen and billing from the NAS itself, syncing back when the line returns. Next phase — it is not a switch yet.</div></div>
                  <span className={s.chip}>next phase</span>
                </div>
              </div>

              <div className={s.srvActs}>
                <button type="button" className={s.key} disabled={!!busy || !x.online} onClick={() => void run(x, "backup", "From Master control")} data-nas-backup-now>{busy === x.id + "backup" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Archive size={14} aria-hidden />} Back up now</button>
                <button type="button" className={s.key} disabled={!!busy || !x.online || !x.mirror_files} onClick={() => void run(x, "mirror", "")} data-nas-copy-now>{busy === x.id + "mirror" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Copy files now</button>
                {!x.active && <button type="button" className={s.key} disabled={!!busy} onClick={async () => { if (!(await ask({ title: `Connect to ${x.name}?`, body: "Back up now, the nightly backup and Restore will use this NAS. The live database stays on Supabase.", ok: "Connect" }))) return; setBusy(x.id); const r = await api("active-server", { id: x.id }); setBusy(null); if (r.error) setErr(r.error); else router.refresh(); }} data-nas-connect><Check size={14} aria-hidden /> Connect</button>}
                <Link className={s.key} href={`/admin/data/servers/${x.id}`} data-nas-open>Dashboard & job log <ChevronRight size={14} aria-hidden /></Link>
                {x.queued > 0 && <span className={s.chip} data-tone="tint">{x.queued} job{x.queued === 1 ? "" : "s"} waiting</span>}
                {x.failed_24h > 0 && <span className={s.chip} data-tone="bad">{x.failed_24h} failed today</span>}
              </div>
              {m?.note && <Note tone="warn">{m.note}</Note>}
            </div>
          </Panel>
        );
      })}

      {nas.length === 0 && (
        <Panel title="What a NAS does here" sub="One shared folder on the NAS, two things inside it.">
          <dl className={s.kv} data-nas-what>
            <div><dt>Backups</dt><dd>every night, the whole database as one checked file · keep 7–365</dd></div>
            <div><dt>Photos & documents</dt><dd>a copy of every stored file, by bucket, after each nightly</dd></div>
            <div><dt>Works with</dt><dd>Synology · QNAP · any NAS with Docker · a Linux box or Windows PC beside it</dd></div>
            <div><dt>Needs</dt><dd>outgoing internet only — no port, no router change, no database password on the NAS</dd></div>
          </dl>
        </Panel>
      )}

      <Sheet open={adding} onClose={close} title={made ? `${made.name} is added` : brand ? `Add a ${BRAND_LABEL[brand]}` : "Add a NAS"} wide>
        {made ? <NasSetup brand={made.brand} name={made.name} token={made.token} setup={setup} /> : !brand ? (
          <div className="grid gap-3" data-nas-brands>
            <p className="text-[13.5px] text-[var(--color-label-2)]">Which NAS is it? The steps differ a little.</p>
            <div className={s.opts}>
              {BRANDS.map((b) => (
                <button key={b.key} type="button" className={s.opt2} onClick={() => setBrand(b.key)} data-nas-brand={b.key}>
                  <span className={s.optIcon}><HardDrive size={20} aria-hidden /></span>
                  <span className="min-w-0"><span className={s.optName}>{b.label}</span><span className={cn(s.optSub, "block")}>{b.sub} · {b.how === "docker" ? "a compose file" : "the installer"}</span></span>
                  <ChevronRight size={16} className="text-[var(--color-label-3)]" aria-hidden />
                </button>))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4" data-nas-name>
            <label className={s.label}>A name for it<input value={name} onChange={(e) => setName(e.target.value)} placeholder={brand === "synology" ? "Synology at the restaurant" : brand === "qnap" ? "QNAP in the office" : "NAS"} maxLength={60} autoFocus /></label>
            <p className="text-[13px] text-[var(--color-label-2)]">Next: the token is made and shown once, with the {BRANDS.find((b) => b.key === brand)?.how === "docker" ? "compose file" : "installer steps"} that carry it.</p>
            <div className="flex gap-2 flex-wrap"><button type="button" className={s.key} onClick={() => setBrand(null)}>Back</button>
              <button type="button" className={cn(s.key, "!bg-[var(--color-tint)] !text-[var(--color-on-tint)]")} disabled={name.trim().length < 2 || busy === "add"} onClick={() => void add()} data-nas-make>{busy === "add" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />} Make the token</button></div>
          </div>
        )}
      </Sheet>
    </>
  );
}
