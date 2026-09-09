"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, LogIn, CalendarDays, Moon, Users } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Sheet, Field, StatTile, Pill, cn, Empty } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { createBooking, checkIn, cancelBooking } from "./actions";

type Room = { id: string; number: string; floor: number; status: string; room_type_id: string | null; room_types: { name: string; base_rate: number; capacity: number } | null };
type Booking = { id: string; booking_no: number; check_in: string; check_out: string; status: string; rate: number; adults: number; children: number; guests: { full_name: string; phone: string | null } | null; rooms: { number: string; room_types: { name: string } | null } | null };
type RT = { id: string; name: string; base_rate: number; capacity: number };
type G = { id: string; full_name: string; phone: string | null };

export function FrontDeskClient({ today, bookings, rooms, types, guests }: { today: string; bookings: Booking[]; rooms: Room[]; types: RT[]; guests: G[] }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [open, setOpen] = useState(false); const [err, setErr] = useState<string | null>(null);
  useLive(["bookings", "rooms"].map(String));
  const arrivals = bookings.filter((b) => b.status === "reserved" && b.check_in <= today);
  const departures = bookings.filter((b) => b.status === "checked_in" && b.check_out <= today);
  const inHouse = bookings.filter((b) => b.status === "checked_in");
  const upcoming = bookings.filter((b) => b.status === "reserved" && b.check_in > today);
  const occ = rooms.length ? Math.round((rooms.filter((r) => r.status === "occupied").length / rooms.length) * 100) : 0;

  const Row = ({ b, action }: { b: Booking; action?: React.ReactNode }) => (
    <Link href={`/frontdesk/${b.id}`} className="feather feather-lift flex items-center gap-4 p-4">
      <div className="keycard h-12 w-14 grid place-items-center font-display text-lg shrink-0">{b.rooms?.number}</div>
      <div className="flex-1 min-w-0"><div className="font-semibold truncate">{b.guests?.full_name}</div><div className="text-xs text-steel num">#{b.booking_no} · {b.check_in.slice(5)} → {b.check_out.slice(5)} · {b.rooms?.room_types?.name} · <Users size={10} className="inline" /> {b.adults + b.children}</div></div>
      <div className="num text-sm font-semibold hidden sm:block">{formatINR(Number(b.rate))}/n</div>
      {action}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Arrivals today" value={String(arrivals.length)} sub={arrivals.length ? "waiting to check in" : "all arrived"} />
        <StatTile label="Departures today" value={String(departures.length)} delay={0.05} />
        <StatTile label="In house" value={String(inHouse.length)} sub={`${occ}% occupancy`} tone={occ >= 80 ? "good" : undefined} delay={0.1} />
        <StatTile label="Rooms ready" value={String(rooms.filter((r) => r.status === "available").length)} sub={`${rooms.filter((r) => r.status === "cleaning").length} being cleaned`} delay={0.15} />
      </div>
      <div className="flex items-center gap-2"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Today</div><div className="ml-auto"><Button onClick={() => setOpen(true)}><Plus size={16} /> New booking</Button></div></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section><div className="text-sm font-semibold mb-3 flex items-center gap-2"><LogIn size={15} /> Arrivals <span className="num text-steel">{arrivals.length}</span></div>
          <div className="space-y-3">{arrivals.map((b) => <Row key={b.id} b={b} action={<Button size="sm" variant="ink" disabled={pending} onClick={(e) => { e.preventDefault(); start(async () => { const r = await checkIn(b.id); if ("error" in r) alert(r.error); }); }}>Check in</Button>} />)}{arrivals.length === 0 && <p className="text-sm text-steel">No pending arrivals.</p>}</div>
          <div className="text-sm font-semibold mt-6 mb-3 flex items-center gap-2"><CalendarDays size={15} /> Upcoming <span className="num text-steel">{upcoming.length}</span></div>
          <div className="space-y-3">{upcoming.slice(0, 8).map((b) => <Row key={b.id} b={b} action={<button className="text-xs text-steel hover:text-chili" onClick={(e) => { e.preventDefault(); if (confirm("Cancel this booking?")) start(() => { cancelBooking(b.id); }); }}>cancel</button>} />)}{upcoming.length === 0 && <p className="text-sm text-steel">Nothing upcoming.</p>}</div></section>
        <section><div className="text-sm font-semibold mb-3 flex items-center gap-2"><Moon size={15} /> In house <span className="num text-steel">{inHouse.length}</span></div>
          <div className="space-y-3">{inHouse.map((b) => <Row key={b.id} b={b} action={b.check_out <= today ? <Pill tone="alert">due out</Pill> : <Pill tone="gold">night {Math.max(1, Math.round((Date.now() - new Date(b.check_in).getTime()) / 86400000))}</Pill>} />)}{inHouse.length === 0 && <Empty title="No guests in house" hint="Check in an arrival or create a walk-in booking." />}</div></section>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="New booking" wide>
        <BookingForm today={today} rooms={rooms} types={types} guests={guests} onDone={(id) => { setOpen(false); router.push(`/frontdesk/${id}`); }} />
      </Sheet>
    </div>
  );
}

function BookingForm({ today, rooms, types, guests, onDone }: { today: string; rooms: Room[]; types: RT[]; guests: G[]; onDone: (id: string) => void }) {
  const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ check_in: today, check_out: tomorrow, room_id: "", adults: 2, children: 0, rate: 0, advance: 0, source: "walk_in", notes: "" });
  const [g, setG] = useState({ id: "", full_name: "", phone: "", email: "", id_type: "Aadhaar", id_last4: "", address: "" });
  const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const nights = Math.max(1, Math.round((new Date(f.check_out).getTime() - new Date(f.check_in).getTime()) / 86400000));
  const free = rooms.filter((r) => r.status !== "maintenance");
  const pickRoom = (r: Room) => setF({ ...f, room_id: r.id, rate: Number(r.room_types?.base_rate ?? 0) });
  const pickGuest = (id: string) => { const x = guests.find((y) => y.id === id); setG(x ? { ...g, id, full_name: x.full_name, phone: x.phone ?? "" } : { ...g, id: "" }); };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3"><Field label="Check-in"><input type="date" value={f.check_in} min={today} onChange={(e) => setF({ ...f, check_in: e.target.value })} className="num" /></Field><Field label="Check-out"><input type="date" value={f.check_out} min={f.check_in} onChange={(e) => setF({ ...f, check_out: e.target.value })} className="num" /></Field></div>
      <Field label={`Room · ${nights} night${nights > 1 ? "s" : ""}`}>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">{free.map((r) => <button key={r.id} type="button" onClick={() => pickRoom(r)} className={cn("keycard h-12 text-sm font-semibold", r.status, f.room_id === r.id && "!border-saffron shadow-glow")}><div className="font-display">{r.number}</div><div className="text-[9px] opacity-70 -mt-0.5">{r.room_types?.name?.slice(0, 8)}</div></button>)}</div>
      </Field>
      <div className="grid grid-cols-3 gap-3"><Field label="Rate / night"><input type="number" className="num" value={f.rate || ""} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} /></Field><Field label="Adults"><input type="number" min={1} className="num" value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></Field><Field label="Children"><input type="number" min={0} className="num" value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} /></Field></div>
      <div className="hairline-gold" />
      <Field label="Returning guest"><select value={g.id} onChange={(e) => pickGuest(e.target.value)}><option value="">— new guest —</option>{guests.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.phone ? ` · ${x.phone}` : ""}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Guest name"><input value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} required /></Field><Field label="Phone"><input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></Field></div>
      {!g.id && <div className="grid grid-cols-3 gap-3"><Field label="ID type"><select value={g.id_type} onChange={(e) => setG({ ...g, id_type: e.target.value })}><option>Aadhaar</option><option>Passport</option><option>Driving licence</option><option>Voter ID</option></select></Field><Field label="ID last 4"><input maxLength={4} className="num" value={g.id_last4} onChange={(e) => setG({ ...g, id_last4: e.target.value })} /></Field><Field label="Email"><input value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></Field></div>}
      <div className="grid grid-cols-2 gap-3"><Field label="Advance received"><input type="number" className="num" value={f.advance || ""} onChange={(e) => setF({ ...f, advance: Number(e.target.value) })} /></Field><Field label="Source"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="walk_in">Walk-in</option><option value="phone">Phone</option><option value="ota">OTA (MMT / Booking.com)</option><option value="agent">Agent</option></select></Field></div>
      <div className="flex justify-between items-baseline border-t border-dashed border-line pt-3"><span className="text-sm text-steel">{nights} × {formatINR(f.rate)} + room GST</span><span className="num text-2xl font-semibold">{formatINR(nights * f.rate)}</span></div>
      {err && <p className="text-sm text-chili">{err}</p>}
      <Button size="lg" className="w-full" disabled={pending || !f.room_id || !g.full_name} onClick={() => start(async () => { const r = await createBooking({ ...f, guest: g }); if ("error" in r) setErr(r.error!); else onDone(r.id!); })}>{pending ? "Saving…" : "Confirm booking"}</Button>
    </div>
  );
}
