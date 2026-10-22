"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Database, FunctionSquare, Plug, ShieldCheck, Gauge, Code2, MonitorSmartphone, Play, ChevronDown, Check, AlertTriangle, X, Minus, Loader2, FileDown, Activity } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";
import { recordRun } from "./actions";
import { exportPdf } from "./exportPdf";

/**
 * One button runs everything; one button per suite runs that suite. Six suites run on the server
 * (/api/admin/selftest); the seventh, Screens & buttons, has to run here — it loads every screen in
 * this browser at phone and laptop width, in a frame, and reads what a person would see: a crash
 * card, a sideways scroll, an image that did not arrive, a button with no name, a link that answers
 * with an error. Results are kept, so the page opens on the last run of each suite.
 */
type Status = "pass" | "warn" | "fail" | "skip";
export type Check = { name: string; status: Status; detail?: string; ms?: number };
export type Run = { suite: string; status: "pass" | "warn" | "fail"; ms: number; checks: Check[]; ran_at: string };
/** a kept run without its checks — for the history dots and the trend line */
export type Hist = { suite: string; status: "pass" | "warn" | "fail"; ms: number; ran_at: string; pass: number; warn: number; fail: number };

const SUITES: { key: string; title: string; what: string; Icon: typeof Database; server: boolean; needsProperty?: boolean }[] = [
  { key: "database", title: "Database", what: "Connection, migrations, row security, functions, indexes, data checks.", Icon: Database, server: true },
  { key: "functions", title: "Functions", what: "Every report and screen call works, and how fast.", Icon: FunctionSquare, server: true, needsProperty: true },
  { key: "api", title: "API & connectivity", what: "Supabase, the app's routes, outside services and server keys.", Icon: Plug, server: true },
  { key: "security", title: "Security", what: "Headers, no anonymous access, sign-in required, no secrets leaked.", Icon: ShieldCheck, server: true },
  { key: "performance", title: "Speed", what: "Server time per screen and call: under 600 ms good, over 1.5 s failing.", Icon: Gauge, server: true },
  { key: "unit", title: "Code checks", what: "Money, dates, bills, recipes and till search logic.", Icon: Code2, server: true },
  { key: "browser", title: "Screens & buttons", what: "Every screen at phone and laptop width — no crash, no side scroll, links work.", Icon: MonitorSmartphone, server: false },
];

const worst = (checks: Check[]): "pass" | "warn" | "fail" => checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const secs = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

/** The browser suite: each screen in a hidden frame, twice — a phone and a laptop. */
async function runBrowser(acting: boolean): Promise<Run> {
  const t0 = Date.now(); const checks: Check[] = [];
  const routes = acting
    ? ["/dashboard", "/orders", "/orders/new", "/kitchen", "/billing", "/menu", "/inventory", "/invoices", "/reports", "/tomorrow", "/settings", "/intelligence", "/controls", "/audit"]
    : ["/admin", "/admin/compliance", "/admin/testing", "/get"];   // not /login: a signed-in master is sent on from it
  if (!acting) checks.push({ name: "Property screens", status: "skip", detail: "open a property (Master control → Open) first" });
  const links = new Set<string>();
  for (const width of [412, 1280]) {
    for (const path of routes) {
      const f = document.createElement("iframe");
      f.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:900px;border:0;visibility:hidden`;
      f.setAttribute("aria-hidden", "true");
      const started = performance.now();
      const loaded = new Promise<boolean>((res) => { f.onload = () => res(true); setTimeout(() => res(false), 20000); });
      f.src = path; document.body.appendChild(f);
      const ok = await loaded; await new Promise((r) => setTimeout(r, 700));
      const ms = Math.round(performance.now() - started);
      try {
        const d = f.contentDocument;
        if (!ok || !d) { checks.push({ name: `${path} @${width}`, status: "fail", detail: "did not load in 20 s", ms }); continue; }
        const landed = f.contentWindow?.location.pathname ?? path;
        const crashed = !!d.querySelector("[data-error-screen]");
        const side = d.documentElement.scrollWidth - d.documentElement.clientWidth;
        const imgs = [...d.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).length;
        // only buttons a person can see (a closed menu's items keep their boxes while hidden), named by
        // any text they carry — innerText is empty for a hidden element, textContent is not
        const shown = (b: HTMLElement) => (typeof b.checkVisibility === "function" ? b.checkVisibility({ visibilityProperty: true, opacityProperty: true } as never) : b.getClientRects().length > 0);
        const nameless = [...d.querySelectorAll("button")].filter((b) => shown(b) && !((b.textContent ?? "").trim() || b.getAttribute("aria-label") || b.getAttribute("title") || b.querySelector("img[alt]"))).length;
        const h1 = !!d.querySelector("h1");
        if (width === 1280) for (const a of [...d.querySelectorAll<HTMLAnchorElement>("a[href]")]) { const u = new URL(a.href, location.origin); if (u.origin === location.origin && !/logout|^\/admin\/leave/.test(u.pathname) && !u.hash) links.add(u.pathname + u.search); }
        const problems: string[] = [];
        if (crashed) problems.push("crash card");
        if (side > 1) problems.push(`${side}px sideways scroll`);
        if (imgs) problems.push(`${imgs} image(s) missing`);
        if (nameless) problems.push(`${nameless} unnamed button(s)`);
        if (!h1) problems.push("no heading");
        if (landed !== path && !path.startsWith("/admin")) problems.push(`landed on ${landed}`);
        const status: Status = crashed || side > 1 || (landed !== path && !path.startsWith("/admin")) ? "fail" : problems.length ? "warn" : ms > 4000 ? "warn" : "pass";
        checks.push({ name: `${path} @${width}`, status, detail: `${ms} ms${problems.length ? " · " + problems.join(" · ") : ""}`, ms });
      } finally { f.remove(); }
    }
  }
  // every internal link those screens offer answers without an error
  let broken = 0, tried = 0;
  for (const href of [...links].slice(0, 60)) {
    tried++;
    try { const r = await fetch(href, { credentials: "include", redirect: "follow" }); if (r.status >= 400) { broken++; checks.push({ name: `Link ${href}`, status: "fail", detail: `http ${r.status}` }); } }
    catch { broken++; checks.push({ name: `Link ${href}`, status: "fail", detail: "no answer" }); }
  }
  checks.push({ name: "Links on those screens", status: broken ? "fail" : "pass", detail: `${tried} tried, ${broken} broken` });
  return { suite: "browser", status: worst(checks), ms: Date.now() - t0, checks, ran_at: new Date().toISOString() };
}

export function TestingClient({ last, history = [], properties, acting }: { last: Record<string, Run>; history?: Hist[]; properties: { id: string; name: string }[]; acting: string | null }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Record<string, Run>>(last);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [hist, setHist] = useState<Hist[]>(history);
  const [property, setProperty] = useState<string>(acting ?? properties[0]?.id ?? "");
  const [step, setStep] = useState<{ i: number; title: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const runOne = async (key: string): Promise<Run | null> => {
    setBusy(key);
    try {
      if (key === "browser") {
        const r = await runBrowser(Boolean(acting));
        await recordRun("browser", r.status, r.ms, r.checks);
        setRuns((x) => ({ ...x, browser: r })); setHist((h) => [...h, toHist(r)]); return r;
      }
      const res = await fetch("/api/admin/selftest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ suite: key, restaurant: property || null }) });
      if (!res.ok) { const r: Run = { suite: key, status: "fail", ms: 0, checks: [{ name: "The test route", status: "fail", detail: `http ${res.status}` }], ran_at: new Date().toISOString() }; setRuns((x) => ({ ...x, [key]: r })); return r; }
      const r = (await res.json()) as Run; setRuns((x) => ({ ...x, [key]: r })); setHist((h) => [...h, toHist(r)]); return r;
    } finally { setBusy(null); }
  };
  const runAll = async () => {
    for (let i = 0; i < SUITES.length; i++) { setStep({ i, title: SUITES[i].title }); await runOne(SUITES[i].key); }
    setStep(null); router.refresh();
  };

  const all = SUITES.map((s) => runs[s.key]).filter(Boolean) as Run[];
  const count = (st: Status, list: Check[] = all.flatMap((r) => r.checks)) => list.filter((c) => c.status === st).length;
  const total = all.reduce((n, r) => n + r.checks.length, 0);
  const judged = count("pass") + count("warn") + count("fail");
  const score = judged ? Math.round(((count("pass") + count("warn") * 0.5) / judged) * 100) : null;
  const overall = all.length ? worst(all.flatMap((r) => r.checks)) : null;
  const latest = all.length ? all.map((r) => r.ran_at).sort().at(-1)! : null;
  const totalMs = all.reduce((t, r) => t + r.ms, 0);
  const doExport = async () => { setExporting(true); try { await exportPdf(all, Object.fromEntries(SUITES.map((x) => [x.key, x.title]))); } finally { setExporting(false); } };
  const running = busy !== null;
  /* response times across every timed check of the server-side suites */
  const times = all.filter((r) => r.suite !== "browser").flatMap((r) => r.checks.filter((c) => typeof c.ms === "number" && c.status !== "skip").map((c) => ({ ms: c.ms!, name: c.name }))).sort((a, b) => a.ms - b.ms);
  const q = (p: number) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))].ms : 0);
  const issues = all.flatMap((r) => r.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => ({ ...c, suite: r.suite }))).sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1));
  /* the score of each Run all: runs within three minutes of each other are one sitting */
  const trend = (() => { const out: number[] = []; let group: Hist[] = []; const flush = () => { const p = group.reduce((t, x) => t + x.pass, 0), w = group.reduce((t, x) => t + x.warn, 0), f = group.reduce((t, x) => t + x.fail, 0); if (p + w + f) out.push(Math.round(((p + w * 0.5) / (p + w + f)) * 100)); group = []; };
    for (const h of hist) { if (group.length && new Date(h.ran_at).getTime() - new Date(group[group.length - 1].ran_at).getTime() > 180000) flush(); group.push(h); } flush(); return out.slice(-12); })();

  return (
    <div className="space-y-5" data-testing>
      {/* ── header: what this is, and the three things you can do ── */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Self-test</div>
          <h1 className="text-4xl">Is everything <em>working?</em></h1>
          <p className="text-sm text-steel mt-1.5 max-w-xl">Seven suites check the app from inside. Nothing here changes a property&apos;s data.</p>
        </div>
        {/* a phone: the picker on its own line, the two buttons sharing the next — in one row Run all was squeezed to 46px */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:w-auto">
          <select value={property} onChange={(e) => setProperty(e.target.value)} className="col-span-2 !h-11 !w-full sm:!w-auto sm:min-w-[11rem] !text-[13px]" aria-label="Property the Functions suite runs for" data-property>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}{acting === p.id ? " · open now" : ""}</option>)}
          </select>
          <Button variant="outline" onClick={() => { void doExport(); }} disabled={!all.length || exporting || running} data-export-pdf title="Download the last results as a PDF">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Export PDF
          </Button>
          <Button onClick={() => { void runAll(); }} disabled={running} data-run-all className="min-w-0">
            {step ? <><Loader2 size={16} className="animate-spin" /> Running {step.i + 1} of {SUITES.length}</> : <><Play size={16} /> Run all tests</>}
          </Button>
        </div>
      </div>

      {/* ── overview: one panel, read left to right ── */}
      <Card className="!p-0 overflow-hidden" data-summary>
        {step && (
          <div className="px-5 pt-4" data-progress>
            <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-semibold">Running {step.title}…</span><span className="num text-steel">{Math.round((step.i / SUITES.length) * 100)}%</span></div>
            <div className="h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-tint)] transition-[width] duration-500" style={{ width: `${Math.max(4, (step.i / SUITES.length) * 100)}%` }} /></div>
          </div>
        )}
        {score === null ? (
          <div className="p-6 flex items-center gap-4">
            <span className="h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-steel shrink-0"><Activity size={20} /></span>
            <div><div className="text-[15px] font-semibold">No results yet</div><div className="text-sm text-steel">Press <b>Run all tests</b> — it takes about fifteen seconds.</div></div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[auto_minmax(0,1fr)] items-center gap-5 md:gap-8 p-5 md:p-6">
            <div className="flex items-center gap-4 md:pr-8 md:border-r border-[var(--color-separator)]">
              <ScoreRing score={score} status={overall!} />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-steel">Health score</div>
                <div className="text-[17px] font-semibold mt-0.5" data-verdict>{overall === "pass" ? "All clear" : overall === "warn" ? "Working, with warnings" : "Something is failing"}</div>
                <div className="text-xs text-steel mt-1 num">{secs(totalMs)} · {all.length} of {SUITES.length} suites · {ago(latest!)}</div>
                {trend.length > 1 && <div className="mt-2 flex items-center gap-2" data-trend title={`Health over the last ${trend.length} runs: ${trend.join(", ")}`}><Spark values={trend} />{(() => { const dlt = trend.at(-1)! - trend.at(-2)!; return <span className={cn("text-[11px] font-semibold num", dlt > 0 ? "text-[var(--color-green)]" : dlt < 0 ? "text-[var(--color-red)]" : "text-steel")}>{dlt > 0 ? `▲ ${dlt} since last run` : dlt < 0 ? `▼ ${-dlt} since last run` : "steady since last run"}</span>; })()}</div>}
              </div>
            </div>
            <div className="min-w-0">
              <div className="grid grid-cols-4 divide-x divide-[var(--color-separator)]" data-totals>
                <Total label="Passed" value={count("pass")} tone="pass" />
                <Total label="Warnings" value={count("warn")} tone="warn" />
                <Total label="Failed" value={count("fail")} tone="fail" />
                <Total label="Skipped" value={count("skip")} tone="skip" />
              </div>
              {/* every check, as one bar */}
              <div className="mt-4 h-2.5 rounded-full bg-[var(--color-fill)] overflow-hidden flex" data-overall-bar aria-label={`${count("pass")} passed, ${count("warn")} warnings, ${count("fail")} failed, ${count("skip")} skipped of ${total}`}>
                {(["pass", "warn", "fail", "skip"] as Status[]).map((st) => <span key={st} className="h-full transition-[width] duration-700" style={{ width: `${(count(st) / Math.max(1, total)) * 100}%`, background: TONE[st] }} />)}
              </div>
              <div className="mt-2 text-xs text-steel num" data-tally>{count("pass")} passed · {count("warn")} warnings · {count("fail")} failed{count("skip") ? ` · ${count("skip")} skipped` : ""} · {total} checks</div>
              {times.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2" data-latency>
                  <Metric label="Median answer" value={secs(q(0.5))} tone={q(0.5) < 600 ? "pass" : q(0.5) < 1500 ? "warn" : "fail"} />
                  <Metric label="95th percentile" value={secs(q(0.95))} tone={q(0.95) < 600 ? "pass" : q(0.95) < 1500 ? "warn" : "fail"} />
                  <Metric label="Slowest" value={secs(times.at(-1)!.ms)} sub={speedLabel(times.at(-1)!.name).label} tone={times.at(-1)!.ms < 600 ? "pass" : times.at(-1)!.ms < 1500 ? "warn" : "fail"} />
                </div>
              )}
            </div>
          </div>
        )}
        {!acting && <div className="px-5 py-2.5 text-xs text-[var(--color-orange)] bg-[color-mix(in_srgb,var(--color-orange)_8%,transparent)] border-t border-[var(--color-separator)]">Speed and Screens need a property open — press <b>Open</b> on one, then come back.</div>}
      </Card>

      {/* ── needs attention: every warning and failure in one place, worst first ── */}
      {all.length > 0 && (
        <Card className="!p-0 overflow-hidden" data-attention>
          <div className="px-5 py-3 flex items-center gap-2 border-b border-[var(--color-separator)]">
            <h2 className="text-[15px] font-semibold">Needs attention</h2>
            <span className="h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center num" style={{ background: issues.length ? `color-mix(in srgb, ${TONE[issues[0].status as Status]} 18%, transparent)` : "var(--color-green-2)", color: issues.length ? TONE[issues[0].status as Status] : TONE.pass }}>{issues.length}</span>
          </div>
          {issues.length === 0
            ? <div className="px-5 py-4 flex items-center gap-3 text-sm"><Mark status="pass" /> Nothing to fix — every check passed.</div>
            : <ul className="divide-y divide-[var(--color-separator)]">
                {issues.map((c, i) => { const s2 = SUITES.find((x) => x.key === c.suite)!; return (
                  <li key={i}>
                    <button type="button" onClick={() => { setOpen(c.suite); setIssuesOnly(true); setTimeout(() => document.querySelector(`[data-suite="${c.suite}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                      className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-5 py-2.5 text-left !min-h-0 !bg-transparent hover:!bg-[var(--color-fill)] transition-colors" data-issue={c.status}>
                      <Mark status={c.status} />
                      <span className="min-w-0"><span className="block text-[13px] font-medium">{c.name}</span>{c.detail && <span className="block text-xs text-steel break-words">{c.detail}</span>}</span>
                      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11px] text-steel whitespace-nowrap"><s2.Icon size={12} />{s2.title}</span>
                    </button>
                  </li>); })}
              </ul>}
        </Card>
      )}

      {/* ── the suites: one list, each row a suite, expanding to its checks ── */}
      <Card className="!p-0 overflow-hidden" data-suites>
        <div className="px-5 py-3 flex items-center gap-2 border-b border-[var(--color-separator)]"><h2 className="text-[15px] font-semibold">Suites</h2><span className="ml-auto flex items-center gap-3 text-[11px] text-steel"><Key c={TONE.pass} t="pass" /><Key c={TONE.warn} t="warning" /><Key c={TONE.fail} t="fail" /></span></div>
        <ul className="divide-y divide-[var(--color-separator)]">
          {SUITES.map(({ key, title, what, Icon }) => {
            const r = runs[key]; const isOpen = open === key; const isRunning = busy === key;
            const p = r ? count("pass", r.checks) : 0, w = r ? count("warn", r.checks) : 0, f = r ? count("fail", r.checks) : 0, sk = r ? count("skip", r.checks) : 0, tot = Math.max(1, p + w + f);
            return (
              <li key={key} data-suite={key} data-status={r?.status ?? "none"}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", r ? "" : "bg-[var(--color-fill)] text-steel")} style={r ? { background: `color-mix(in srgb, ${TONE[r.status]} 14%, transparent)`, color: TONE[r.status] } : undefined}>{isRunning ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="text-[15px] font-semibold truncate">{title}</span>{r && <Pill status={r.status} />}</div>
                    <div className="text-xs text-steel truncate" title={what}>{what}</div>
                  </div>
                  {/* the result: a bar of this suite's checks, its count and time */}
                  <div className="col-span-3 md:col-span-1 order-last md:order-none min-w-0">
                    {r ? (<>
                      <div className="h-2 rounded-full bg-[var(--color-fill)] overflow-hidden flex">
                        <span className="h-full" style={{ width: `${(p / tot) * 100}%`, background: TONE.pass }} />
                        <span className="h-full" style={{ width: `${(w / tot) * 100}%`, background: TONE.warn }} />
                        <span className="h-full" style={{ width: `${(f / tot) * 100}%`, background: TONE.fail }} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-steel num">
                        <span className="font-semibold text-[var(--color-label)]">{p}/{tot} passed</span>{w > 0 && <span style={{ color: TONE.warn }}>{w} warn</span>}{f > 0 && <span style={{ color: TONE.fail }}>{f} fail</span>}{sk > 0 && <span>{sk} skipped</span>}
                        <span className="ml-auto hidden sm:flex items-center gap-[3px]" data-history aria-label="The last results of this suite, oldest first">{hist.filter((h) => h.suite === key).slice(-8).map((h, j) => <span key={j} title={`${h.status} · ${ago(h.ran_at)}`} className="h-2 w-2 rounded-full" style={{ background: TONE[h.status] }} />)}</span>
                        <span className="ml-auto sm:ml-2">{secs(r.ms)} · {ago(r.ran_at)}</span>
                      </div>
                    </>) : <div className="text-xs text-steel">Not run yet</div>}
                  </div>
                  <div className="flex items-center gap-1.5 justify-self-end">
                    <Button size="sm" variant="outline" onClick={() => { void runOne(key); }} disabled={running} data-run={key} aria-label={`Run ${title}`}>{isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}<span className="hidden sm:inline">Run</span></Button>
                    {r && <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} the ${r.checks.length} checks of ${title}`} data-details
                      className="h-10 w-10 rounded-full grid place-items-center !bg-transparent hover:!bg-[var(--color-fill)] text-steel"><ChevronDown size={17} className={cn("transition-transform", isOpen && "rotate-180")} /><span className="sr-only">{r.checks.length} checks · {ago(r.ran_at)}</span></button>}
                  </div>
                </div>
                {r && isOpen && (
                  <div className="px-5 pb-4" data-checks>
                    {(w + f) > 0 && (
                      <div className="mb-2 flex items-center gap-2 text-xs" data-filter>
                        <span className="text-steel">Show</span>
                        <div className="inline-flex p-0.5 rounded-full bg-[var(--color-fill)]">
                          {[["all", `All ${r.checks.length}`], ["issues", `Issues ${w + f}`]].map(([v, l]) => <button key={v} type="button" onClick={() => setIssuesOnly(v === "issues")} aria-pressed={(v === "issues") === issuesOnly}
                            className={cn("!min-h-0 h-7 px-3 rounded-full text-[12px] font-semibold transition-colors", (v === "issues") === issuesOnly ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-sm" : "!bg-transparent text-steel")}>{l}</button>)}
                        </div>
                      </div>
                    )}
                    <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden">
                      {r.checks.filter((c) => !issuesOnly || w + f === 0 || c.status === "warn" || c.status === "fail").map((c, i) => (
                        <div key={i} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-2.5 text-[13px]", i > 0 && "border-t border-[var(--color-separator)]")}>
                          <Mark status={c.status} />
                          <span className="min-w-0"><span className="block font-medium">{c.name}</span>{c.detail && <span className="block text-xs text-steel break-words">{c.detail}</span>}</span>
                          {typeof c.ms === "number" && <span className="text-xs num text-steel pt-0.5">{secs(c.ms)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── speed: the slowest answers on one axis, the two budgets marked ── */}
      {all.length > 0 && <SpeedChart runs={all} />}
    </div>
  );
}

const toHist = (r: Run): Hist => ({ suite: r.suite, status: r.status, ms: r.ms, ran_at: r.ran_at, pass: r.checks.filter((c) => c.status === "pass").length, warn: r.checks.filter((c) => c.status === "warn").length, fail: r.checks.filter((c) => c.status === "fail").length });

/** a small line of the health score over the last runs */
function Spark({ values }: { values: number[] }) {
  const W = 96, H = 24, lo = Math.min(...values, 80), hi = Math.max(...values, 100);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * W, H - 2 - ((v - lo) / Math.max(1, hi - lo)) * (H - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--color-tint)" opacity=".06" />
      <path d={d} fill="none" stroke="var(--color-tint)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.5" fill="var(--color-tint)" />
    </svg>
  );
}
function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: Status }) {
  return (
    <div className="rounded-[14px] bg-[var(--color-fill)] px-3 py-2 min-w-0" data-metric>
      <div className="text-[10.5px] text-steel truncate">{label}</div>
      <div className="flex items-baseline gap-1.5 min-w-0"><span className="h-1.5 w-1.5 rounded-full shrink-0 self-center" style={{ background: TONE[tone] }} /><span className="text-[15px] font-semibold num">{value}</span></div>
      {sub && <div className="text-[10.5px] text-steel truncate" title={sub}>{sub}</div>}
    </div>
  );
}

const TONE: Record<Status, string> = { pass: "var(--color-green)", warn: "var(--color-orange)", fail: "var(--color-red)", skip: "var(--color-label-3)" };

/** "/admin @412" → "/admin" on a phone; "Screen /dashboard" → "/dashboard"; "Database call x" → "x()" */
function speedLabel(name: string): { label: string; where: string } {
  const m = name.match(/^(\S+) @(\d+)$/); if (m) return { label: m[1], where: Number(m[2]) < 700 ? "phone" : "laptop" };
  if (name.startsWith("Screen ")) return { label: name.slice(7), where: "server" };
  if (name.startsWith("Database call ")) return { label: name.slice(14) + "()", where: "database" };
  if (/^App: |^Supabase |^Wikimedia/.test(name)) return { label: name.replace(/^App: /, ""), where: "api" };
  return { label: name, where: "function" };
}

function SpeedChart({ runs }: { runs: Run[] }) {
  /* server, API and database answers only: the Screens suite times a whole page in a frame (scripts
     and all), which the 600 ms server budget does not apply to — mixing them painted every bar amber */
  const items = runs.filter((r) => r.suite !== "browser").flatMap((r) => r.checks.filter((c) => typeof c.ms === "number" && c.status !== "skip").map((c) => ({ ...speedLabel(c.name), ms: c.ms! })))
    .sort((a, b) => b.ms - a.ms).slice(0, 10);
  if (!items.length) return null;
  const max = Math.max(2000, Math.ceil(Math.max(...items.map((i) => i.ms)) / 500) * 500);
  const pct = (ms: number) => `${(ms / max) * 100}%`;
  const ticks = [0, 600, 1500, max];
  const slow = items.filter((i) => i.ms >= 600).length;
  return (
    <Card data-speed-chart>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold">Slowest answers</h2>
        <span className="text-xs text-steel">{slow ? `${slow} of the ${items.length} slowest are over 600 ms` : `all ${items.length} under 600 ms`}</span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-steel"><Key c={TONE.pass} t="under 600 ms" /><Key c={TONE.warn} t="600 ms – 1.5 s" /><Key c={TONE.fail} t="over 1.5 s" /></span>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem] gap-x-3 gap-y-2.5 items-center">
        {items.map((it, i) => { const col = it.ms < 600 ? TONE.pass : it.ms < 1500 ? TONE.warn : TONE.fail; return (
          <div key={i} className="contents">
            <div className="min-w-0"><div className="text-[13px] font-medium truncate" title={it.label}>{it.label}</div><div className="text-[10.5px] text-steel uppercase tracking-wide">{it.where}</div></div>
            <div className="relative h-6 rounded-md bg-[var(--color-fill)]">
              <span aria-hidden className="absolute inset-y-0 w-px bg-[var(--color-separator)]" style={{ left: pct(600) }} />
              <span aria-hidden className="absolute inset-y-0 w-px bg-[var(--color-separator)]" style={{ left: pct(1500) }} />
              <span className="absolute inset-y-1 left-1 rounded transition-[width] duration-700" style={{ width: `calc(${pct(it.ms)} - 4px)`, minWidth: 4, background: col }} />
            </div>
            <div className="text-right text-[13px] num font-semibold">{secs(it.ms)}</div>
          </div>); })}
        {/* the axis */}
        <div />
        <div className="relative h-4 text-[10.5px] text-steel num">
          {/* the end labels align inwards: centred on the edge, "2.0 s" stuck out and scrolled a phone 9px sideways */}
          {ticks.map((t, i) => <span key={t} className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pct(t) }}>{t === 0 ? "0" : secs(t)}</span>)}
        </div>
        <div />
      </div>
    </Card>
  );
}

/** the health score as a ring: green, amber or red by the worst result, the number in the middle */
function ScoreRing({ score, status }: { score: number; status: "pass" | "warn" | "fail" }) {
  const R = 52, C = 2 * Math.PI * R; const col = TONE[status];
  return (
    <div className="relative h-[112px] w-[112px] shrink-0" data-score={score}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--color-fill-2)" strokeWidth="10" />
        <circle cx="64" cy="64" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center"><span className="font-display text-[34px] leading-none num">{score}</span></div>
    </div>
  );
}
function Total({ label, value, tone }: { label: string; value: number; tone: Status }) {
  return (
    <div className="px-2 sm:px-3 first:pl-0 min-w-0" data-stat={tone}>
      <div className="flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[11px] text-steel"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: TONE[tone] }} /><span className="truncate">{label}</span></div>
      <div className="font-display text-[30px] leading-none num mt-1">{value}</div>
    </div>
  );
}
function Key({ c, t }: { c: string; t: string }) { return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>; }

function Pill({ status }: { status: "pass" | "warn" | "fail" }) {
  return <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-semibold shrink-0" style={{ background: `color-mix(in srgb, ${TONE[status]} 15%, transparent)`, color: TONE[status] }} data-pill={status}>{status === "pass" ? <Check size={11} /> : status === "warn" ? <AlertTriangle size={11} /> : <X size={11} />}{status === "pass" ? "Pass" : status === "warn" ? "Warnings" : "Failing"}</span>;
}
function Mark({ status }: { status: Status }): ReactNode {
  return <span className="mt-0.5 h-5 w-5 rounded-full grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, ${TONE[status]} 16%, transparent)`, color: TONE[status] }} data-mark={status}>{status === "pass" ? <Check size={12} /> : status === "warn" ? <AlertTriangle size={12} /> : status === "fail" ? <X size={12} /> : <Minus size={12} />}</span>;
}
