"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Pencil, Sparkles, Wrench, Check, Trash2 } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Sheet, Field, cn, Pill } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveRoom, setRoomStatus, deleteRoom, saveRoomType } from "./actions";

type Room = { id: string; number: string; floor: number; status: string; room_type_id: string | null; notes: string | null; room_types: { name: string; base_rate: number } | null };
type RT = { id: string; name: string; base_rate: number; capacity: number };
type Bk = { id: string; room_id: string; check_out: string; guests: { full_name: string } | null };

export function RoomsClient({ rooms, types, bookings }: { rooms: Room[]; types: RT[]; bookings: Bk[] }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [edit, setEdit] = useState<Partial<Room> | null>(null); const [typeSheet, setTypeSheet] = useState(false); const [err, setErr] = useState<string | null>(null);
  useLive(["rooms"].map(String));
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const byRoom = Object.fromEntries(bookings.map((b) => [b.room_id, b]));
  const counts = (s: string) => rooms.filter((r) => r.status === s).length;
  return (
    <div className="space-y-6">
      <div className="toolbar"><div className="toolbar-group text-xs font-semibold">
        {[["available", "Ready", "bg-card border border-line"], ["occupied", "Occupied", "bg-ink text-white"], ["reserved", "Arriving", "border border-dashed border-champagne bg-card"], ["cleaning", "Cleaning", "bg-sky-2"], ["maintenance", "Maintenance", "bg-chili-2 text-chili"]].map(([k, l, c]) => <span key={k} className={cn("rounded-full px-3 py-1.5", c)}>{l} <span className="num opacity-70">{counts(k)}</span></span>)}
        </div><div className="toolbar-group toolbar-end"><Button variant="outline" onClick={() => setTypeSheet(true)}>Room types & rates</Button><Button onClick={() => setEdit({ floor: floors.at(-1) ?? 1 })}><Plus size={16} /> Room</Button></div>
      </div>
      {floors.map((f) => (
        <section key={f}><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel mb-3">Floor {f}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-3">
            {rooms.filter((r) => r.floor === f).map((r, i) => { const b = byRoom[r.id]; return (
              <motion.div key={r.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}>
                <Link href={b ? `/frontdesk/${b.id}` : "/frontdesk"} className={cn("keycard feather-lift block aspect-[5/4] p-3 flex flex-col", r.status)}>
                  <div className="flex justify-between items-start"><span className="font-display text-2xl">{r.number}</span><span className={cn("text-[10px] font-semibold", r.status === "occupied" ? "text-white/60" : "text-steel")}>{r.room_types?.name}</span></div>
                  <div className="mt-auto text-xs">
                    {r.status === "occupied" && b ? <><div className="font-semibold truncate">{b.guests?.full_name}</div><div className="num text-white/60">out {b.check_out.slice(5)}</div></>
                      : r.status === "cleaning" ? <span className="flex items-center gap-1 text-ink"><Sparkles size={12} /> cleaning</span>
                      : r.status === "maintenance" ? <span className="flex items-center gap-1 text-chili"><Wrench size={12} /> maintenance</span>
                      : r.status === "reserved" ? <span className="text-champagne font-semibold">arriving</span>
                      : <span className="num text-steel">{formatINR(Number(r.room_types?.base_rate ?? 0))}/n</span>}
                  </div>
                </Link>
                <div className="flex justify-center gap-1 mt-1 text-steel">
                  {r.status !== "occupied" && <>
                    {r.status !== "available" && <button title="Mark ready" disabled={pending} onClick={() => start(() => { setRoomStatus(r.id, "available"); })} className="p-1 hover:text-ink"><Check size={13} /></button>}
                    {r.status === "available" && <button title="Send to cleaning" disabled={pending} onClick={() => start(() => { setRoomStatus(r.id, "cleaning"); })} className="p-1 hover:text-ink"><Sparkles size={13} /></button>}
                    {r.status !== "maintenance" && <button title="Maintenance" disabled={pending} onClick={() => start(() => { setRoomStatus(r.id, "maintenance"); })} className="p-1 hover:text-chili"><Wrench size={13} /></button>}
                  </>}
                  <button title="Edit" onClick={() => setEdit(r)} className="p-1 hover:text-ink"><Pencil size={13} /></button>
                </div>
              </motion.div>); })}
          </div></section>
      ))}
      {rooms.length === 0 && <p className="text-sm text-steel">No rooms yet. Add room types first, then rooms.</p>}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Room ${edit.number}` : "New room"}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveRoom(fd); if ("error" in r) setErr(r.error!); else setEdit(null); })}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <div className="grid grid-cols-2 gap-3"><Field label="Room number"><input name="number" defaultValue={edit?.number} required className="num" placeholder="101" /></Field><Field label="Floor"><input name="floor" type="number" defaultValue={edit?.floor ?? 1} className="num" /></Field></div>
          <Field label="Type"><select name="room_type_id" defaultValue={edit?.room_type_id ?? ""}><option value="">—</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatINR(Number(t.base_rate))}</option>)}</select></Field>
          <Field label="Notes"><input name="notes" defaultValue={edit?.notes ?? ""} placeholder="Sea view, connecting door…" /></Field>
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>{edit?.id && edit.status === "available" && <Button type="button" variant="danger" onClick={() => start(async () => { await deleteRoom(edit.id!); setEdit(null); })}><Trash2 size={16} /></Button>}</div>
        </form>
      </Sheet>
      <Sheet open={typeSheet} onClose={() => setTypeSheet(false)} title="Room types & rates">
        <ul className="space-y-2 mb-5">{types.map((t) => <li key={t.id} className="feather p-3"><form className="grid grid-cols-[1fr_100px_60px_auto] gap-2 items-center" action={(fd) => start(async () => { await saveRoomType(fd); })}><input type="hidden" name="id" value={t.id} /><input name="name" defaultValue={t.name} /><input name="base_rate" type="number" defaultValue={t.base_rate} className="num" /><input name="capacity" type="number" defaultValue={t.capacity} className="num" /><Button size="sm" variant="outline">Save</Button></form></li>)}</ul>
        <form className="grid grid-cols-[1fr_100px_60px_auto] gap-2 items-end" action={(fd) => start(async () => { await saveRoomType(fd); })}><Field label="Name"><input name="name" placeholder="Sea-view suite" required /></Field><Field label="Rate/night"><input name="base_rate" type="number" className="num" /></Field><Field label="Sleeps"><input name="capacity" type="number" defaultValue={2} className="num" /></Field><Button size="sm"><Plus size={14} /></Button></form>
      </Sheet>
    </div>
  );
}
