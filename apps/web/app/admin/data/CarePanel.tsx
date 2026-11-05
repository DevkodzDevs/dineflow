"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Loader2, Check, X, Plug, Save, KeyRound, ExternalLink, CloudUpload } from "lucide-react";
import { ask, Switch, Segmented, cn } from "@/components/ui";
import { PROVIDERS, type Provider } from "@/lib/backup/providers";
import { PLANS } from "@/lib/backup/supabaseApi";
import { fmtBytes } from "@/lib/backup/bytes";
import { api, when, n, Panel, Note } from "./bits";
import { saveDataSettings } from "./actions";
import type { Settings, Env, Backup } from "./types";
import s from "./Data.module.css";

/** The clean-up rules (0172 data_cleanup) — what each one removes; the database holds the same list and the minimums. */
const RULES: { key: string; title: string; what: string; days: number[] }[] = [
  { key: "print_jobs", title: "Old print jobs", what: "Tickets sent to a printer. One older than this will never print.", days: [7, 14, 30, 60, 90] },
  { key: "selftest_runs", title: "Self-test runs", what: "Master control → Testing's past results.", days: [14, 30, 90, 180] },
  { key: "client_errors", title: "Crash reports", what: "Errors people saw, last seen before this.", days: [14, 30, 90, 180] },
  { key: "scan_log", title: "Scan log", what: "What the scanner read.", days: [14, 30, 90, 180] },
  { key: "ota_sync_log", title: "Channel sync log", what: "Each booking-channel sync's result.", days: [14, 30, 60, 90] },
  { key: "codes", title: "Used sign-in codes", what: "Password and contact codes that were used or ran out.", days: [1, 7, 30] },
  { key: "hits", title: "Throttle counters", what: "The per-hour and per-day limits' old hits.", days: [2, 3, 7] },
];
type Preview = { applied: boolean; total: number; rules: Record<string, { days: number; min: number; rows: number }> };

export function CleanupPanel({ settings }: { settings: Settings }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [days, setDays] = useState<Record<string, number>>(() => Object.fromEntries(RULES.map((r) => [r.key, settings.cleanup?.[r.key]?.days ?? r.days[Math.min(2, r.days.length - 1)]])));
  const [pv, setPv] = useState<Preview | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = async (d = days) => { const r = await api<Preview>("cleanup", { apply: false, days: d }); if (r.error) setMsg({ ok: false, text: r.error }); else setPv(r); };
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setDay = (k: string, v: number) => {
    const d = { ...days, [k]: v }; setDays(d); void refresh(d);
    if (settings.cleanup?.[k]?.on) start(async () => { await saveDataSettings({ cleanup: { [k]: { on: true, days: v } } }); });
  };
  const nightly = (k: string, on: boolean) => start(async () => { const r = await saveDataSettings({ cleanup: { [k]: { on, days: days[k] } } }); if ("error" in r && r.error) setMsg({ ok: false, text: r.error }); });
  const clean = async (only: string[]) => {
    const rows = only.reduce((a, k) => a + (pv?.rules[k]?.rows ?? 0), 0);
    if (!rows) return;
    if (!(await ask({ title: `Delete ${n(rows)} old rows?`, body: only.length === 1 ? RULES.find((r) => r.key === only[0])!.title : `${only.length} kinds of old rows`, ok: "Delete", tone: "danger", icon: "trash" }))) return;
    setBusy(only.join()); const r = await api<Preview>("cleanup", { apply: true, only, days }); setBusy(null);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Deleted ${n(r.total)} rows.` }); await refresh(); router.refresh();
  };
  const withRows = RULES.filter((r) => (pv?.rules[r.key]?.rows ?? 0) > 0).map((r) => r.key);
  return (
    <>
      <Panel title="Clean-up" sub="Rows that pile up and are never read again" data-data-cleanup
        right={<button type="button" className="btn btn-gray !h-10" disabled={!withRows.length || !!busy} onClick={() => clean(withRows)} data-cleanup-all>
          {busy && busy.includes(",") ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Eraser size={15} aria-hidden />} Clean all · {n(pv?.total ?? 0)}</button>}>
        {msg && <div className="px-[18px] pb-3"><Note tone={msg.ok ? "ok" : "bad"} data-cleanup-msg>{msg.text}</Note></div>}
        <div className={s.list}>
          {RULES.map((r) => {
            const p = pv?.rules[r.key];
            return (
              <div key={r.key} className={s.setRow} data-cleanup-rule={r.key}>
                <div className="min-w-0 flex-1">
                  <div className={s.setName}>{r.title} <span className={cn(s.chip, "ml-1")} data-tone={p?.rows ? "warn" : undefined} data-cleanup-rows={p?.rows ?? ""}>{p ? `${n(p.rows)} rows` : "…"}</span></div>
                  <div className={s.setSub}>{r.what}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <select value={days[r.key]} onChange={(e) => setDay(r.key, Number(e.target.value))} aria-label={`${r.title}: older than`} data-cleanup-days>
                    {r.days.map((d) => <option key={d} value={d}>older than {d} {d === 1 ? "day" : "days"}</option>)}
                  </select>
                  <Switch on={!!settings.cleanup?.[r.key]?.on} onChange={(v) => nightly(r.key, v)} label="Every night" />
                  <button type="button" className={s.key} disabled={!p?.rows || !!busy || pending} onClick={() => clean([r.key])} data-cleanup-run={r.key}>
                    {busy === r.key ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Eraser size={14} aria-hidden />} Clean</button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Note>Never cleaned: bills, orders, payments, invoices, stock, guests, bookings, staff, the audit trail and Master control's own log. A backup is a good idea before a big clean.</Note>
    </>
  );
}

type Step = { name: string; ok: boolean; ms: number; detail?: string };
type SbTest = { ok: boolean; error?: string; ref?: string; region?: string | null; pitr?: boolean; backups?: { at: string; status: string; physical: boolean }[] };

export function OffsitePanel({ settings, env, backups }: { settings: Settings; env: Env; backups: Backup[] }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [kind, setKind] = useState<Provider>(settings.offsite_kind === "none" ? "r2" : settings.offsite_kind);
  const [f, setF] = useState({ endpoint: settings.offsite_endpoint ?? "", region: settings.offsite_region ?? PROVIDERS.r2.region, bucket: settings.offsite_bucket ?? "", prefix: settings.offsite_prefix ?? "dineflow", key_id: settings.offsite_key_id ?? "", secret: "" });
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null); const [sb, setSb] = useState<SbTest | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const pickKind = (k: Provider) => { setKind(k); if (!f.endpoint || f.endpoint.includes("<") || f.endpoint === "https://") setF((x) => ({ ...x, region: PROVIDERS[k].region, endpoint: "" })); else set("region", PROVIDERS[k].region); };
  const saveOffsite = (extra: Record<string, unknown> = {}) => start(async () => {
    const r = await saveDataSettings({ offsite_kind: kind, offsite_endpoint: f.endpoint, offsite_region: f.region, offsite_bucket: f.bucket, offsite_prefix: f.prefix, offsite_key_id: f.key_id, offsite_secret: f.secret, ...extra });
    setMsg("error" in r && r.error ? { ok: false, text: r.error } : { ok: true, text: "Saved." }); if (!("error" in r && r.error)) set("secret", "");
  });
  const test = async () => { setBusy("test"); setSteps(null); const r = await api<{ ok: boolean; steps: Step[] }>("offsite-test"); setBusy(null); if (r.error) setMsg({ ok: false, text: r.error }); else setSteps(r.steps); };
  const copyNewest = async () => {
    const b = backups.find((x) => x.kind !== "property"); if (!b) return;
    setBusy("copy"); const r = await api<{ ok: boolean; note: string }>("offsite-copy", { id: b.id }); setBusy(null);
    setMsg({ ok: !!r.ok, text: r.error ?? (r.ok ? `Copied: ${r.note}` : r.note) }); router.refresh();
  };
  const saveToken = (clear = false) => start(async () => {
    const r = await saveDataSettings(clear ? { clear_supabase_token: true } : { supabase_token: token });
    setMsg("error" in r && r.error ? { ok: false, text: r.error } : { ok: true, text: clear ? "Token removed." : "Token saved." }); setToken(""); if (clear) setSb(null);
  });
  const testSb = async () => { setBusy("sb"); const r = await api<SbTest>("supabase-test"); setBusy(null); setSb(r.error && r.ok === undefined ? { ok: false, error: r.error } : r); };
  const P = PROVIDERS[kind]; const ready = settings.offsite_secret_set && !!settings.offsite_bucket && !!settings.offsite_endpoint;

  return (
    <>
      <Panel title="What it costs" sub="Everything on this page works on the free plans. Paying is only for more room or older backups." data-data-plans>
        <div className={s.plans}>
          {PLANS.map((p) => (
            <div key={p.key} className={s.plan} data-current={p.key === "free"} data-plan={p.key}>
              <div className={s.planName}>Supabase {p.label}{p.key === "free" && <span className={s.chip} data-tone="tint">you are here</span>}</div>
              <div className={s.planPrice}>{p.price}</div>
              <div className={s.planLine}>Database <b>{p.db}</b> · files <b>{p.files}</b></div>
              <div className={s.planLine}>Supabase backups: <b>{p.backups}</b></div>
              {p.pauses && <div className={s.planLine}>Pauses after a week with no use</div>}
            </div>
          ))}
        </div>
        <div className={s.list}>
          {[
            ["DineFlow's own backups, check, restore, clean-up", "Free", "ok"],
            ["Download a copy to a computer", "Free", "ok"],
            ["Off-site copy to Cloudflare R2 or Backblaze B2", "Free up to 10 GB", "ok"],
            ["Off-site copy to Amazon S3", "Paid · pennies a month at this size", "warn"],
            ["Nightly run (Vercel Cron, once a day)", "Free · needs two keys on Vercel", env.cron && env.serviceRole ? "ok" : "warn"],
            ["Supabase Pro: its own daily backups, 8 GB, no pausing", "$25 a month — optional", "warn"],
          ].map(([k, v, t]) => (
            <div key={k} className={s.item}><div className={s.itemName}><span className="truncate">{k}</span></div><div className={s.itemFig}><span className={s.chip} data-tone={t}>{v}</span></div></div>
          ))}
        </div>
      </Panel>

      {msg && <Note tone={msg.ok ? "ok" : "bad"} data-offsite-msg>{msg.text}</Note>}

      <Panel title="Off-site copy" sub="Each backup also goes to a store outside Supabase" data-data-offsite
        right={<Switch on={settings.offsite_on} onChange={(v) => start(async () => { const r = await saveDataSettings({ offsite_on: v }); if ("error" in r && r.error) setMsg({ ok: false, text: r.error }); })} label="Copy every backup" />}>
        <div className={s.pad}>
          <Segmented value={kind} onChange={pickKind} options={(Object.keys(PROVIDERS) as Provider[]).map((k) => ({ value: k, label: PROVIDERS[k].label.replace("Cloudflare ", "").replace("Backblaze ", "").replace("Amazon ", "").replace("Other S3-compatible", "Other") }))} />
          <Note tone={kind === "s3" ? "warn" : "info"}>{P.label} · {P.cost}. {P.help}.</Note>
          <div className={s.form}>
            <label className={cn(s.label, s.wide)}>Address (endpoint)<input value={f.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder={P.endpoint} inputMode="url" autoComplete="off" data-offsite-endpoint /></label>
            <label className={s.label}>Bucket<input value={f.bucket} onChange={(e) => set("bucket", e.target.value)} placeholder="dineflow-backups" autoComplete="off" data-offsite-bucket /></label>
            <label className={s.label}>Region<input value={f.region} onChange={(e) => set("region", e.target.value)} placeholder={P.region} autoComplete="off" data-offsite-region /></label>
            <label className={s.label}>Folder <span className={s.hint}>optional</span><input value={f.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="dineflow" autoComplete="off" data-offsite-prefix /></label>
            <label className={s.label}>Access key ID<input value={f.key_id} onChange={(e) => set("key_id", e.target.value)} autoComplete="off" spellCheck={false} data-offsite-key /></label>
            <label className={cn(s.label, s.wide)}>Secret access key {settings.offsite_secret_set && <span className={s.hint}>saved {settings.offsite_secret_hint} — leave blank to keep it</span>}
              <input type="password" value={f.secret} onChange={(e) => set("secret", e.target.value)} autoComplete="new-password" placeholder={settings.offsite_secret_set ? "••••••••" : ""} data-offsite-secret /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-filled !h-11" onClick={() => saveOffsite()} disabled={pending} data-offsite-save><Save size={16} aria-hidden /> Save</button>
            <button type="button" className="btn btn-gray !h-11" onClick={test} disabled={!ready || !!busy} data-offsite-test>{busy === "test" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plug size={16} aria-hidden />} Test connection</button>
            <button type="button" className="btn btn-gray !h-11" onClick={copyNewest} disabled={!ready || !!busy || !backups.some((b) => b.kind !== "property")} data-offsite-copy>{busy === "copy" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CloudUpload size={16} aria-hidden />} Copy the newest now</button>
            {settings.offsite_secret_set && <button type="button" className="btn btn-plain !h-11" onClick={() => saveOffsite({ clear_offsite_secret: true, offsite_on: false })} disabled={pending} data-offsite-forget>Forget the secret</button>}
          </div>
          {!ready && <Note>Fill in the address, bucket, key and secret, and Save — then Test connection.</Note>}
          {steps && <div className={s.steps} data-offsite-steps={steps.every((x) => x.ok) ? "ok" : "bad"}>
            {steps.map((st) => <div key={st.name} className={s.step} data-ok={st.ok}>{st.ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}<span>{st.name}{st.detail && <span className="block text-[12.5px] text-[var(--color-red)]">{st.detail}</span>}</span><span className={s.stepMs}>{st.ms} ms</span></div>)}
          </div>}
        </div>
      </Panel>

      <Panel title="Supabase's own backups" sub={`Project ${env.ref ?? "—"} · on Pro there is one a day, kept 7 days`} data-data-supabase>
        <div className={s.pad}>
          <Note>An access token lets this page read what Supabase keeps. The token is free; Supabase keeps backups only on a paid plan. Make one at supabase.com → Account → Access tokens.</Note>
          <div className="flex flex-wrap gap-2 items-end">
            <label className={cn(s.label, "flex-1 min-w-[14rem]")}>Access token {settings.supabase_token_set && <span className={s.hint}>saved {settings.supabase_token_hint}</span>}
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" placeholder={settings.supabase_token_set ? "••••••••" : "sbp_…"} data-supabase-token /></label>
            <button type="button" className="btn btn-gray !h-11" onClick={() => saveToken()} disabled={!token.trim() || pending} data-supabase-save><KeyRound size={16} aria-hidden /> Save</button>
            <button type="button" className="btn btn-gray !h-11" onClick={testSb} disabled={!settings.supabase_token_set || !!busy} data-supabase-test>{busy === "sb" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plug size={16} aria-hidden />} Test</button>
            {settings.supabase_token_set && <button type="button" className="btn btn-plain !h-11" onClick={() => saveToken(true)} disabled={pending}>Remove</button>}
            <a className="btn btn-plain !h-11" href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Make a token</a>
          </div>
          {sb && (sb.ok ? <div className="grid gap-2" data-supabase-result="ok">
            <Note tone={sb.backups?.length ? "ok" : "warn"}>{sb.backups?.length ? `${sb.backups.length} Supabase backups${sb.pitr ? " · point-in-time recovery on" : ""} · ${sb.region ?? ""}` : "Connected — Supabase keeps no backups on this plan. DineFlow's own backups are the ones that count."}</Note>
            {!!sb.backups?.length && <div className={s.list}>{sb.backups.slice(0, 7).map((b) => <div key={b.at} className={s.item}><div className={s.itemName}><span className="truncate">{when(b.at)}</span></div><div className={s.itemFig}>{b.status.toLowerCase()}{b.physical ? " · full copy" : ""}</div></div>)}</div>}
          </div> : <Note tone="bad" data-supabase-result="bad">{sb.error}</Note>)}
          <Note>Supabase Pro is bought in the Supabase dashboard (Organization → Billing), not here. After that, Test shows its daily backups, and Supabase restores them from its dashboard. DineFlow's own backups keep running either way · {fmtBytes(backups.find((b) => b.kind !== "property")?.size_bytes)} the newest.</Note>
        </div>
      </Panel>
    </>
  );
}
