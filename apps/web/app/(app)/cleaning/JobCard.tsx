"use client";
import { useState, type ReactNode } from "react";
import { BedDouble, Armchair, Clock, Check, UserPlus, RotateCcw, Ban, Hand, CalendarCheck, Star, Wrench, Sprout, SprayCan, ConciergeBell, ChefHat, HandPlatter, Boxes, ShieldCheck, ShieldX, PartyPopper, Briefcase, ClipboardList, AlertTriangle, Repeat, StickyNote, CircleCheck, MoreHorizontal, type LucideIcon } from "lucide-react";
import { DEPARTMENTS } from "@dineflow/shared";
import { cn } from "@/components/ui";
import { EmptyState, type EmptyHue } from "@/components/ui/EmptyState";
import { Hourglass, Timer, CalendarClock } from "lucide-react";
import { Say } from "@/components/ui/Say";
import { takeJob, finishJob, giveBack, assignJob, skipJob, cancelJob, assignLabour, type JobKind } from "./actions";

/** One job, whatever it is: a table paid and left, a room checked out, or anything raised on Work (0113). */
export type Job = {
  kind: JobKind; id: string; place: string; zone: string | null; what: string; status: "pending" | "in_progress" | "done" | "skipped"; note: string | null; created_at: string;
  assigned_to: string | null; assigned_name: string | null; assigned_by_name: string | null; assigned_at: string | null;
  taken_by: string | null; taken_name: string | null; taken_at: string | null; done_by: string | null; done_name: string | null; done_at: string | null;
  // rooms (0112): a guest arriving today, a VIP in it, and how the supervisor found the clean
  arrival?: boolean; vip?: boolean; inspection?: "passed" | "failed" | null; inspected_name?: string | null; inspected_at?: string | null;
  // work (0113): what, for whom, how urgent, by when, how often, raised by whom, or given to a day labourer
  title?: string | null; details?: string | null; category?: string | null; department?: string | null; priority?: number | null; guest?: boolean | null;
  due_at?: string | null; repeat_days?: number | null; source?: string | null; created_by?: string | null; created_name?: string | null;
  labourer_id?: string | null; labourer_name?: string | null;
};
export type Person = { id: string; name: string; role: string; title: string | null; dept: string | null; on_duty: boolean };
export type Labourer = { id: string; name: string; skill: string | null; on_duty: boolean };
export type Act = (p: Promise<object>, said: string) => void;

export const ms = (a: string, b?: string | null) => (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
export const span = (m: number) => { const n = Math.max(0, Math.round(m / 60000)); return n < 1 ? "under a minute" : n < 60 ? `${n} min` : n < 1440 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${Math.floor(n / 1440)} d ${Math.floor((n % 1440) / 60)} h`; };
/** the stat tile's form: as short as it gets, so it fits a phone's half-width tile */
export const brief = (m: number) => { const n = Math.max(0, Math.round(m / 60000)); return n < 1 ? "<1 min" : n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} m`; };
export const ago = (t: string) => { const n = Math.round(ms(t) / 60000); return n < 1 ? "just now" : n < 60 ? `${n} min ago` : n < 1440 ? `${Math.floor(n / 60)} h ${n % 60} min ago` : `${Math.floor(n / 1440)} d ago`; };
export const clock = (t: string) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayClock = (t: string) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const PILL = "inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-extrabold";
const WHAT: Record<string, string> = { "After guests": "After guests left", clean: "Room clean", stayover: "Stayover service", turndown: "Turndown", pickup: "Touch-up", maintenance: "Repair" };
/** When a wait or a clean has gone on too long, in minutes — for the cleaning jobs, which carry no due time. */
const LATE = { table: { wait: 15, clean: 20 }, room: { wait: 45, clean: 60 }, job: { wait: 480, clean: 480 } } as const;

export const deptLabel = (k: string | null | undefined) => (k ? DEPARTMENTS.find((d) => d.key === k)?.label ?? k : "Anyone");
/** What a job is, by its category: the picture, the word, and the department it goes to unless told otherwise. */
export const CATEGORY: Record<string, { label: string; Icon: LucideIcon; dept: string | null }> = {
  repair: { label: "Repair", Icon: Wrench, dept: "engineering" }, grounds: { label: "Grounds & garden", Icon: Sprout, dept: "engineering" },
  cleaning: { label: "Cleaning", Icon: SprayCan, dept: "housekeeping" }, guest_request: { label: "Guest request", Icon: ConciergeBell, dept: "housekeeping" },
  kitchen: { label: "Kitchen", Icon: ChefHat, dept: "kitchen" }, service: { label: "Service", Icon: HandPlatter, dept: "service" },
  stock: { label: "Stock", Icon: Boxes, dept: "stores" }, security: { label: "Security", Icon: ShieldCheck, dept: "security" },
  event: { label: "Event", Icon: PartyPopper, dept: "banquets" }, admin: { label: "Admin", Icon: Briefcase, dept: "management" }, other: { label: "Other", Icon: ClipboardList, dept: null },
};
/** The tiers hotel maintenance desks use, with their response targets. */
export const PRIORITY: Record<number, { label: string; target: string; cls: string }> = {
  1: { label: "Urgent", target: "30 min", cls: "bg-[var(--color-red-2)] text-[var(--color-red)]" },
  2: { label: "High", target: "2 h", cls: "bg-[var(--color-orange-2)] text-[var(--color-orange)]" },
  3: { label: "Normal", target: "8 h", cls: "" },
  4: { label: "Low", target: "3 days", cls: "bg-[var(--color-fill)] text-steel" },
};
export const placeOf = (j: Job) => (j.kind === "room" && !/^Room /.test(j.place) ? `Room ${j.place}` : j.place);
export const titleOf = (j: Job) => (j.kind === "job" ? j.title || placeOf(j) : j.what === "maintenance" ? j.title || `Repair · ${placeOf(j)}` : placeOf(j));
export const deptOf = (j: Job) => j.department ?? (j.kind === "room" ? "housekeeping" : j.kind === "table" ? "service" : null);
export const isOpen = (j: Job) => j.status === "pending" || j.status === "in_progress";
/** Past its due time; a cleaning job with none is late by the old rule of thumb. */
export const isLate = (j: Job) => isOpen(j) && (j.due_at ? ms(j.due_at) > 0 : j.status === "pending" && j.kind !== "job" && ms(j.created_at) > LATE[j.kind].wait * 60000);
/** Pending and not due for hours yet — a round scheduled for later, not something to run to. */
export const isUpcoming = (j: Job) => j.status === "pending" && !!j.due_at && ms(j.due_at) < -6 * 3600e3;
const initials = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const iconOf = (j: Job): LucideIcon => (j.kind === "job" ? (CATEGORY[j.category ?? "other"] ?? CATEGORY.other).Icon : j.what === "maintenance" ? Wrench : j.kind === "room" ? BedDouble : Armchair);

/** A person's initials in a round badge — the board's way of saying whose a job is at a glance. */
export function Badge({ name, you }: { name: string | null; you?: boolean }) {
  return <span className={cn("h-7 w-7 shrink-0 rounded-full grid place-items-center text-[11px] font-extrabold", you ? "bg-[var(--color-cyan)] text-[var(--color-bezel)]" : "bg-[var(--color-fill-2)] text-[var(--color-label)]")} aria-hidden>{initials(name)}</span>;
}

/** The people a job can be given to: on duty first, then the ones whose work it is. */
export function peopleFor(people: Person[], j: Job) {
  const dept = deptOf(j);
  const fit = (p: Person) => (dept ? p.dept === dept : false) || (j.kind === "room" ? p.role === "housekeeping" : j.kind === "table" ? ["waiter", "employee"].includes(p.role) : false);
  return [...people].sort((a, b) => Number(b.on_duty) - Number(a.on_duty) || Number(fit(b)) - Number(fit(a)) || a.name.localeCompare(b.name));
}

/**
 * One job as a card: what and where, how urgent and by when, who it was given to and by whom, who is on it and since
 * when; then the one move this person can make — take it, finish it (with a note, for work), give it back, drop it —
 * and, for a supervisor, who to give it to (a person, or a day labourer who has no sign-in).
 */
export function JobCard({ j, me, boss, pending, people, labourers = [], act, showDept, cleaner }: { j: Job; me: string; boss: boolean; pending: boolean; people: Person[]; labourers?: Labourer[]; act: Act; showDept?: boolean; cleaner?: boolean }) {
  const [noting, setNoting] = useState(false); const [note, setNote] = useState("");
  const [panel, setPanel] = useState<"more" | "give" | null>(null);
  const theirs = !!j.assigned_to && j.assigned_to !== me;
  /* a table or a room on the Cleaning board (`cleaner` given, 2026-10-30 — the owner: "I'll take it only for the cleaning
     people; a manager or supervisor gets assign"): a cleaner takes one nobody else was given, anyone takes the one given
     to them, a boss gives it out and finishes only what they took. Work's jobs keep their rule. */
  const cleanRule = cleaner !== undefined && j.kind !== "job";
  const canTake = j.status === "pending" && (cleanRule ? j.assigned_to === me || (!!cleaner && !theirs) : !theirs || boss);
  const canFinish = j.status === "in_progress" && (cleanRule ? j.taken_by === me || j.assigned_to === me || (!!cleaner && !j.taken_by) : j.taken_by === me || j.assigned_to === me || boss || !j.taken_by);
  const canBack = j.status === "in_progress" && (j.taken_by === me || boss);
  const canDrop = j.kind === "job" && isOpen(j) && (boss || j.created_by === me || j.taken_by === me || j.assigned_to === me);
  const canSkip = j.kind === "table" && j.status === "pending" && (!theirs || boss);
  const hasMore = (canFinish && j.kind === "job") || canBack || canSkip || canDrop;
  const Icon = iconOf(j); const name = titleOf(j); const mine = [j.assigned_to, j.taken_by].includes(me);
  const late = isLate(j);
  const slow = j.status === "in_progress" && !!j.taken_at && (j.due_at ? ms(j.due_at) > 0 : ms(j.taken_at) > LATE[j.kind].clean * 60000);
  const pr = (j.kind === "job" || j.what === "maintenance") && j.priority ? PRIORITY[j.priority] : null;
  const due = j.due_at ? (ms(j.due_at) > 0 ? `late by ${span(ms(j.due_at))}` : ms(j.due_at) > -20 * 3600e3 ? `due in ${span(-ms(j.due_at))}` : `due ${dayClock(j.due_at)}`) : null;
  const give = (v: string) => {
    if (v.startsWith("lab:")) { const id = v.slice(4); const who = labourers.find((l) => l.id === id)?.name; act(assignLabour(j.id, id), `${name} given to ${who}`); return; }
    const who = people.find((p) => p.id === v)?.name;
    act(assignJob(j.kind, j.id, v || null), v ? `${name} given to ${who}` : `${name}: anyone can take it`);
  };
  return (
    <article className={cn("card !p-0 overflow-hidden min-w-0 flex flex-col", mine && "!border-[var(--color-cyan)]", late && !mine && "!border-[var(--color-red)]")} data-job={name} data-job-kind={j.kind} data-job-status={j.status} data-late={late || undefined}>
      <div className="p-4 pb-3 flex items-start gap-3">
        <span className={cn("h-12 w-12 shrink-0 rounded-2xl grid place-items-center", late ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]")}><Icon size={22} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={cn("font-display leading-none", j.kind === "job" ? "text-[21px] line-clamp-2" : "text-[26px] truncate")}>{name}</span>
            <span className={cn("ml-auto text-[12.5px] shrink-0 inline-flex items-center gap-1", late ? "text-[var(--color-red)] font-bold" : "text-steel")} title={`Raised ${clock(j.created_at)}${j.due_at ? ` · due ${dayClock(j.due_at)}` : ""}`} data-due>
              {late ? <AlertTriangle size={13} aria-hidden /> : <Clock size={13} aria-hidden />}{due ?? ago(j.created_at)}</span>
          </div>
          <div className="text-[13px] text-steel mt-1 truncate">
            {j.kind === "job" ? <>{j.place || (CATEGORY[j.category ?? "other"] ?? CATEGORY.other).label}{showDept !== false && <> · {deptLabel(j.department)}</>}{j.created_name && <> · raised by {j.created_name}</>}</>
              : <>{WHAT[j.what] ?? j.what}{j.zone ? ` · ${j.zone}` : ""}{showDept && <> · {deptLabel(deptOf(j))}</>}</>}
          </div>
          {j.details && <div className="text-[13px] mt-1 line-clamp-3">{j.details}</div>}
          {j.note && isOpen(j) && !/^Checkout clean$/i.test(j.note) && <div className="text-[13px] mt-1 font-semibold text-[var(--color-orange)]">{j.note}</div>}
          {(pr?.cls || j.guest || j.arrival || j.vip || (j.repeat_days ?? 0) > 0) && <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pr?.cls && <span className={cn(PILL, pr.cls)} data-priority={j.priority}>{j.priority === 1 && <AlertTriangle size={12} aria-hidden />}{pr.label} · {pr.target}</span>}
            {j.guest && <span className={cn(PILL, "bg-[var(--color-violet-2)] text-[var(--color-violet)]")} data-guest><Star size={12} aria-hidden />Guest waiting</span>}
            {j.arrival && <span className={cn(PILL, "bg-[var(--color-orange-2)] text-[var(--color-orange)]")} data-arrival><CalendarCheck size={12} aria-hidden />Guest arriving today</span>}
            {j.vip && <span className={cn(PILL, "bg-[var(--color-violet-2)] text-[var(--color-violet)]")}><Star size={12} aria-hidden />VIP</span>}
            {(j.repeat_days ?? 0) > 0 && <span className={cn(PILL, "bg-[var(--color-fill)] text-steel")} data-repeat><Repeat size={12} aria-hidden />{j.repeat_days === 1 ? "Every day" : j.repeat_days === 7 ? "Every week" : `Every ${j.repeat_days} days`}</span>}
          </div>}
        </div>
      </div>
      <div className="px-4 space-y-2 text-[13.5px]">
        {j.assigned_to && <div className="flex items-center gap-2 min-w-0" data-assigned><Badge name={j.assigned_name} you={j.assigned_to === me} />
          <span className="min-w-0">Given to <b>{j.assigned_to === me ? "you" : j.assigned_name}</b>{j.assigned_by_name && <> by {j.assigned_by_name}</>}{j.assigned_at && <span className="text-steel"> · {clock(j.assigned_at)}</span>}</span></div>}
        {j.labourer_id && <div className="flex items-center gap-2 min-w-0" data-assigned-labour><Badge name={j.labourer_name ?? null} />
          <span className="min-w-0">Given to <b>{j.labourer_name}</b> <span className="text-steel">(labourer)</span>{j.assigned_by_name && <> by {j.assigned_by_name}</>}{j.assigned_at && <span className="text-steel"> · {clock(j.assigned_at)}</span>}</span></div>}
        {j.status === "in_progress" && <div className="flex items-center gap-2 min-w-0 font-semibold" data-taken><Badge name={j.taken_name} you={j.taken_by === me} />
          <span className="min-w-0">{j.taken_by === me ? "You are" : `${j.taken_name ?? "Someone"} is`} on it{j.labourer_id && j.taken_by !== null && <> for {j.labourer_name}</>}{j.taken_at && <span className={slow ? "text-[var(--color-orange)]" : "text-[var(--color-cyan)]"}> · since {clock(j.taken_at)} · {span(ms(j.taken_at))}</span>}</span></div>}
      </div>
      {/* the actions (2026-10-18): the one move this person has, as the card's button; the rest behind two round buttons —
          ⋯ for a note, give back, not needed, drop; the person for a supervisor's Give to — opening in place */}
      <div className="px-4 pb-4 pt-3 mt-auto">
        <div className="flex items-center gap-2 min-w-0">
          {j.status === "pending" && canTake
            ? <button type="button" disabled={pending} className="svc-btn go sm flex-1 min-w-0" data-take onClick={() => act(takeJob(j.kind, j.id), `${name} is yours`)}><Hand size={18} aria-hidden /><Say w="take_it" /></button>
            : canFinish && !noting ? <button type="button" disabled={pending} className="svc-btn go sm flex-1 min-w-0" data-finish onClick={() => act(finishJob(j.kind, j.id), `${name} done`)}><Check size={18} aria-hidden /><Say w="clean_done" /></button>
            : cleanRule && boss && !noting ? <button type="button" disabled={pending} className="svc-btn go sm flex-1 min-w-0" data-give-wide data-clean-assign="wide" onClick={() => setPanel((x) => (x === "give" ? null : "give"))}><UserPlus size={18} aria-hidden />{j.assigned_to || j.status === "in_progress" ? "Reassign" : "Assign"}</button>
            : <p className="flex-1 min-w-0 text-[13px] text-steel truncate">{j.status === "pending" ? `Waiting for ${j.assigned_name ?? "someone"}` : noting ? "Say what was done" : `${j.taken_name ?? "Someone"} is on it`}</p>}
          {hasMore && <button type="button" onClick={() => setPanel((x) => (x === "more" ? null : "more"))} aria-expanded={panel === "more"} aria-label={`More for ${name}`} title="More"
            className={cn("h-11 w-11 shrink-0 rounded-xl grid place-items-center transition-colors", panel === "more" ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")} data-more><MoreHorizontal size={19} aria-hidden /></button>}
          {/* Give to… is the owner's, a manager's or a supervisor's (`boss` = clean_board.can_assign = _clean_may_assign:
              owner, manager, supervisor, supervisor 2); clean_assign refuses anyone else, and since 0156 so does a direct
              write of a room's assigned_to. Everyone else keeps I'll take it / Done. */}
          {boss && !(cleanRule && !noting && !(j.status === "pending" && canTake) && !canFinish) && <button type="button" onClick={() => setPanel((x) => (x === "give" ? null : "give"))} aria-expanded={panel === "give"} aria-label={`Give ${name} to`} title="Give to…"
            className={cn("h-11 w-11 shrink-0 rounded-xl grid place-items-center transition-colors", panel === "give" ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : (j.assigned_to || j.labourer_id) ? "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")} data-give-open data-clean-assign="open"><UserPlus size={18} aria-hidden /></button>}
        </div>
        <div className={cn("mt-2 grid grid-cols-2 gap-2", panel !== "more" && "!hidden")} data-more-panel>
          {canFinish && j.kind === "job" && <button type="button" className="svc-btn quiet sm min-w-0 col-span-2" data-add-note onClick={() => { setNoting(true); setPanel(null); }}><StickyNote size={16} aria-hidden /> Done with a note</button>}
          {canBack && <button type="button" disabled={pending} className="svc-btn quiet sm min-w-0" data-give-back onClick={() => act(giveBack(j.kind, j.id), `${name} is back in the queue`)}><RotateCcw size={16} aria-hidden /><Say w="give_back" /></button>}
          {canSkip && <button type="button" disabled={pending} className="svc-btn quiet sm min-w-0" data-skip onClick={() => act(skipJob(j.id), `${name}: not needed`)}><Ban size={16} aria-hidden /><Say w="not_needed" /></button>}
          {canDrop && <button type="button" disabled={pending} className="svc-btn quiet sm min-w-0 !text-[var(--color-red)]" data-drop onClick={() => act(cancelJob(j.id), `${name} dropped`)}><Ban size={16} aria-hidden /><Say w="drop_it" /></button>}
        </div>
        {noting && <div className="mt-2 grid gap-2" data-note-box>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done?" maxLength={300} aria-label={`What was done: ${name}`} data-done-note autoFocus />
          <div className="flex gap-2 [&>*]:flex-1 [&>*]:min-w-0">
            <button type="button" className="svc-btn quiet sm" onClick={() => setNoting(false)}>Cancel</button>
            <button type="button" disabled={pending} className="svc-btn go sm" data-finish-note onClick={() => { act(finishJob(j.kind, j.id, note), `${name} done`); setNoting(false); }}><Check size={16} aria-hidden /><Say w="with_note" /></button>
          </div></div>}
        {boss && <label className={cn("mt-2 flex items-center gap-2 min-w-0", panel !== "give" && "!hidden")} data-give-panel><UserPlus size={18} className="shrink-0 text-steel" aria-hidden />
          <select className="!h-11 !min-h-11 min-w-0 flex-1 text-[14px] font-semibold" value={j.assigned_to ?? (j.labourer_id ? `lab:${j.labourer_id}` : "")} disabled={pending} data-assign data-clean-assign="select" aria-label={`Give ${name} to`} onChange={(e) => { give(e.target.value); setPanel(null); }}>
            <option value="">{j.assigned_to || j.labourer_id ? "Anyone can take" : "Give to…"}</option>
            {peopleFor(people, j).map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` — ${p.title}` : ""}{p.on_duty ? " · on duty" : ""}</option>)}
            {j.kind === "job" && labourers.length > 0 && <optgroup label="Day labourers (no sign-in)">
              {labourers.map((l) => <option key={l.id} value={`lab:${l.id}`}>{l.name}{l.skill ? ` — ${l.skill}` : ""}{l.on_duty ? " · on duty" : ""}</option>)}</optgroup>}
          </select></label>}
      </div>
    </article>
  );
}

/** A finished job, one line: who, how long it took, how long it waited, who gave it, what was done, and a room's inspection. */
export function DoneRow({ j, me, inspectRequired, showDept }: { j: Job; me: string; inspectRequired?: boolean; showDept?: boolean }) {
  const skipped = j.status === "skipped"; const name = titleOf(j);
  return (
    <li className="py-3 flex items-start gap-3 min-w-0" data-done={name}>
      <span className={cn("mt-0.5 h-9 w-9 shrink-0 rounded-xl grid place-items-center", skipped ? "bg-[var(--color-fill)] text-steel" : "bg-[var(--color-green-2)] text-[var(--color-green)]")}>{skipped ? <Ban size={17} aria-hidden /> : <CircleCheck size={18} aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0"><b className="text-[15px] truncate">{name}</b>{j.kind === "job" && j.place && <span className="text-[12.5px] text-steel truncate">{j.place}</span>}{j.done_at && <span className="ml-auto text-[12.5px] text-steel shrink-0">{clock(j.done_at)}</span>}</div>
        <div className="text-[13px] text-steel">
          {skipped ? <>{j.note ?? "Not needed"}{j.done_name && <> — {j.done_name}</>}</>
            : <>Done by <b className="text-[var(--color-label)]">{j.done_by === me ? "you" : j.done_name ?? "—"}</b>{j.labourer_name && <> for {j.labourer_name}</>}
              {j.taken_at && j.done_at && <> · took {span(ms(j.taken_at, j.done_at))}</>}
              {j.taken_at && <> · waited {span(ms(j.created_at, j.taken_at))}</>}
              {j.assigned_by_name && <> · given by {j.assigned_by_name}</>}
              {showDept && <> · {deptLabel(deptOf(j))}</>}</>}
        </div>
        {j.kind === "job" && !skipped && j.note && <div className="text-[13px] mt-0.5 inline-flex items-center gap-1" data-done-note-text><StickyNote size={13} className="text-steel shrink-0" aria-hidden />{j.note}</div>}
        {j.kind === "room" && j.what !== "maintenance" && j.status === "done" && (j.inspection
          ? <div className={cn("text-[12.5px] font-bold mt-0.5 inline-flex items-center gap-1", j.inspection === "passed" ? "text-[var(--color-green)]" : "text-[var(--color-red)]")} data-inspection={j.inspection}>
              {j.inspection === "passed" ? <ShieldCheck size={13} aria-hidden /> : <ShieldX size={13} aria-hidden />}{j.inspection === "passed" ? "Passed" : "Failed"} by {j.inspected_name}{j.inspected_at && ` · ${clock(j.inspected_at)}`}</div>
          : inspectRequired ? <div className="text-[12.5px] font-semibold mt-0.5 text-[var(--color-orange)]">Waiting for inspection</div> : null)}
      </div>
    </li>
  );
}

const COL_LOOK: Record<"waiting" | "on_it" | "done_today" | "to_inspect" | "coming_up", [LucideIcon, EmptyHue, string]> = {
  waiting: [Hourglass, "orange", ""],
  on_it: [Timer, "blue", ""],
  to_inspect: [ShieldCheck, "violet", ""],
  done_today: [CircleCheck, "tint", ""],
  coming_up: [CalendarClock, "cyan", ""],
};

/** A column of the board: its word, a count, and its cards or a quiet line. */
export function Column({ keyName, title, n, hint, children }: { keyName: string; title: "waiting" | "on_it" | "done_today" | "to_inspect" | "coming_up"; n: number; hint: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3" data-col={keyName}>
      <div className="flex items-center gap-2 px-1"><span className="text-[17px] font-extrabold"><Say w={title} start /></span><span className="num rounded-full bg-[var(--color-fill)] px-2.5 py-0.5 text-[13px] font-extrabold">{n}</span></div>
      {n === 0 ? <>
        {/* the phone keeps its quiet dashed line; from sm up the column says it with its icon and hue (2026-10-24, the owner) */}
        <div className="sm:hidden rounded-2xl border border-dashed border-[var(--color-line-2)] px-4 py-6 text-center text-[13.5px] text-steel">{hint}</div>
        <EmptyState from="sm" size="sm" icon={COL_LOOK[title][0]} hue={COL_LOOK[title][1]} title={hint} hint={COL_LOOK[title][2]} data-col-empty={keyName} />
      </> : children}
    </section>
  );
}
