"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Moon, Building2, Download, ShieldCheck, CloudUpload, Trash2, Loader2, Check, X, Search, RotateCcw, FileDown } from "lucide-react";
import { ask, Switch, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, ago, when, n, Panel, Note } from "./bits";
import { saveDataSettings } from "./actions";
import type { Backup, Settings, Env, Overview } from "./types";
import s from "./Data.module.css";

const KIND = { manual: { label: "Manual", Icon: Archive }, nightly: { label: "Nightly", Icon: Moon }, property: { label: "Property", Icon: Building2 } } as const;

export function BackupsPanel({ backups, settings, env, properties, onMsg, now }: { backups: Backup[]; settings: Settings; env: Env; properties: Overview["properties"]; onMsg: (m: { ok: boolean; text: string }) => void; now: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [rid, setRid] = useState(properties.find((p) => !p.demo)?.id ?? properties[0]?.id ?? "");
  const save = (p: Record<string, unknown>) => start(async () => { const r = await saveDataSettings(p); if ("error" in r && r.error) onMsg({ ok: false, text: r.error }); });
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };

  const download = (b: Backup) => run(`dl-${b.id}`, async () => {
    const r = await api<{ url?: string; name?: string }>("download", { id: b.id });
    if (r.error || !r.url) { onMsg({ ok: false, text: r.error ?? "No download link." }); return; }
    const a = document.createElement("a"); a.href = r.url; a.download = r.name ?? "backup.json.gz"; document.body.appendChild(a); a.click(); a.remove();
    router.refresh();
  });
  const verify = (b: Backup) => run(`v-${b.id}`, async () => {
    const r = await api<{ ok?: boolean; note?: string }>("verify", { id: b.id });
    onMsg({ ok: !!r.ok, text: r.error ?? (r.ok ? `Checked: ${r.note}` : `Check failed: ${r.note}`) }); router.refresh();
  });
  const offsite = (b: Backup) => run(`o-${b.id}`, async () => {
    const r = await api<{ ok?: boolean; note?: string }>("offsite-copy", { id: b.id });
    onMsg({ ok: !!r.ok, text: r.error ?? (r.ok ? `Copied off-site: ${r.note}` : `Off-site copy failed: ${r.note}`) }); router.refresh();
  });
  const remove = async (b: Backup) => {
    if (!(await ask({ title: "Delete this backup?", body: `${KIND[b.kind].label} · ${when(b.started_at)}${b.size_bytes ? ` · ${fmtBytes(b.size_bytes)}` : ""}. The file goes for good.`, ok: "Delete", tone: "danger", icon: "trash" }))) return;
    await run(`d-${b.id}`, async () => { const r = await api<{ deleted?: number }>("delete", { ids: [b.id] }); onMsg({ ok: !r.error, text: r.error ?? "Backup deleted." }); router.refresh(); });
  };
  const exportOne = () => run("export", async () => {
    const r = await api<{ url?: string | null; path?: string; rows?: number; size?: number }>("export", { restaurant: rid });
    if (r.error) { onMsg({ ok: false, text: r.error }); return; }
    onMsg({ ok: true, text: `Exported ${n(r.rows)} rows · ${fmtBytes(r.size)}. Keys, tokens and codes are left out.` });
    if (r.url) { const a = document.createElement("a"); a.href = r.url; a.download = r.path?.split("/").pop() ?? "export.json.gz"; document.body.appendChild(a); a.click(); a.remove(); }
    router.refresh();
  });

  const needs = [!env.cron && "CRON_SECRET", !env.serviceRole && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) as string[];
  const newest = backups.find((b) => b.status === "done" && b.kind !== "property");
  const stale = !settings.last_download_at || now - new Date(settings.last_download_at).getTime() > 7 * 86400000;
  return (
    <>
      <div className={s.cols}>
        <Panel title="How backups run" sub="Saved to a private folder only Master control can open" data-data-settings>
          <div className={s.setRow}>
            <div><div className={s.setName}>Every night at 2:00 am</div>
              <div className={s.setSub}>{needs.length ? <>Waits for <b>{needs.join(" and ")}</b> on Vercel</> : settings.nightly ? "Ready — the scheduler calls it" : "Off"}</div></div>
            <Switch on={settings.nightly} onChange={(v) => save({ nightly: v })} name="Nightly backup" />
          </div>
          <div className={s.setRow}>
            <div><div className={s.setName}>Keep the newest</div><div className={s.setSub}>Older ones are deleted after each backup</div></div>
            <select value={settings.keep_count} onChange={(e) => save({ keep_count: Number(e.target.value) })} disabled={pending} data-keep-count aria-label="How many backups to keep">
              {[3, 7, 14, 30, 60].map((k) => <option key={k} value={k}>{k} backups</option>)}
            </select>
          </div>
          <div className={s.setRow}>
            <div><div className={s.setName}>Stored files too</div><div className={s.setSub}>Logos, menu photos, attendance photos</div></div>
            <Switch on={settings.include_files} onChange={(v) => save({ include_files: v })} name="Include stored files" />
          </div>
          {settings.include_files && <div className={s.setRow}>
            <div><div className={s.setName}>Up to</div><div className={s.setSub}>Bigger files are listed, not copied (a file may be 50 MB)</div></div>
            <select value={settings.files_cap_mb} onChange={(e) => save({ files_cap_mb: Number(e.target.value) })} disabled={pending} data-files-cap aria-label="Most file space in a backup">
              {[5, 10, 25, 40].map((k) => <option key={k} value={k}>{k} MB of files</option>)}
            </select>
          </div>}
        </Panel>

        <Panel title="Keep a copy away from Supabase" sub="If the project is lost, its backups go with it" data-data-away>
          <div className={s.pad}>
            {stale ? <Note tone="warn" data-download-nudge>Download the newest backup once a week — {settings.last_download_at ? `last ${ago(settings.last_download_at, now)}` : "never downloaded yet"}.</Note>
              : <Note tone="ok">Downloaded {ago(settings.last_download_at, now)}.</Note>}
            {newest && <button type="button" className="btn btn-gray !h-11" onClick={() => download(newest)} disabled={!!busy} data-download-newest>
              {busy === `dl-${newest.id}` ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />} Download the newest · {fmtBytes(newest.size_bytes)}</button>}
            <Note>{settings.offsite_on ? "Each backup is also copied to your off-site store." : "Or copy each one automatically to Cloudflare R2 or Backblaze — free up to 10 GB (Off-site & plans)."}</Note>
          </div>
        </Panel>
      </div>

      <Panel title="Backups" sub={`${backups.filter((b) => b.status === "done").length} saved · newest first`} data-data-backups>
        {backups.length === 0 ? <div className={s.pad}><Note tone="warn">No backup yet — press Back up now above.</Note></div> : (
          <div className={s.list}>
            {backups.map((b) => {
              const K = KIND[b.kind];
              return (
                <div key={b.id} className={s.bk} data-status={b.status} data-backup-row={b.kind}>
                  <span className={s.bkIcon}><K.Icon size={17} aria-hidden /></span>
                  <div className={s.bkText}>
                    <div className={s.bkTitle}>
                      {b.kind === "property" ? `Export · ${b.label ?? "property"}` : `${K.label}${b.label ? ` · ${b.label}` : ""}`}
                      {b.status === "running" && <span className={s.chip} data-tone="warn">running</span>}
                      {b.status === "failed" && <span className={s.chip} data-tone="bad">failed</span>}
                      {b.status === "done" && (b.verify_ok ? <span className={s.chip} data-tone="ok" title={b.verify_note ?? ""} data-checked="ok"><Check size={11} aria-hidden /> checked</span>
                        : b.verify_ok === false ? <span className={s.chip} data-tone="bad" title={b.verify_note ?? ""} data-checked="bad"><X size={11} aria-hidden /> check failed</span>
                        : <span className={s.chip}>not checked</span>)}
                      {b.offsite_ok && <span className={s.chip} data-tone="tint" title={b.offsite_note ?? ""}><CloudUpload size={11} aria-hidden /> off-site</span>}
                      {b.offsite_ok === false && <span className={s.chip} data-tone="bad" title={b.offsite_note ?? ""}>off-site failed</span>}
                    </div>
                    <div className={s.bkMeta}>{when(b.started_at)}{b.status === "done" && <> · {fmtBytes(b.size_bytes)} · {n(b.rows_total)} rows · {b.tables} tables · {b.files ?? 0} files</>}</div>
                    {b.status === "failed" && b.error && <div className={s.bkErr}>{b.error}</div>}
                    {b.verify_ok === false && b.verify_note && <div className={s.bkErr}>{b.verify_note}</div>}
                  </div>
                  <div className={s.bkActs}>
                    {b.status === "done" && <>
                      <button type="button" className={s.key} onClick={() => download(b)} disabled={!!busy} data-act="download">{busy === `dl-${b.id}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />} Download</button>
                      <button type="button" className={s.key} onClick={() => verify(b)} disabled={!!busy} data-act="verify">{busy === `v-${b.id}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />} Check</button>
                      {settings.offsite_secret_set && settings.offsite_bucket && <button type="button" className={s.key} onClick={() => offsite(b)} disabled={!!busy} data-act="offsite">{busy === `o-${b.id}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CloudUpload size={14} aria-hidden />} Off-site</button>}
                    </>}
                    {b.status !== "running" && <button type="button" className={s.key} data-tone="bad" onClick={() => remove(b)} disabled={!!busy} aria-label="Delete backup" data-act="delete">{busy === `d-${b.id}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Export one property" sub="All of its data in one file — for the owner, or to move it" data-data-export>
        <div className={s.pad}>
          <div className="flex flex-wrap gap-2 items-end">
            <label className={cn(s.label, "flex-1 min-w-[12rem]")}>Property
              <select value={rid} onChange={(e) => setRid(e.target.value)} data-export-property>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.demo ? " (demo)" : ""}</option>)}
              </select></label>
            <button type="button" className="btn btn-gray !h-11" onClick={exportOne} disabled={!rid || !!busy} data-export-go>
              {busy === "export" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileDown size={16} aria-hidden />} {busy === "export" ? "Exporting…" : "Export"}</button>
          </div>
          <Note>Its rows from every table, and its own files. Keys, tokens, codes and passwords are left out.</Note>
        </div>
      </Panel>
    </>
  );
}

type Contents = { header: { created_at: string; kind: string; restaurant: { name: string } | null }; tables: { name: string; rows: number; restorable: boolean }[]; users: number; files: number };
type Line = { table: string; inBackup: number; missing: number; inserted: number; failed: number; error: string | null; added: boolean };
type Result = { lines: Line[]; missing: number; inserted: number; failed: number };

export function RestorePanel({ backups }: { backups: Backup[] }) {
  const [id, setId] = useState(backups[0]?.id ?? "");
  const [contents, setContents] = useState<Contents | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"load" | "check" | "apply" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState("");

  const load = async (bid = id) => {
    setBusy("load"); setErr(null); setPreview(null); setDone(null); setChosen(new Set()); setContents(null);
    const r = await api<Contents>("contents", { id: bid }); setBusy(null);
    if (r.error) { setErr(r.error); return; } setContents(r);
  };
  const toggle = (t: string) => setChosen((c) => { const x = new Set(c); if (x.has(t)) x.delete(t); else x.add(t); return x; });
  const shown = useMemo(() => (contents?.tables ?? []).filter((t) => t.name.includes(q.trim().toLowerCase())), [contents, q]);
  const check = async () => {
    setBusy("check"); setErr(null); setDone(null);
    const r = await api<Result>("restore", { id, tables: [...chosen], apply: false }); setBusy(null);
    if (r.error) { setErr(r.error); return; } setPreview(r);
  };
  const apply = async () => {
    setBusy("apply"); setErr(null);
    const r = await api<Result>("restore", { id, tables: [...chosen], apply: true, confirm }); setBusy(null);
    if (r.error) { setErr(r.error); return; } setDone(r); setPreview(null); setConfirm("");
  };

  if (!backups.length) return <Panel title="Restore" sub="Bring back rows that were deleted"><div className={s.pad}><Note tone="warn">There is no backup to restore from yet.</Note></div></Panel>;
  return (
    <>
      <Panel title="Restore" sub="Brings back rows that are missing now. A row that is there is never changed or deleted." data-data-restore>
        <div className={s.pad}>
          <div className="flex flex-wrap gap-2 items-end">
            <label className={cn(s.label, "flex-1 min-w-[14rem]")}>From the backup of
              <select value={id} onChange={(e) => { setId(e.target.value); setContents(null); setPreview(null); setDone(null); }} data-restore-backup>
                {backups.map((b) => <option key={b.id} value={b.id}>{when(b.started_at)} · {KIND[b.kind].label}{b.kind === "property" && b.label ? ` · ${b.label}` : ""} · {fmtBytes(b.size_bytes)}</option>)}
              </select></label>
            <button type="button" className="btn btn-gray !h-11" onClick={() => load()} disabled={!id || !!busy} data-restore-open>
              {busy === "load" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />} Open it</button>
          </div>
          {err && <Note tone="bad" data-restore-error>{err}</Note>}
          {contents && <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="text-[13px] text-[var(--color-label-2)]">{contents.tables.length} tables · {n(contents.tables.reduce((a, t) => a + t.rows, 0))} rows · {contents.users} sign-ins · {contents.files} files</div>
              <div className="flex gap-2 flex-wrap">
                <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-label-3)]" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a table" className="!pl-8 !h-10 w-44" data-restore-search /></label>
                <button type="button" className={s.key} onClick={() => setChosen(new Set(shown.filter((t) => t.restorable && t.rows > 0).map((t) => t.name)))} data-restore-all>Choose these</button>
                <button type="button" className={s.key} onClick={() => setChosen(new Set())}>None</button>
              </div>
            </div>
            <div className={s.checks} data-restore-tables>
              {shown.map((t) => (
                <label key={t.name} className={s.check} data-off={!t.restorable || t.rows === 0} title={t.restorable ? "" : "Sign-in state, codes and throttles are never restored"}>
                  <input type="checkbox" checked={chosen.has(t.name)} disabled={!t.restorable || t.rows === 0} onChange={() => toggle(t.name)} data-restore-table={t.name} />
                  <span>{t.name}</span><em>{n(t.rows)}</em>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-filled !h-11" onClick={check} disabled={!chosen.size || !!busy} data-restore-check>
                {busy === "check" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />} {busy === "check" ? "Comparing…" : `See what is missing${chosen.size ? ` · ${chosen.size} tables` : ""}`}</button>
            </div>
          </>}
        </div>
      </Panel>

      {preview && <Panel title={preview.missing ? `${n(preview.missing)} rows are missing` : "Nothing is missing"} sub="Compared with the database now — tables these depend on are added" data-restore-preview={preview.missing}>
        <Lines r={preview} kind="preview" />
        {preview.missing > 0 && <div className={s.pad}>
          <Note tone="warn">They go back exactly as they were in the backup, with their own numbers and dates. Stock, tickets and totals are not re-run. Every restore is written to the admin log.</Note>
          <div className="flex flex-wrap gap-2 items-end">
            <label className={cn(s.label, "min-w-[12rem]")}>Type RESTORE to go ahead
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" autoCapitalize="characters" data-restore-confirm /></label>
            <button type="button" className="btn btn-danger !h-11" onClick={apply} disabled={confirm !== "RESTORE" || !!busy} data-restore-apply>
              {busy === "apply" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RotateCcw size={16} aria-hidden />} {busy === "apply" ? "Bringing back…" : `Bring back ${n(preview.missing)} rows`}</button>
          </div>
        </div>}
      </Panel>}

      {done && <Panel title={`${n(done.inserted)} rows brought back`} sub={done.failed ? `${n(done.failed)} could not go back — see below` : "Everything that was missing is back"} data-restore-done={done.inserted}>
        <Lines r={done} kind="done" />
      </Panel>}
    </>
  );
}

function Lines({ r, kind }: { r: Result; kind: "preview" | "done" }) {
  return (
    <div className={s.scrollX}><table className={s.table}>
      <thead><tr><th>Table</th><th className="r">In backup</th><th className="r">Missing</th>{kind === "done" && <><th className="r">Back</th><th className="r">Refused</th></>}</tr></thead>
      <tbody>{r.lines.map((l) => (
        <tr key={l.table} data-restore-line={l.table}>
          <td><b>{l.table}</b>{l.added && <span className={cn(s.chip, "ml-2")}>needed</span>}{l.error && <div className="text-[12px] text-[var(--color-red)] mt-1">{l.error}</div>}</td>
          <td className="r">{n(l.inBackup)}</td><td className="r">{n(l.missing)}</td>
          {kind === "done" && <><td className="r">{n(l.inserted)}</td><td className="r">{n(l.failed)}</td></>}
        </tr>))}</tbody>
    </table></div>
  );
}
