"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wrench, Check, Play, Plus } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Field, Pill, cn, Empty } from "@/components/ui";
import { minsSince } from "@/lib/format";
import { setTask, addTask } from "./actions";

type Task = { id: string; kind: string; status: string; notes: string | null; created_at: string; rooms: { number: string; floor: number } | null };
export function HousekeepingClient({ tasks, rooms, done }: { tasks: Task[]; rooms: { id: string; number: string; status: string }[]; done: { id: string; kind: string; done_at: string; rooms: { number: string } | null }[] }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [f, setF] = useState({ room: "", kind: "clean", notes: "" });
  useLive(["housekeeping_tasks"].map(String));
  const cols = [{ key: "pending", title: "To do" }, { key: "in_progress", title: "In progress" }];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid sm:grid-cols-2 gap-4">
        {cols.map((c) => { const list = tasks.filter((t) => t.status === c.key); return (
          <section key={c.key} className={cn("rounded-[20px] p-3", c.key === "pending" ? "bg-sky-2" : "bg-champagne-2")}><div className="text-sm font-semibold px-1 pb-3">{c.title} <span className="num text-steel">{list.length}</span></div>
            <div className="space-y-3"><AnimatePresence>{list.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-4">
                <div className="flex items-center gap-3"><span className="keycard h-11 w-12 grid place-items-center font-display text-lg">{t.rooms?.number}</span><div className="flex-1"><div className="font-semibold capitalize flex items-center gap-1.5">{t.kind === "maintenance" ? <Wrench size={14} className="text-chili" /> : <Sparkles size={14} />}{t.kind}</div><div className="text-xs text-steel">{t.notes || "—"} · {minsSince(t.created_at)} min</div></div></div>
                <div className="mt-3 flex gap-2">{c.key === "pending" ? <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(() => { setTask(t.id, "in_progress"); })}><Play size={14} /> Start</Button> : null}<Button size="sm" variant="ink" className="flex-1" disabled={pending} onClick={() => start(() => { setTask(t.id, "done"); })}><Check size={14} /> Done · room ready</Button></div>
              </motion.div>))}</AnimatePresence>{list.length === 0 && <p className="text-sm text-steel px-1">—</p>}</div></section>); })}
        {tasks.length === 0 && <div className="sm:col-span-2"><Empty title="All rooms are ready" hint="Check-outs create cleaning tasks automatically." /></div>}
      </div>
      <div className="space-y-4">
        <Card><h3 className="text-lg mb-3">New task</h3><div className="space-y-3">
          <Field label="Room"><select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">Choose</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.status}</option>)}</select></Field>
          <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="clean">Clean</option><option value="turndown">Turndown</option><option value="maintenance">Maintenance</option></select></Field>
          <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="AC not cooling, extra towels…" /></Field>
          <Button className="w-full" disabled={pending || !f.room} onClick={() => start(async () => { await addTask(f.room, f.kind, f.notes); setF({ room: "", kind: "clean", notes: "" }); })}><Plus size={15} /> Add</Button></div></Card>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Recently done</div><ul className="space-y-1.5 text-sm">{done.map((d) => <li key={d.id} className="flex justify-between"><span>Room {d.rooms?.number} · {d.kind}</span><Pill tone="ready">done</Pill></li>)}{done.length === 0 && <li className="text-steel">—</li>}</ul></Card>
      </div>
    </div>
  );
}
