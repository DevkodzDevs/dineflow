"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Clock, Timer, Hourglass, ListChecks, CalendarCheck, ShieldCheck, ShieldX, Users } from "lucide-react";
import { Card, Segmented, cn, useToast, FlapBreathe, FlapShuffle } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { useLive } from "@/lib/useLive";
import { saveCleanSettings } from "./actions";
import { inspectRoom } from "../housekeeping/actions";
import { JobCard, DoneRow, Column, Badge, ms, span, brief, ago, clock, avg, placeOf, PILL, type Job, type Person, type Act } from "./JobCard";

export type { Job, Person } from "./JobCard";
/** A room cleaned and not yet signed off (only for whoever may sign off, where the property inspects). */
export type Inspect = { room: string; place: string; zone: string; since: string; cleaned_name: string | null; cleaned_at: string | null; arrival: boolean };
export type Board = { jobs: Job[]; people: Person[]; can_assign: boolean; tables_on: boolean; inspect_required?: boolean; inspect?: Inspect[] };
type Filter = "all" | "table" | "room" | "mine";

/**
 * The Cleaning board (0111): Waiting, On it and Done today, for tables (paid and left) and rooms (checked out, or a
 * housekeeping task). Anyone takes a job that is not someone else's — the job then carries their name and the time;
 * an owner, manager or supervisor gives a job to a person from its card. Live: a new table appears the moment its
 * bill is settled. Done today says who finished each one, how long it took and how long it waited. The card and the
 * done row are shared with the Work board (JobCard.tsx, 0113).
 */
export function CleaningClient({ board, error, me, role, canSet, hasRooms, cleaner = false }: { board: Board; error: string | null; me: string; role: string; canSet: boolean; hasRooms: boolean; cleaner?: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition(); const [, tick] = useState(0);
  useLive(["table_cleanings", "housekeeping_tasks"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  // housekeeping starts on rooms, the floor on tables; everyone else on all of it
  const [filter, setFilter] = useState<Filter>(() => (hasRooms && role === "housekeeping" ? "room" : hasRooms && role === "waiter" ? "table" : "all"));
  const [tablesOn, setTablesOn] = useState(board.tables_on);
  const boss = board.can_assign;

  const jobs = useMemo(() => board.jobs.filter((j) => filter === "all" || (filter === "mine" ? [j.assigned_to, j.taken_by, j.done_by].includes(me) : j.kind === filter)), [board.jobs, filter, me]);
  // mine first, then a room with a guest arriving today, then the one waiting longest
  const mineFirst = (a: Job, b: Job) => Number([b.assigned_to, b.taken_by].includes(me)) - Number([a.assigned_to, a.taken_by].includes(me))
    || Number(!!b.arrival) - Number(!!a.arrival) || ms(b.created_at) - ms(a.created_at);
  const waiting = jobs.filter((j) => j.status === "pending").sort(mineFirst);
  const onIt = jobs.filter((j) => j.status === "in_progress").sort(mineFirst);
  const finished = jobs.filter((j) => j.status === "done" || j.status === "skipped").sort((a, b) => ms(a.done_at ?? a.created_at) - ms(b.done_at ?? b.created_at));
  const took = avg(finished.filter((j) => j.status === "done" && j.taken_at && j.done_at).map((j) => ms(j.taken_at!, j.done_at)));
  const waited = avg(jobs.filter((j) => j.taken_at).map((j) => ms(j.created_at, j.taken_at)));

  const act = (p: Promise<object>, said: string) => start(async () => { const r = (await p) as { error?: string }; if (r.error) toast(r.error, "err"); else toast(said); });
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
  // a room with a guest arriving today first, then the one cleaned longest ago
  const inspect = boss && board.inspect_required ? [...(board.inspect ?? [])].sort((a, b) => Number(b.arrival) - Number(a.arrival) || (a.cleaned_at ?? a.since).localeCompare(b.cleaned_at ?? b.since)) : [];
  const [failing, setFailing] = useState<string | null>(null); const [why, setWhy] = useState("");
  // the supervisor's view of the day: who finished how many, how fast, and who is on what now
  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; done: number; took: number[]; now: string | null }>();
    const of = (id: string, name: string | null) => { const e = m.get(id) ?? { name: name ?? "Someone", done: 0, took: [], now: null }; m.set(id, e); return e; };
    for (const j of board.jobs) {
      if (j.status === "done" && j.done_by) { const e = of(j.done_by, j.done_name); e.done++; if (j.taken_at && j.done_at) e.took.push(ms(j.taken_at, j.done_at)); }
      if (j.status === "in_progress" && j.taken_by) of(j.taken_by, j.taken_name).now = placeOf(j);
    }
    return [...m.entries()].sort((a, b) => b[1].done - a[1].done || a[1].name.localeCompare(b[1].name));
  }, [board.jobs]);

  const card = (j: Job) => <JobCard key={j.id} j={j} me={me} boss={boss} pending={!!busy[j.id]} people={board.people} act={actOn(j.id)} cleaner={cleaner} />;
  const row = (j: Job) => <DoneRow key={j.id} j={j} me={me} inspectRequired={board.inspect_required} />;

  /** A cleaned room the supervisor signs off: Pass puts it on sale, Fail (with what is wrong) sends it back to whoever cleaned it. */
  const inspectCard = (r: Inspect) => (
    <article key={r.room} className="card !p-0 overflow-hidden min-w-0" data-inspect={`Room ${r.place}`}>
      <div className="p-4 pb-3 flex items-start gap-3">
        <span className="h-12 w-12 shrink-0 rounded-2xl grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><ShieldCheck size={22} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0"><span className="font-display text-[26px] leading-none truncate">Room {r.place}</span>
            <span className="ml-auto text-[12.5px] text-steel shrink-0 inline-flex items-center gap-1"><Clock size={13} aria-hidden />{ago(r.cleaned_at ?? r.since)}</span></div>
          <div className="text-[13px] text-steel mt-1">{r.zone}{r.cleaned_name && <> · cleaned by <b className="text-[var(--color-label)]">{r.cleaned_name}</b></>}{r.cleaned_at && ` at ${clock(r.cleaned_at)}`}</div>
          {r.arrival && <div className="mt-1.5"><span className={cn(PILL, "bg-[var(--color-orange-2)] text-[var(--color-orange)]")}><CalendarCheck size={12} aria-hidden />Guest arriving today</span></div>}
        </div>
      </div>
      <div className="p-4 pt-0 grid gap-2">
        {failing === r.room ? (<>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What is wrong?" maxLength={120} aria-label={`What is wrong in Room ${r.place}`} data-fail-why autoFocus />
          <div className="flex gap-2 [&>*]:flex-1 [&>*]:min-w-0">
            <button type="button" className="svc-btn quiet sm" onClick={() => setFailing(null)}>Cancel</button>
            <button type="button" disabled={pending} className="svc-btn no sm" data-fail-confirm onClick={() => { act(inspectRoom(r.room, false, why), `Room ${r.place} failed — back to ${r.cleaned_name ?? "the queue"}`); setFailing(null); setWhy(""); }}><ShieldX size={16} aria-hidden /><Say w="fail_it" /></button>
          </div></>) : (
          <div className="flex gap-2 [&>*]:flex-1 [&>*]:min-w-0">
            <button type="button" disabled={pending} className="svc-btn go sm" data-pass onClick={() => act(inspectRoom(r.room, true), `Room ${r.place} ready to sell`)}><ShieldCheck size={16} aria-hidden /><Say w="pass_it" /></button>
            <button type="button" disabled={pending} className="svc-btn quiet sm !text-[var(--color-red)]" data-fail onClick={() => { setFailing(r.room); setWhy(""); }}><ShieldX size={16} aria-hidden /><Say w="fail_it" /></button>
          </div>)}
      </div>
    </article>
  );

  return (
    <div className="space-y-5" data-cleaning>
      {error && <p className="text-[14px] font-semibold text-chili" role="alert">{error}</p>}
      {/* Every width (iPad and desktop 2026-10-24; the phone 2026-10-26, the owner: "the flaps are tiny — number flap design,
          perfectly sized", and Average clean was a dash): Work's tiles —
          each state its colour, the flap at .flip-stat's size, a caption beside it; the average a flap of minutes. */}
      <CleanTiles waiting={waiting.length} onIt={onIt.length} done={finished.filter((j) => j.status === "done").length} took={took} />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "table", label: "Tables" }, ...(hasRooms ? [{ value: "room" as Filter, label: "Rooms" }] : []), { value: "mine", label: "Mine" }]} />
        {waited != null && <span className="text-[13px] text-steel">Average wait: {span(waited)}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Column keyName="waiting" title="waiting" n={waiting.length} hint="Nothing waiting."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{waiting.map(card)}</div></Column>
        <Column keyName="on-it" title="on_it" n={onIt.length} hint="Nobody cleaning"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{onIt.map(card)}</div></Column>
        {boss && board.inspect_required && <Column keyName="inspect" title="to_inspect" n={inspect.length} hint="None to check"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{inspect.map(inspectCard)}</div></Column>}
        <Column keyName="done" title="done_today" n={finished.length} hint="None finished yet"><Card className="!py-1 !px-4"><ul className="divide-y divide-[var(--color-separator)]">{finished.map(row)}</ul></Card></Column>
      </div>

      {boss && byPerson.length > 0 && (
        <Card className="!p-4" data-by-person>
          <div className="flex items-center gap-2 text-[17px] font-extrabold mb-2"><Users size={18} aria-hidden /> Today by person</div>
          <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {byPerson.map(([id, p]) => { const a = avg(p.took); return (
              <li key={id} className="py-2 flex items-center gap-3 min-w-0 border-b border-[var(--color-separator)]" data-person-row={p.name}>
                <Badge name={p.name} you={id === me} />
                <div className="min-w-0 flex-1"><div className="font-bold text-[14.5px] truncate">{id === me ? "You" : p.name}</div>
                  <div className="text-[12.5px] text-steel">{p.done} done{a != null && ` · ${brief(a)} each`}</div></div>
                {p.now && <span className={cn(PILL, "bg-[var(--color-cyan-2)] text-[var(--color-cyan)] shrink-0")}>On {p.now}</span>}
              </li>); })}
          </ul>
        </Card>)}

      {canSet && (
        <Card className="!p-4" data-clean-settings>
          <label className="flex items-start gap-3 !min-h-11 cursor-pointer">
            <input type="checkbox" className="h-5 w-5 mt-0.5" checked={tablesOn} disabled={pending} data-switch="tables"
              onChange={(e) => { const v = e.target.checked; setTablesOn(v); start(async () => { const r = await saveCleanSettings(v); if ("error" in r) { setTablesOn(!v); toast(r.error!, "err"); } else toast(v ? "Table cleaning on" : "Table cleaning off"); }); }} />
            <span><span className="block text-[15px] font-bold">Clean tables after payment</span>
              <span className="block text-[12.5px] text-steel">Off for counters</span></span>
          </label>
        </Card>)}
    </div>
  );
}

/** The four counts as split-flaps from sm up — the same tile as Work's (WorkClient `data-work-stats`). */
function CleanTiles({ waiting, onIt, done, took }: { waiting: number; onIt: number; done: number; took: number | null }) {
  const mins = took == null ? 0 : Math.max(0, Math.round(took / 60000));
  const tiles = [
    ["waiting", Hourglass, "Waiting", waiting, "var(--color-orange)", "var(--color-orange-2)", waiting ? "to be cleaned" : "nothing waiting"],
    ["on", Timer, "On it", onIt, "var(--color-blue)", "var(--color-blue-2)", onIt ? "being cleaned now" : "nobody cleaning"],
    ["done", ListChecks, "Cleaned today", done, "var(--color-green)", "var(--color-green-2)", done ? "cleaned today" : "none yet"],
    ["avg", Clock, "Average clean", mins, "var(--color-cyan)", "var(--color-cyan-2)", took == null ? "none timed yet" : mins < 1 ? "under a minute" : "min a clean"],
  ] as const;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-clean-tiles data-clean-stats>
      {tiles.map(([key, I, k, n, hue, hue2, cap]) => (
        <div key={key} data-clean-tile={key} data-n={n} style={{ ["--hue" as string]: hue, ["--hue-2" as string]: hue2 }}
          className="@container feather !rounded-[20px] p-4 min-w-0 flex flex-col gap-3 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1 bg-[var(--hue)] opacity-80" aria-hidden />
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]"><I size={18} aria-hidden /></span>
            <span className="text-[13.5px] font-bold text-[var(--color-label-2)] truncate">{k}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flip-stat shrink-0">
              {key === "waiting"
                ? <FlapBreathe value={n} pad={2} size="sm" tone="live" on={n > 0} say={`${n} waiting`} />
                : <FlapShuffle value={n} pad={2} size="sm" say={key === "avg" ? (took == null ? "no clean timed yet" : `${n} minutes a clean`) : `${n} ${k.toLowerCase()}`} />}
            </div>
            <span className="min-w-0 flex-1 basis-24 text-[12px] leading-snug text-[var(--color-label-2)]">{cap}</span>
          </div>
        </div>))}
    </div>
  );
}
