"use client";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus, ClipboardList, ShieldCheck, ShieldX, AlertTriangle, Star } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Field, Pill, cn, Empty, useToast } from "@/components/ui";
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

      {discrepancies.length > 0 && (
        <Card className="!border-[var(--color-orange)]/50">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-orange)] mb-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Discrepancies · {discrepancies.length}</div>
          <ul className="text-sm space-y-1">{discrepancies.map((d, i) => <li key={i} className="flex items-center gap-3"><span className="num font-semibold shrink-0 h-7 min-w-11 px-2 rounded-lg bg-[var(--color-fill)] grid place-items-center">{d.room}</span><span className="min-w-0">{d.what}</span></li>)}</ul>
        </Card>
      )}

      {floors.map((fl) => (
        <section key={fl}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel mb-3">Floor {fl}</div>
          {/* One room to a row on a phone, its actions in a single row of equal buttons. Two
              across, a 170px card stacked four 44px pills two by two, and a card with one action
              sat beside one with four as a tall empty hole. From 520px the board goes back to
              cards with the two-column action grid. */}
          <div className="grid grid-cols-1 min-[520px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
            {rooms.filter((r) => r.floor === fl).map((r) => {
              const s = byRoom[r.id]; const out = r.status === "maintenance"; const c = COND[r.condition] ?? COND.clean;
              const sellable = r.condition === "inspected" || (r.condition === "clean" && !inspectRule);
              const waiting = !out && r.condition === "clean" && !canInspect && inspectRule;
              /* Every state puts its buttons through the same grid, so a board of thirty rooms is
                 one shape repeated rather than four. One action fills the row; three put the one
                 you will press on top. They were a wrapping flex row of four different variants —
                 a near-white "Pass" shouting from every card and a ghost "Dirty" that looked like
                 a stray caption, often on a second line of its own. */
              const acts: { key: string; label: string; icon?: ReactNode; variant: "tinted" | "outline"; muted?: boolean; red?: boolean; run: () => void }[] = [];
              if (!out) {
                if (r.condition === "dirty") acts.push({ key: "clean", label: "Cleaned", icon: <Sparkles size={13} />, variant: "tinted", run: () => act(() => setCondition(r.id, "clean")) });
                if (r.condition === "pickup") acts.push({ key: "touch", label: "Touched up", icon: <Sparkles size={13} />, variant: "tinted", run: () => act(() => setCondition(r.id, "clean")) });
                if (r.condition === "clean" && canInspect) {
                  acts.push({ key: "pass", label: "Pass", icon: <ShieldCheck size={13} />, variant: "tinted", run: () => act(() => inspectRoom(r.id, true)) });
                  /* outline, not the red fill: a failed inspection is rare, and a board of thirty
                     rooms offering it in filled red reads as thirty problems */
                  acts.push({ key: "fail", label: "Fail", icon: <ShieldX size={13} />, variant: "outline", red: true, run: () => fail(r) });
                }
                if (sellable && s) acts.push({ key: "pickup", label: "Pickup", variant: "outline", run: () => act(() => setCondition(r.id, "pickup")) });
                /* not the tint: a green "Dirty" reads as approval, which is the opposite of what it does */
                if (r.condition !== "dirty") acts.push({ key: "dirty", label: "Dirty", variant: "outline", muted: true, run: () => act(() => setCondition(r.id, "dirty")) });
              }
              const lead = acts.length > 1 && acts.length % 2 === 1;
              return (
                <div key={r.id} className={cn("feather relative overflow-hidden p-3 pl-4 flex flex-col gap-1.5", out && "opacity-75")}>
                  {/* the condition as a rail down the edge. A .5px tinted border at 60% was all but
                      invisible on graphite, and "clean" borrowed --color-saffron, which this theme
                      aliases to the tint — so a whole board of amber "Clean" pills sat in green
                      frames, indistinguishable from the inspected rooms beside them. */}
                  <span className={cn("absolute inset-y-0 left-0 w-[3px]", out ? "bg-[var(--color-red)]" : c.rail)} aria-hidden />
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[26px] leading-none">{r.number}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold shrink-0", out ? "bg-chili-2 text-chili" : c.chip)}>{out ? "Out of order" : c.label}</span>
                  </div>
                  <div className="text-xs min-[520px]:min-h-[2.4em]">
                    {s ? <>
                      <div className="font-semibold flex items-center gap-1"><span className="truncate">{s.guests?.full_name}</span>{s.guests?.vip && <Star size={11} className="text-champagne fill-current shrink-0" />}</div>
                      <div className="num text-steel">out {s.check_out.slice(5)}{s.check_out <= today ? " · due out" : ""}</div>
                    </> : <div className="text-steel capitalize">{r.status === "available" ? "Vacant" : r.status}</div>}
                  </div>
                  {/* the since-line belongs to the room's state, so it stays with it; the slack a
                      stretched grid row leaves falls below, where the rule explains it */}
                  {/* label-2, not label-3: at 11px on the card ground, --color-label-3 measures 2.70
                      against WCAG's 4.5. It is the quietest line on the card but it still has to be
                      readable by someone holding a phone in a corridor. */}
                  <div className="num text-[11px] text-[var(--color-label-2)]">{c.label.toLowerCase()} {fmtSince(r.condition_at)} ago</div>
                  {/* An out-of-order room says why, and how it comes back: the open maintenance
                      task on it (or that there is none), and Back in service, which returns it to
                      the board as clean — a supervisor still inspects it before it is sold. The
                      card was an empty dark block beside cards full of buttons. */}
                  {out && (() => {
                    const fix = tasks.find((t) => t.kind === "maintenance" && t.status !== "done" && t.rooms?.number === r.number);
                    return (
                      <div className="mt-auto pt-2.5 border-t border-line space-y-2">
                        <div className="flex items-start gap-2 rounded-xl bg-[var(--color-red-2)] px-2.5 py-2 text-[11.5px]">
                          <Wrench size={13} className="text-[var(--color-red)] shrink-0 mt-0.5" />
                          <span className="min-w-0"><span className="block font-semibold text-[var(--color-red)]">{fix ? (fix.status === "in_progress" ? "Being fixed" : "Waiting for repair") : "No repair task open"}</span>
                            <span className="block text-[var(--color-label-2)] line-clamp-2">{fix ? `${fix.notes || "Maintenance"} · ${fmtSince(fix.created_at)} ago` : "Add one below so someone picks it up"}</span></span>
                        </div>
                        <Button size="sm" variant="outline" className="w-full !px-2" disabled={pending} onClick={() => act(() => setRoomStatus(r.id, "available"))}><Check size={14} /> Back in service</Button>
                      </div>
                    );
                  })()}
                  {(waiting || acts.length > 0) && (
                    <div className="mt-auto pt-2.5 border-t border-line space-y-1.5">
                      {waiting && <div className="text-[11px] text-steel">Awaiting a supervisor's sign-off</div>}
                      {acts.length > 0 && (
                        <div className={cn("grid gap-1.5 grid-flow-col auto-cols-fr min-[520px]:grid-flow-row min-[520px]:auto-cols-auto", acts.length > 1 && "min-[520px]:grid-cols-2")}>
                          {acts.map((a, i) => (
                            <Button key={a.key} size="sm" variant={a.variant} disabled={pending} onClick={a.run}
                              className={cn("w-full min-w-0 !px-2", lead && i === 0 && "min-[520px]:col-span-2", a.muted && "!text-steel", a.red && "!text-[var(--color-red)]")}>{a.icon}{a.label}</Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div></section>
      ))}
      {rooms.length === 0 && <p className="text-sm text-steel">No rooms yet — add them on the Rooms page.</p>}

      {/* the task sheet */}
      {/* The board gets two real columns before the form takes a side of its own: at lg the form's
          320px left each column ~290px and "Done · room ready" ran out of its button. Below xl the
          form and "Recently done" sit under the board, side by side. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
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
