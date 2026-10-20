"use client";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { ListTodo, ListChecks, CalendarDays, Plane, Wallet, MessagesSquare, UserRound, ChevronRight, Check, Clock, Fingerprint, FileText, Sun, Moon, Sunrise, X } from "lucide-react";
import { Sheet, cn, useToast, FlapShuffle, FlapPercent, FlapClock, FlapMini } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { tick } from "../tasks/actions";
import { askLeave, cancelLeave } from "./actions";

type Job = { id: string; title: string; place: string | null; priority: number; due_at: string | null; status: string; assigned_at: string | null; assigned_to: string | null; taken_by: string | null; guest_impact: boolean | null; created_at: string };
type Leave = { id: string; from_date: string; to_date: string; days: number; kind: string; reason: string | null; status: "requested" | "approved" | "rejected" | "cancelled"; decision_note: string | null; decided_at: string | null; created_at: string };
type Slip = { id: string; month: string; basis: string; rate: number; days_in_month: number; days_present: number; paid_days: number; gross: number; bonus: number; pf_employee: number; esi_employee: number; advances: number; other_deduction: number; net: number; pf_employer: number; esi_employer: number; pf_wage: number; paid_at: string | null; paid_method: string | null; wage_rule: boolean };
export type Home = {
  me: string; today: string; locked: string | null; attend: boolean;
  name: string; fullName: string; title: string; team: string | null; teamKey: string | null; property: string;
  jobs: Job[]; doneToday: number;
  lists: { id: string; name: string; shift: string; items: string[]; done: Record<string, { name: string; at: string }> }[];
  attendance: { work_date: string; in_at: string | null; out_at: string | null; hours: number | null }[];
  leave: Leave[]; pay: { basis: string; amount: number } | null; advances: { amount: number; given_on: string; note: string | null }[];
  payslips: Slip[]; unread: number;
};

const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");
const dmy = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthName = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const PRI: Record<number, { label: string; cls: string }> = { 1: { label: "Urgent", cls: "bg-[var(--color-red-2)] text-[var(--color-red)]" }, 2: { label: "High", cls: "bg-[var(--color-orange-2)] text-[color-mix(in_srgb,var(--color-orange)_80%,var(--color-label))]" } };
const LEAVE_KIND: Record<string, string> = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid", other: "Other" };
const LEAVE_STATE: Record<Leave["status"], { label: string; cls: string }> = {
  requested: { label: "Waiting", cls: "bg-[var(--color-orange-2)] text-[color-mix(in_srgb,var(--color-orange)_80%,var(--color-label))]" },
  approved: { label: "Approved", cls: "bg-[var(--color-green-2)] text-[color-mix(in_srgb,var(--color-green)_80%,var(--color-label))]" },
  rejected: { label: "Not approved", cls: "bg-[var(--color-red-2)] text-[color-mix(in_srgb,var(--color-red)_80%,var(--color-label))]" },
  cancelled: { label: "Withdrawn", cls: "bg-[var(--color-fill)] text-steel" },
};

/** One tile of the dashboard: an icon square in its own hue, a title, the figure that matters, a line under it, and
 *  — when it has more — the whole tile opens it (a Sheet, or another screen). */
function Tile({ k, hue, Icon, title, figure, unit, sub, badge, children, onOpen, href }: { k: string; hue: string; Icon: typeof Sun; title: string; figure: ReactNode; unit?: string; sub?: ReactNode; badge?: ReactNode; children?: ReactNode; onOpen?: () => void; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-3 min-w-0">
        <span className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 16%, transparent)`, color: `color-mix(in srgb, ${hue} 85%, var(--color-label))` }}><Icon size={21} aria-hidden /></span>
        <span className="min-w-0 flex-1 text-[15px] font-bold truncate">{title}</span>
        {badge}
        <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
      </span>
      <span className="mt-4 flex items-end gap-1.5 min-w-0"><span className="font-display num text-[34px] leading-none truncate">{figure}</span>{unit && <span className="text-[13px] text-steel font-semibold">{unit}</span>}</span>
      {sub && <span className="mt-1.5 block text-[13px] text-steel leading-snug">{sub}</span>}
      {children && <span className="mt-3.5 block">{children}</span>}
    </>
  );
  const cls = "feather !rounded-[22px] p-4 sm:p-5 text-left flex flex-col min-w-0 transition hover:brightness-[1.04] active:scale-[.99] !min-h-0 w-full";
  return href
    ? <Link href={href} className={cls} data-home-tile={k}>{body}</Link>
    : <button type="button" onClick={onOpen} className={cls} data-home-tile={k} aria-haspopup="dialog">{body}</button>;
}

export function HomeClient({ home }: { home: Home }) {
  const [open, setOpen] = useState<null | "work" | "lists" | "attendance" | "leave" | "salary">(null);
  const { me, today } = home;

  // ── greeting and today's state ─────────────────────────────────────────────────────────────────
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => { setHour(Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }))); }, []);
  const greet = hour == null ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const GreetIcon = hour == null || hour < 12 ? Sunrise : hour < 17 ? Sun : Moon;
  const todayRow = home.attendance.find((a) => a.work_date === today);
  const onLeave = home.leave.find((l) => l.status === "approved" && l.from_date <= today && l.to_date >= today);
  const status = onLeave ? { label: "On leave today", cls: "bg-[var(--color-cyan-2)] text-[color-mix(in_srgb,var(--color-cyan)_80%,var(--color-label))]" }
    : todayRow?.in_at && !todayRow.out_at ? { label: `In since ${hm(todayRow.in_at)}`, cls: "bg-[var(--color-green-2)] text-[color-mix(in_srgb,var(--color-green)_80%,var(--color-label))]" }
    : todayRow?.out_at ? { label: `Out at ${hm(todayRow.out_at)}`, cls: "bg-[var(--color-fill)] text-steel" }
    : { label: "Not punched in yet", cls: "bg-[var(--color-orange-2)] text-[color-mix(in_srgb,var(--color-orange)_80%,var(--color-label))]" };
  const dateLine = new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  // ── work: what is on them, and what was given to them since they last looked ─────────────────────
  const SEEN = `df-home-work-seen:${me}`;
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => { try { setSeen(localStorage.getItem(SEEN) ?? ""); } catch { setSeen(""); } }, [SEEN]);
  const given = home.jobs.filter((j) => j.assigned_to === me);
  const fresh = seen == null ? [] : given.filter((j) => j.assigned_at && (!seen || j.assigned_at > seen));
  const busy = home.jobs.filter((j) => j.status === "in_progress").length;
  const openWork = () => { setOpen("work"); try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* fine */ } setSeen(new Date().toISOString()); };

  // ── checklists ─────────────────────────────────────────────────────────────────────────────────
  const [done, setDone] = useState<Record<string, Record<string, { name: string; at: string }>>>(() => Object.fromEntries(home.lists.map((l) => [l.id, l.done])));
  const ticks = home.lists.reduce((a, l) => a + Object.keys(done[l.id] ?? {}).filter((k) => Number(k) < l.items.length).length, 0);
  const duties = home.lists.reduce((a, l) => a + l.items.length, 0);

  // ── attendance: this month ───────────────────────────────────────────────────────────────────────
  const month = today.slice(0, 7);
  const thisMonth = home.attendance.filter((a) => a.work_date.startsWith(month) && a.in_at);
  const present = new Set(thisMonth.map((a) => a.work_date)).size;
  const hours = thisMonth.reduce((a, r) => a + Number(r.hours ?? 0), 0);
  const week = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today) - (6 - i) * 86400000).toISOString().slice(0, 10));
  const was = (d: string) => home.attendance.some((a) => a.work_date === d && a.in_at);
  const leaveOn = (d: string) => home.leave.some((l) => l.status === "approved" && l.from_date <= d && l.to_date >= d);

  // ── leave ───────────────────────────────────────────────────────────────────────────────────────
  const waiting = home.leave.filter((l) => l.status === "requested");
  const next = [...home.leave].filter((l) => l.status === "approved" && l.to_date >= today).sort((a, b) => a.from_date.localeCompare(b.from_date))[0];
  const yearLeave = home.leave.filter((l) => l.status === "approved" && l.from_date.startsWith(today.slice(0, 4))).reduce((a, l) => a + Number(l.days), 0);
  const lastDecided = home.leave.filter((l) => l.decided_at).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))[0];

  // ── pay ─────────────────────────────────────────────────────────────────────────────────────────
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const estimate = home.pay ? (home.pay.basis === "monthly" ? home.pay.amount * present / daysInMonth : home.pay.amount * present) : null;
  const owed = home.advances.reduce((a, x) => a + x.amount, 0);
  const lastSlip = home.payslips[0];

  return (
    <div className="space-y-5" data-home>
      {home.locked && <p className="rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13.5px] text-steel" data-home-locked>That section is not part of your job here — this is your day. Ask the owner if you need it.</p>}

      {/* who and when: the greeting, the job, today's date and where the day stands */}
      <section className="feather !rounded-[26px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 min-w-0" data-home-hello>
        <span className="h-14 w-14 shrink-0 rounded-[20px] grid place-items-center bg-[color-mix(in_srgb,var(--color-tint)_14%,transparent)] text-[var(--color-tint)]"><GreetIcon size={26} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-steel">{dateLine}</div>
          <h1 className="mt-1 font-display text-[30px] sm:text-[34px] leading-[1.05] truncate">{greet}, {home.name}</h1>
          <div className="mt-1.5 text-[14px] text-steel truncate">{home.title}{home.team ? ` · ${home.team}` : ""} · {home.property}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {/* 2026-10-20: "In since" shows the time on small flap tiles (Flap.tsx); the words stay for a screen reader */}
          {todayRow?.in_at && !todayRow.out_at && status.label.startsWith("In since")
            ? <span className={cn("inline-flex items-center gap-2 min-h-9 py-1 px-3.5 rounded-full text-[13px] font-bold", status.cls)} data-home-status><Clock size={14} aria-hidden /><span>In since</span><span className="sr-only">{hm(todayRow.in_at)}</span>
                <FlapClock at={new Date(todayRow.in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} size="xs" tile="30px" bare /></span>
            : <span className={cn("inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-bold", status.cls)} data-home-status><Clock size={14} aria-hidden />{status.label}</span>}
          {home.attend && !onLeave && (!todayRow?.in_at || !todayRow.out_at) && <Link href="/attendance" className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] text-[13.5px] font-bold" data-home-punch><Fingerprint size={16} aria-hidden />{todayRow?.in_at ? "Punch out" : "Punch in"}</Link>}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-home-tiles>
        <Tile k="work" hue="var(--color-blue)" Icon={ListTodo} title="My work" figure={home.jobs.length} unit={home.jobs.length === 1 ? "open job" : "open jobs"}
          sub={<>{given.length} given to you · {busy} in progress · {home.doneToday} done today</>}
          badge={fresh.length > 0 && <span className="inline-flex items-center gap-1.5 min-h-7 py-0.5 pl-0.5 pr-2.5 rounded-full bg-[var(--color-red)] text-white text-[12px] font-bold" data-home-new-work><span className="sr-only">{fresh.length}</span><FlapMini value={fresh.length} /> new</span>}
          onOpen={openWork}>
          {home.jobs.length === 0 ? <span className="text-[13px] text-steel">Nothing on you right now.</span> : (
            <span className="block space-y-1.5">
              {home.jobs.slice(0, 3).map((j) => (
                <span key={j.id} className="flex items-center gap-2 min-w-0 text-[13.5px]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", j.status === "in_progress" ? "bg-[var(--color-blue)]" : "bg-[var(--color-label-3)]")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold">{j.title}{j.place ? <span className="font-normal text-steel"> · {j.place}</span> : null}</span>
                  {PRI[j.priority] && <span className={cn("shrink-0 h-6 px-2 rounded-full text-[11px] font-bold grid place-items-center", PRI[j.priority].cls)}>{PRI[j.priority].label}</span>}
                </span>))}
            </span>)}
        </Tile>

        <Tile k="lists" hue="var(--color-green)" Icon={ListChecks} title="My checklists" figure={duties ? <FlapPercent value={(ticks / duties) * 100} size="xs" tile="40px" bare bar={false} say={`${ticks} of ${duties} duties done`} /> : "—"} unit={duties ? `${ticks} of ${duties} duties done` : undefined}
          sub={home.lists.length ? home.lists.map((l) => l.name).join(" · ") : "No lists for you yet"} onOpen={() => setOpen("lists")}>
          {duties > 0 && <span className="block h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><span className="block h-full rounded-full transition-all" style={{ width: `${(ticks / duties) * 100}%`, background: ticks >= duties ? "var(--color-green)" : "var(--color-orange)" }} /></span>}
        </Tile>

        <Tile k="attendance" hue="var(--color-violet)" Icon={CalendarDays} title="Attendance" figure={<FlapShuffle value={present} pad={0} size="xs" tile="40px" bare say={`${present} days this month`} />} unit={`day${present === 1 ? "" : "s"} this month`}
          sub={<>Today: {todayRow?.in_at ? <>in {hm(todayRow.in_at)}{todayRow.out_at ? <> · out {hm(todayRow.out_at)}</> : null}</> : onLeave ? "on leave" : "not punched in"}{hours ? <> · {Math.round(hours)} h this month</> : null}</>}
          onOpen={() => setOpen("attendance")}>
          <span className="flex gap-1.5" aria-label="The last seven days">
            {week.map((d) => (
              <span key={d} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span className={cn("h-7 w-full max-w-9 rounded-lg grid place-items-center", was(d) ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : leaveOn(d) ? "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]", d === today && "ring-2 ring-[var(--color-label-3)]")}>
                  {was(d) ? <Check size={14} strokeWidth={3} aria-hidden /> : leaveOn(d) ? <Plane size={12} aria-hidden /> : null}
                </span>
                <span className="text-[10.5px] text-steel">{new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
              </span>))}
          </span>
        </Tile>

        <Tile k="leave" hue="var(--color-cyan)" Icon={Plane} title="Leave" figure={yearLeave} unit={`day${yearLeave === 1 ? "" : "s"} taken this year`}
          sub={next ? <>Next: {dmy(next.from_date)}{next.to_date !== next.from_date ? ` → ${dmy(next.to_date)}` : ""} · {LEAVE_KIND[next.kind]}</> : waiting.length ? <>{waiting.length} waiting for an answer</> : "No leave coming up"}
          badge={lastDecided && lastDecided.decided_at && Date.now() - new Date(lastDecided.decided_at).getTime() < 3 * 86400000 && <span className={cn("h-7 px-2.5 rounded-full text-[12px] font-bold grid place-items-center", LEAVE_STATE[lastDecided.status].cls)} data-home-leave-news>{LEAVE_STATE[lastDecided.status].label}</span>}
          onOpen={() => setOpen("leave")}>
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[var(--color-fill)] text-[13px] font-bold">Apply for leave <ChevronRight size={14} aria-hidden /></span>
        </Tile>

        <Tile k="salary" hue="var(--color-orange)" Icon={Wallet} title="Salary" figure={estimate != null ? formatINR(estimate, { whole: true }) : "—"} unit={estimate != null ? "so far this month" : undefined}
          sub={home.pay ? <>{formatINR(home.pay.amount, { whole: true })} {home.pay.basis === "monthly" ? "a month" : "a day"} · {present} day{present === 1 ? "" : "s"} counted{owed ? <> · advance {formatINR(owed, { whole: true })}</> : null}</> : "Your pay rate is not set yet — the owner sets it"}
          onOpen={() => setOpen("salary")}>
          {lastSlip && <span className="flex items-center gap-2 text-[13px] min-w-0"><FileText size={14} className="shrink-0 text-steel" aria-hidden /><span className="truncate">{monthName(lastSlip.month)}: <b className="num">{formatINR(Number(lastSlip.net), { whole: true })}</b> · {lastSlip.paid_at ? "paid" : "not paid yet"}</span></span>}
        </Tile>

        <Tile k="messages" hue="var(--color-tint)" Icon={MessagesSquare} title="Messages" figure={<FlapShuffle value={home.unread} pad={0} size="xs" tile="40px" bare say={`${home.unread} new`} />} unit={home.unread === 1 ? "new answer" : "new answers"}
          sub="The owner's answers to your feedback and complaints" href="/voice"
          badge={home.unread > 0 && <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-red)]" aria-hidden />} />
      </div>

      <Link href="/me" className="feather !rounded-[22px] p-4 flex items-center gap-3 min-w-0 hover:brightness-[1.04]" data-home-tile="me">
        <span className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center bg-[var(--color-fill)]"><UserRound size={20} aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold truncate">{home.fullName}</span><span className="block text-[13px] text-steel truncate">Your details, sign-in and this device — Settings</span></span>
        <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
      </Link>

      {/* ── the full views ─────────────────────────────────────────────────────────────────────── */}
      <Sheet open={open === "work"} onClose={() => setOpen(null)} title="My work" wide>
        <div className="space-y-2" data-home-work>
          {home.jobs.length === 0 && <p className="text-[14px] text-steel py-6 text-center">Nothing on you right now. New jobs for your team are on Work.</p>}
          {home.jobs.map((j) => (
            <div key={j.id} className="rounded-2xl bg-[var(--color-fill)] p-3.5 flex items-start gap-3 min-w-0">
              <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", j.status === "in_progress" ? "bg-[var(--color-blue)]" : "bg-[var(--color-label-3)]")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-snug">{j.title}</div>
                <div className="mt-0.5 text-[12.5px] text-steel">{[j.place, j.status === "in_progress" ? "you are on it" : j.assigned_to === me ? "given to you" : "waiting", j.due_at ? `due ${hm(j.due_at)}` : null, j.guest_impact ? "a guest is waiting" : null].filter(Boolean).join(" · ")}</div>
              </div>
              {PRI[j.priority] && <span className={cn("shrink-0 h-6 px-2 rounded-full text-[11px] font-bold grid place-items-center", PRI[j.priority].cls)}>{PRI[j.priority].label}</span>}
            </div>))}
          <Link href="/work" className="svc-btn go w-full !mt-4">Open Work</Link>
        </div>
      </Sheet>

      <Sheet open={open === "lists"} onClose={() => setOpen(null)} title="My checklists" wide>
        <ListsView home={home} done={done} setDone={setDone} />
      </Sheet>

      <Sheet open={open === "attendance"} onClose={() => setOpen(null)} title={`Attendance · ${monthName(today)}`} wide>
        <AttendanceView home={home} present={present} hours={hours} />
      </Sheet>

      <Sheet open={open === "leave"} onClose={() => setOpen(null)} title="Leave" wide>
        <LeaveView home={home} />
      </Sheet>

      <Sheet open={open === "salary"} onClose={() => setOpen(null)} title="Salary" wide>
        <SalaryView home={home} present={present} daysInMonth={daysInMonth} estimate={estimate} owed={owed} />
      </Sheet>
    </div>
  );
}

function ListsView({ home, done, setDone }: { home: Home; done: Record<string, Record<string, { name: string; at: string }>>; setDone: (f: (d: Record<string, Record<string, { name: string; at: string }>>) => Record<string, Record<string, { name: string; at: string }>>) => void }) {
  const toast = useToast(); const [, start] = useTransition();
  const toggle = (id: string, i: number) => {
    const was = done[id] ?? {}; const on = !was[String(i)];
    setDone((d) => ({ ...d, [id]: on ? { ...was, [String(i)]: { name: "You", at: new Date().toISOString() } } : Object.fromEntries(Object.entries(was).filter(([k]) => k !== String(i))) }));
    start(async () => { const r = await tick(id, i, on); if ("error" in r) { toast(r.error!, "err"); setDone((d) => ({ ...d, [id]: was })); } else setDone((d) => ({ ...d, [id]: r.run.done })); });
  };
  if (!home.lists.length) return <p className="text-[14px] text-steel py-6 text-center">No lists for you yet. The owner or a manager sets them up on Checklists.</p>;
  return (
    <div className="space-y-4" data-home-lists>
      {home.lists.map((l) => (
        <section key={l.id} className="rounded-2xl bg-[var(--color-fill)] overflow-hidden">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2"><span className="font-bold text-[15px] flex-1 truncate">{l.name}</span><span className="text-[12.5px] text-steel num">{Object.keys(done[l.id] ?? {}).length}/{l.items.length}</span></div>
          <ul>{l.items.map((it, i) => { const d = (done[l.id] ?? {})[String(i)]; return (
            <li key={i}><button type="button" onClick={() => toggle(l.id, i)} aria-pressed={!!d} className="!min-h-12 w-full flex items-center gap-3 px-4 py-2 text-left border-t border-[var(--color-separator)]">
              <span className={cn("h-6 w-6 shrink-0 rounded-lg grid place-items-center border-2", d ? "bg-[var(--color-green)] border-[var(--color-green)] text-[var(--color-on-tint)]" : "border-[var(--color-label-3)]")}>{d && <Check size={14} strokeWidth={3.5} aria-hidden />}</span>
              <span className="min-w-0 flex-1"><span className={cn("block text-[14.5px] font-semibold", d && "line-through text-steel")}>{it}</span>{d && <span className="block text-[12px] text-steel">{d.name} · {hm(d.at)}</span>}</span>
            </button></li>); })}</ul>
        </section>))}
      <Link href="/tasks" className="btn btn-gray w-full">All checklists</Link>
    </div>
  );
}

function AttendanceView({ home, present, hours }: { home: Home; present: number; hours: number }) {
  const month = home.today.slice(0, 7);
  const first = new Date(`${month}-01T00:00:00`); const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;   // Monday first
  const rowOf = (d: string) => home.attendance.find((a) => a.work_date === d);
  return (
    <div className="space-y-4" data-home-attendance>
      <div className="grid grid-cols-3 gap-2">
        {[["Days present", String(present)], ["Hours", String(Math.round(hours))], ["Days so far", String(Number(home.today.slice(8, 10)))]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-[var(--color-fill)] p-3 text-center"><div className="font-display num text-[26px] leading-none">{v}</div><div className="mt-1 text-[12px] text-steel">{k}</div></div>))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="text-center text-[11px] font-bold text-steel">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`; const r = rowOf(d); const future = d > home.today;
          const lv = home.leave.some((l) => l.status === "approved" && l.from_date <= d && l.to_date >= d);
          return (
            <div key={d} className={cn("min-w-0 rounded-xl p-1.5 min-h-[58px] flex flex-col", r?.in_at ? "bg-[var(--color-green-2)]" : lv ? "bg-[var(--color-cyan-2)]" : "bg-[var(--color-fill)]", future && "opacity-50", d === home.today && "ring-2 ring-[var(--color-label-3)]")}>
              <span className="text-[12px] font-bold num">{i + 1}</span>
              {r?.in_at ? <span className="mt-auto text-[10px] leading-tight text-steel truncate">{hm(r.in_at)}{r.out_at ? <><br />{hm(r.out_at)}</> : null}</span> : lv ? <span className="mt-auto text-[10px] text-steel">Leave</span> : null}
            </div>);
        })}
      </div>
      <p className="text-[12.5px] text-steel">Green: you were in (in and out times). Blue: approved leave. A wrong day? Tell your manager — they correct it on Staff → attendance.</p>
      {home.attend && <Link href="/attendance" className="svc-btn go w-full"><Fingerprint size={18} aria-hidden /> My attendance — punch in or out</Link>}
    </div>
  );
}

function LeaveView({ home }: { home: Home }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [kind, setKind] = useState("casual"); const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const days = from && to && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
  const send = () => start(async () => {
    setErr(null); const r = await askLeave(from, to || from, kind, reason);
    if ("error" in r) setErr(r.error!); else { toast("Leave asked — you will see the answer here"); setFrom(""); setTo(""); setReason(""); }
  });
  const withdraw = (id: string) => start(async () => { const r = await cancelLeave(id); if ("error" in r) toast(r.error!, "err"); else toast("Withdrawn"); });
  const sorted = useMemo(() => [...home.leave].sort((a, b) => b.from_date.localeCompare(a.from_date)), [home.leave]);
  return (
    <div className="space-y-5" data-home-leave>
      <section className="rounded-2xl bg-[var(--color-fill)] p-4 space-y-3" data-leave-form>
        <div className="text-[15px] font-bold">Apply for leave</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0"><span className="text-[12.5px] font-semibold text-steel">First day</span><input type="date" className="mt-1" value={from} min={home.today} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} data-leave-from /></label>
          <label className="block min-w-0"><span className="text-[12.5px] font-semibold text-steel">Last day</span><input type="date" className="mt-1" value={to} min={from || home.today} onChange={(e) => setTo(e.target.value)} data-leave-to /></label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of leave">
          {Object.entries(LEAVE_KIND).map(([k, v]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("chip", kind === k && "on")} data-leave-kind={k}>{v}</button>)}
        </div>
        <label className="block"><span className="text-[12.5px] font-semibold text-steel">Reason — if you like</span><textarea className="mt-1" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A family wedding · fever · going home" data-leave-reason /></label>
        {err && <p className="text-[13.5px] font-semibold text-chili" role="alert">{err}</p>}
        <button type="button" disabled={pending || !from} onClick={send} className="svc-btn go w-full" data-leave-send><Plane size={18} aria-hidden />{days ? `Ask for ${days} day${days === 1 ? "" : "s"}` : "Ask for leave"}</button>
      </section>
      <section>
        <div className="text-[13px] font-bold text-steel mb-2">Your leave</div>
        {sorted.length === 0 ? <p className="text-[14px] text-steel">Nothing asked yet.</p> : (
          <div className="space-y-2">
            {sorted.map((l) => {
              const canWithdraw = l.status === "requested" || (l.status === "approved" && l.from_date > home.today);
              return (
                <div key={l.id} className="rounded-2xl bg-[var(--color-fill)] p-3.5 flex items-start gap-3 min-w-0" data-leave-row={l.status}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold">{dmy(l.from_date)}{l.to_date !== l.from_date ? ` → ${dmy(l.to_date)}` : ""} <span className="font-normal text-steel">· {Number(l.days)} day{Number(l.days) === 1 ? "" : "s"} · {LEAVE_KIND[l.kind] ?? l.kind}</span></div>
                    {(l.reason || l.decision_note) && <div className="mt-0.5 text-[12.5px] text-steel">{[l.reason, l.decision_note ? `Answer: ${l.decision_note}` : null].filter(Boolean).join(" — ")}</div>}
                  </div>
                  <span className={cn("shrink-0 h-7 px-2.5 rounded-full text-[12px] font-bold grid place-items-center", LEAVE_STATE[l.status].cls)}>{LEAVE_STATE[l.status].label}</span>
                  {canWithdraw && <button type="button" disabled={pending} onClick={() => withdraw(l.id)} className="shrink-0 h-11 w-11 grid place-items-center rounded-xl hover:bg-[var(--color-fill-2)] text-steel" aria-label="Withdraw this leave" title="Withdraw"><X size={17} /></button>}
                </div>);
            })}
          </div>)}
      </section>
    </div>
  );
}

function SalaryView({ home, present, daysInMonth, estimate, owed }: { home: Home; present: number; daysInMonth: number; estimate: number | null; owed: number }) {
  const pdf = async (l: Slip) => {
    const { tablesPdf } = await import("@/lib/tablePdf"); const { download } = await import("@/lib/xlsx");
    const inr = (n: number) => `Rs ${Math.round(Number(n)).toLocaleString("en-IN")}`;
    const rows = (xs: [string, number][]) => xs.filter(([, v]) => Number(v) !== 0).map(([k, v]) => [k, Number(v)] as [string, number]);
    const bytes = await tablesPdf(`Payslip · ${home.fullName}`, `${home.property} · ${monthName(l.month)} · ${home.title}`, [
      { title: "Attendance", head: ["", ""], rows: [["Days in the month", l.days_in_month], ["Days present", l.days_present], ["Paid days", Number(l.paid_days)], ["Rate", `${inr(l.rate)} ${l.basis === "monthly" ? "a month" : "a day"}`]] },
      { title: "Earnings", head: ["", "Amount"], rows: rows([["Pay for paid days", l.gross], ["Bonus", l.bonus]]) },
      { title: "Deductions", head: ["", "Amount"], rows: rows([["PF (employee 12%)", l.pf_employee], ["ESI (employee 0.75%)", l.esi_employee], ["Advance recovered", l.advances], ["Other", l.other_deduction]]) },
      { title: "Net pay", head: ["", "Amount"], rows: [["Paid to you", Number(l.net)], ...(l.paid_at ? [["Paid on", `${new Date(l.paid_at).toLocaleDateString("en-IN")} · ${(l.paid_method ?? "").toUpperCase()}`] as [string, string]] : [])] },
    ]);
    download(`payslip-${l.month.slice(0, 7)}.pdf`, new Uint8Array(bytes), "application/pdf");
  };
  return (
    <div className="space-y-5" data-home-salary>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[var(--color-fill)] p-3.5"><div className="text-[12px] text-steel">Your rate</div><div className="mt-1 font-display num text-[22px] leading-none">{home.pay ? formatINR(home.pay.amount, { whole: true }) : "—"}</div><div className="mt-1 text-[12px] text-steel">{home.pay ? (home.pay.basis === "monthly" ? "a month" : "a day") : "not set yet"}</div></div>
        <div className="rounded-2xl bg-[var(--color-fill)] p-3.5"><div className="text-[12px] text-steel">So far this month</div><div className="mt-1 font-display num text-[22px] leading-none">{estimate != null ? formatINR(estimate, { whole: true }) : "—"}</div><div className="mt-1 text-[12px] text-steel">{present} of {daysInMonth} days · an estimate</div></div>
      </div>
      <p className="text-[12.5px] text-steel">The month&apos;s pay is worked out by the owner from attendance, then PF/ESI and any advance come off — the payslip below is the final word.</p>
      {owed > 0 && (
        <section><div className="text-[13px] font-bold text-steel mb-2">Advances to come off your pay · {formatINR(owed, { whole: true })}</div>
          <div className="space-y-1.5">{home.advances.map((a, i) => <div key={i} className="flex items-center gap-2 rounded-xl bg-[var(--color-fill)] px-3.5 py-2.5 text-[13.5px]"><span className="flex-1 min-w-0 truncate">{dmy(a.given_on)}{a.note ? ` · ${a.note}` : ""}</span><b className="num">{formatINR(a.amount, { whole: true })}</b></div>)}</div>
        </section>)}
      <section>
        <div className="text-[13px] font-bold text-steel mb-2">Payslips</div>
        {home.payslips.length === 0 ? <p className="text-[14px] text-steel">No finalised month yet.</p> : (
          <div className="space-y-2">
            {home.payslips.map((l) => (
              <div key={l.id} className="rounded-2xl bg-[var(--color-fill)] p-3.5 flex items-center gap-3 min-w-0" data-payslip-row>
                <div className="min-w-0 flex-1"><div className="text-[14.5px] font-bold">{monthName(l.month)}</div><div className="text-[12.5px] text-steel">{l.days_present} days present · {l.paid_at ? `paid ${new Date(l.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "not paid yet"}</div></div>
                <b className="num text-[17px]">{formatINR(Number(l.net), { whole: true })}</b>
                <button type="button" onClick={() => void pdf(l)} className="h-11 w-11 grid place-items-center rounded-xl bg-[var(--color-bg-2)]" aria-label={`Payslip for ${monthName(l.month)}`} title="Payslip (PDF)" data-home-payslip><FileText size={17} /></button>
              </div>))}
          </div>)}
      </section>
    </div>
  );
}
