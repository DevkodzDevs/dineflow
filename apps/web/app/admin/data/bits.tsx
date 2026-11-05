"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/components/ui";
import s from "./Data.module.css";

/** Master control → Data's small pieces (0172): the call to /api/admin/data, dates, a meter, a tile, a panel, a note. */
export async function api<T = Record<string, unknown>>(op: string, body: Record<string, unknown> = {}): Promise<T & { error?: string }> {
  let r: Response;
  try { r = await fetch("/api/admin/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...body }) }); }
  catch { return { error: "No connection — check the internet and try again." } as T & { error?: string }; }
  const j = await r.json().catch(() => ({ error: r.status === 504 ? "It took too long and was stopped — try again." : `The server answered ${r.status}.` }));
  if (!r.ok && !j.error) j.error = `The server answered ${r.status}.`;
  return j;
}

/** "5 Nov, 2:07 pm" in India time — built by hand, so the server and the browser write the same text (no #418). */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime(); if (Number.isNaN(t)) return "—";
  const d = new Date(t + 330 * 60000);   // IST is UTC+5:30, no daylight saving
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** The time to measure "ago" from: the server's clock for the first render (so it hydrates), then this device's, each minute. */
export function useNow(seed: number) {
  const [now, setNow] = useState(seed);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  return now;
}
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("en-IN");

/** How full: green under 70%, amber under 90%, red after. */
export function Meter({ used, max, label }: { used: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const tone = pct < 70 ? "var(--color-green)" : pct < 90 ? "var(--color-orange)" : "var(--color-red)";
  return (
    <div className={s.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label ?? "Used"} data-meter={Math.round(pct)}>
      <span style={{ width: `${Math.max(pct, 1.5)}%`, background: tone }} />
    </div>
  );
}

export function Tile({ label, value, sub, icon, tone, children, ...rest }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "ok" | "warn" | "bad"; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(s.tile, tone && s[tone])} {...rest}>
      <div className={s.tileHead}>{icon}<span>{label}</span></div>
      <div className={cn(s.tileValue, "num")}>{value}</div>
      {sub && <div className={s.tileSub}>{sub}</div>}
      {children}
    </div>
  );
}

export function Panel({ title, sub, right, children, className, ...rest }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string } & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={cn("card", s.panel, className)} {...rest}>
      <header className={s.panelHead}>
        <div className="min-w-0"><h2 className={s.panelTitle}>{title}</h2>{sub && <p className={s.panelSub}>{sub}</p>}</div>
        {right && <div className={s.panelRight}>{right}</div>}
      </header>
      {children}
    </section>
  );
}

const ICON = { ok: Check, warn: AlertTriangle, bad: XCircle, info: Info };
export function Note({ tone = "info", children, ...rest }: { tone?: "ok" | "warn" | "bad" | "info"; children: ReactNode } & React.HTMLAttributes<HTMLParagraphElement>) {
  const I = ICON[tone];
  return <p role={tone === "bad" ? "alert" : "status"} className={cn(s.note, s[`note_${tone}`])} {...rest}><I size={16} aria-hidden className="shrink-0 mt-0.5" /><span className="min-w-0">{children}</span></p>;
}

/** A thin line of the database's size by day — the newest point marked. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 320, h = 64, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 6 - ((v - lo) / span) * (h - 12)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={s.spark} preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="color-mix(in srgb, var(--color-tint) 12%, transparent)" />
      <path d={d} fill="none" stroke="var(--color-tint)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={4} fill="var(--color-tint)" stroke="var(--color-bg-2)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A command queued for a server (0173): poll it every 2 s until it is done or failed; `start` queues a new one. */
export function useCommand() {
  const [cmd, setCmd] = useState<{ id: string; status: string; op: string; result: Record<string, unknown> | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async (server: string, op: string, args: Record<string, unknown> = {}) => {
    setBusy(true); setCmd(null);
    const r = await api<{ id?: string }>("server-command", { id: server, op, args });
    if (r.error || !r.id) { setBusy(false); return { error: r.error ?? "Could not queue the job." }; }
    for (let i = 0; i < 300; i++) {
      await new Promise((res) => setTimeout(res, i < 5 ? 1500 : 2500));
      const c = await api<{ status?: string; result?: Record<string, unknown> | null; error?: string | null; op?: string }>("command", { id: r.id });
      if (c.error && !c.status) continue;
      const cur = { id: r.id, status: c.status ?? "queued", op: c.op ?? op, result: c.result ?? null, error: c.error ?? null };
      setCmd(cur);
      if (cur.status === "done" || cur.status === "failed") { setBusy(false); return cur; }
    }
    setBusy(false); return { error: "The server has not answered yet — it may be off. The job stays queued." };
  };
  return { cmd, busy, start };
}
