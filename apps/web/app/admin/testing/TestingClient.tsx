"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Database, FunctionSquare, Plug, ShieldCheck, Gauge, Code2, MonitorSmartphone, Play, ChevronDown, Check, AlertTriangle, X, Minus, Loader2, FileDown, Activity,
  ShieldAlert, Scale, Siren, Cpu, Zap, Search, RotateCcw, ClipboardCopy, FileJson, Wrench, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { recordRun } from "./actions";
import { exportPdf } from "./exportPdf";

/**
 * One button runs everything; one button per suite runs that suite. Eleven suites run on the server
 * (/api/admin/selftest); the twelfth, Screens & buttons, has to run here — it loads every screen in
 * this browser at phone, iPad and laptop width, in a frame, and reads what a person would see: a crash
 * card, a sideways scroll, an image that did not arrive, a button with no name or too small to tap, a
 * script error, a heavy page, a link that answers with an error. Results are kept, so the page opens on
 * the last run of each suite, and each check is compared with the run before it (new / fixed).
 */
type Status = "pass" | "warn" | "fail" | "skip";
export type Check = { name: string; status: Status; detail?: string; ms?: number; fix?: string };
export type Run = { suite: string; status: "pass" | "warn" | "fail"; ms: number; checks: Check[]; ran_at: string };
/** a kept run without its checks — for the history dots and the trend line */
export type Hist = { suite: string; status: "pass" | "warn" | "fail"; ms: number; ran_at: string; pass: number; warn: number; fail: number };

type GroupKey = "data" | "security" | "speed" | "live" | "screens";
const GROUPS: { key: GroupKey; title: string; Icon: typeof Database; hue: string }[] = [
  { key: "data", title: "Data & money", Icon: Scale, hue: "var(--color-tint)" },
  { key: "security", title: "Security", Icon: ShieldCheck, hue: "var(--color-violet)" },
  { key: "speed", title: "Speed & load", Icon: Gauge, hue: "var(--color-blue)" },
  { key: "live", title: "Live system", Icon: Siren, hue: "var(--color-orange)" },
  { key: "screens", title: "Screens & code", Icon: MonitorSmartphone, hue: "var(--color-cyan)" },
];
const SUITES: { key: string; title: string; what: string; Icon: typeof Database; group: GroupKey; server: boolean }[] = [
  { key: "database", title: "Database", what: "Connection, migrations, functions, indexes", Icon: Database, group: "data", server: true },
  { key: "integrity", title: "Money & data integrity", what: "Bills, invoices, loyalty, bookings", Icon: Scale, group: "data", server: true },
  { key: "functions", title: "Functions", what: "Reports and screen calls", Icon: FunctionSquare, group: "data", server: true },
  { key: "security", title: "Security", what: "Headers, sign-in, CORS, secrets", Icon: ShieldCheck, group: "security", server: true },
  { key: "dbsecurity", title: "Database security", what: "Policies, keys, master password", Icon: ShieldAlert, group: "security", server: true },
  { key: "performance", title: "Speed", what: "Under 600 ms · fail over 1.5 s", Icon: Gauge, group: "speed", server: true },
  { key: "load", title: "Load test", what: "Visitor bursts · median, p95", Icon: Zap, group: "speed", server: true },
  { key: "dbperf", title: "Database performance", what: "Cache, indexes, slow queries", Icon: Cpu, group: "speed", server: true },
  { key: "ops", title: "Live operations", what: "Stuck orders, syncs, cash-ups", Icon: Siren, group: "live", server: true },
  { key: "api", title: "API & connectivity", what: "Routes, services, mail, keys", Icon: Plug, group: "live", server: true },
  { key: "unit", title: "Code checks", what: "Money, GST, dates, recipes", Icon: Code2, group: "screens", server: true },
  { key: "browser", title: "Screens & buttons", what: "Every screen, three widths", Icon: MonitorSmartphone, group: "screens", server: false },
];
const TITLE = Object.fromEntries(SUITES.map((x) => [x.key, x.title]));
const RANK: Record<Status, number> = { pass: 0, skip: 0, warn: 1, fail: 2 };

const worst = (checks: Check[]): "pass" | "warn" | "fail" => checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const secs = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
const scoreOf = (checks: Check[]) => { const p = checks.filter((c) => c.status === "pass").length, w = checks.filter((c) => c.status === "warn").length, f = checks.filter((c) => c.status === "fail").length; return p + w + f ? Math.round(((p + w * 0.5) / (p + w + f)) * 100) : null; };

/** The browser suite: each screen in a hidden frame, three times — a phone, an iPad and a laptop. */
async function runBrowser(acting: boolean, onStep: (n: number, of: number) => void): Promise<Run> {
  const t0 = Date.now(); const checks: Check[] = [];
  const routes = acting
    ? ["/dashboard", "/orders", "/orders/new", "/orders/phone", "/kitchen", "/billing", "/menu", "/inventory", "/invoices", "/expenses", "/reports", "/tomorrow", "/work", "/cleaning", "/labour", "/staff", "/connections", "/settings", "/intelligence", "/controls", "/audit"]
    : ["/admin", "/admin/compliance", "/admin/support", "/admin/testing", "/get"];   // not /login: a signed-in master is sent on from it
  if (!acting) checks.push({ name: "Property screens", status: "skip", detail: "open a property (Master control → Open) first" });
  const links = new Set<string>(); const widths = [412, 834, 1280]; let step = 0;
  for (const width of widths) {
    for (const path of routes) {
      onStep(++step, widths.length * routes.length);
      const f = document.createElement("iframe");
      f.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:900px;border:0;visibility:hidden`;
      f.setAttribute("aria-hidden", "true");
      const started = performance.now();
      const errors: string[] = [];
      const loaded = new Promise<boolean>((res) => { f.onload = () => res(true); setTimeout(() => res(false), 20000); });
      f.src = path; document.body.appendChild(f);
      const ok = await loaded;
      // script errors after the page arrives: an exception, a rejected promise, a console.error from React
      try {
        const w = f.contentWindow as (Window & typeof globalThis) | null;
        if (w) {
          w.addEventListener("error", (e) => errors.push((e as ErrorEvent).message || "script error"));
          w.addEventListener("unhandledrejection", (e) => errors.push(String((e as PromiseRejectionEvent).reason).slice(0, 120)));
          const ce = w.console.error.bind(w.console); w.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ").slice(0, 120)); ce(...a); };
        }
      } catch { /* a cross-origin landing (an outside redirect) has nothing to read */ }
      await new Promise((r) => setTimeout(r, 900));
      const ms = Math.round(performance.now() - started);
      try {
        const d = f.contentDocument; const fw = f.contentWindow;
        if (!ok || !d || !fw) { checks.push({ name: `${path} @${width}`, status: "fail", detail: "did not load in 20 s", ms, fix: "Open it yourself at this width; a server error or an endless redirect keeps a frame from loading." }); continue; }
        const landed = fw.location.pathname ?? path;
        const crashed = !!d.querySelector("[data-error-screen]");
        const side = d.documentElement.scrollWidth - d.documentElement.clientWidth;
        const shown = (b: Element) => (typeof (b as HTMLElement).checkVisibility === "function" ? (b as HTMLElement).checkVisibility({ visibilityProperty: true, opacityProperty: true } as never) : b.getClientRects().length > 0);
        const imgs = [...d.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).length;
        const noAlt = [...d.images].filter((i) => shown(i) && !i.hasAttribute("alt")).length;
        // only buttons a person can see (a closed menu's items keep their boxes while hidden), named by any text they carry
        const buttons = [...d.querySelectorAll("button, [role=button]")].filter(shown) as HTMLElement[];
        const nameless = buttons.filter((b) => !((b.textContent ?? "").trim() || b.getAttribute("aria-label") || b.getAttribute("title") || b.getAttribute("aria-labelledby") || b.querySelector("img[alt]"))).length;
        // a finger needs about 44px; under 40 is a miss waiting to happen on a phone or an iPad (inline text links aside)
        const small = width < 1000 ? [...buttons, ...[...d.querySelectorAll("a[href]")].filter((a) => shown(a) && fw.getComputedStyle(a).display !== "inline")]
          .filter((b) => { const r = (b as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40) && fw.getComputedStyle(b as HTMLElement).pointerEvents !== "none"; }) : [];
        const fields = [...d.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter(shown) as HTMLInputElement[];
        const unlabelled = fields.filter((x) => !(x.getAttribute("aria-label") || x.getAttribute("aria-labelledby") || x.getAttribute("placeholder") || x.getAttribute("title") || x.closest("label") || (x.id && d.querySelector(`label[for="${CSS.escape(x.id)}"]`)))).length;
        const h1 = !!d.querySelector("h1");
        const nodes = d.getElementsByTagName("*").length;
        const js = Math.round((fw.performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => e.initiatorType === "script").reduce((t, e) => t + (e.encodedBodySize || e.transferSize || 0), 0) / 1024);
        if (width === 1280) for (const a of [...d.querySelectorAll<HTMLAnchorElement>("a[href]")]) { const u = new URL(a.href, location.origin); if (u.origin === location.origin && !/logout|^\/admin\/leave/.test(u.pathname) && !u.hash) links.add(u.pathname + u.search); }
        const problems: string[] = []; const fixes: string[] = [];
        if (crashed) { problems.push("crash card"); fixes.push("open it at this width and read the error card's digest in the server log"); }
        if (side > 1) { problems.push(`${side}px sideways scroll`); fixes.push("a grid track is 1fr instead of minmax(0,1fr), or an item lacks min-w-0"); }
        if (imgs) problems.push(`${imgs} image(s) missing`);
        if (noAlt) problems.push(`${noAlt} image(s) without alt`);
        if (nameless) { problems.push(`${nameless} unnamed button(s)`); fixes.push("give icon-only buttons an aria-label"); }
        if (small.length > 3) { problems.push(`${small.length} tap targets under 40px`); fixes.push(`make them 44px on touch widths — e.g. ${small.slice(0, 2).map((b) => `"${((b as HTMLElement).getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 24)}"`).join(", ")}`); }
        if (unlabelled) problems.push(`${unlabelled} field(s) without a label`);
        if (errors.length) { problems.push(`${errors.length} script error(s): ${errors[0]}`); fixes.push("the frame's console has the stack"); }
        if (nodes > 4000) problems.push(`${nodes} elements on the page`);
        if (js > 1500) problems.push(`${js} KB of script`);
        if (!h1) problems.push("no heading");
        if (landed !== path && !path.startsWith("/admin")) problems.push(`landed on ${landed}`);
        const status: Status = crashed || side > 1 || (landed !== path && !path.startsWith("/admin")) ? "fail" : problems.length ? "warn" : ms > 4000 ? "warn" : "pass";
        checks.push({ name: `${path} @${width}`, status, detail: `${ms} ms · ${js} KB script · ${nodes} elements${problems.length ? " · " + problems.join(" · ") : ""}`, ms, ...(fixes.length ? { fix: fixes.join("; ") } : {}) });
      } finally { f.remove(); }
    }
  }
  // every internal link those screens offer answers without an error
  let broken = 0, tried = 0;
  for (const href of [...links].slice(0, 80)) {
    tried++;
    try { const r = await fetch(href, { credentials: "include", redirect: "follow" }); if (r.status >= 400) { broken++; checks.push({ name: `Link ${href}`, status: "fail", detail: `http ${r.status}`, fix: "a screen links to a page that is gone or refuses — fix the href or the route" }); } }
    catch { broken++; checks.push({ name: `Link ${href}`, status: "fail", detail: "no answer" }); }
  }
  checks.push({ name: "Links on those screens", status: broken ? "fail" : "pass", detail: `${tried} tried, ${broken} broken` });
  return { suite: "browser", status: worst(checks), ms: Date.now() - t0, checks, ran_at: new Date().toISOString() };
}

export function TestingClient({ last, prev: prevIn = {}, history = [], properties, acting }: { last: Record<string, Run>; prev?: Record<string, Record<string, string>>; history?: Hist[]; properties: { id: string; name: string }[]; acting: string | null }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Record<string, Run>>(last);
  const [prev, setPrev] = useState<Record<string, Record<string, string>>>(prevIn);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [hist, setHist] = useState<Hist[]>(history);
  const [property, setProperty] = useState<string>(acting ?? properties[0]?.id ?? "");
  const [step, setStep] = useState<{ i: number; of: number; title: string; sub?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);

  /** keep the run being replaced as the comparison for the new one */
  const keep = (r: Run) => { setRuns((x) => { const old = x[r.suite]; if (old) setPrev((p) => ({ ...p, [r.suite]: Object.fromEntries(old.checks.map((c) => [c.name, c.status])) })); return { ...x, [r.suite]: r }; }); setHist((h) => [...h, toHist(r)]); };
  const runOne = async (key: string, at?: { i: number; of: number }): Promise<Run | null> => {
    setBusy(key);
    try {
      if (key === "browser") {
        const r = await runBrowser(Boolean(acting), (n, of) => setStep({ i: at?.i ?? 0, of: at?.of ?? 1, title: TITLE.browser, sub: `screen ${n} of ${of}` }));
        await recordRun("browser", r.status, r.ms, r.checks); keep(r); return r;
      }
      const res = await fetch("/api/admin/selftest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ suite: key, restaurant: property || null }) });
      if (!res.ok) { const r: Run = { suite: key, status: "fail", ms: 0, checks: [{ name: "The test route", status: "fail", detail: `http ${res.status}`, fix: res.status === 504 ? "The suite ran past the server's time limit; run it alone." : undefined }], ran_at: new Date().toISOString() }; setRuns((x) => ({ ...x, [key]: r })); return r; }
      const r = (await res.json()) as Run; keep(r); return r;
    } finally { setBusy(null); if (!at) setStep(null); }   // a lone Run clears its own progress; Run all clears at the end
  };
  const runList = async (keys: string[]) => {
    for (let i = 0; i < keys.length; i++) { setStep({ i, of: keys.length, title: TITLE[keys[i]] }); await runOne(keys[i], { i, of: keys.length }); }
    setStep(null); router.refresh();
  };
  const runAll = () => runList(SUITES.map((s) => s.key));

  const all = SUITES.map((s) => runs[s.key]).filter(Boolean) as Run[];
  const allChecks = all.flatMap((r) => r.checks);
  const count = (st: Status, list: Check[] = allChecks) => list.filter((c) => c.status === st).length;
  const total = allChecks.length;
  const score = scoreOf(allChecks);
  const overall = all.length ? worst(allChecks) : null;
  const latest = all.length ? all.map((r) => r.ran_at).sort().at(-1)! : null;
  const totalMs = all.reduce((t, r) => t + r.ms, 0);
  const doExport = async () => { setExporting(true); try { await exportPdf(all, TITLE); } finally { setExporting(false); } };
  const running = busy !== null;
  /* what changed since each suite's previous run: worse is new, better is fixed */
  const change = (suite: string, c: Check): "new" | "fixed" | null => { const was = prev[suite]?.[c.name] as Status | undefined; if (!was) return null; return RANK[c.status] > RANK[was] ? "new" : RANK[c.status] < RANK[was] ? "fixed" : null; };
  const delta = all.reduce((t, r) => { for (const c of r.checks) { const ch = change(r.suite, c); if (ch) t[ch]++; } return t; }, { new: 0, fixed: 0 });
  /* response times across every timed check of the server-side suites */
  const times = all.filter((r) => r.suite !== "browser").flatMap((r) => r.checks.filter((c) => typeof c.ms === "number" && c.status !== "skip").map((c) => ({ ms: c.ms!, name: c.name }))).sort((a, b) => a.ms - b.ms);
  const pct = (p: number) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))].ms : 0);
  const issues = all.flatMap((r) => r.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => ({ ...c, suite: r.suite, change: change(r.suite, c) })))
    .sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1) || (a.change === "new" ? 0 : 1) - (b.change === "new" ? 0 : 1));
  const failingSuites = SUITES.filter((s) => runs[s.key] && runs[s.key].status !== "pass").map((s) => s.key);
  /* the score of each Run all: runs within three minutes of each other are one sitting */
  const trend = (() => { const out: number[] = []; let group: Hist[] = []; const flush = () => { const p = group.reduce((t, x) => t + x.pass, 0), w = group.reduce((t, x) => t + x.warn, 0), f = group.reduce((t, x) => t + x.fail, 0); if (p + w + f) out.push(Math.round(((p + w * 0.5) / (p + w + f)) * 100)); group = []; };
    for (const h of hist) { if (group.length && new Date(h.ran_at).getTime() - new Date(group[group.length - 1].ran_at).getTime() > 180000) flush(); group.push(h); } flush(); return out.slice(-12); })();
  const found = useMemo(() => { const t = q.trim().toLowerCase(); if (t.length < 2) return null; return all.flatMap((r) => r.checks.filter((c) => `${c.name} ${c.detail ?? ""} ${c.fix ?? ""}`.toLowerCase().includes(t)).map((c) => ({ ...c, suite: r.suite }))).slice(0, 60); }, [q, all]);

  const report = () => [
    `DineFlow self-test — ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Health ${score ?? "—"} · ${count("pass")} passed · ${count("warn")} warnings · ${count("fail")} failed · ${count("skip")} skipped · ${total} checks`,
    ...(delta.new || delta.fixed ? [`Since the previous run: ${delta.new} new issue(s), ${delta.fixed} fixed`] : []),
    "",
    ...(issues.length ? issues.map((c) => `[${c.status.toUpperCase()}]${c.change === "new" ? " [NEW]" : ""} ${TITLE[c.suite]} › ${c.name}${c.detail ? ` — ${c.detail}` : ""}${c.fix ? `\n    Fix: ${c.fix}` : ""}`) : ["Nothing to fix — every check passed."]),
  ].join("\n");
  const doCopy = () => { void copyText(report()).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); } }); };
  const doJson = () => {
    const blob = new Blob([JSON.stringify({ generated_at: new Date().toISOString(), score, totals: { pass: count("pass"), warn: count("warn"), fail: count("fail"), skip: count("skip") }, runs: all }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dineflow-self-test-${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 16).replace("T", "-").replace(":", "")}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const jump = (suite: string, onlyIssues: boolean) => { setOpen(suite); setIssuesOnly(onlyIssues); setTimeout(() => document.querySelector(`[data-suite="${suite}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  return (
    <div className="space-y-5" data-testing>
      {/* ── header: what this is, and what you can do ── */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Self-test</div>
          <h1 className="text-4xl">Is everything <em>working?</em></h1>
          <p className="text-sm text-steel mt-1.5 max-w-xl">{SUITES.length} suites · read-only</p>
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
            {step ? <><Loader2 size={16} className="animate-spin" /> Running {step.i + 1} of {step.of}</> : <><Play size={16} /> Run all tests</>}
          </Button>
        </div>
      </div>

      {/* ── overview: one panel, read left to right ── */}
      <Card className="!p-0 overflow-hidden" data-summary>
        {step && (
          <div className="px-5 pt-4" data-progress>
            <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-semibold">Running {step.title}{step.sub ? ` · ${step.sub}` : ""}…</span><span className="num text-steel">{Math.round((step.i / step.of) * 100)}%</span></div>
            <div className="h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-tint)] transition-[width] duration-500" style={{ width: `${Math.max(4, (step.i / step.of) * 100)}%` }} /></div>
          </div>
        )}
        {score === null ? (
          <div className="p-6 flex items-center gap-4">
            <span className="h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-steel shrink-0"><Activity size={20} /></span>
            <div><div className="text-[15px] font-semibold">No results yet</div><div className="text-sm text-steel">Takes about 2 minutes</div></div>
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
                {(delta.new > 0 || delta.fixed > 0) && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" data-delta>
                  {delta.new > 0 && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full" style={{ background: `color-mix(in srgb, ${TONE.fail} 14%, transparent)`, color: TONE.fail }}><ArrowDownRight size={12} />{delta.new} new</span>}
                  {delta.fixed > 0 && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full" style={{ background: `color-mix(in srgb, ${TONE.pass} 14%, transparent)`, color: TONE.pass }}><ArrowUpRight size={12} />{delta.fixed} fixed</span>}
                  <span className="text-steel font-normal">since the run before</span></div>}
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
                  <Metric label="Median answer" value={secs(pct(0.5))} tone={pct(0.5) < 600 ? "pass" : pct(0.5) < 1500 ? "warn" : "fail"} />
                  <Metric label="95th percentile" value={secs(pct(0.95))} tone={pct(0.95) < 600 ? "pass" : pct(0.95) < 1500 ? "warn" : "fail"} />
                  <Metric label="Slowest" value={secs(times.at(-1)!.ms)} sub={speedLabel(times.at(-1)!.name).label} tone={times.at(-1)!.ms < 600 ? "pass" : times.at(-1)!.ms < 1500 ? "warn" : "fail"} />
                </div>
              )}
            </div>
          </div>
        )}
        {!acting && <div className="px-5 py-2.5 text-xs text-[var(--color-orange)] bg-[color-mix(in_srgb,var(--color-orange)_8%,transparent)] border-t border-[var(--color-separator)]">Open a property for Speed, Screens</div>}
      </Card>

      {/* ── the five areas, each with its own score: where the trouble is, at a glance ── */}
      <div className="fill-tiles !gap-2.5" data-groups>
        {GROUPS.map((g) => {
          const keys = SUITES.filter((s) => s.group === g.key).map((s) => s.key); const rs = keys.map((k) => runs[k]).filter(Boolean) as Run[];
          const cs = rs.flatMap((r) => r.checks); const sc = scoreOf(cs); const st = rs.length ? worst(cs) : null; const bad = cs.filter((c) => c.status === "warn" || c.status === "fail").length;
          return (
            <button key={g.key} type="button" data-group={g.key} data-group-score={sc ?? ""} onClick={() => { const k = keys.find((x) => runs[x] && runs[x].status !== "pass") ?? keys[0]; jump(k, bad > 0); }}
              style={{ ["--hue" as string]: g.hue }} className="feather !rounded-[20px] p-3.5 text-left min-w-0 flex flex-col gap-2.5 relative overflow-hidden hover:-translate-y-0.5 transition-transform !min-h-0">
              <span className="absolute inset-x-0 top-0 h-1 opacity-80" style={{ background: st ? TONE[st] : "var(--hue)" }} aria-hidden />
              <span className="flex items-center gap-2 min-w-0"><span className="h-8 w-8 shrink-0 rounded-xl grid place-items-center bg-[color-mix(in_srgb,var(--hue)_14%,transparent)] text-[var(--hue)]"><g.Icon size={16} aria-hidden /></span><span className="text-[13px] font-bold truncate">{g.title}</span></span>
              <span className="flex items-baseline gap-2 min-w-0"><span className="font-display text-[30px] leading-none num">{sc ?? "—"}</span>{st && <span className="text-[11.5px] font-semibold truncate" style={{ color: TONE[st] }}>{bad ? `${bad} to look at` : "all clear"}</span>}</span>
              <span className="text-[11px] text-steel truncate">{rs.length} of {keys.length} suites run</span>
            </button>);
        })}
      </div>

      {/* ── tools: find a check, run only what is not clear, take the report away ── */}
      <div className="flex flex-wrap items-center gap-2" data-tools>
        <label className="relative flex-1 min-w-[min(100%,16rem)]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a check…" className="!h-11 !pl-10 !text-[14px]" aria-label="Find a check" data-search />
        </label>
        <Button variant="outline" onClick={() => { void runList(failingSuites); }} disabled={running || !failingSuites.length} data-rerun-issues title="Run again only the suites with warnings or failures">
          <RotateCcw size={16} /> Re-run issues{failingSuites.length ? ` (${failingSuites.length})` : ""}
        </Button>
        <Button variant="outline" onClick={doCopy} disabled={!all.length} data-copy-report title="Copy a plain-text report: the score, then every issue with its fix">
          {copied ? <Check size={16} /> : <ClipboardCopy size={16} />} {copied ? "Copied" : "Copy report"}
        </Button>
        <Button variant="outline" onClick={doJson} disabled={!all.length} data-download-json title="Every check of the last runs as JSON"><FileJson size={16} /> JSON</Button>
      </div>
      {found && (
        <Card className="!p-0 overflow-hidden" data-search-results>
          <div className="px-5 py-3 border-b border-[var(--color-separator)] text-[13px]"><b className="num">{found.length}</b> check{found.length === 1 ? "" : "s"} match “{q.trim()}”</div>
          {found.length === 0 ? <div className="px-5 py-4 text-sm text-steel">No matches</div>
            : <ul className="divide-y divide-[var(--color-separator)]">{found.map((c, i) => <li key={i}><CheckRow c={c} change={change(c.suite, c)} suiteTag={c.suite} onSuite={() => jump(c.suite, false)} /></li>)}</ul>}
        </Card>
      )}

      {/* ── needs attention: every warning and failure in one place, worst first, new before old ── */}
      {all.length > 0 && (
        <Card className="!p-0 overflow-hidden" data-attention>
          <div className="px-5 py-3 flex items-center gap-2 border-b border-[var(--color-separator)]">
            <h2 className="text-[15px] font-semibold">Needs attention</h2>
            <span className="h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center num" style={{ background: issues.length ? `color-mix(in srgb, ${TONE[issues[0].status as Status]} 18%, transparent)` : "var(--color-green-2)", color: issues.length ? TONE[issues[0].status as Status] : TONE.pass }}>{issues.length}</span>
            {issues.length > 0 && <span className="ml-auto text-[11.5px] text-steel">{issues.filter((c) => c.fix).length} with a fix</span>}
          </div>
          {issues.length === 0
            ? <div className="px-5 py-4 flex items-center gap-3 text-sm"><Mark status="pass" /> All checks passed</div>
            : <ul className="divide-y divide-[var(--color-separator)]">
                {issues.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => jump(c.suite, true)} className="w-full text-left !min-h-0 !bg-transparent hover:!bg-[var(--color-fill)] transition-colors" data-issue={c.status}>
                      <CheckRow c={c} change={c.change} suiteTag={c.suite} />
                    </button>
                  </li>))}
              </ul>}
        </Card>
      )}

      {/* ── the suites: grouped by area, each row a suite, expanding to its checks ── */}
      <Card className="!p-0 overflow-hidden" data-suites>
        <div className="px-5 py-3 flex items-center gap-2 border-b border-[var(--color-separator)]"><h2 className="text-[15px] font-semibold">Suites</h2><span className="ml-auto flex items-center gap-3 text-[11px] text-steel"><Key c={TONE.pass} t="pass" /><Key c={TONE.warn} t="warning" /><Key c={TONE.fail} t="fail" /></span></div>
        {GROUPS.map((g) => (
          <div key={g.key} data-suite-group={g.key}>
            <div className="px-5 pt-3 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-steel flex items-center gap-1.5 border-t border-[var(--color-separator)] first:border-t-0"><g.Icon size={12} aria-hidden />{g.title}</div>
            <ul className="divide-y divide-[var(--color-separator)]">
              {SUITES.filter((s) => s.group === g.key).map(({ key, title, what, Icon }) => {
                const r = runs[key]; const isOpen = open === key; const isRunning = busy === key;
                const p = r ? count("pass", r.checks) : 0, w = r ? count("warn", r.checks) : 0, f = r ? count("fail", r.checks) : 0, sk = r ? count("skip", r.checks) : 0, tot = Math.max(1, p + w + f);
                const nw = r ? r.checks.filter((c) => change(key, c) === "new").length : 0;
                return (
                  <li key={key} data-suite={key} data-status={r?.status ?? "none"}>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5">
                      <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", r ? "" : "bg-[var(--color-fill)] text-steel")} style={r ? { background: `color-mix(in srgb, ${TONE[r.status]} 14%, transparent)`, color: TONE[r.status] } : undefined}>{isRunning ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0"><span className="text-[15px] font-semibold truncate">{title}</span>{r && <Pill status={r.status} />}{nw > 0 && <ChangeTag kind="new" n={nw} />}</div>
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
                        {r && <button type="button" onClick={() => { setOpen(isOpen ? null : key); if (!isOpen) setIssuesOnly(false); }} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} the ${r.checks.length} checks of ${title}`} data-details
                          className="h-11 w-11 rounded-full grid place-items-center !bg-transparent hover:!bg-[var(--color-fill)] text-steel"><ChevronDown size={17} className={cn("transition-transform", isOpen && "rotate-180")} /><span className="sr-only">{r.checks.length} checks · {ago(r.ran_at)}</span></button>}
                      </div>
                    </div>
                    {r && isOpen && (
                      <div className="px-5 pb-4" data-checks>
                        {(w + f) > 0 && (
                          <div className="mb-2 flex items-center gap-2 text-xs" data-filter>
                            <span className="text-steel">Show</span>
                            <div className="inline-flex p-0.5 rounded-full bg-[var(--color-fill)]">
                              {[["all", `All ${r.checks.length}`], ["issues", `Issues ${w + f}`]].map(([v, l]) => <button key={v} type="button" onClick={() => setIssuesOnly(v === "issues")} aria-pressed={(v === "issues") === issuesOnly}
                                className={cn("!min-h-0 h-8 px-3 rounded-full text-[12px] font-semibold transition-colors", (v === "issues") === issuesOnly ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-sm" : "!bg-transparent text-steel")}>{l}</button>)}
                            </div>
                          </div>
                        )}
                        <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden divide-y divide-[var(--color-separator)]">
                          {r.checks.filter((c) => !issuesOnly || w + f === 0 || c.status === "warn" || c.status === "fail").map((c, i) => <CheckRow key={i} c={c} change={change(key, c)} dense />)}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Card>

      {/* ── speed: the slowest answers on one axis, the two budgets marked ── */}
      {all.length > 0 && <SpeedChart runs={all} />}
    </div>
  );
}

const toHist = (r: Run): Hist => ({ suite: r.suite, status: r.status, ms: r.ms, ran_at: r.ran_at, pass: r.checks.filter((c) => c.status === "pass").length, warn: r.checks.filter((c) => c.status === "warn").length, fail: r.checks.filter((c) => c.status === "fail").length });

/** one check: its mark, the name and what was seen, a New / Fixed tag, the suite, the time, and — when it is not clear — what to do */
function CheckRow({ c, change, suiteTag, onSuite, dense }: { c: Check; change: "new" | "fixed" | null; suiteTag?: string; onSuite?: () => void; dense?: boolean }) {
  const s2 = suiteTag ? SUITES.find((x) => x.key === suiteTag) : null;
  return (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3", dense ? "px-3.5 py-2.5 text-[13px]" : "px-5 py-2.5")} data-check={c.status} data-change={change ?? undefined}>
      <Mark status={c.status} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5"><span className="text-[13px] font-medium">{c.name}</span>{change && <ChangeTag kind={change} />}</span>
        {c.detail && <span className="block text-xs text-steel break-words">{c.detail}</span>}
        {c.fix && c.status !== "pass" && c.status !== "skip" && <span className="mt-1 flex items-start gap-1.5 text-xs text-[var(--color-label-2)] break-words" data-fix><Wrench size={12} className="mt-0.5 shrink-0" style={{ color: TONE[c.status] }} aria-hidden /><span><b className="font-semibold">Fix: </b>{c.fix}</span></span>}
      </span>
      <span className="flex flex-col items-end gap-1">
        {s2 && (onSuite
          ? <button type="button" onClick={onSuite} className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-[var(--color-fill)] text-[11px] text-steel whitespace-nowrap !min-h-0"><s2.Icon size={12} />{s2.title}</button>
          : <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11px] text-steel whitespace-nowrap"><s2.Icon size={12} />{s2.title}</span>)}
        {typeof c.ms === "number" && <span className="text-xs num text-steel pt-0.5">{secs(c.ms)}</span>}
      </span>
    </div>
  );
}
function ChangeTag({ kind, n }: { kind: "new" | "fixed"; n?: number }) {
  const col = kind === "new" ? TONE.fail : TONE.pass;
  return <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ background: `color-mix(in srgb, ${col} 14%, transparent)`, color: col }} data-change-tag={kind}>{kind === "new" ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}{n ? `${n} new` : kind === "new" ? "New" : "Fixed"}</span>;
}

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
  const m = name.match(/^(\S+) @(\d+)$/); if (m) return { label: m[1], where: Number(m[2]) < 700 ? "phone" : Number(m[2]) < 1000 ? "ipad" : "laptop" };
  if (name.startsWith("Screen ")) return { label: name.slice(7), where: "server" };
  if (name.startsWith("Database call ")) return { label: name.slice(14) + "()", where: "database" };
  if (/^App: |^Supabase |^Wikimedia|^Mail domain/.test(name)) return { label: name.replace(/^App: /, ""), where: "api" };
  if (/ at once$|visitors|sessions load/.test(name)) return { label: name, where: "load · 95th" };
  return { label: name, where: "function" };
}

function SpeedChart({ runs }: { runs: Run[] }) {
  /* server, API and database answers only: the Screens suite times a whole page in a frame (scripts
     and all), which the 600 ms server budget does not apply to — mixing them painted every bar amber.
     The database scans of the deep suites are left out too: they read the catalogue, not a screen. */
  const items = runs.filter((r) => !["browser", "integrity", "dbsecurity", "dbperf", "ops"].includes(r.suite)).flatMap((r) => r.checks.filter((c) => typeof c.ms === "number" && c.status !== "skip").map((c) => ({ ...speedLabel(c.name), ms: c.ms! })))
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
        <span className="text-xs text-steel">{slow ? `${slow} over 600 ms` : `all ${items.length} under 600 ms`}</span>
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
