"use client";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus, ClipboardList, ShieldCheck, ShieldX, AlertTriangle, Star, ChevronDown, ChevronsUpDown, ChevronsDownUp, Clock, MoreHorizontal } from "lucide-react";
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
  /* the one room whose ⋯ menu is open; a tap anywhere else, or Escape, closes it */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const off = (e: Event) => { if (!(e.target as HTMLElement).closest("[data-room-menu]")) setMenuFor(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuFor(null); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [menuFor]);
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
          {on && <div className="p-3 sm:p-4">
          {/* One room to a row on a phone, its actions in a single row of equal buttons. Two
              across, a 170px card stacked four 44px pills two by two, and a card with one action
              sat beside one with four as a tall empty hole. From 520px the board goes back to
              cards with the two-column action grid. */}
          <div className="grid grid-cols-1 min-[520px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3 sm:gap-3.5">
            {rooms.filter((r) => r.floor === fl).map((r) => {
              const s = byRoom[r.id]; const out = r.status === "maintenance"; const c = COND[r.condition] ?? COND.clean;
              const sellable = r.condition === "inspected" || (r.condition === "clean" && !inspectRule);
              const waiting = !out && r.condition === "clean" && !canInspect && inspectRule;
              const dueOut = !!s && s.check_out <= today;
              /* One shape for every room: the action you will press as a full-width button, Fail
                 beside it when an inspection is due, and the rare moves — Pickup, Dirty — behind ⋯.
                 Cards used to carry anything from one to four pills in a 2x2 block, so a board of
                 thirty rooms was thirty different shapes. A room with nothing to press says so. */
              const main: { label: string; icon: ReactNode; run: () => void } | null = out ? null
                : r.condition === "dirty" ? { label: "Cleaned", icon: <Sparkles size={15} />, run: () => act(() => setCondition(r.id, "clean")) }
                : r.condition === "pickup" ? { label: "Touched up", icon: <Sparkles size={15} />, run: () => act(() => setCondition(r.id, "clean")) }
                : r.condition === "clean" && canInspect ? { label: "Pass", icon: <ShieldCheck size={15} />, run: () => act(() => inspectRoom(r.id, true)) }
                : null;
              const canFail = !out && r.condition === "clean" && canInspect;
              const more: { label: string; hint: string; run: () => void }[] = out ? [] : [
                ...(sellable && s ? [{ label: "Needs a pickup", hint: "A quick touch-up while the guest is out", run: () => act(() => setCondition(r.id, "pickup")) }] : []),
                ...(r.condition !== "dirty" ? [{ label: "Mark dirty", hint: "Send it back for a full clean", run: () => act(() => setCondition(r.id, "dirty")) }] : []),
              ];
              const tone = out ? "var(--color-red)" : r.condition === "dirty" ? "var(--color-red)" : r.condition === "clean" ? "var(--color-orange)" : r.condition === "inspected" ? "var(--color-tint)" : "var(--color-blue)";
              return (
                <div key={r.id} className={cn("feather relative p-4 pl-5 flex flex-col gap-3 min-w-0", menuFor === r.id && "z-20")}>
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

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="num inline-flex items-center gap-1 text-[var(--color-label-2)]"><Clock size={11} />{c.label.toLowerCase()} {fmtSince(r.condition_at)} ago</span>
                    {s && <span className="num h-5 px-2 rounded-full bg-[var(--color-fill)] text-[var(--color-label-2)] inline-flex items-center">out {s.check_out.slice(5)}</span>}
                    {dueOut && <span className="h-5 px-2 rounded-full bg-[var(--color-red-2)] text-[var(--color-red)] font-semibold inline-flex items-center">Due out</span>}
                  </div>

                  {out && (() => {
                    const fix = tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number);
                    return (
                      <div className="mt-auto space-y-2">
                        <div className="flex items-start gap-2 rounded-xl bg-[var(--color-red-2)] px-3 py-2.5 text-[12px]">
                          <Wrench size={13} className="text-[var(--color-red)] shrink-0 mt-0.5" />
                          <span className="min-w-0"><span className="block font-semibold text-[var(--color-red)]">{fix ? (fix.status === "in_progress" ? "Being fixed" : "Waiting for repair") : "No repair task open"}</span>
                            <span className="block text-[var(--color-label-2)] line-clamp-2">{fix ? `${fix.notes || "Maintenance"} · ${fmtSince(fix.created_at)} ago` : "Add one in Tasks so someone picks it up"}</span></span>
                        </div>
                        <Button size="sm" variant="outline" className="w-full" disabled={pending} onClick={() => act(() => setRoomStatus(r.id, "available"))}><Check size={14} /> Back in service</Button>
                      </div>
                    );
                  })()}

                  {!out && (
                    <div className="mt-auto flex items-center gap-2">
                      {main ? (
                        <Button size="sm" variant="tinted" disabled={pending} onClick={main.run} className="flex-1 min-w-0">{main.icon}{main.label}</Button>
                      ) : (
                        <div className={cn("flex-1 min-w-0 h-10 rounded-xl px-3 inline-flex items-center gap-2 text-[12.5px] font-semibold",
                          sellable ? "bg-[var(--color-green-2)] text-[var(--color-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>
                          {sellable ? <><Check size={15} className="shrink-0" /><span className="truncate">{s ? "Guest in room" : "Ready to sell"}</span></>
                            : waiting ? <><ShieldCheck size={15} className="shrink-0" /><span className="truncate">Awaiting sign-off</span></>
                            : <span className="truncate">Nothing to do</span>}
                        </div>
                      )}
                      {canFail && <Button size="sm" variant="outline" disabled={pending} onClick={() => fail(r)} className="!px-3 !text-[var(--color-red)] shrink-0"><ShieldX size={15} />Fail</Button>}
                      {more.length > 0 && (
                        <div className="relative shrink-0" data-room-menu>
                          <button type="button" onClick={() => setMenuFor(menuFor === r.id ? null : r.id)} aria-haspopup="menu" aria-expanded={menuFor === r.id} aria-label={`More for room ${r.number}`}
                            className={cn("h-10 w-10 rounded-xl grid place-items-center transition-colors", menuFor === r.id ? "bg-[var(--color-fill-2)] text-[var(--color-label)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)]")}><MoreHorizontal size={17} /></button>
                          {menuFor === r.id && (
                            <div role="menu" className="popover !animate-none absolute right-0 bottom-12 w-60 z-30">
                              {more.map((m) => (
                                <button key={m.label} role="menuitem" type="button" disabled={pending} onClick={() => { setMenuFor(null); m.run(); }} className="menu-item flex-col !items-start !gap-0.5 min-h-11">
                                  <span className="text-[14px] font-semibold">{m.label}</span><span className="text-[11.5px] text-[var(--color-label-2)]">{m.hint}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
