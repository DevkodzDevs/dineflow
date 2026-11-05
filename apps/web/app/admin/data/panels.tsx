"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, HardDrive, Archive, Rows3, Users, Loader2, Gauge, Clock, Plug, Activity } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { FREE_LIMITS } from "@/lib/backup/supabaseApi";
import { api, ago, when, n, Meter, Tile, Panel, Note, Spark } from "./bits";
import s from "./Data.module.css";

import type { Overview, Server, Backup, Env } from "./types";
export type { Overview, Server, Settings, Backup, Env } from "./types";
/** The newest finished full backup, and what to say about it. */
export function protection(backups: Backup[], now: number) {
  const last = backups.find((b) => b.status === "done" && b.kind !== "property") ?? null;
  const hours = last ? (now - new Date(last.finished_at ?? last.started_at).getTime()) / 3600000 : Infinity;
  const tone: "ok" | "warn" | "bad" = !last || last.verify_ok === false ? "bad" : hours > 30 || last.verify_ok == null ? "warn" : "ok";
  const title = !last ? "No backup yet" : last.verify_ok === false ? "The last backup failed its check" : hours > 30 ? `Last backup ${ago(last.finished_at ?? last.started_at, now)}` : "Data is backed up";
  return { last, tone, title };
}

/** Back up now — one request; the time it has taken so far, then what happened. */
export function BackupNow({ big, onDone }: { big?: boolean; onDone?: (msg: { ok: boolean; text: string }) => void }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [secs, setSecs] = useState(0); const t = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (t.current) clearInterval(t.current); }, []);
  const go = async () => {
    setBusy(true); setSecs(0); t.current = setInterval(() => setSecs((x) => x + 1), 1000);
    const r = await api<{ ok?: boolean; size?: number; rows?: number; tables?: number; files?: number; ms?: number; pruned?: number; checked?: { ok: boolean }; offsite?: { ok: boolean; note: string } | null }>("backup");
    if (t.current) clearInterval(t.current); setBusy(false);
    onDone?.(r.error ? { ok: false, text: r.error }
      : { ok: true, text: `Backed up ${n(r.rows)} rows in ${r.tables} tables and ${r.files} files — ${fmtBytes(r.size)} in ${Math.round((r.ms ?? 0) / 1000)} s${r.checked?.ok ? ", checked" : ""}${r.offsite ? (r.offsite.ok ? ", copied off-site" : ", off-site copy failed") : ""}${r.pruned ? `; ${r.pruned} older removed` : ""}.` });
    router.refresh();
  };
  return (
    <button type="button" onClick={go} disabled={busy} className={cn("btn btn-filled", big ? "!h-12 !px-6" : "!h-11 !px-5")} data-backup-now>
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />}
      {busy ? `Backing up… ${secs}s` : "Back up now"}
    </button>
  );
}

export function StoragePanel({ o }: { o: Overview }) {
  const [all, setAll] = useState(false);
  const tables = all ? o.tables : o.tables.slice(0, 10);
  const top = o.tables[0]?.bytes || 1;
  const props = o.properties.filter((p) => p.rows > 0 || !p.demo);
  const topProp = Math.max(1, ...props.map((p) => p.bytes));
  const hist = o.history.map((h) => Number(h.db_bytes));
  const appBytes = o.public_bytes;
  const growth = useMemo(() => {
    if (o.history.length < 2) return null;
    const a = o.history[0], b = o.history[o.history.length - 1];
    const days = Math.max(1, (new Date(b.day).getTime() - new Date(a.day).getTime()) / 86400000);
    const perDay = (Number(b.db_bytes) - Number(a.db_bytes)) / days;
    const left = FREE_LIMITS.db - Number(b.db_bytes);
    return { perDay, days: Math.round(days), full: perDay > 0 ? Math.round(left / perDay) : null };
  }, [o.history]);
  return (
    <>
      <div className={s.tiles}>
        <Tile label="Database" icon={<Database size={14} aria-hidden />} value={fmtBytes(o.db_bytes)} sub={`of 500 MB · ${Math.round((o.db_bytes / FREE_LIMITS.db) * 100)}% · Free plan`} data-tile="db">
          <Meter used={o.db_bytes} max={FREE_LIMITS.db} label="Database used" />
        </Tile>
        <Tile label="Files" icon={<HardDrive size={14} aria-hidden />} value={fmtBytes(o.files_bytes)} sub={`${n(o.files)} files of 1 GB`} data-tile="files">
          <Meter used={o.files_bytes} max={FREE_LIMITS.files} label="File storage used" />
        </Tile>
        <Tile label="Rows" icon={<Rows3 size={14} aria-hidden />} value={n(o.rows)} sub={`in ${o.tables.length} tables · app data ${fmtBytes(appBytes)}`} data-tile="rows" />
        <Tile label="Sign-ins" icon={<Users size={14} aria-hidden />} value={n(o.users)} sub={`${o.properties.length} properties · Postgres ${o.version}`} data-tile="users" />
      </div>

      <Panel title="Growth" sub={growth ? `${fmtBytes(Math.abs(growth.perDay))} a day ${growth.perDay >= 0 ? "more" : "less"} over ${growth.days} days${growth.full ? ` · Free plan full in about ${n(growth.full)} days` : ""}` : "Measured once a day — the line starts from the second day"} data-data-growth>
        <div className={s.pad}>
          {hist.length >= 2 ? <><Spark values={hist} /><div className={s.sparkLegend}><span>{o.history[0].day} · {fmtBytes(hist[0])}</span><span>{o.history[o.history.length - 1].day} · {fmtBytes(hist[hist.length - 1])}</span></div></>
            : <Note>Today: {fmtBytes(o.db_bytes)}. Each day this page or the nightly backup runs adds a point.</Note>}
        </div>
      </Panel>

      <div className={s.cols}>
        <Panel title="Biggest tables" sub={`${o.tables.length} tables · ${fmtBytes(appBytes)}`} data-data-tables>
          <div className={s.list}>
            {tables.map((t) => (
              <div key={t.name} className={s.item} data-table-row={t.name}>
                <div className={s.itemName}><span className="truncate">{t.name}</span>{!t.pk && <span className={s.chip}>no key</span>}</div>
                <div className={s.itemFig}><b>{fmtBytes(t.bytes)}</b> · {n(t.rows)} rows</div>
                <div className={s.share}><span style={{ width: `${Math.max(1, (t.bytes / top) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {o.tables.length > 10 && <div className={s.more}><button type="button" className={s.key} onClick={() => setAll((x) => !x)} data-tables-all>{all ? "Show the top 10" : `Show all ${o.tables.length}`}</button></div>}
        </Panel>

        <Panel title="Each property" sub="Rows, and its share of the space" data-data-properties>
          <div className={s.list}>
            {props.map((p) => (
              <div key={p.id} className={s.item} data-property-row>
                <div className={s.itemName}><span className="truncate">{p.name}</span><span className={s.chip}>{p.type}</span>{p.demo && <span className={s.chip} data-tone="warn">demo</span>}</div>
                <div className={s.itemFig}><b>{fmtBytes(p.bytes)}</b> · {n(p.rows)} rows</div>
                <div className={s.share}><span style={{ width: `${Math.max(1, (p.bytes / topProp) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className={s.cols}>
        <Panel title="File storage" sub={`${o.buckets.length} folders · ${fmtBytes(o.files_bytes)}`} data-data-buckets>
          <div className={s.list}>
            {o.buckets.map((b) => (
              <div key={b.id} className={s.item} data-bucket={b.id}>
                <div className={s.itemName}><span className="truncate">{b.id}</span><span className={s.chip} data-tone={b.public ? "tint" : undefined}>{b.public ? "public" : "private"}</span></div>
                <div className={s.itemFig}><b>{fmtBytes(b.bytes)}</b> · {n(b.files)} files{b.limit ? ` · ${fmtBytes(b.limit)} a file` : ""}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Largest files" sub="Across every folder" data-data-largest>
          {o.largest.length ? <div className={s.list}>{o.largest.map((f) => (
            <div key={f.bucket + f.name} className={s.item}>
              <div className={s.itemName}><span className="truncate" title={f.name}>{f.name}</span><span className={s.chip}>{f.bucket}</span></div>
              <div className={s.itemFig}><b>{fmtBytes(f.bytes)}</b></div>
            </div>))}</div> : <div className={s.pad}><Note>No files stored yet.</Note></div>}
        </Panel>
      </div>

      <Panel title="Where the space goes" sub="By part of the database" data-data-schemas>
        <div className={s.list}>{o.schemas.filter((x) => x.bytes > 0).map((x) => (
          <div key={x.name} className={s.item}><div className={s.itemName}><span className="truncate">{x.name === "public" ? "public — the app's data" : x.name === "auth" ? "auth — sign-ins" : x.name === "pg_catalog" ? "pg_catalog — the database's own" : x.name}</span></div><div className={s.itemFig}><b>{fmtBytes(x.bytes)}</b></div>
            <div className={s.share}><span style={{ width: `${Math.max(1, (x.bytes / o.db_bytes) * 100)}%` }} /></div></div>))}</div>
      </Panel>
    </>
  );
}

export function ServerPanel({ sv, env }: { sv: Server; env: Env }) {
  const conn = sv.connections / Math.max(1, sv.max_connections);
  const xidPct = (sv.xid_age / 2_000_000_000) * 100;
  return (
    <>
      <div className={s.tiles}>
        <Tile label="Connections" icon={<Plug size={14} aria-hidden />} value={`${sv.connections} / ${sv.max_connections}`} sub={`${sv.active} working · ${sv.idle_tx} waiting in a transaction`} tone={conn > 0.85 ? "bad" : conn > 0.65 ? "warn" : undefined} data-tile="connections">
          <Meter used={sv.connections} max={sv.max_connections} label="Connections used" />
        </Tile>
        <Tile label="Cache hits" icon={<Gauge size={14} aria-hidden />} value={sv.cache_heap == null ? "—" : `${sv.cache_heap}%`} sub={`indexes ${sv.cache_index ?? "—"}% · good is 99%+`} tone={sv.cache_heap != null && sv.cache_heap < 95 ? "warn" : "ok"} data-tile="cache" />
        <Tile label="Answer time" icon={<Activity size={14} aria-hidden />} value={`${env.roundTrip} ms`} sub="this page's four database calls, together" tone={env.roundTrip > 1500 ? "bad" : env.roundTrip > 600 ? "warn" : "ok"} data-tile="roundtrip" />
        <Tile label="Up since" icon={<Clock size={14} aria-hidden />} value={ago(sv.started_at, new Date(sv.now).getTime()).replace(" ago", "")} sub={`Postgres ${sv.version} · ${when(sv.started_at)}`} data-tile="uptime" />
      </div>

      <div className={s.cols}>
        <Panel title="Health" sub="What a database administrator would look at" data-data-health>
          <div className={s.list}>
            {[
              ["Longest query running now", `${sv.longest_s} s`, sv.longest_s > 30 ? "warn" : "ok"],
              ["Deadlocks since the counters reset", n(sv.db.deadlocks), sv.db.deadlocks > 0 ? "warn" : "ok"],
              ["Transactions undone (rollbacks)", `${n(sv.db.rollbacks)} of ${n(sv.db.commits + sv.db.rollbacks)}`, "ok"],
              ["Spilled to disk (temporary files)", fmtBytes(sv.db.temp_bytes), sv.db.temp_bytes > 1073741824 ? "warn" : "ok"],
              ["Transaction-ID age", `${xidPct.toFixed(2)}% of the limit`, xidPct > 50 ? "bad" : xidPct > 20 ? "warn" : "ok"],
              ["Indexes never used", `${sv.unused_indexes.count} · ${fmtBytes(sv.unused_indexes.bytes)}`, "ok"],
              ["A statement may run for", sv.statement_timeout, "ok"],
              ["Database clock", `${sv.timezone}`, "ok"],
            ].map(([k, v, tone]) => (
              <div key={k} className={s.item}><div className={s.itemName}><span className="truncate">{k}</span></div><div className={s.itemFig}><span className={s.chip} data-tone={tone === "ok" ? undefined : tone}>{v}</span></div></div>
            ))}
          </div>
        </Panel>
        <Panel title="Who is connected" sub={`App server ${env.region ?? "this computer"} · project ${env.ref ?? "local"}`} data-data-apps>
          <div className={s.list}>{sv.by_app.map((a) => (
            <div key={a.app} className={s.item}><div className={s.itemName}><span className="truncate">{a.app}</span></div><div className={s.itemFig}><b>{a.n}</b></div></div>))}</div>
        </Panel>
      </div>

      <div className={s.cols}>
        <Panel title="Tables to tidy" sub="Dead rows waiting for the automatic vacuum" data-data-vacuum>
          {sv.vacuum.length ? <div className={s.list}>{sv.vacuum.map((v) => (
            <div key={v.name} className={s.item}><div className={s.itemName}><span className="truncate">{v.name}</span></div>
              <div className={s.itemFig}><b>{n(v.dead)}</b> dead of {n(v.live + v.dead)} · {v.last_autovacuum ? `tidied ${ago(v.last_autovacuum, new Date(sv.now).getTime())}` : "never tidied"}</div></div>))}</div>
            : <div className={s.pad}><Note tone="ok">Nothing waiting.</Note></div>}
        </Panel>
        <Panel title="Slowest statements" sub="Average time, run 20 times or more" data-data-slow>
          {sv.slow.length ? <div className={s.list}>{sv.slow.map((q, i) => (
            <div key={i} className={s.item}><div className="min-w-0"><div className={s.mono}>{q.query}</div></div>
              <div className={s.itemFig}><b>{q.mean_ms} ms</b><br />{n(q.calls)} runs</div></div>))}</div>
            : <div className={s.pad}><Note>No statement statistics on this database.</Note></div>}
        </Panel>
      </div>
    </>
  );
}
