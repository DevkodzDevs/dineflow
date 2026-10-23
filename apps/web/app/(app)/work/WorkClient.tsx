"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Timer, Hourglass, ListChecks, AlertTriangle, Users, Plus, ChefHat, ClipboardCheck } from "lucide-react";
import { DEPARTMENTS } from "@dineflow/shared";
import { Card, Sheet, cn, useToast } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { Rail } from "@/components/ui/Rail";
import { useLive } from "@/lib/useLive";
import { addJob, type NewJob } from "./actions";
import type { Board } from "../cleaning/CleaningClient";
import { JobCard, DoneRow, Column, Badge, CATEGORY, PRIORITY, deptLabel, deptOf, isLate, isUpcoming, isOpen, titleOf, ms, brief, avg, PILL, type Job, type Labourer, type Act } from "../cleaning/JobCard";

export type WorkBoard = Board & { work: Job[]; me_dept: string | null; labourers: Labourer[]; cooks: { id: string; name: string; cooked: number; ready: number }[]; rooms: { id: string; number: string }[]; tables: { id: string; name: string }[] };
const DEPT_ORDER = DEPARTMENTS.map((d) => d.key);
const BOSS = ["owner", "manager", "supervisor", "supervisor_2"];
const blank: NewJob = { title: "", details: "", category: "repair", department: "engineering", place: "", room: null, table: null, priority: 3, guest: false, due: null, assigned: null, labourer: null, repeat: 0 };

/**
 * The Work board (0113): everything to do on the property, in one place — the tables and rooms to clean (the Cleaning
 * board's jobs, under Service and Housekeeping) and every job anyone raises, each routed to a department. A worker
 * starts on their own department; a supervisor sees every department with its waiting and late counts, gives jobs to
 * people or day labourers, and reads Today by person — jobs finished, and the kitchen's tickets cooked. Late is by the
 * job's due time (its priority's response target unless one was given).
 */
export function WorkClient({ board, error, me, role, dept, hasRooms }: { board: WorkBoard; error: string | null; me: string; role: string; dept: string | null; hasRooms: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition(); const [, tick] = useState(0);
  useLive(["jobs", "table_cleanings", "housekeeping_tasks"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const boss = board.can_assign; const isBoss = BOSS.includes(role);
  // the cleaning jobs are Housekeeping's (rooms) and Service's (tables); a room repair is Engineering's already
  const all = useMemo<Job[]>(() => [...board.work, ...board.jobs.map((j) => ({ ...j, department: deptOf(j) }))], [board.work, board.jobs]);
  const [filter, setFilter] = useState<string>(() => (dept && !isBoss ? dept : "all"));
  const depts = useMemo(() => { const set = new Set(all.filter(isOpen).map((j) => j.department ?? "other")); if (dept) set.add(dept); return DEPT_ORDER.filter((k) => set.has(k)).concat(set.has("other") ? ["other"] : []); }, [all, dept]);
  const count = (k: string) => all.filter((j) => isOpen(j) && (j.department ?? "other") === k).length;
  const lateCount = (k: string) => all.filter((j) => isLate(j) && (j.department ?? "other") === k).length;

  const jobs = useMemo(() => all.filter((j) => filter === "all" ? true : filter === "mine" ? [j.assigned_to, j.taken_by, j.done_by, j.created_by].includes(me) : filter === "late" ? isLate(j) : (j.department ?? "other") === filter), [all, filter, me]);
  // late first, then mine, then the most urgent, then the oldest
  const order = (a: Job, b: Job) => Number(isLate(b)) - Number(isLate(a)) || Number([b.assigned_to, b.taken_by].includes(me)) - Number([a.assigned_to, a.taken_by].includes(me))
    || (a.priority ?? 3) - (b.priority ?? 3) || ms(b.created_at) - ms(a.created_at);
  const waiting = jobs.filter((j) => j.status === "pending" && !isUpcoming(j)).sort(order);
  const upcoming = jobs.filter(isUpcoming).sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
  const onIt = jobs.filter((j) => j.status === "in_progress").sort(order);
  const finished = jobs.filter((j) => j.status === "done" || j.status === "skipped").sort((a, b) => ms(a.done_at ?? a.created_at) - ms(b.done_at ?? b.created_at));
  const late = all.filter(isLate).length;

  /* Each card waits on its own answer only (2026-10-18): the board's one `pending` used to grey every card while any
     one card's tap was answering, so taking a table froze the rest of the queue for the server's round trip. */
  const [busy, setBusy] = useState<Record<string, true>>({});
  const actOn = (id: string): Act => (p, said) => {
    setBusy((b) => ({ ...b, [id]: true }));
    start(async () => {
      try { const r = (await p) as { error?: string }; if (r.error) toast(r.error, "err"); else toast(said); }
      finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }
    });
  };
  const card = (j: Job) => <JobCard key={j.id} j={j} me={me} boss={boss} pending={!!busy[j.id]} people={board.people} labourers={board.labourers} act={actOn(j.id)} showDept={filter === "all" || filter === "mine" || filter === "late"} />;

  // who did what today, across every department — and the kitchen's cooks
  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; done: number; took: number[]; now: string | null; cooked: number }>();
    const of = (id: string, name: string | null) => { const e = m.get(id) ?? { name: name ?? "Someone", done: 0, took: [], now: null, cooked: 0 }; m.set(id, e); return e; };
    for (const j of all) {
      if (j.status === "done" && j.done_by) { const e = of(j.done_by, j.done_name); e.done++; if (j.taken_at && j.done_at) e.took.push(ms(j.taken_at, j.done_at)); }
      if (j.status === "in_progress" && j.taken_by) of(j.taken_by, j.taken_name).now = titleOf(j);
    }
    for (const c of board.cooks) of(c.id, c.name).cooked = c.cooked;
    return [...m.entries()].sort((a, b) => (b[1].done + b[1].cooked) - (a[1].done + a[1].cooked) || a[1].name.localeCompare(b[1].name));
  }, [all, board.cooks]);

  // raising a job
  const [open, setOpen] = useState(false); const [f, setF] = useState<NewJob>(blank);
  const set = <K extends keyof NewJob>(k: K, v: NewJob[K]) => setF((x) => ({ ...x, [k]: v }));
  const placeKey = f.room ? `room:${f.room}` : f.table ? `table:${f.table}` : f.place ? "text" : "";
  const pickPlace = (v: string) => { if (v.startsWith("room:")) setF((x) => ({ ...x, room: v.slice(5), table: null, place: "" })); else if (v.startsWith("table:")) setF((x) => ({ ...x, table: v.slice(6), room: null, place: "" })); else setF((x) => ({ ...x, room: null, table: null, place: v === "text" ? x.place || " " : "" })); };
  const raise = () => start(async () => {
    const r = await addJob({ ...f, place: f.place.trim() });
    if ("error" in r) { toast(r.error!, "err"); return; }
    toast(`Raised — ${deptLabel(r.job.department)} will see it`); setOpen(false); setF(blank);
  });

  const chip = (k: string, label: string, n?: number, warn?: number) => (
    <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} data-dept-chip={k}
      className={cn("!min-h-11 shrink-0 rounded-full px-4 text-[14px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap", filter === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>
      {label}{n !== undefined && n > 0 && <b className="num">{n}</b>}{!!warn && <span className={cn("num rounded-full px-1.5 text-[11px]", filter === k ? "bg-[var(--color-on-label)]/20" : "bg-[var(--color-red-2)] text-[var(--color-red)]")}>{warn} late</span>}
    </button>);

  return (
    <div className="space-y-5" data-work>
      {error && <p className="text-[14px] font-semibold text-chili" role="alert">{error}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-work-stats>
        {([[Hourglass, "Waiting", String(all.filter((j) => j.status === "pending" && !isUpcoming(j)).length), ""], [Timer, "On it", String(all.filter((j) => j.status === "in_progress").length), ""],
          [AlertTriangle, "Late", String(late), late ? "!border-[var(--color-red)]" : ""], [ListChecks, "Done today", String(all.filter((j) => j.status === "done").length), ""]] as const).map(([I, k, v, extra]) => (
          <div key={k} className={cn("feather !rounded-[18px] px-4 py-3 min-w-0 flex items-center gap-3", extra)}>
            <span className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", k === "Late" && late ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]")}><I size={19} aria-hidden /></span>
            <div className="min-w-0"><div className="text-[12px] font-bold text-steel">{k}</div><div className={cn("font-display num text-[24px] leading-tight truncate", k === "Late" && late && "text-[var(--color-red)]")}>{v}</div></div></div>))}
      </div>

      {/* on a phone: New job on a row of its own, the departments sliding sideways under it (the floor's chip rail) */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-3 min-w-0">
        <Rail wrapClassName="min-w-0 sm:flex-1" arrowClassName="!bottom-0" label="Departments"
          className="rail-fade flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 2xl:flex-wrap 2xl:overflow-visible 2xl:![mask-image:none] 2xl:![-webkit-mask-image:none] [scrollbar-width:none]">
          {chip("all", "All", all.filter(isOpen).length)}
          {chip("mine", "Mine")}
          {late > 0 && chip("late", "Late", late)}
          {depts.map((k) => chip(k, deptLabel(k), count(k), lateCount(k)))}
        </Rail>
        {["owner", "manager"].includes(role) && <Link href="/work-records" className="svc-btn quiet sm !px-4 shrink-0 max-sm:w-full" data-records-link><ClipboardCheck size={17} aria-hidden /> Records</Link>}
        <button type="button" className="svc-btn go sm !px-4 shrink-0 max-sm:w-full" onClick={() => { setF({ ...blank, room: null }); setOpen(true); }} data-new-job><Plus size={18} aria-hidden /><Say w="new_job" /></button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Column keyName="waiting" title="waiting" n={waiting.length} hint={filter === "mine" ? "Nothing waiting for you." : "Nothing waiting — tap New job."}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{waiting.map(card)}</div></Column>
        <Column keyName="on-it" title="on_it" n={onIt.length} hint="Nobody is on a job right now."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{onIt.map(card)}</div></Column>
        {upcoming.length > 0 && <Column keyName="upcoming" title="coming_up" n={upcoming.length} hint=""><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{upcoming.map(card)}</div></Column>}
        <Column keyName="done" title="done_today" n={finished.length} hint="Nothing finished yet today."><Card className="!py-1 !px-4"><ul className="divide-y divide-[var(--color-separator)]">{finished.map((j) => <DoneRow key={j.id} j={j} me={me} inspectRequired={board.inspect_required} showDept={filter === "all" || filter === "mine"} />)}</ul></Card></Column>
      </div>

      {isBoss && byPerson.length > 0 && (
        <Card className="!p-4" data-by-person>
          <div className="flex items-center gap-2 text-[17px] font-extrabold mb-2"><Users size={18} aria-hidden /> Today by person</div>
          <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {byPerson.map(([id, p]) => { const a = avg(p.took); return (
              <li key={id} className="py-2 flex items-center gap-3 min-w-0 border-b border-[var(--color-separator)]" data-person-row={p.name}>
                <Badge name={p.name} you={id === me} />
                <div className="min-w-0 flex-1"><div className="font-bold text-[14.5px] truncate">{id === me ? "You" : p.name}</div>
                  <div className="text-[12.5px] text-steel">{p.done > 0 && <>{p.done} done{a != null && ` · ${brief(a)} each`}</>}{p.done > 0 && p.cooked > 0 && " · "}{p.cooked > 0 && <span className="inline-flex items-center gap-1"><ChefHat size={12} aria-hidden />{p.cooked} ticket{p.cooked === 1 ? "" : "s"} cooked</span>}{p.done === 0 && p.cooked === 0 && "on a job"}</div></div>
                {p.now && <span className={cn(PILL, "bg-[var(--color-cyan-2)] text-[var(--color-cyan)] shrink-0 max-w-[45%]")}><span className="truncate">On {p.now}</span></span>}
              </li>); })}
          </ul>
        </Card>)}

      <Sheet open={open} onClose={() => setOpen(false)} title="New job">
        <div className="space-y-4" data-new-job-form>
          <label className="block"><span className="text-[13px] font-semibold text-steel">What needs doing</span>
            <input className="mt-1" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="Tap leaking · Mow the lawn · Set up the hall" data-job-title autoFocus /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Kind of job</span>
              <select className="mt-1" value={f.category} onChange={(e) => { const c = e.target.value; setF((x) => ({ ...x, category: c, department: CATEGORY[c]?.dept ?? x.department })); }} data-job-category>
                {Object.entries(CATEGORY).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">For</span>
              <select className="mt-1" value={f.department ?? ""} onChange={(e) => set("department", e.target.value || null)} data-job-department>
                <option value="">Anyone</option>{DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
          </div>
          <label className="block"><span className="text-[13px] font-semibold text-steel">Where</span>
            <select className="mt-1" value={placeKey} onChange={(e) => pickPlace(e.target.value)} data-job-place>
              <option value="">—</option>
              {hasRooms && board.rooms.length > 0 && <optgroup label="Rooms">{board.rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>Room {r.number}</option>)}</optgroup>}
              {board.tables.length > 0 && <optgroup label="Tables">{board.tables.map((t) => <option key={t.id} value={`table:${t.id}`}>{t.name}</option>)}</optgroup>}
              <option value="text">Somewhere else…</option>
            </select>
            {placeKey === "text" && <input className="mt-2" value={f.place.trim()} onChange={(e) => set("place", e.target.value || " ")} maxLength={60} placeholder="Lobby · Lawn · Kitchen store · Pool" data-job-place-text />}</label>
          <div><span className="text-[13px] font-semibold text-steel">How urgent</span>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="How urgent">
              {[1, 2, 3, 4].map((p) => <button key={p} type="button" role="radio" aria-checked={f.priority === p} onClick={() => set("priority", p)} data-job-priority={p}
                className={cn("!min-h-12 rounded-xl px-2 text-[13.5px] font-bold flex flex-col items-center justify-center leading-tight", f.priority === p ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>
                <span>{PRIORITY[p].label}</span><span className={cn("text-[11px] font-semibold", f.priority === p ? "opacity-80" : "text-steel")}>within {PRIORITY[p].target}</span></button>)}
            </div></div>
          <label className="flex items-center gap-3 !min-h-11 cursor-pointer"><input type="checkbox" className="h-5 w-5" checked={f.guest} onChange={(e) => set("guest", e.target.checked)} data-job-guest /><span className="text-[14px] font-semibold">A guest is waiting on this</span></label>
          <label className="block"><span className="text-[13px] font-semibold text-steel">Details (optional)</span>
            <textarea className="mt-1" rows={2} value={f.details} onChange={(e) => set("details", e.target.value)} maxLength={600} placeholder="Which tap, what the guest said, what to bring…" data-job-details /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">By when (optional)</span>
              <input type="datetime-local" className="mt-1" value={f.due ?? ""} onChange={(e) => set("due", e.target.value ? new Date(e.target.value).toISOString() : null)} data-job-due /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Repeats</span>
              <select className="mt-1" value={f.repeat} onChange={(e) => set("repeat", Number(e.target.value))} data-job-repeat>
                <option value={0}>Once</option><option value={1}>Every day</option><option value={7}>Every week</option><option value={14}>Every two weeks</option><option value={30}>Every month</option></select></label>
          </div>
          {boss && (
            <label className="block"><span className="text-[13px] font-semibold text-steel">Give it to (optional)</span>
              <select className="mt-1" value={f.assigned ?? (f.labourer ? `lab:${f.labourer}` : "")} data-job-give
                onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, assigned: v && !v.startsWith("lab:") ? v : null, labourer: v.startsWith("lab:") ? v.slice(4) : null })); }}>
                <option value="">Anyone in {deptLabel(f.department)}</option>
                {[...board.people].sort((a, b) => Number(b.on_duty) - Number(a.on_duty) || Number(b.dept === f.department) - Number(a.dept === f.department) || a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` — ${p.title}` : ""}{p.on_duty ? " · on duty" : ""}</option>)}
                {board.labourers.length > 0 && <optgroup label="Day labourers (no sign-in — finish it for them)">{board.labourers.map((l) => <option key={l.id} value={`lab:${l.id}`}>{l.name}{l.skill ? ` — ${l.skill}` : ""}{l.on_duty ? " · on duty" : ""}</option>)}</optgroup>}
              </select></label>)}
          <button type="button" disabled={pending || f.title.trim().length < 2} className="svc-btn go w-full" onClick={raise} data-raise-job><Plus size={18} aria-hidden /><Say w="raise_it" /></button>
          <p className="text-[12.5px] text-steel">Everyone in {deptLabel(f.department)} is told. {f.priority <= 2 ? "Turns red when late." : ""}</p>
        </div>
      </Sheet>
    </div>
  );
}
