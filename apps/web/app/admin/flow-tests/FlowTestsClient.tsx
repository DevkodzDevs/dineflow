"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow, Play, Square, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, LayoutGrid, ListTree, Route, FileText, Clock, Circle, MinusCircle, Store, BedDouble } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { FLOWS, GROUPS, GROUP_FLOWS, PAGES, KIND_WORD, planFor, flowTitle, modeLabel, type Mode, type Step, type Kind, type FlowKey } from "@/lib/flowtest/catalog";

type Status = "pass" | "warn" | "fail" | "skip";
type Check = { name: string; status: Status; detail?: string; ms?: number; fix?: string };
type Row = Step & { state: "wait" | "run" | Status; checks: Check[]; ms?: number };
export type Past = { id: string; label: string; status: "pass" | "warn" | "fail"; ms: number; ran_at: string; pass: number; warn: number; fail: number };

const TONE: Record<Status, string> = { pass: "var(--color-green)", warn: "var(--color-orange)", fail: "var(--color-red)", skip: "var(--color-label-3)" };
const worst = (cs: Check[]): Status => cs.some((c) => c.status === "fail") ? "fail" : cs.some((c) => c.status === "warn") ? "warn" : cs.length && cs.every((c) => c.status === "skip") ? "skip" : "pass";
const secs = (ms: number) => ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
/** about how long a step takes on the live site — the setup steps make properties and logins, a page is one load */
const guess = (s: Step) => (s.id.startsWith("setup:") ? 6 : s.id.startsWith("staff:") ? 8 : s.flow === "pages" ? 1.5 : 2.5);

function Mark({ s, size = 18 }: { s: Row["state"]; size?: number }) {
  if (s === "run") return <Loader2 size={size} className="animate-spin text-[var(--color-tint)] shrink-0" aria-label="Running" />;
  if (s === "wait") return <Circle size={size} className="text-[var(--color-label-3)] shrink-0" aria-label="Waiting" />;
  const I = s === "pass" ? CheckCircle2 : s === "warn" ? AlertTriangle : s === "fail" ? XCircle : MinusCircle;
  return <I size={size} style={{ color: TONE[s] }} className="shrink-0" aria-label={s} />;
}

/**
 * Master control → Flow tests (2026-11-02, the owner: "the testing flow as a complete automatic testing tool — start
 * testing runs the whole application; an option by the menu's headings; one by a whole flow — an order, a bill, a room
 * booking; and one for a particular page"). Four ways in, one run panel: each step is one call to /api/admin/flowtest,
 * shown as it lands, under its flow; the run cleans up after itself (both throwaway properties and their logins) and is
 * kept with the others below.
 */
export function FlowTestsClient({ past }: { past: Past[] }) {
  const router = useRouter();
  const [how, setHow] = useState<"full" | "group" | "flow" | "page">("full");
  const [group, setGroup] = useState(GROUPS.find((g) => g === "Orders & kitchen") ?? GROUPS[0]);
  const [flow, setFlow] = useState<FlowKey>("order");
  const [href, setHref] = useState("/orders");
  const pageDef = PAGES.find((p) => p.href === href) ?? PAGES[0];
  const [on, setOn] = useState<Kind>("r");
  const mode: Mode = how === "full" ? { kind: "full" } : how === "group" ? { kind: "group", group } : how === "flow" ? { kind: "flow", flow } : { kind: "page", href: pageDef.href, on: pageDef.kinds.includes(on) ? on : pageDef.kinds[0] };
  const plan = useMemo(() => planFor(mode), [how, group, flow, href, on]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<Row[]>([]); const [ran, setRan] = useState<Mode | null>(null);
  const [running, setRunning] = useState(false); const [cleanup, setCleanup] = useState<Check[]>([]);
  const [t0, setT0] = useState(0); const [now, setNow] = useState(0); const [open, setOpen] = useState<Record<string, boolean>>({});
  const stop = useRef(false);
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [running]);
  // a run in flight holds two throwaway properties: say so before the tab is closed (they expire by themselves in 8 hours)
  useEffect(() => { if (!running) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; addEventListener("beforeunload", h); return () => removeEventListener("beforeunload", h); }, [running]);

  const call = async (body: object) => {
    const r = await fetch("/api/admin/flowtest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `the server answered ${r.status}` }));
    if (!r.ok || j.error) throw new Error(j.error ?? `the server answered ${r.status}`);
    return j;
  };

  const start = async (m: Mode = mode) => {
    if (running) return;
    const steps = planFor(m); stop.current = false;
    setRows(steps.map((s) => ({ ...s, state: "wait", checks: [] }))); setRan(m); setCleanup([]); setRunning(true); setT0(Date.now()); setNow(Date.now());
    setOpen({});
    let ctx: object = { vars: {} }; const done: Row[] = steps.map((s) => ({ ...s, state: "wait", checks: [] })); const dead = new Set<Kind>();
    const put = (i: number, r: Partial<Row>) => { done[i] = { ...done[i], ...r }; setRows([...done]); };
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (stop.current) { put(i, { state: "skip", checks: [{ name: "Stopped before this step", status: "skip" }] }); continue; }
      if (s.kind && dead.has(s.kind)) { put(i, { state: "skip", checks: [{ name: `Skipped — the throwaway ${KIND_WORD[s.kind].toLowerCase()} was not ready`, status: "skip" }] }); continue; }
      put(i, { state: "run" });
      const a = Date.now();
      try {
        const j = await call({ op: "step", id: s.id, ctx }) as { checks: Check[]; ctx: object; ms: number };
        ctx = j.ctx; const st = worst(j.checks);
        put(i, { state: st, checks: j.checks, ms: j.ms });
        if (s.flow === "setup" && st === "fail" && s.kind) dead.add(s.kind);
        if (st === "fail") setOpen((o) => ({ ...o, [s.id]: true }));
      } catch (e) {
        put(i, { state: "fail", ms: Date.now() - a, checks: [{ name: "The step answered", status: "fail", detail: (e as Error).message, fix: "A dropped connection or a server timeout — run again; the Testing tab's API suite checks the server." }] });
        if (s.flow === "setup" && s.kind) dead.add(s.kind);
      }
    }
    // clean up whatever the run made, even when it was stopped
    let cl: Check[] = [];
    try { cl = ((await call({ op: "finish", ctx })) as { checks: Check[] }).checks; } catch (e) { cl = [{ name: "The throwaway properties are deleted", status: "warn", detail: (e as Error).message, fix: "They expire by themselves within 8 hours." }]; }
    setCleanup(cl); setRunning(false);
    const all = done.flatMap((r) => r.checks.map((c) => ({ ...c, name: `${flowTitle(r.flow)} · ${r.title} — ${c.name}` })));
    const status = worst(all); const ms = Date.now() - (t0 || Date.now());
    try { await call({ op: "save", mode: modeLabel(m), status: status === "skip" ? "pass" : status, ms: done.reduce((a, r) => a + (r.ms ?? 0), 0) || ms, checks: all }); router.refresh(); } catch { /* kept on screen anyway */ }
  };

  const total = rows.length, finished = rows.filter((r) => r.state !== "wait" && r.state !== "run").length;
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 } as Record<Status, number>;
  rows.forEach((r) => r.checks.forEach((c) => { counts[c.status]++; }));
  const current = rows.find((r) => r.state === "run");
  const byFlow = useMemo(() => { const m = new Map<string, Row[]>(); rows.forEach((r) => { const k = r.flow === "pages" ? `Pages · ${r.group ?? ""}` : flowTitle(r.flow); m.set(k, [...(m.get(k) ?? []), r]); }); return [...m.entries()]; }, [rows]);
  const score = counts.pass + counts.warn + counts.fail ? Math.round(((counts.pass + counts.warn / 2) / (counts.pass + counts.warn + counts.fail)) * 100) : null;
  const eta = Math.round(plan.reduce((a, s) => a + guess(s), 0) / 60 * 10) / 10;

  const TABS = [
    { key: "full" as const, Icon: LayoutGrid, title: "Full application", sub: "Every flow, then every page" },
    { key: "group" as const, Icon: ListTree, title: "By menu section", sub: "One heading of the menu" },
    { key: "flow" as const, Icon: Route, title: "By flow", sub: "Order, billing, room booking …" },
    { key: "page" as const, Icon: FileText, title: "One page", sub: "A single screen" },
  ];

  return (
    <div className="space-y-5" data-flow-tests>
      {/* the head: what this is and the one button the owner asked for */}
      <Card className="!p-5 sm:!p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] shrink-0"><Workflow size={22} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[26px] leading-tight">Flow tests</h1>
            <p className="text-[13px] text-steel mt-0.5">The testing flow, run by itself on a throwaway restaurant and hotel — deleted after</p>
          </div>
          <button type="button" className="svc-btn go !min-h-12 !px-5 max-sm:w-full" disabled={running} onClick={() => { setHow("full"); void start({ kind: "full" }); }} data-start-full>
            {running && ran?.kind === "full" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Play size={18} aria-hidden />}Start full test
          </button>
        </div>
      </Card>

      {/* four ways in */}
      <Card className="!p-0 overflow-hidden" data-modes>
        <div role="tablist" aria-label="What to test" className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--color-separator)]">
          {TABS.map(({ key, Icon, title, sub }) => (
            <button key={key} type="button" role="tab" aria-selected={how === key} onClick={() => setHow(key)} data-mode={key} disabled={running}
              className={cn("text-left p-4 min-w-0 flex items-start gap-3 transition-colors !min-h-[76px]", how === key ? "bg-[color-mix(in_srgb,var(--color-tint)_12%,var(--color-bg-2))]" : "bg-[var(--color-bg-2)] hover:bg-[var(--color-fill)]")}>
              <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", how === key ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}><Icon size={18} aria-hidden /></span>
              <span className="min-w-0"><span className="block text-[14.5px] font-bold truncate">{title}</span><span className="block text-[12px] text-steel leading-snug">{sub}</span></span>
            </button>))}
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          {how === "full" && <p className="text-[13.5px] text-[var(--color-label-2)]">All {FLOWS.length} flows of the testing flow — sign-in and roles, an order, billing, cleaning, a room booking, a table booking, guest pages, security — then every page of the app for a restaurant and a hotel.</p>}
          {how === "group" && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Menu section" data-groups>
              {GROUPS.map((g) => { const n = PAGES.filter((p) => p.group === g).length; const f = (GROUP_FLOWS[g] ?? []).length; return (
                <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)} disabled={running} data-group={g}
                  className={cn("!min-h-11 rounded-full pl-4 pr-3 inline-flex items-center gap-2 text-[14px] font-semibold transition-colors", group === g ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                  {g}<span className={cn("num text-[11.5px] rounded-full px-1.5", group === g ? "bg-[color-mix(in_srgb,var(--color-on-label)_18%,transparent)]" : "bg-[var(--color-bg-2)]")}>{n} page{n === 1 ? "" : "s"}{f ? ` · ${f} flow${f === 1 ? "" : "s"}` : ""}</span>
                </button>); })}
            </div>)}
          {how === "flow" && (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Flow" data-flows>
              {FLOWS.map((f) => (
                <button key={f.key} type="button" role="radio" aria-checked={flow === f.key} onClick={() => setFlow(f.key)} disabled={running} data-flow={f.key}
                  className={cn("text-left rounded-2xl p-3.5 min-w-0 border transition-colors", flow === f.key ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_10%,var(--color-bg-2))]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] hover:bg-[var(--color-fill)]")}>
                  <span className="flex items-center gap-2"><span className="text-[14.5px] font-bold truncate">{f.title}</span><span className="ml-auto shrink-0 text-[11px] font-bold text-steel">{f.stage}</span></span>
                  <span className="block mt-1 text-[12px] text-steel leading-snug line-clamp-2">{f.what}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--color-label-2)]">{f.steps.length} steps · {f.needs.map((k) => KIND_WORD[k]).join(" + ")}</span>
                </button>))}
            </div>)}
          {how === "page" && (
            <div className="flex flex-wrap items-end gap-3" data-page-pick>
              <label className="min-w-0 flex-1 basis-64"><span className="text-[12.5px] font-semibold text-steel">Page</span>
                <select className="mt-1 !h-11 !min-h-11" value={pageDef.href} onChange={(e) => setHref(e.target.value)} disabled={running} data-page-select>
                  {GROUPS.map((g) => <optgroup key={g} label={g}>{PAGES.filter((p) => p.group === g).map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>)}
                </select></label>
              <div role="radiogroup" aria-label="Property" className="flex gap-1 p-1 rounded-2xl bg-[var(--color-fill)]">
                {(["r", "h"] as Kind[]).map((k) => { const can = pageDef.kinds.includes(k); const I = k === "r" ? Store : BedDouble; return (
                  <button key={k} type="button" role="radio" aria-checked={mode.kind === "page" && mode.on === k} disabled={!can || running} onClick={() => setOn(k)} data-kind={k}
                    className={cn("!min-h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13.5px] font-semibold disabled:opacity-40", mode.kind === "page" && mode.on === k ? "bg-[var(--color-bg-2)] shadow-sm" : "")}><I size={15} aria-hidden />{KIND_WORD[k]}</button>); })}
              </div>
            </div>)}
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[var(--color-separator)]">
            <span className="text-[13px] text-steel pt-3"><b className="num text-[var(--color-label)]">{plan.length}</b> steps · about <b className="num text-[var(--color-label)]">{eta < 1 ? "1" : eta}</b> min · {modeLabel(mode)}</span>
            <span className="ml-auto pt-3 max-sm:w-full flex gap-2">
              {running
                ? <button type="button" className="svc-btn quiet sm !px-4 max-sm:flex-1" onClick={() => { stop.current = true; }} data-stop><Square size={15} aria-hidden />Stop</button>
                : <button type="button" className="svc-btn go sm !px-5 max-sm:flex-1" onClick={() => void start()} data-start><Play size={16} aria-hidden />Start testing</button>}
            </span>
          </div>
        </div>
      </Card>

      {/* the run */}
      {ran && (
        <Card className="!p-0 overflow-hidden" data-run>
          <div className="p-4 sm:p-5 flex flex-wrap items-center gap-4 border-b border-[var(--color-separator)]">
            <div className="relative h-16 w-16 shrink-0" aria-label={score === null ? "No result yet" : `Score ${score}`}>
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-fill-2)" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={counts.fail ? TONE.fail : counts.warn ? TONE.warn : TONE.pass} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(finished / Math.max(1, total)) * 97.4} 97.4`} /></svg>
              <span className="absolute inset-0 grid place-items-center text-[15px] font-extrabold num">{running ? `${Math.round((finished / Math.max(1, total)) * 100)}%` : score ?? "—"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold truncate">{modeLabel(ran)}</div>
              <div className="text-[12.5px] text-steel truncate" data-run-now>{running ? (current ? `${flowTitle(current.flow)} · ${current.title}` : "Cleaning up…") : stop.current ? "Stopped" : "Finished"} · <span className="num">{finished}/{total}</span> steps · <Clock size={12} className="inline -mt-0.5" aria-hidden /> <span className="num">{secs((running ? now : (rows.reduce((a, r) => a + (r.ms ?? 0), 0) + t0)) - t0)}</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden" data-progress><div className="h-full bg-[var(--color-tint)] transition-[width] duration-300" style={{ width: `${(finished / Math.max(1, total)) * 100}%` }} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center max-sm:w-full" data-totals>
              {(["pass", "warn", "fail"] as const).map((k) => <div key={k} className="rounded-xl px-3 py-2 min-w-[72px]" style={{ background: `color-mix(in srgb, ${TONE[k]} 12%, transparent)` }}><div className="num text-[20px] font-extrabold leading-none" style={{ color: TONE[k] }}>{counts[k]}</div><div className="text-[11px] font-semibold text-steel mt-1">{k === "pass" ? "passed" : k === "warn" ? "warnings" : "failed"}</div></div>)}
            </div>
          </div>
          {byFlow.map(([title, list]) => { const st = list.some((r) => r.state === "run") ? "run" : list.every((r) => r.state === "wait") ? "wait" : worst(list.flatMap((r) => r.checks)); return (
            <section key={title} className="border-b border-[var(--color-separator)] last:border-b-0" data-run-flow={title}>
              <div className="px-4 sm:px-5 pt-3 pb-1.5 flex items-center gap-2"><Mark s={st as Row["state"]} size={15} /><h2 className="text-[11.5px] font-extrabold uppercase tracking-[.12em] text-steel truncate">{title}</h2><span className="ml-auto text-[11.5px] text-steel num">{list.filter((r) => r.state === "pass").length}/{list.length}</span></div>
              <ul>
                {list.map((r) => { const isOpen = !!open[r.id]; return (
                  <li key={r.id} data-step={r.id} data-state={r.state}>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} disabled={!r.checks.length} aria-expanded={isOpen}
                      className="w-full text-left px-4 sm:px-5 py-2.5 flex items-center gap-3 min-w-0 !min-h-11 hover:bg-[var(--color-fill)] transition-colors disabled:hover:bg-transparent">
                      <Mark s={r.state} />
                      <span className="min-w-0 flex-1 text-[14px] font-medium truncate">{r.title}</span>
                      {r.ms !== undefined && <span className="text-[11.5px] text-steel num shrink-0">{secs(r.ms)}</span>}
                      {r.checks.length > 0 && <ChevronDown size={16} className={cn("shrink-0 text-steel transition-transform", isOpen && "rotate-180")} aria-hidden />}
                    </button>
                    {isOpen && <ul className="pb-2 pl-12 pr-4 sm:pr-5 space-y-1.5" data-checks>{r.checks.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 min-w-0 text-[13px]"><Mark s={c.status} size={14} />
                        <span className="min-w-0"><span className="font-semibold">{c.name}</span>{c.detail && <span className="text-steel"> — {c.detail}</span>}
                          {c.fix && c.status !== "pass" && <span className="block text-[12px] mt-0.5" style={{ color: TONE[c.status] }}>Fix: {c.fix}</span>}</span></li>))}</ul>}
                  </li>); })}
              </ul>
            </section>); })}
          {cleanup.length > 0 && <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-steel bg-[var(--color-fill)]" data-cleanup>{cleanup.map((c, i) => <span key={i} className="inline-flex items-center gap-1.5"><Mark s={c.status} size={13} />{c.name}{c.detail ? ` · ${c.detail}` : ""}</span>)}</div>}
        </Card>)}

      {/* the runs kept so far */}
      <Card className="!p-0 overflow-hidden" data-past>
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--color-separator)] flex items-center gap-2"><h2 className="text-[15px] font-semibold">Recent runs</h2><span className="ml-auto text-[11.5px] text-steel">kept with the Testing results</span></div>
        {past.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-steel">No flow test has run yet</p>
          : <ul className="divide-y divide-[var(--color-separator)]">{past.map((p) => (
              <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0" data-past-run={p.status}>
                <Mark s={p.status} />
                <span className="min-w-0 flex-1 text-[14px] font-semibold truncate">{p.label}</span>
                <span className="text-[12px] num" style={{ color: TONE.pass }}>{p.pass} passed</span>
                {p.warn > 0 && <span className="text-[12px] num" style={{ color: TONE.warn }}>{p.warn} warnings</span>}
                {p.fail > 0 && <span className="text-[12px] num" style={{ color: TONE.fail }}>{p.fail} failed</span>}
                <span className="text-[12px] text-steel num">{secs(p.ms)} · {ago(p.ran_at)}</span>
              </li>))}</ul>}
      </Card>
    </div>
  );
}
