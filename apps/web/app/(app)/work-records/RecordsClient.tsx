"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, ListChecks, Timer, AlertTriangle, Hourglass, Users, Building2, ChefHat, Search, CalendarDays, ArrowRight, CircleCheck } from "lucide-react";
import { Card, cn, FlapShuffle, FlapBreathe } from "@/components/ui";
import { useLive } from "@/lib/useLive";
import { deptLabel, PRIORITY } from "../cleaning/JobCard";

export type LogRow = {
  kind: "table" | "room" | "job"; id: string; title: string; place: string | null; department: string | null; priority: number | null;
  status: "pending" | "in_progress" | "done" | "skipped"; note: string | null; created_at: string; due_at: string | null; created_name: string | null;
  assigned_name: string | null; assigned_by_name: string | null; assigned_at: string | null;
  taken_name: string | null; taken_by: string | null; taken_at: string | null; done_name: string | null; done_by: string | null; done_at: string | null;
  labourer_name: string | null; inspection: "passed" | "failed" | null; inspected_name: string | null;
};
export type Log = { rows: LogRow[]; cooks: { id: string; name: string; cooked: number; avg_min: number | null }[] };

const min = (a: string | null, b: string | null) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
const fmtMin = (m: number | null) => (m == null ? "—" : m < 1 ? "<1 min" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} m`);
const at = (t: string | null) => (t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** On time: finished by its due time (a cleaning job has none, and counts as on time). */
const onTime = (r: LogRow) => r.status === "done" && (!r.due_at || (r.done_at ?? "") <= r.due_at);
const late = (r: LogRow) => (r.status === "done" ? !!r.due_at && (r.done_at ?? "") > r.due_at : (r.status === "pending" || r.status === "in_progress") && !!r.due_at && Date.now() > new Date(r.due_at).getTime());
const STATUS: Record<LogRow["status"], { word: string; cls: string }> = {
  pending: { word: "Waiting", cls: "bg-[var(--color-fill)]" }, in_progress: { word: "On it", cls: "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]" },
  done: { word: "Done", cls: "bg-[var(--color-green-2)] text-[var(--color-green)]" }, skipped: { word: "Dropped", cls: "bg-[var(--color-fill)] text-steel" },
};
const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

/**
 * The owner's and managers' record of the work (0116): pick a period; tiles — jobs, done, late, average response
 * (raised → taken) and average work time (taken → done); by person (jobs done, time each, on time, tickets cooked);
 * by department; and every job with its raiser, who it was given to, who took it and when, who finished it and when,
 * the note and a room's inspection — filtered by department, person, status or words, and to Excel. Live.
 */
export function RecordsClient({ log, error, from, to, today, property }: { log: Log; error: string | null; from: string; to: string; today: string; property: string }) {
  const router = useRouter();
  useLive(["jobs", "table_cleanings", "housekeeping_tasks", "kots"], 30000);
  const go = (f: string, t: string) => router.push(`/work-records?from=${f}&to=${t}`);
  const d = new Date(`${today}T00:00:00+05:30`);
  const ranges: [string, string, string][] = [
    ["Today", today, today], ["Yesterday", iso(new Date(d.getTime() - 86400e3)), iso(new Date(d.getTime() - 86400e3))],
    ["Last 7 days", iso(new Date(d.getTime() - 6 * 86400e3)), today], ["This month", `${today.slice(0, 7)}-01`, today],
  ];
  const [dept, setDept] = useState(""); const [person, setPerson] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState("");
  const rows = useMemo(() => log.rows.filter((r) => (!dept || (r.department ?? "") === dept) && (!person || [r.taken_name, r.done_name, r.created_name, r.assigned_name].includes(person))
    && (!status || (status === "late" ? late(r) : r.status === status)) && (!q || `${r.title} ${r.place ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [log.rows, dept, person, status, q]);
  const done = rows.filter((r) => r.status === "done");
  const resp = avg(rows.filter((r) => r.taken_at).map((r) => min(r.created_at, r.taken_at)!));
  const work = avg(done.filter((r) => r.taken_at && r.done_at).map((r) => min(r.taken_at, r.done_at)!));
  const people = useMemo(() => {
    const m = new Map<string, { done: number; took: number[]; onTime: number; open: number; cooked: number; cookMin: number | null }>();
    const of = (n: string) => { const e = m.get(n) ?? { done: 0, took: [], onTime: 0, open: 0, cooked: 0, cookMin: null }; m.set(n, e); return e; };
    for (const r of rows) {
      if (r.status === "done" && r.done_name) { const e = of(r.done_name); e.done++; if (onTime(r)) e.onTime++; const w = min(r.taken_at, r.done_at); if (w != null) e.took.push(w); }
      if (r.status === "in_progress" && r.taken_name) of(r.taken_name).open++;
    }
    if (!dept || dept === "kitchen") for (const c of log.cooks) { const e = of(c.name); e.cooked = c.cooked; e.cookMin = c.avg_min; }
    return [...m.entries()].sort((a, b) => (b[1].done + b[1].cooked) - (a[1].done + a[1].cooked) || a[0].localeCompare(b[0]));
  }, [rows, log.cooks, dept]);
  const depts = useMemo(() => {
    const m = new Map<string, { all: number; done: number; late: number; took: number[] }>();
    for (const r of rows) { const k = r.department ?? ""; const e = m.get(k) ?? { all: 0, done: 0, late: 0, took: [] }; e.all++; if (r.status === "done") e.done++; if (late(r)) e.late++; const w = min(r.taken_at, r.done_at); if (r.status === "done" && w != null) e.took.push(w); m.set(k, e); }
    return [...m.entries()].sort((a, b) => b[1].all - a[1].all);
  }, [rows]);
  const allDepts = [...new Set(log.rows.map((r) => r.department ?? ""))];
  const allPeople = [...new Set(log.rows.flatMap((r) => [r.taken_name, r.done_name, r.created_name, r.assigned_name]).filter(Boolean) as string[])].sort();

  const excel = async () => {
    const { xlsx, download, XLSX_TYPE } = await import("@/lib/xlsx");
    download(`work-records-${property.replace(/[^\w]+/g, "-").toLowerCase()}-${from}-to-${to}.xlsx`, xlsx([
      { name: "Jobs", rows: [["Raised", "Job", "Where", "Department", "Priority", "Status", "Raised by", "Given to", "Given by", "Taken by", "Started", "Finished by", "Finished", "Response (min)", "Work (min)", "Late", "Note", "Inspection"],
        ...rows.map((r) => [at(r.created_at), r.title, r.place ?? "", deptLabel(r.department), r.priority ? PRIORITY[r.priority].label : "", STATUS[r.status].word, r.created_name ?? "",
          r.assigned_name ?? r.labourer_name ?? "", r.assigned_by_name ?? "", r.taken_name ?? "", at(r.taken_at), r.done_name ?? "", at(r.done_at),
          Math.round(min(r.created_at, r.taken_at) ?? 0) || "", Math.round(min(r.taken_at, r.done_at) ?? 0) || "", late(r) ? "Yes" : "", r.note ?? "", r.inspection ? `${r.inspection} by ${r.inspected_name}` : ""])] },
      { name: "By person", rows: [["Person", "Jobs done", "Average work (min)", "On time", "On it now", "Tickets cooked", "Average cook (min)"],
        ...people.map(([n, p]) => [n, p.done, Math.round(avg(p.took) ?? 0) || "", p.done ? `${Math.round((p.onTime / p.done) * 100)}%` : "", p.open, p.cooked, p.cookMin ?? ""])] },
      { name: "By department", rows: [["Department", "Jobs", "Done", "Late", "Average work (min)"], ...depts.map(([k, e]) => [deptLabel(k || null), e.all, e.done, e.late, Math.round(avg(e.took) ?? 0) || ""])] },
    ]), XLSX_TYPE);
  };

  const sel = "!h-11 !min-h-11 text-[14px] font-semibold min-w-0";
  const wideDate = "!h-auto !min-h-0 !border-0 !bg-transparent !p-0 !shadow-none !rounded-none !text-[15.5px] !font-bold num !w-[8.4rem] cursor-pointer";
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const lateN = rows.filter(late).length;
  return (
    <div className="space-y-5" data-records>
      {error && <p className="text-[14px] font-semibold text-chili" role="alert">{error}</p>}
      <Card className="!p-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-wrap gap-2">
          {ranges.map(([label, f, t]) => <button key={label} type="button" aria-pressed={from === f && to === t} onClick={() => go(f, t)} data-range={label}
            className={cn("!min-h-11 rounded-full px-4 text-[14px] font-bold", from === f && to === t ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>{label}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          <label className="min-w-0"><span className="text-[12.5px] font-semibold text-steel">From</span><input type="date" className="mt-1" value={from} max={today} onChange={(e) => e.target.value && go(e.target.value, to < e.target.value ? e.target.value : to)} data-from /></label>
          <label className="min-w-0"><span className="text-[12.5px] font-semibold text-steel">To</span><input type="date" className="mt-1" value={to} max={today} onChange={(e) => e.target.value && go(from > e.target.value ? e.target.value : from, e.target.value)} data-to /></label>
        </div>
        {/* iPad and desktop (2026-10-24, the owner: "the From / To fields don't look good"): one range control — the calendar,
            From → To, and how many days it covers */}
        <div className="hidden sm:flex items-stretch min-w-0 rounded-[18px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden min-h-[58px] shadow-[0_1px_0_var(--color-separator)]" data-range-wide>
          <span className="px-3.5 grid place-items-center bg-[var(--color-cyan-2)] text-[var(--color-cyan)]" aria-hidden><CalendarDays size={20} /></span>
          <label className="px-3.5 py-1.5 flex flex-col justify-center min-w-0 cursor-pointer hover:bg-[var(--color-fill)] transition-colors">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[.12em] text-steel">From</span>
            <input type="date" className={wideDate} value={from} max={today} onChange={(e) => e.target.value && go(e.target.value, to < e.target.value ? e.target.value : to)} data-from-wide />
          </label>
          <span className="grid place-items-center px-1 text-[var(--color-label-3)]" aria-hidden><ArrowRight size={17} /></span>
          <label className="px-3.5 py-1.5 flex flex-col justify-center min-w-0 cursor-pointer hover:bg-[var(--color-fill)] transition-colors">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[.12em] text-steel">To</span>
            <input type="date" className={wideDate} value={to} max={today} onChange={(e) => e.target.value && go(from > e.target.value ? e.target.value : from, e.target.value)} data-to-wide />
          </label>
          <span className="px-4 grid place-items-center border-l border-[var(--color-separator)] text-[13px] font-bold whitespace-nowrap" data-range-days={days}>
            <span><span className="num">{days}</span> {days === 1 ? "day" : "days"}</span>
          </span>
        </div>
      </Card>

      {/* iPad and desktop: the counts as split-flaps (Work's tiles) — five across from lg; on an iPad in portrait Jobs, Done,
          Late on top and the two averages under them */}
      <div className="hidden sm:grid grid-cols-6 lg:grid-cols-5 gap-2.5" data-record-tiles>
        {([["jobs", ListChecks, "Jobs", rows.length, "var(--color-blue)", "var(--color-blue-2)", rows.length ? "raised" : "none raised"],
          ["done", CircleCheck, "Done", done.length, "var(--color-green)", "var(--color-green-2)", done.length ? "finished" : "none finished"],
          ["late", AlertTriangle, "Late", lateN, "var(--color-red)", "var(--color-red-2)", lateN ? "past their time" : "none late"],
          ["resp", Hourglass, "Average response", resp == null ? 0 : Math.round(resp), "var(--color-orange)", "var(--color-orange-2)", resp == null ? "none taken yet" : resp < 1 ? "under a minute" : "min to take"],
          ["work", Timer, "Average work", work == null ? 0 : Math.round(work), "var(--color-cyan)", "var(--color-cyan-2)", work == null ? "none finished yet" : work < 1 ? "under a minute" : "min a job"]] as const).map(([key, I, k, n, hue, hue2, cap]) => (
          <div key={key} data-record-tile={key} data-n={n} style={{ ["--hue" as string]: hue, ["--hue-2" as string]: hue2 }}
            className={cn("@container feather !rounded-[20px] p-4 min-w-0 flex flex-col gap-3 relative overflow-hidden", key === "resp" || key === "work" ? "col-span-3 lg:col-span-1" : "col-span-2 lg:col-span-1", key === "late" && n > 0 && "!border-[color-mix(in_srgb,var(--color-red)_45%,transparent)]")}>
            <span className="absolute inset-x-0 top-0 h-1 bg-[var(--hue)] opacity-80" aria-hidden />
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]"><I size={18} aria-hidden /></span>
              <span className="text-[13.5px] font-bold text-[var(--color-label-2)] truncate">{k}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="flip-stat shrink-0">
                {key === "late"
                  ? <FlapBreathe value={n} pad={2} size="sm" tone="alert" on={n > 0} say={`${n} late`} />
                  : <FlapShuffle value={n} pad={2} size="sm" say={`${n} ${cap}`} />}
              </div>
              <span className={cn("min-w-0 flex-1 basis-24 text-[12px] leading-snug", key === "late" && n > 0 ? "text-[var(--color-red)] font-semibold" : "text-[var(--color-label-2)]")}>{cap}</span>
            </div>
          </div>))}
      </div>

      <div className="fill-tiles sm:!hidden !gap-2.5" data-record-stats>
        {([[ListChecks, "Jobs", String(rows.length)], [ListChecks, "Done", String(done.length)], [AlertTriangle, "Late", String(rows.filter(late).length)],
          [Hourglass, "Average response", fmtMin(resp)], [Timer, "Average work", fmtMin(work)]] as const).map(([I, k, v]) => (
          <div key={k} className={cn("feather !rounded-[18px] px-4 py-3 min-w-0 flex items-center gap-3", k === "Late" && v !== "0" && "!border-[var(--color-red)]")}>
            <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-cyan-2)] text-[var(--color-cyan)]"><I size={19} aria-hidden /></span>
            <div className="min-w-0"><div className="text-[12px] font-bold text-steel">{k}</div><div className="font-display num text-[22px] leading-tight truncate">{v}</div></div></div>))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="!p-4 min-w-0" data-by-person>
          <div className="flex items-center gap-2 text-[17px] font-extrabold mb-2"><Users size={18} aria-hidden /> By person</div>
          {people.length === 0 ? <p className="text-[13.5px] text-steel">None finished</p> : (
            <div className="overflow-x-auto"><table className="w-full text-[13.5px]"><thead><tr className="text-left text-steel text-[12px]"><th className="py-1.5 pr-3">Person</th><th className="py-1.5 px-2 text-right">Done</th><th className="py-1.5 px-2 text-right">Each</th><th className="py-1.5 px-2 text-right">On time</th><th className="py-1.5 px-2 text-right">On it</th><th className="py-1.5 pl-2 text-right"><ChefHat size={13} className="inline" aria-label="Tickets cooked" /></th></tr></thead>
              <tbody>{people.map(([n, p]) => <tr key={n} className="border-t border-line" data-record-person={n}><td className="py-2 pr-3 font-bold">{n}</td><td className="py-2 px-2 text-right num">{p.done}</td><td className="py-2 px-2 text-right num">{fmtMin(avg(p.took))}</td>
                <td className="py-2 px-2 text-right num">{p.done ? `${Math.round((p.onTime / p.done) * 100)}%` : "—"}</td><td className="py-2 px-2 text-right num">{p.open || "—"}</td><td className="py-2 pl-2 text-right num">{p.cooked || "—"}{p.cookMin != null && p.cooked > 0 && <span className="text-steel"> · {p.cookMin} min</span>}</td></tr>)}</tbody></table></div>)}
        </Card>
        <Card className="!p-4 min-w-0" data-by-dept>
          <div className="flex items-center gap-2 text-[17px] font-extrabold mb-2"><Building2 size={18} aria-hidden /> By department</div>
          {depts.length === 0 ? <p className="text-[13.5px] text-steel">No jobs</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">{depts.map(([k, e]) => <li key={k} className="py-2 flex items-center gap-3 min-w-0" data-record-dept={k}>
              <span className="font-bold text-[14px] flex-1 min-w-0 truncate">{deptLabel(k || null)}</span>
              <span className="text-[12.5px] text-steel num shrink-0">{e.done}/{e.all} done · {fmtMin(avg(e.took))} each</span>
              {e.late > 0 && <span className="shrink-0 rounded-full px-2 h-6 inline-flex items-center text-[11.5px] font-extrabold bg-[var(--color-red-2)] text-[var(--color-red)]">{e.late} late</span>}</li>)}</ul>)}
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden" data-record-list>
        <div className="p-4 grid gap-2 grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] items-end">
          <label className="relative col-span-2 lg:col-span-1 min-w-0"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
            <input className="!h-11 !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, place or note" aria-label="Search the records" data-record-search /></label>
          <select className={cn(sel, "col-span-2 lg:col-span-1")} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" data-record-dept-filter><option value="">Every department</option>{allDepts.map((k) => <option key={k} value={k}>{deptLabel(k || null)}</option>)}</select>
          <select className={sel} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" data-record-person-filter><option value="">Everyone</option>{allPeople.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-record-status-filter><option value="">Any status</option><option value="done">Done</option><option value="in_progress">On it</option><option value="pending">Waiting</option><option value="late">Late</option><option value="skipped">Dropped</option></select>
          <button type="button" className="svc-btn quiet sm !px-4 col-span-2 lg:col-span-1" onClick={() => void excel()} disabled={!rows.length} data-record-xlsx><FileSpreadsheet size={16} aria-hidden /> Excel</button>
        </div>
        {rows.length === 0 ? <p className="px-4 pb-5 text-[13.5px] text-steel">No jobs match.</p> : (<>
          {/* wide: one row a job */}
          <div className="hidden lg:block overflow-x-auto"><table className="w-full text-[13px]">
            <thead><tr className="text-left text-steel text-[12px] border-t border-line"><th className="px-4 py-2">Job</th><th className="px-2 py-2">Department</th><th className="px-2 py-2">Raised</th><th className="px-2 py-2">Taken by · started</th><th className="px-2 py-2">Finished</th><th className="px-2 py-2 text-right">Response</th><th className="px-2 py-2 text-right">Work</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line align-top" data-record={r.title}>
              <td className="px-4 py-2.5 min-w-[14rem]"><b>{r.title}</b>{r.place && r.kind === "job" && <span className="text-steel"> · {r.place}</span>}{r.note && <div className="text-[12px] text-steel">{r.note}</div>}{r.inspection && <div className={cn("text-[12px] font-bold", r.inspection === "passed" ? "text-[var(--color-green)]" : "text-[var(--color-red)]")}>{r.inspection === "passed" ? "Passed" : "Failed"} by {r.inspected_name}</div>}</td>
              <td className="px-2 py-2.5">{deptLabel(r.department)}</td>
              <td className="px-2 py-2.5 whitespace-nowrap">{at(r.created_at)}{r.created_name && <div className="text-[12px] text-steel">by {r.created_name}</div>}{(r.assigned_name || r.labourer_name) && <div className="text-[12px] text-steel">→ {r.assigned_name ?? `${r.labourer_name} (labourer)`}{r.assigned_by_name && ` by ${r.assigned_by_name}`}</div>}</td>
              <td className="px-2 py-2.5 whitespace-nowrap">{r.taken_name ? <><b>{r.taken_name}</b><div className="text-[12px] text-steel">{at(r.taken_at)}</div></> : "—"}</td>
              <td className="px-2 py-2.5 whitespace-nowrap">{r.done_at ? <>{r.done_name && <b>{r.done_name}</b>}<div className="text-[12px] text-steel">{at(r.done_at)}</div></> : "—"}</td>
              <td className="px-2 py-2.5 text-right num whitespace-nowrap">{fmtMin(min(r.created_at, r.taken_at))}</td>
              <td className="px-2 py-2.5 text-right num whitespace-nowrap">{fmtMin(min(r.taken_at, r.done_at))}</td>
              <td className="px-4 py-2.5 whitespace-nowrap"><span className={cn("inline-flex h-6 px-2 rounded-full items-center text-[11.5px] font-extrabold", STATUS[r.status].cls)}>{STATUS[r.status].word}</span>{late(r) && <span className="ml-1 inline-flex h-6 px-2 rounded-full items-center text-[11.5px] font-extrabold bg-[var(--color-red-2)] text-[var(--color-red)]">Late</span>}</td>
            </tr>)}</tbody></table></div>
          {/* phone and tablet: one card a job */}
          <ul className="lg:hidden divide-y divide-[var(--color-separator)] border-t border-line">{rows.map((r) => <li key={r.id} className="px-4 py-3 min-w-0" data-record-card={r.title}>
            <div className="flex items-start gap-2 min-w-0"><b className="text-[15px] min-w-0 flex-1">{r.title}</b>
              <span className={cn("shrink-0 inline-flex h-6 px-2 rounded-full items-center text-[11.5px] font-extrabold", STATUS[r.status].cls)}>{STATUS[r.status].word}</span>
              {late(r) && <span className="shrink-0 inline-flex h-6 px-2 rounded-full items-center text-[11.5px] font-extrabold bg-[var(--color-red-2)] text-[var(--color-red)]">Late</span>}</div>
            <div className="text-[12.5px] text-steel mt-0.5">{deptLabel(r.department)}{r.place && r.kind === "job" ? ` · ${r.place}` : ""} · raised {at(r.created_at)}{r.created_name ? ` by ${r.created_name}` : ""}</div>
            {r.taken_name && <div className="text-[13px] mt-1"><b>{r.taken_name}</b> started {at(r.taken_at)}{r.done_at && <> · finished {at(r.done_at)}{r.done_name && r.done_name !== r.taken_name ? ` by ${r.done_name}` : ""} · <b>{fmtMin(min(r.taken_at, r.done_at))}</b></>}</div>}
            {r.note && <div className="text-[12.5px] text-steel mt-0.5">{r.note}</div>}
          </li>)}</ul>
        </>)}
      </Card>
    </div>
  );
}
