"use client";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus, ClipboardList, ShieldCheck, ShieldX, AlertTriangle, Star } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Field, Pill, cn, Empty, useToast } from "@/components/ui";
import { fmtSince } from "@/lib/format";
import { setTask, addTask, setCondition, inspectRoom, buildSheet } from "./actions";

type Task = { id: string; kind: string; status: string; notes: string | null; created_at: string; rooms: { number: string; floor: number } | null };
type Condition = "dirty" | "clean" | "inspected" | "pickup";
type Room = { id: string; number: string; floor: number; status: string; condition: Condition; condition_at: string };
type Stay = { room_id: string; check_out: string; guests: { full_name: string; vip: boolean } | null };
type Done = { id: string; kind: string; done_at: string; rooms: { number: string } | null };

/** The colours housekeeping boards have used for decades: red dirty, amber cleaned-not-yet-inspected, green inspected, blue pickup. */
const COND: Record<Condition, { label: string; chip: string; card: string }> = {
  dirty:     { label: "Dirty",     chip: "bg-chili-2 text-chili",                                card: "!border-chili/50" },
  clean:     { label: "Clean",     chip: "bg-[rgb(255_179_64/.18)] text-[var(--color-orange)]",  card: "!border-saffron/60" },
  inspected: { label: "Inspected", chip: "bg-[var(--color-green-2)] text-[var(--color-tint)]",   card: "!border-mint/60" },
  pickup:    { label: "Pickup",    chip: "bg-sky-2 text-ink",                                     card: "!border-sky/60" },
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
          <ul className="text-sm space-y-1">{discrepancies.map((d, i) => <li key={i} className="flex gap-3"><span className="num font-semibold w-12 shrink-0">{d.room}</span><span>{d.what}</span></li>)}</ul>
        </Card>
      )}

      {floors.map((fl) => (
        <section key={fl}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel mb-3">Floor {fl}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
            {rooms.filter((r) => r.floor === fl).map((r) => {
              const s = byRoom[r.id]; const out = r.status === "maintenance"; const c = COND[r.condition] ?? COND.clean;
              const sellable = r.condition === "inspected" || (r.condition === "clean" && !inspectRule);
              return (
                <div key={r.id} className={cn("feather p-3 flex flex-col gap-2 border", out ? "!border-chili/40 opacity-70" : c.card)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-2xl leading-none">{r.number}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", out ? "bg-chili-2 text-chili" : c.chip)}>{out ? "Out of order" : c.label}</span>
                  </div>
                  <div className="text-xs text-steel min-h-[2.6em]">
                    {s ? <><span className="font-semibold text-[var(--color-label)] flex items-center gap-1">{s.guests?.vip && <Star size={11} className="text-champagne fill-current" />}{s.guests?.full_name}</span><span className="num">out {s.check_out.slice(5)}{s.check_out <= today ? " · due out" : ""}</span></>
                      : <span className="capitalize">{r.status === "available" ? "Vacant" : r.status}</span>}
                    <div className="num opacity-70">{c.label.toLowerCase()} {fmtSince(r.condition_at)} ago</div>
                  </div>
                  {!out && (
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      {r.condition === "dirty" && <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => act(() => setCondition(r.id, "clean"))}><Sparkles size={13} /> Cleaned</Button>}
                      {r.condition === "pickup" && <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => act(() => setCondition(r.id, "clean"))}><Sparkles size={13} /> Touched up</Button>}
                      {r.condition === "clean" && canInspect && <><Button size="sm" variant="ink" className="flex-1" disabled={pending} onClick={() => act(() => inspectRoom(r.id, true))}><ShieldCheck size={13} /> Pass</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => fail(r)}><ShieldX size={13} /> Fail</Button></>}
                      {r.condition === "clean" && !canInspect && inspectRule && <span className="text-[11px] text-steel self-center">awaiting inspection</span>}
                      {sellable && s && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setCondition(r.id, "pickup"))}>Pickup</Button>}
                      {/* not the tint: a green "Dirty" reads as approval, which is the opposite of what it does */}
                      {r.condition !== "dirty" && <Button size="sm" variant="ghost" className="!text-steel" disabled={pending} onClick={() => act(() => setCondition(r.id, "dirty"))}>Dirty</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div></section>
      ))}
      {rooms.length === 0 && <p className="text-sm text-steel">No rooms yet — add them on the Rooms page.</p>}

      {/* the task sheet */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid sm:grid-cols-2 gap-4">
          {cols.map((c) => { const list = tasks.filter((t) => t.status === c.key); return (
            <section key={c.key} className={cn("rounded-[20px] p-3", c.key === "pending" ? "bg-sky-2" : "bg-champagne-2")}><div className="text-sm font-semibold px-1 pb-3">{c.title} <span className="num text-steel">{list.length}</span></div>
              <div className="space-y-3"><AnimatePresence>{list.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-4">
                  <div className="flex items-center gap-3"><span className="keycard h-11 w-12 grid place-items-center font-display text-lg">{t.rooms?.number}</span><div className="flex-1"><div className="font-semibold flex items-center gap-1.5">{t.kind === "maintenance" ? <Wrench size={14} className="text-chili" /> : <Sparkles size={14} />}{KIND[t.kind] ?? t.kind}</div><div className="text-xs text-steel">{t.notes || "—"} · {fmtSince(t.created_at)}</div></div></div>
                  <div className="mt-3 flex gap-2">{c.key === "pending" ? <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(() => { setTask(t.id, "in_progress"); })}><Play size={14} /> Start</Button> : null}<Button size="sm" variant="ink" className="flex-1" disabled={pending} onClick={() => start(() => { setTask(t.id, "done"); })}><Check size={14} /> {t.kind === "maintenance" || (inspectRule && t.kind !== "maintenance") ? "Done" : "Done · room ready"}</Button></div>
                </motion.div>))}</AnimatePresence>{list.length === 0 && <p className="text-sm text-steel px-1">—</p>}</div></section>); })}
          {tasks.length === 0 && <div className="sm:col-span-2"><Empty title="Nothing on the sheet" hint="Check-outs create cleaning tasks automatically. Build today's sheet for the stayovers." /></div>}
        </div>
        <div className="space-y-4">
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
