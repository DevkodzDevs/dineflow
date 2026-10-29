"use client";
import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus, ClipboardList, ShieldCheck, ShieldX, AlertTriangle, Star, ChevronDown, ChevronsUpDown, ChevronsDownUp, Clock, Brush, RotateCcw } from "lucide-react";
import { deptOf } from "@/components/shell/sections";
import { useLive } from "@/lib/useLive";
import { Button, Card, Field, Segmented, cn, Empty, useToast, FlapSpell } from "@/components/ui";
import { fmtSince } from "@/lib/format";
import { addTask, setCondition, inspectRoom, buildSheet } from "./actions";
import { setRoomStatus } from "../rooms/actions";
import { takeJob, finishJob, assignJob } from "../cleaning/actions";

type Task = { id: string; kind: string; status: string; notes: string | null; created_at: string; rooms: { number: string; floor: number } | null;
  assigned_to?: string | null; assigned_by?: string | null; assigned_at?: string | null; taken_by?: string | null; taken_at?: string | null };   // 0111
type Person = { id: string; full_name: string; role: string; position_title: string | null; department?: string | null; position?: string | null };
type Condition = "dirty" | "clean" | "inspected" | "pickup";
type Room = { id: string; number: string; floor: number; status: string; condition: Condition; condition_at: string };
type Stay = { room_id: string; check_out: string; guests: { full_name: string; vip: boolean } | null };
type Done = { id: string; kind: string; done_at: string; done_by?: string | null; taken_at?: string | null; rooms: { number: string } | null };

/* the wide room card's actions: small pills sized to their words, left-aligned — not a bar across the
   card, which read as one big button. The main move (Pass / Cleaned / Touched up) is the green wash;
   the others are a hairline outline with the word in its meaning's colour (Fail red, Pickup blue,
   Dirty grey), and take their colour as a faint wash on hover. 30px to the eye; the finger gets 44
   from an invisible ::before (7px above and below, 2px each side), the way .switch does it. */
/* the footer strip's sections: the main move on a soft green, the rest in their colour on the strip */
const FOOT = {
  go: "!bg-[var(--color-green-2)] text-[var(--color-tint)] hover:brightness-110",
  red: "!bg-transparent text-[var(--color-red)] hover:!bg-[var(--color-red-2)]",
  blue: "!bg-transparent text-[var(--color-blue)] hover:!bg-[var(--color-blue-2)]",
  quiet: "!bg-transparent text-[var(--color-label-2)] hover:!bg-[var(--color-fill)] hover:text-[var(--color-label)]",
} as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-17" → "17 Sep" (en-IN would say "Sept") */
const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1] ?? ""}`;
/** The colours housekeeping boards have used for decades: red dirty, amber cleaned-not-yet-inspected, green inspected, blue pickup. */
const COND: Record<Condition, { label: string; chip: string; rail: string }> = {
  dirty:     { label: "Dirty",     chip: "bg-chili-2 text-chili",                                rail: "bg-[var(--color-red)]" },
  clean:     { label: "Clean",     chip: "bg-[rgb(255_179_64/.18)] text-[var(--color-orange)]",  rail: "bg-[var(--color-orange)]" },
  inspected: { label: "Inspected", chip: "bg-[var(--color-green-2)] text-[var(--color-tint)]",   rail: "bg-[var(--color-tint)]" },
  pickup:    { label: "Pickup",    chip: "bg-sky-2 text-[var(--color-blue)]",                    rail: "bg-[var(--color-blue)]" },
};
const KIND: Record<string, string> = { clean: "Clean", stayover: "Stayover service", turndown: "Turndown", pickup: "Pickup / touch-up", maintenance: "Maintenance" };

/**
 * The housekeeping module a hotel PMS ships: a live room-status board that is housekeeping's own
 * word (dirty → clean → inspected), the supervisor's sign-off, the day's task sheet in one press,
 * and the discrepancy report that used to wait for the night audit.
 */
export function HousekeepingClient({ today, tasks, rooms, stays, done, canInspect, inspectRule, people = [], me = "" }:
  { today: string; tasks: Task[]; rooms: Room[]; stays: Stay[]; done: Done[]; canInspect: boolean; inspectRule: boolean; people?: Person[]; me?: string }) {
  // whose a task is (0111): the names on the card, and the people a supervisor gives tasks to — housekeeping first
  const nameOf = (id: string | null | undefined) => (id ? (id === me ? "You" : people.find((p) => p.id === id)?.full_name ?? "Someone") : null);
  /* Who a task can be given to is decided by the work (2026-10-21, the owner: "Give to shows the owner — show the job
     positions by the work"): a clean, a stayover, a turndown or a pickup goes to Housekeeping; maintenance to
     Engineering & maintenance — by each person's team (deptOf: their department, else their position's, else their
     role's). Never the owner or a manager. A property with nobody in that team yet is offered its housekeeping-role
     and general staff. Whoever has the task now stays in the list, so the select can show them. */
  const crewFor = (t: Task) => {
    const team = t.kind === "maintenance" ? "engineering" : "housekeeping";
    const ok = (p: Person) => p.role !== "owner" && p.role !== "manager";
    let list = people.filter((p) => ok(p) && deptOf(p.role, p.department ?? null, p.position ?? null) === team);
    if (!list.length) list = people.filter((p) => ok(p) && (p.role === "housekeeping" || p.role === "employee"));
    const now = t.assigned_to && !list.some((p) => p.id === t.assigned_to) ? people.filter((p) => p.id === t.assigned_to) : [];
    return [...now, ...list.sort((a, b) => a.full_name.localeCompare(b.full_name))];
  };
  const [pending, start] = useTransition(); const toast = useToast();
  const [f, setF] = useState({ room: "", kind: "clean", notes: "" });
  /* On a phone the board and the task sheet are two tabs, not one page five screens long: a
     housekeeper is either walking the rooms or working the list. From sm both show, as before. */
  const [view, setView] = useState<"rooms" | "tasks">("rooms");
  /* Floors fold: the first is open, opening another closes it, and "all" opens every one. */
  const [openFloor, setOpenFloor] = useState<number | "all" | null>(() => [...new Set(rooms.map((r) => r.floor))].sort((x, y) => x - y)[0] ?? null);
  useLive(["housekeeping_tasks", "rooms", "bookings"]);
  const byRoom = useMemo(() => Object.fromEntries(stays.map((s) => [s.room_id, s])) as Record<string, Stay>, [stays]);
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const count = (c: Condition) => rooms.filter((r) => r.status !== "maintenance" && r.condition === c).length;
  const ooo = rooms.filter((r) => r.status === "maintenance").length;

  /* Where the front office and housekeeping disagree about a room. Every PMS prints this at the
     night audit; here it is live, and empty on a good day. */
  const discrepancies = useMemo(() => {
    const out: { room: string; what: string; why: string }[] = [];
    rooms.forEach((r) => {
      const s = byRoom[r.id];
      if (r.status === "occupied" && !s) out.push({ room: r.number, what: "Shown occupied", why: "Nobody is checked in" });
      if (s && r.status !== "occupied") out.push({ room: r.number, what: `${s.guests?.full_name ?? "A guest"} is checked in`, why: `Room marked ${r.status}` });
      if (r.status === "available" && r.condition === "dirty") out.push({ room: r.number, what: "On sale but dirty", why: "Housekeeping marked it dirty" });
      if (s && s.check_out < today) out.push({ room: r.number, what: `${s.guests?.full_name ?? "The guest"} is past check-out`, why: `Was due out ${dayMonth(s.check_out)}` });
    });
    return out;
  }, [rooms, byRoom, today]);

  /* Each room and each task waits on its own answer only (2026-10-18): one shared `pending` greyed every room's
     buttons while any one tap was answering, so marking room 101 clean froze the whole floor for the round trip. */
  const [busy, setBusy] = useState<Record<string, true>>({});
  const act = (fn: () => Promise<unknown>, key?: string) => {
    if (key) setBusy((b) => ({ ...b, [key]: true }));
    start(async () => {
      try { const r = (await fn()) as { error?: string } | null; if (r && r.error) toast(r.error, "err"); }
      finally { if (key) setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); }
    });
  };
  const fail = (r: Room) => { const note = window.prompt(`Room ${r.number} — what failed?`); if (note === null) return; act(() => inspectRoom(r.id, false, note), r.id); };
  const sheet = () => start(async () => { const r = await buildSheet(); if (r.error) toast(r.error, "err"); else toast(r.added ? `${r.added} task${r.added === 1 ? "" : "s"} added` : "Sheet already complete"); });

  const cols = [{ key: "pending", title: "To do" }, { key: "in_progress", title: "In progress" }];
  return (
    <div className="space-y-6">
      {/* the room status board */}
      <div className="toolbar">
        <div className="toolbar-group text-xs font-semibold">
          {(["dirty", "clean", "inspected", "pickup"] as const).map((c) => <span key={c} className={cn("rounded-full px-3 py-1.5", COND[c].chip)}>{COND[c].label} <span className="num opacity-70">{count(c)}</span></span>)}
          <span className="rounded-full px-3 py-1.5 bg-card border border-line">Out of order <span className="num opacity-70">{ooo}</span></span>
        </div>
        <div className="toolbar-group toolbar-end">
          <Button variant="outline" disabled={pending} onClick={sheet} title="Service occupied rooms, clean dirty ones"><ClipboardList size={15} /> Build today's sheet</Button>
        </div>
      </div>
      {inspectRule && !canInspect && <p className="text-xs text-steel -mt-3">Supervisor signs off rooms</p>}

      <div className="sm:hidden">
        <Segmented value={view} onChange={setView} className="w-full [&>button]:flex-1 [&>button]:!h-11"
          options={[{ value: "rooms", label: <span className="inline-flex items-center gap-1.5">Rooms <span className="num opacity-60">{rooms.length}</span></span> },
                    { value: "tasks", label: <span className="inline-flex items-center gap-1.5">Tasks <span className="num opacity-60">{tasks.length}</span></span> }]} />
      </div>

      <div className={cn("space-y-6", view !== "rooms" && "max-sm:hidden")}>
      {discrepancies.length > 0 && (
        /* What the board and the bookings disagree on (redrawn 2026-10-23, the owner: "not looking good"): a head with its
           count, then one row each — the room on its flap tiles, what is wrong in bold, why in a quiet line under it */
        <section className="feather overflow-hidden" data-discrepancies>
          <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-separator)]">
            <span className="h-9 w-9 shrink-0 rounded-[11px] grid place-items-center bg-[var(--color-orange-2)] text-[var(--color-orange)]" aria-hidden><AlertTriangle size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">Needs a look</span><span className="block text-[12px] text-steel">Board and bookings disagree</span></span>
            <span className="num shrink-0 h-7 min-w-7 px-2 rounded-full bg-[var(--color-orange-2)] text-[var(--color-orange)] text-[13px] font-bold grid place-items-center">{discrepancies.length}</span>
          </header>
          <ul className="divide-y divide-[var(--color-separator)]">{discrepancies.map((d, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 min-w-0" data-discrepancy={d.room}>
              <FlapSpell text={d.room} size="xs" tile="28px" say={`Room ${d.room}`} className="shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{d.what}</span><span className="block text-[12.5px] text-steel leading-snug">{d.why}</span></span>
            </li>))}</ul>
        </section>
      )}

      {/* Floors fold. The first is open; opening another closes it; Open all shows the lot. A board of
          three floors was three screens of cards before the task list on a phone. */}
      {floors.length > 1 && (
        /* the board's own head: what it is, how many floors, and how they fold — one at a time, or
           all open — as the app's segmented switch rather than a loose pill beside a caption */
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel">Floors</span>
            <span className="num h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{floors.length}</span>
          </div>
          <div role="radiogroup" aria-label="How floors open" className="inline-flex p-1 rounded-xl bg-[var(--color-fill)] shrink-0">
            {([["one", "One at a time", <ChevronsDownUp key="i" size={14} />], ["all", "All open", <ChevronsUpDown key="i" size={14} />]] as const).map(([k, label, icon]) => {
              const on = k === "all" ? openFloor === "all" : openFloor !== "all";
              return (
                <button key={k} type="button" role="radio" aria-checked={on}
                  onClick={() => setOpenFloor(k === "all" ? "all" : openFloor === "all" ? (floors[0] ?? null) : openFloor)}
                  className={cn("h-9 px-3 rounded-[10px] inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors",
                    on ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_3px_rgb(0_0_0/.25)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
                  {icon}<span className="max-[360px]:hidden">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {floors.map((fl) => { const on = openFloor === "all" || openFloor === fl; const here = rooms.filter((r) => r.floor === fl);
        const dirty = here.filter((r) => r.status !== "maintenance" && r.condition === "dirty").length; const outN = here.filter((r) => r.status === "maintenance").length;
        return (
        <section key={fl} className={cn("feather transition-shadow", on && "shadow-[var(--shadow-pop)]")}>
          {/* a floor's head reads as the control it is: its number in a tile, its name, its state as
              tags, and the chevron in a round button that turns when the floor opens */}
          <button type="button" onClick={() => setOpenFloor(openFloor === "all" ? fl : on ? null : fl)} aria-expanded={on}
            className={cn("w-full min-h-[64px] px-3.5 sm:px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-[var(--color-fill)]", on ? "rounded-t-[inherit] border-b border-[var(--color-separator)]" : "rounded-[inherit]")}>
            <span className={cn("h-10 w-10 rounded-xl grid place-items-center font-display text-lg shrink-0 transition-colors", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] text-[var(--color-label)]")}>{fl}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight">Floor {fl}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="num h-5 px-2 rounded-full bg-[var(--color-fill)] text-[11px] font-semibold text-[var(--color-label-2)] inline-flex items-center">{here.length} room{here.length === 1 ? "" : "s"}</span>
                {dirty > 0 && <span className="num h-5 px-2 rounded-full bg-[var(--color-red-2)] text-[11px] font-semibold text-[var(--color-red)] inline-flex items-center">{dirty} dirty</span>}
                {outN > 0 && <span className="num h-5 px-2 rounded-full bg-[var(--color-red-2)] text-[11px] font-semibold text-[var(--color-red)] inline-flex items-center">{outN} out of order</span>}
                {!dirty && !outN && <span className="h-5 px-2 rounded-full bg-[var(--color-green-2)] text-[11px] font-semibold text-[var(--color-green)] inline-flex items-center">all clear</span>}
              </span>
            </span>
            <span className={cn("h-9 w-9 rounded-full grid place-items-center shrink-0 transition-colors", on ? "bg-[var(--color-fill-2)]" : "bg-[var(--color-fill)]")}>
              <ChevronDown size={17} className={cn("text-[var(--color-label-2)] transition-transform duration-200", on && "rotate-180")} />
            </span>
          </button>
          {on && <div className="p-3 sm:p-2.5 lg:p-4">
          {/* One room to a row on a phone, its actions in a single row of equal buttons (the phone
              card, kept as it is). From sm — an iPad, a laptop — three across, four from 1800px (a
              1920 screen), with the wide card below: auto-fill put four or five squeezed cards in a
              row and a four-tile dock cut "Pickup" to "Pick…". */}
          <div className="grid grid-cols-1 min-[520px]:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:grid-cols-3 min-[1800px]:!grid-cols-4 sm:items-start gap-3 sm:gap-2.5 lg:gap-3.5" data-board>
            {rooms.filter((r) => r.floor === fl).map((r) => {
              const s = byRoom[r.id]; const out = r.status === "maintenance"; const c = COND[r.condition] ?? COND.clean;
              const sellable = r.condition === "inspected" || (r.condition === "clean" && !inspectRule);
              const waiting = !out && r.condition === "clean" && !canInspect && inspectRule;
              const dueOut = !!s && s.check_out <= today;
              /* Every move the room allows, all on show, as one dock of equal tiles — icon over label —
                 along the foot of the card. The move you will make most is green; Fail is red,
                 Pickup blue, Dirty grey. A room with nothing pending shows its good news as the
                 first tile. Same shape on every card, a laptop or a phone. */
              type Tile = { key: string; label: string; icon: ReactNode; tone: "go" | "red" | "blue" | "quiet"; run: () => void };
              const tiles: Tile[] = out ? [] : [
                ...(r.condition === "dirty" ? [{ key: "clean", label: "Cleaned", icon: <Sparkles size={17} />, tone: "go" as const, run: () => act(() => setCondition(r.id, "clean"), r.id) }] : []),
                ...(r.condition === "pickup" ? [{ key: "touch", label: "Touched up", icon: <Sparkles size={17} />, tone: "go" as const, run: () => act(() => setCondition(r.id, "clean"), r.id) }] : []),
                ...(r.condition === "clean" && canInspect ? [
                  { key: "pass", label: "Pass", icon: <ShieldCheck size={17} />, tone: "go" as const, run: () => act(() => inspectRoom(r.id, true), r.id) },
                  { key: "fail", label: "Fail", icon: <ShieldX size={17} />, tone: "red" as const, run: () => fail(r) },
                ] : []),
                ...(sellable && s ? [{ key: "pickup", label: "Pickup", icon: <Brush size={17} />, tone: "blue" as const, run: () => act(() => setCondition(r.id, "pickup"), r.id) }] : []),
                ...(r.condition !== "dirty" ? [{ key: "dirty", label: "Dirty", icon: <RotateCcw size={17} />, tone: "quiet" as const, run: () => act(() => setCondition(r.id, "dirty"), r.id) }] : []),
              ];
              const hasMain = tiles.some((t) => t.tone === "go");
              const status = out || hasMain ? null : sellable ? (s ? "Occupied" : "Ready") : waiting ? "Sign-off" : null;
              const tone = out ? "var(--color-red)" : r.condition === "dirty" ? "var(--color-red)" : r.condition === "clean" ? "var(--color-orange)" : r.condition === "inspected" ? "var(--color-tint)" : "var(--color-blue)";
              const fix = out ? tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number) : undefined;
              /* the wide card's actions: every move, as small pills; a room out of order has one — back in
                 service (where its repair stands is on the second line) */
              type Seg = { key: string; label: string; icon: ReactNode; tone: keyof typeof FOOT; run: () => void };
              const segs: Seg[] = out
                ? [{ key: "service", label: "Back in service", icon: <Check size={14} />, tone: "quiet", run: () => act(() => setRoomStatus(r.id, "available"), r.id) }]
                : tiles.map((t) => ({ key: t.key, label: t.label, icon: t.icon, tone: t.tone, run: t.run }));
              const detail = out ? (fix ? (fix.status === "in_progress" ? "Being fixed" : "In repair") : "No repair task")
                : dueOut ? "Due out" : waiting ? "Awaiting sign-off" : s ? `Out ${dayMonth(s.check_out)}` : fmtSince(r.condition_at);
              return (
                <Fragment key={r.id}>
                {/* the wide card (sm and up), three quiet rows: the number and the condition as its pill; who
                    is in the room and the one thing to know about it; the actions as small pills */}
                <div data-room={r.number} className="@container hidden sm:flex feather relative overflow-hidden p-3 flex-col gap-2.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span data-num className="shrink-0"><FlapSpell text={r.number} size="xs" tile="26px" say={`Room ${r.number}`} /></span>
                    <span className={cn("ml-auto shrink-0 inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full text-[11px] font-semibold", out ? "bg-chili-2 text-chili" : c.chip)} data-cond>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} /><span data-cond-label>{out ? "Out of order" : c.label}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 text-[13px] leading-tight whitespace-nowrap" data-line title={`${out ? "Out of order" : c.label} since ${fmtSince(r.condition_at)} ago`}>
                    {s ? <><span className="font-semibold truncate">{s.guests?.full_name}</span>{s.guests?.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}</>
                      : out ? <span className={cn("truncate", fix?.notes ? "font-semibold" : "text-[var(--color-label-2)]")}>{fix?.notes || "Maintenance"}</span>
                        : <span className="text-[var(--color-label-2)] capitalize truncate">{r.status === "available" ? "Vacant" : r.status}</span>}
                    <span className="text-[var(--color-label-3)] shrink-0" aria-hidden>·</span>
                    <span className={cn("shrink-0", dueOut || out ? "text-[var(--color-red)] font-semibold" : "num text-[var(--color-label-2)]")}>{detail}</span>
                  </div>
                  {/* the actions as the card's footer strip — a hairline across, a tinted band from edge to edge,
                      one equal section per action split by hairlines (the Menu card's footer, which the owner
                      pointed at); the main move sits on a soft green */}
                  {segs.length > 0 && (
                    <div className="-mx-3 -mb-3 mt-auto grid border-t border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)] divide-x divide-[var(--color-separator)]" style={{ gridTemplateColumns: `repeat(${segs.length}, minmax(0, 1fr))` }} data-dock>
                      {segs.map((t) => (
                        <button key={t.key} type="button" disabled={!!busy[r.id]} onClick={t.run} aria-label={`${t.label} · room ${r.number}`}
                          className={cn("w-full min-w-0 inline-flex items-center justify-center gap-1.5 h-11 max-xl:h-10 !min-h-0 !rounded-none px-1.5 text-[12.5px] @max-[15rem]:text-[11.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 [&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:shrink-0", FOOT[t.tone])}>
                          <span className="hidden @[15rem]:contents">{t.icon}</span><span className="truncate">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={cn("feather relative p-4 pl-5 flex flex-col gap-3 min-w-0 sm:hidden")}>
                  {/* the state as a slim pill down the inside edge, clear of the rounded corners */}
                  <span aria-hidden className="absolute left-1.5 top-4 bottom-4 w-[3px] rounded-full" style={{ background: tone }} />

                  {/* the head (redrawn 2026-10-23, the owner: "not looking good"): the room number on flap tiles, then who is in
                      it — or what it is — in bold with the since-line under, and the condition as its pill on the right */}
                  <div className="flex items-center gap-3 min-w-0" data-room-head>
                    <FlapSpell text={r.number} size="xs" tile="34px" say={`Room ${r.number}`} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold leading-tight truncate">
                        {s ? <span className="inline-flex items-center gap-1 max-w-full"><span className="truncate">{s.guests?.full_name}</span>{s.guests?.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}</span>
                          : <span className="capitalize">{out ? "Maintenance" : r.status === "available" ? "Vacant" : r.status}</span>}
                      </div>
                      <div className="mt-1 num text-[12px] leading-tight text-[var(--color-label-2)] inline-flex items-center gap-1"><Clock size={12} aria-hidden />{c.label.toLowerCase()} · {fmtSince(r.condition_at)}</div>
                    </div>
                    <span className={cn("shrink-0 self-start inline-flex items-center gap-1.5 h-7 pl-2.5 pr-3 rounded-full text-[12px] font-semibold", out ? "bg-chili-2 text-chili" : c.chip)}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />{out ? "Out of order" : c.label}
                    </span>
                  </div>

                  {(s || dueOut || out) && <div className="flex flex-wrap items-center gap-1.5 text-[11px] min-h-5">
                    {s && <span className="num h-5 px-2 rounded-full bg-[var(--color-fill)] text-[var(--color-label-2)] inline-flex items-center">out {s.check_out.slice(5)}</span>}
                    {dueOut && <span className="h-5 px-2 rounded-full bg-[var(--color-red-2)] text-[var(--color-red)] font-semibold inline-flex items-center">Due out</span>}
                    {out && (() => { const fix = tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number); return fix?.notes ? <span className="min-w-0 max-w-full truncate text-[var(--color-red)]">{fix.notes}</span> : null; })()}
                  </div>}

                  {/* out of order: the repair's state and the way back, in the same dock as every other
                      room, so the row it sits in keeps one height */}
                  {out && (() => {
                    const fix = tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number);
                    const what = fix ? (fix.status === "in_progress" ? "Being fixed" : "In repair") : "No task";
                    return (
                      <div className="mt-auto flex gap-1 p-1 rounded-2xl bg-[var(--color-fill)]">
                        <div className="dock-tile flex-1 bg-[var(--color-red-2)] text-[var(--color-red)]" title={fix ? `${fix.notes || "Maintenance"} · ${fmtSince(fix.created_at)} ago` : "No repair task open — add one in Tasks"}>
                          <Wrench size={17} /><span>{what}</span>
                        </div>
                        <button type="button" disabled={!!busy[r.id]} onClick={() => act(() => setRoomStatus(r.id, "available"), r.id)} aria-label={`Back in service · room ${r.number}`} className="dock-tile dock-btn flex-1 dock-quiet">
                          <Check size={17} /><span>In service</span>
                        </button>
                      </div>
                    );
                  })()}

                  {!out && (tiles.length > 0 || status) && (
                    <div className="mt-auto flex gap-1 p-1 rounded-2xl bg-[var(--color-fill)]">
                      {status && (
                        <div className={cn("dock-tile flex-1", status === "Sign-off" ? "text-[var(--color-label-2)]" : "dock-go")} title={status === "Sign-off" ? "Awaiting a supervisor's sign-off" : status === "Ready" ? "Inspected and ready to sell" : "Guest in the room"}>
                          {status === "Sign-off" ? <ShieldCheck size={17} /> : <Check size={17} />}<span>{status}</span>
                        </div>
                      )}
                      {tiles.map((t) => (
                        <button key={t.key} type="button" disabled={!!busy[r.id]} onClick={t.run} aria-label={`${t.label} · room ${r.number}`}
                          className={cn("dock-tile dock-btn flex-1", t.tone === "go" && "dock-go", t.tone === "red" && "dock-red", t.tone === "blue" && "dock-blue", t.tone === "quiet" && "dock-quiet")}>
                          {t.icon}<span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </Fragment>
              );
            })}
          </div></div>}</section>
      ); })}
      {rooms.length === 0 && <p className="text-sm text-steel">No rooms yet</p>}
      </div>

      {/* the task sheet */}
      {/* The board gets two real columns before the form takes a side of its own: at lg the form's
          320px left each column ~290px and "Done · room ready" ran out of its button. Below xl the
          form and "Recently done" sit under the board, side by side. */}
      <div className={cn("grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start", view !== "tasks" && "max-sm:hidden")}>
        <div className="grid md:grid-cols-2 gap-4 min-w-0">
          {cols.map((c) => { const list = tasks.filter((t) => t.status === c.key); return (
            <section key={c.key} className={cn("rounded-[20px] p-3", c.key === "pending" ? "bg-sky-2" : "bg-champagne-2")}><div className="text-sm font-semibold px-1 pb-3">{c.title} <span className="num text-steel">{list.length}</span></div>
              <div className="space-y-3"><AnimatePresence>{list.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-4">
                  <div className="flex items-start gap-3"><span className="shrink-0 min-w-12 grid place-items-center" data-task-room>{t.rooms?.number ? <FlapSpell text={t.rooms.number} size="xs" tile="30px" say={`Room ${t.rooms.number}`} /> : <span className="keycard h-11 w-12 grid place-items-center font-display text-lg">—</span>}</span><div className="flex-1 min-w-0"><div className="font-semibold flex items-center gap-1.5">{t.kind === "maintenance" ? <Wrench size={14} className="text-chili shrink-0" /> : <Sparkles size={14} className="shrink-0" />}<span className="truncate">{KIND[t.kind] ?? t.kind}</span></div><div className="text-xs text-steel line-clamp-2 mt-0.5">{t.notes || "No notes"}</div><div className="num text-[11px] text-[var(--color-label-2)] mt-0.5">{fmtSince(t.created_at)} ago</div>
                    {t.status === "in_progress" && t.taken_by && <div className="text-[12.5px] font-semibold text-[var(--color-cyan)] mt-1 truncate" data-task-who>{nameOf(t.taken_by)} · since {fmtSince(t.taken_at ?? t.created_at)}</div>}
                    {t.status === "pending" && t.assigned_to && <div className="text-[12.5px] font-semibold mt-1 truncate" data-task-who>Given to {nameOf(t.assigned_to)}{t.assigned_by && <span className="font-normal text-steel"> by {nameOf(t.assigned_by)}</span>}</div>}</div></div>
                  {/* "Done", never "Done · room ready": the long label ran out of its half of a narrow
                      card. What Done does to the room is in its title instead. */}
                  {/* a task given to someone else, or someone else on it, is theirs: no buttons for anyone but them and a supervisor */}
                  {!canInspect && ((t.status === "pending" && t.assigned_to && t.assigned_to !== me) || (t.status === "in_progress" && t.taken_by && t.taken_by !== me && t.assigned_to !== me))
                    ? <p className="mt-3 text-[12.5px] text-steel" data-task-theirs>{t.status === "in_progress" ? `${nameOf(t.taken_by)}'s task` : `${nameOf(t.assigned_to)}'s task`} — ask a supervisor</p>
                    : <div className="mt-3 grid grid-cols-2 gap-2">{c.key === "pending" ? <Button size="sm" variant="outline" className="w-full !px-2" disabled={!!busy[t.id]} onClick={() => act(() => takeJob("room", t.id), t.id)}><Play size={14} /> Start</Button> : null}<Button size="sm" variant="ink" className={cn("w-full !px-2", c.key !== "pending" && "col-span-2")} disabled={!!busy[t.id]} title={t.kind === "maintenance" || inspectRule ? "Mark the task done" : "Done — room goes on sale"} onClick={() => act(() => finishJob("room", t.id), t.id)}><Check size={14} /> Done</Button></div>}
                  {canInspect && <select className="mt-2 !h-11 !min-h-11 w-full text-[13.5px] font-semibold" value={t.assigned_to ?? ""} disabled={!!busy[t.id]} aria-label={`Give room ${t.rooms?.number ?? ""} to`} data-task-assign
                    onChange={(e) => act(() => assignJob("room", t.id, e.target.value || null), t.id)}>
                    <option value="">{t.assigned_to ? "Anyone can take" : "Give to…"}</option>
                    {crewFor(t).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.position_title ? ` — ${p.position_title}` : ""}</option>)}</select>}
                </motion.div>))}</AnimatePresence>{list.length === 0 && <p className="text-sm text-steel px-1 py-3">{c.key === "pending" ? "Nothing to do." : "Nothing in progress."}</p>}</div></section>); })}
          {tasks.length === 0 && <div className="sm:col-span-2"><Empty title="Nothing on the sheet" hint="Check-outs add cleans automatically." /></div>}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 items-start min-w-0">
          <Card><h3 className="text-lg mb-3">New task</h3><div className="space-y-3">
            <Field label="Room"><select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">Choose</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.status === "maintenance" ? "out of order" : r.condition}</option>)}</select></Field>
            <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="AC not cooling, extra towels…" /></Field>
            <button type="button" className="svc-btn go w-full" disabled={pending || !f.room} data-add-task onClick={() => start(async () => { const r = await addTask(f.room, f.kind, f.notes); if ("error" in r) return void toast(r.error!, "err"); setF({ room: "", kind: "clean", notes: "" }); })}><Plus size={18} strokeWidth={2.4} aria-hidden /> {f.room ? "Add task" : "Choose a room first"}</button></div></Card>
          {/* each finished task a row: the room on its key card, what and who, and how long it took (2026-10-21) */}
          <Card data-hk-done><div className="flex items-center gap-2.5 mb-3"><span className="h-9 w-9 rounded-[11px] grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]" aria-hidden><Check size={17} strokeWidth={2.6} /></span><h3 className="text-lg leading-none">Recently done</h3><span className="ml-auto num text-[12.5px] font-semibold text-steel">{done.length}</span></div>
            {done.length === 0 ? <p className="text-[13.5px] text-steel rounded-2xl border border-dashed border-[var(--color-separator)] px-3 py-4 text-center">None finished yet</p>
              : <ul className="divide-y divide-[var(--color-separator)]">{done.map((d) => { const took = d.taken_at ? Math.max(1, Math.round((new Date(d.done_at).getTime() - new Date(d.taken_at).getTime()) / 60000)) : null; return (
                <li key={d.id} className="flex items-center gap-3 py-2.5 min-w-0">
                  <span className="shrink-0 min-w-11 grid place-items-center">{d.rooms?.number ? <FlapSpell text={d.rooms.number} size="xs" tile="26px" say={`Room ${d.rooms.number}`} /> : <span className="keycard h-10 w-11 grid place-items-center font-display text-[16px]">—</span>}</span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[14px] font-semibold truncate">{KIND[d.kind] ?? d.kind}</div>
                    <div className="text-[12px] text-steel truncate mt-0.5">{d.done_by ? `by ${nameOf(d.done_by)}` : "done"}{d.done_at ? ` · ${fmtSince(d.done_at)} ago` : ""}</div>
                  </div>
                  {took != null && <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)] num"><Clock size={12} aria-hidden />{took} min</span>}
                </li>); })}</ul>}
          </Card>
        </div>
      </div>
    </div>
  );
}
