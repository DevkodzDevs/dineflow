"use client";
import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus, ClipboardList, ShieldCheck, ShieldX, AlertTriangle, Star, ChevronDown, ChevronsUpDown, ChevronsDownUp, Clock, Brush, RotateCcw } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Field, Pill, Segmented, cn, Empty, useToast } from "@/components/ui";
import { fmtSince } from "@/lib/format";
import { setTask, addTask, setCondition, inspectRoom, buildSheet } from "./actions";
import { setRoomStatus } from "../rooms/actions";

type Task = { id: string; kind: string; status: string; notes: string | null; created_at: string; rooms: { number: string; floor: number } | null };
type Condition = "dirty" | "clean" | "inspected" | "pickup";
type Room = { id: string; number: string; floor: number; status: string; condition: Condition; condition_at: string };
type Stay = { room_id: string; check_out: string; guests: { full_name: string; vip: boolean } | null };
type Done = { id: string; kind: string; done_at: string; rooms: { number: string } | null };

/** The colours housekeeping boards have used for decades: red dirty, amber cleaned-not-yet-inspected, green inspected, blue pickup. */
/* the wide room card's action tones: the move you will make most on a green wash; the others on the
   soft fill (the dock's bg-2 is the card's own colour in dark and vanished there), coloured by their
   meaning — Fail red text, not a red block: thirty filled red buttons read as thirty problems */
const SOFT = {
  go: "bg-[var(--color-green-2)] text-[var(--color-tint)]",
  red: "bg-[var(--color-fill)] text-[var(--color-red)]",
  blue: "bg-[var(--color-fill)] text-[var(--color-blue)]",
  quiet: "bg-[var(--color-fill)] text-[var(--color-label-2)]",
} as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-17" → "17 Sep" (en-IN would say "Sept") */
const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1] ?? ""}`;
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
export function HousekeepingClient({ today, tasks, rooms, stays, done, canInspect, inspectRule }:
  { today: string; tasks: Task[]; rooms: Room[]; stays: Stay[]; done: Done[]; canInspect: boolean; inspectRule: boolean }) {
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
    const out: { room: string; what: string }[] = [];
    rooms.forEach((r) => {
      const s = byRoom[r.id];
      if (r.status === "occupied" && !s) out.push({ room: r.number, what: "Shown occupied, but nobody is checked in" });
      if (s && r.status !== "occupied") out.push({ room: r.number, what: `${s.guests?.full_name ?? "A guest"} is checked in, but the room is marked ${r.status}` });
      if (r.status === "available" && r.condition === "dirty") out.push({ room: r.number, what: "On sale, but housekeeping says dirty" });
      if (s && s.check_out < today) out.push({ room: r.number, what: `${s.guests?.full_name ?? "The guest"} was due out on ${s.check_out.slice(5)}` });
    });
    return out;
  }, [rooms, byRoom, today]);

  const act = (fn: () => Promise<{ error?: string }>) => start(async () => { const r = await fn(); if (r && r.error) toast(r.error, "err"); });
  const fail = (r: Room) => { const note = window.prompt(`Room ${r.number} — what failed?`); if (note === null) return; act(() => inspectRoom(r.id, false, note)); };
  const sheet = () => start(async () => { const r = await buildSheet(); if (r.error) toast(r.error, "err"); else toast(r.added ? `${r.added} task${r.added === 1 ? "" : "s"} added to today's sheet` : "Today's sheet is already complete"); });

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
          <Button variant="outline" disabled={pending} onClick={sheet} title="A stayover service for every room with a guest tonight, and a clean for any dirty room without a ticket"><ClipboardList size={15} /> Build today's sheet</Button>
        </div>
      </div>
      {inspectRule && !canInspect && <p className="text-xs text-steel -mt-3">Rooms are inspected before they are sold. An owner, manager or supervisor signs them off from this page.</p>}

      <div className="sm:hidden">
        <Segmented value={view} onChange={setView} className="w-full [&>button]:flex-1 [&>button]:!h-11"
          options={[{ value: "rooms", label: <span className="inline-flex items-center gap-1.5">Rooms <span className="num opacity-60">{rooms.length}</span></span> },
                    { value: "tasks", label: <span className="inline-flex items-center gap-1.5">Tasks <span className="num opacity-60">{tasks.length}</span></span> }]} />
      </div>

      <div className={cn("space-y-6", view !== "rooms" && "max-sm:hidden")}>
      {discrepancies.length > 0 && (
        <Card className="!border-[var(--color-orange)]/50">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-orange)] mb-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Discrepancies · {discrepancies.length}</div>
          <ul className="text-sm space-y-1">{discrepancies.map((d, i) => <li key={i} className="flex items-center gap-3"><span className="num font-semibold shrink-0 h-7 min-w-11 px-2 rounded-lg bg-[var(--color-fill)] grid place-items-center">{d.room}</span><span className="min-w-0">{d.what}</span></li>)}</ul>
        </Card>
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
                ...(r.condition === "dirty" ? [{ key: "clean", label: "Cleaned", icon: <Sparkles size={17} />, tone: "go" as const, run: () => act(() => setCondition(r.id, "clean")) }] : []),
                ...(r.condition === "pickup" ? [{ key: "touch", label: "Touched up", icon: <Sparkles size={17} />, tone: "go" as const, run: () => act(() => setCondition(r.id, "clean")) }] : []),
                ...(r.condition === "clean" && canInspect ? [
                  { key: "pass", label: "Pass", icon: <ShieldCheck size={17} />, tone: "go" as const, run: () => act(() => inspectRoom(r.id, true)) },
                  { key: "fail", label: "Fail", icon: <ShieldX size={17} />, tone: "red" as const, run: () => fail(r) },
                ] : []),
                ...(sellable && s ? [{ key: "pickup", label: "Pickup", icon: <Brush size={17} />, tone: "blue" as const, run: () => act(() => setCondition(r.id, "pickup")) }] : []),
                ...(r.condition !== "dirty" ? [{ key: "dirty", label: "Dirty", icon: <RotateCcw size={17} />, tone: "quiet" as const, run: () => act(() => setCondition(r.id, "dirty")) }] : []),
              ];
              const hasMain = tiles.some((t) => t.tone === "go");
              const status = out || hasMain ? null : sellable ? (s ? "Occupied" : "Ready") : waiting ? "Sign-off" : null;
              const tone = out ? "var(--color-red)" : r.condition === "dirty" ? "var(--color-red)" : r.condition === "clean" ? "var(--color-orange)" : r.condition === "inspected" ? "var(--color-tint)" : "var(--color-blue)";
              const fix = out ? tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number) : undefined;
              /* the wide card's actions: the room's standing (Ready / Occupied / Sign-off) and every move —
                 for a room out of order, the way back (its repair state is on the second line) */
              type Item = { key: string; label: string; icon: ReactNode; cls: string; title?: string; run?: () => void };
              const items: Item[] = out ? [
                { key: "service", label: "Back in service", icon: <Check size={16} />, cls: SOFT.quiet, run: () => act(() => setRoomStatus(r.id, "available")) },
              ] : [
                ...(status ? [{ key: "status", label: status, icon: status === "Sign-off" ? <ShieldCheck size={16} /> : <Check size={16} />, cls: status === "Sign-off" ? SOFT.quiet : SOFT.go, title: status === "Sign-off" ? "Awaiting a supervisor's sign-off" : status === "Ready" ? "Inspected and ready to sell" : "Guest in the room" }] : []),
                ...tiles.map((t) => ({ key: t.key, label: t.label, icon: t.icon, cls: SOFT[t.tone], run: t.run })),
              ];
              const n = items.length;
              /* one row of 48px tiles, and ONE look per card width so a row of cards matches: on a card of
                 15rem or more (an iPad in landscape, a laptop) every tile is icon beside label — four
                 a little tighter, so "Pickup" fits in ~71px at 1194; under 15rem (an iPad-portrait third)
                 every tile is icon over label. Mixing the two, and putting a four-action card two by
                 two, made the rows look uneven. Only under 185px — an iPad narrower than 834 in
                 portrait — do four go two by two, where four in a row would be under 44px each. */
              const tileCls = cn(n === 4 ? "gap-1 px-1 text-[12px] [&>svg]:w-[15px] [&>svg]:h-[15px]" : "gap-1.5 px-2 text-[12.5px]",
                "@max-[15rem]:flex-col @max-[15rem]:gap-0.5 @max-[15rem]:px-0.5 @max-[15rem]:text-[10.5px] @max-[15rem]:[&>svg]:w-[16px] @max-[15rem]:[&>svg]:h-[16px]");
              const dockCols = n === 4 ? "grid-cols-4 @max-[185px]:grid-cols-2" : n === 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
              const repair = fix ? (fix.status === "in_progress" ? "Being fixed" : "In repair") : "No repair task";
              return (
                <Fragment key={r.id}>
                {/* the wide card (sm and up), two lines and a row of actions: the number in a tile washed
                    with the condition's colour; who is in the room (or Vacant / Reserved / Cleaning, or the
                    repair); then the condition and the one thing to know about it — when the guest leaves
                    ("Due out" in red on the day), how long it has been, or where the repair stands */}
                <div data-room={r.number} className="@container hidden sm:flex feather relative p-3 sm:p-2.5 lg:p-3 flex-col gap-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-11 min-w-11 px-1.5 rounded-[12px] grid place-items-center font-display text-[19px] leading-none tracking-tight shrink-0"
                      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 38%, transparent)` }} data-num>{r.number}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 min-w-0 text-[14px] leading-tight">
                        {s ? <><span className="font-semibold truncate">{s.guests?.full_name}</span>{s.guests?.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}</>
                          : out ? <span className={cn("truncate", fix?.notes ? "font-semibold" : "text-[var(--color-label-2)]")}>{fix?.notes || "Maintenance"}</span>
                            : <span className="text-[var(--color-label-2)] capitalize truncate">{r.status === "available" ? "Vacant" : r.status}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] leading-tight min-w-0 whitespace-nowrap" data-cond title={`${out ? "Out of order" : c.label} since ${fmtSince(r.condition_at)} ago`}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: tone }} />
                        <span className="font-semibold shrink-0" data-cond-label>{out ? "Out of order" : c.label}</span>
                        <span className="text-[var(--color-label-3)] shrink-0" aria-hidden>·</span>
                        {out ? <span className="text-[var(--color-red)] truncate">{repair}</span>
                          : dueOut ? <span className="text-[var(--color-red)] font-semibold truncate">Due out</span>
                            : s ? <span className="num text-[var(--color-label-2)] truncate">Out {dayMonth(s.check_out)}</span>
                              : <span className="num text-[var(--color-label-2)] truncate">{fmtSince(r.condition_at)}</span>}
                      </div>
                    </div>
                  </div>
                  {n > 0 && (
                    <div className={cn("mt-auto grid gap-1.5 @max-[15rem]:gap-[3px]", dockCols)} data-dock>
                      {items.map((t) => {
                        const cls = cn("min-w-0 h-12 rounded-[12px] inline-flex items-center justify-center font-semibold [&>svg]:shrink-0", tileCls, t.cls, t.run && "transition hover:brightness-110 active:scale-[.97] disabled:opacity-50");
                        const body = <>{t.icon}<span className="max-w-full truncate">{t.label}</span></>;
                        return t.run
                          ? <button key={t.key} type="button" disabled={pending} onClick={t.run} aria-label={`${t.label} · room ${r.number}`} className={cls}>{body}</button>
                          : <div key={t.key} className={cls} title={t.title}>{body}</div>;
                      })}
                    </div>
                  )}
                </div>
                <div className={cn("feather relative p-4 pl-5 flex flex-col gap-3 min-w-0 sm:hidden")}>
                  {/* the state as a slim pill down the inside edge, clear of the rounded corners */}
                  <span aria-hidden className="absolute left-1.5 top-4 bottom-4 w-[3px] rounded-full" style={{ background: tone }} />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-[30px] leading-none tracking-tight">{r.number}</div>
                      <div className="mt-1.5 text-[13px] leading-tight truncate">
                        {s ? <span className="font-semibold inline-flex items-center gap-1 max-w-full"><span className="truncate">{s.guests?.full_name}</span>{s.guests?.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}</span>
                          : <span className="text-[var(--color-label-2)] capitalize">{out ? "Maintenance" : r.status === "available" ? "Vacant" : r.status}</span>}
                      </div>
                    </div>
                    <span className={cn("shrink-0 inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full text-[11px] font-semibold", out ? "bg-chili-2 text-chili" : c.chip)}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />{out ? "Out of order" : c.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] min-h-5">
                    <span className="num inline-flex items-center gap-1 text-[var(--color-label-2)]"><Clock size={11} />{c.label.toLowerCase()} {fmtSince(r.condition_at)} ago</span>
                    {s && <span className="num h-5 px-2 rounded-full bg-[var(--color-fill)] text-[var(--color-label-2)] inline-flex items-center">out {s.check_out.slice(5)}</span>}
                    {dueOut && <span className="h-5 px-2 rounded-full bg-[var(--color-red-2)] text-[var(--color-red)] font-semibold inline-flex items-center">Due out</span>}
                    {out && (() => { const fix = tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number); return fix?.notes ? <span className="min-w-0 max-w-full truncate text-[var(--color-red)]">{fix.notes}</span> : null; })()}
                  </div>

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
                        <button type="button" disabled={pending} onClick={() => act(() => setRoomStatus(r.id, "available"))} aria-label={`Back in service · room ${r.number}`} className="dock-tile dock-btn flex-1 dock-quiet">
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
                        <button key={t.key} type="button" disabled={pending} onClick={t.run} aria-label={`${t.label} · room ${r.number}`}
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
      {rooms.length === 0 && <p className="text-sm text-steel">No rooms yet — add them on the Rooms page.</p>}
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
                  <div className="flex items-start gap-3"><span className="keycard h-11 w-12 shrink-0 grid place-items-center font-display text-lg">{t.rooms?.number ?? "—"}</span><div className="flex-1 min-w-0"><div className="font-semibold flex items-center gap-1.5">{t.kind === "maintenance" ? <Wrench size={14} className="text-chili shrink-0" /> : <Sparkles size={14} className="shrink-0" />}<span className="truncate">{KIND[t.kind] ?? t.kind}</span></div><div className="text-xs text-steel line-clamp-2 mt-0.5">{t.notes || "No notes"}</div><div className="num text-[11px] text-[var(--color-label-2)] mt-0.5">{fmtSince(t.created_at)} ago</div></div></div>
                  {/* "Done", never "Done · room ready": the long label ran out of its half of a narrow
                      card. What Done does to the room is in its title instead. */}
                  <div className="mt-3 grid grid-cols-2 gap-2">{c.key === "pending" ? <Button size="sm" variant="outline" className="w-full !px-2" disabled={pending} onClick={() => start(() => { setTask(t.id, "in_progress"); })}><Play size={14} /> Start</Button> : null}<Button size="sm" variant="ink" className={cn("w-full !px-2", c.key !== "pending" && "col-span-2")} disabled={pending} title={t.kind === "maintenance" || inspectRule ? "Mark the task done" : "Mark the task done — the room becomes ready to sell"} onClick={() => start(() => { setTask(t.id, "done"); })}><Check size={14} /> Done</Button></div>
                </motion.div>))}</AnimatePresence>{list.length === 0 && <p className="text-sm text-steel px-1 py-3">{c.key === "pending" ? "Nothing to do." : "Nothing in progress."}</p>}</div></section>); })}
          {tasks.length === 0 && <div className="sm:col-span-2"><Empty title="Nothing on the sheet" hint="Check-outs create cleaning tasks automatically. Build today's sheet for the stayovers." /></div>}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 items-start min-w-0">
          <Card><h3 className="text-lg mb-3">New task</h3><div className="space-y-3">
            <Field label="Room"><select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">Choose</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.status === "maintenance" ? "out of order" : r.condition}</option>)}</select></Field>
            <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="AC not cooling, extra towels…" /></Field>
            <Button className="w-full" disabled={pending || !f.room} onClick={() => start(async () => { await addTask(f.room, f.kind, f.notes); setF({ room: "", kind: "clean", notes: "" }); })}><Plus size={15} /> Add</Button></div></Card>
          <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Recently done</div><ul className="space-y-1.5 text-sm">{done.map((d) => <li key={d.id} className="flex justify-between"><span>Room {d.rooms?.number} · {KIND[d.kind] ?? d.kind}</span><Pill tone="ready">done</Pill></li>)}{done.length === 0 && <li className="text-steel">—</li>}</ul></Card>
        </div>
      </div>
    </div>
  );
}
