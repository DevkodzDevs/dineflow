"use client";
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, LogIn, CalendarDays, Moon, Users, Star, ClipboardCheck, List, Check, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { suggestRoom } from "@/lib/roomsuggest";
import { useLive } from "@/lib/useLive";
import { Button, Sheet, Field, StatTile, Pill, cn, Empty, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { createBooking, checkIn, cancelBooking, moveRoom } from "./actions";

type Room = { id: string; number: string; floor: number; status: string; condition?: string | null; room_type_id: string | null; room_types: { name: string; base_rate: number; capacity: number } | null };
type Booking = { id: string; room_id: string | null; precheckin_at?: string | null; precheckin?: { arrival_time?: string | null } | null; booking_no: number; check_in: string; check_out: string; status: string; rate: number; adults: number; children: number; guests: { full_name: string; phone: string | null; vip?: boolean; preferences?: string | null } | null; rooms: { number: string; condition?: string | null; room_types: { name: string } | null } | null };
type RT = { id: string; name: string; base_rate: number; capacity: number };
type G = { id: string; full_name: string; phone: string | null; vip?: boolean };
/** housekeeping's word on a room, as the front desk needs to read it at a glance */
const CONDITION_DOT: Record<string, string> = { dirty: "bg-chili", clean: "bg-saffron", inspected: "bg-mint", pickup: "bg-sky" };

export function FrontDeskClient({ today, bookings, rooms, types, guests, inspectRule = false }: { today: string; bookings: Booking[]; rooms: Room[]; types: RT[]; guests: G[]; inspectRule?: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [open, setOpen] = useState(false); const toast = useToast();
  useLive(["bookings", "rooms"].map(String));
  const arrivals = bookings.filter((b) => b.status === "reserved" && b.check_in <= today);
  const departures = bookings.filter((b) => b.status === "checked_in" && b.check_out <= today);
  const inHouse = bookings.filter((b) => b.status === "checked_in");
  const upcoming = bookings.filter((b) => b.status === "reserved" && b.check_in > today);
  const occ = rooms.length ? Math.round((rooms.filter((r) => r.status === "occupied").length / rooms.length) * 100) : 0;

  /* An arrival's row says whether its room is actually ready — the thing a five-star desk checks
     before it says "welcome" — and a VIP is marked before the desk has to remember. */
  const Row = ({ b, action }: { b: Booking; action?: React.ReactNode }) => {
    const cond = b.status === "reserved" ? b.rooms?.condition : null;
    /* the room booked is not ready: offer a ready one of the same type, one tap to move (0081) */
    const better = b.status === "reserved" && b.check_in <= today ? suggestRoom(b, rooms, bookings, inspectRule) : null;
    return (
      <Link href={`/frontdesk/${b.id}`} className="feather feather-lift flex items-center gap-4 p-4">
        <div className="keycard h-12 w-14 grid place-items-center font-display text-lg shrink-0 relative">{b.rooms?.number}{cond && <span title={`Housekeeping: ${cond}`} className={cn("absolute top-1 right-1 h-2 w-2 rounded-full", CONDITION_DOT[cond] ?? "bg-steel")} />}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-1.5">{b.guests?.vip && <Star size={13} className="text-champagne fill-current shrink-0" aria-label="VIP" />}{b.guests?.full_name}</div>
          <div className="text-xs text-steel num truncate">#{b.booking_no} · {b.check_in.slice(5)} → {b.check_out.slice(5)} · {b.rooms?.room_types?.name} · <Users size={10} className="inline" /> {b.adults + b.children}</div>
          {b.guests?.preferences && <div className="text-xs text-champagne truncate mt-0.5">{b.guests.preferences}</div>}
          {cond && cond !== "inspected" && <div className={cn("text-[11px] mt-0.5", cond === "dirty" ? "text-chili" : "text-[var(--color-orange)]")}>{cond === "dirty" ? "Room not cleaned yet" : cond === "clean" ? (inspectRule ? "Room awaits inspection" : "Room cleaned") : "Room needs a touch-up"}</div>}
          {b.precheckin_at && b.status === "reserved" && <div className="text-[11px] mt-0.5 text-[var(--color-green)] font-semibold flex items-center gap-1"><CheckCircle2 size={11} className="shrink-0" /> Checked in online{b.precheckin?.arrival_time ? ` · arriving ${b.precheckin.arrival_time}` : ""}</div>}
          {better && (
            <button type="button" title={`Room ${better.number} (${better.condition}) is ready — same type`} aria-label={`Move to room ${better.number}, which is ready`} disabled={pending} onClick={(e) => { e.preventDefault(); start(async () => { const r = await moveRoom(b.id, better.id); if ("error" in r) toast(r.error!, "err"); else toast(`${b.guests?.full_name ?? "Guest"} moved to room ${r.number}`); }); }}
              className="mt-1.5 min-h-10 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-green-2)] text-[var(--color-green)] hover:brightness-110 transition max-w-full">
              <ArrowRightLeft size={13} className="shrink-0" /><span className="truncate">Move to {better.number}</span>
            </button>
          )}
        </div>
        <div className="num text-sm font-semibold hidden sm:block shrink-0">{formatINR(Number(b.rate))}/n</div>
        {action}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <StatTile label="Arrivals today" value={String(arrivals.length)} sub={arrivals.length ? "waiting to check in" : "all arrived"} />
        <StatTile label="Departures today" value={String(departures.length)} delay={0.05} />
        <StatTile label="In house" value={String(inHouse.length)} sub={`${occ}% occupancy`} tone={occ >= 80 ? "good" : undefined} delay={0.1} />
        <StatTile label="Rooms ready" value={String(rooms.filter((r) => r.status === "available").length)} sub={`${rooms.filter((r) => r.status === "cleaning").length} being cleaned`} delay={0.15} />
      </div>
      <div className="flex items-center gap-2"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Today</div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/frontdesk/night-audit" className="h-11 px-4 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line hover:bg-[var(--color-fill)] transition-colors"><span className="flex items-center gap-1.5"><ClipboardCheck size={16} /> Night audit</span></Link>
          <Button onClick={() => setOpen(true)}><Plus size={16} /> New booking</Button>
        </div></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0"><Head icon={<LogIn size={16} />} tone="green" label="Arrivals" n={arrivals.length} />
          <div className="space-y-3">{arrivals.map((b) => <Row key={b.id} b={b} action={<Button size="sm" variant="ink" disabled={pending} onClick={(e) => { e.preventDefault(); start(async () => { const r = await checkIn(b.id); if ("error" in r) toast(r.error!, "err"); }); }}>Check in</Button>} />)}{arrivals.length === 0 && <p className="text-sm text-steel">No pending arrivals.</p>}</div>
          <div className="mt-7"><Head icon={<CalendarDays size={16} />} tone="blue" label="Upcoming" n={upcoming.length} /></div>
          <div className="space-y-3">{upcoming.slice(0, 8).map((b) => <Row key={b.id} b={b} action={<button className="text-xs text-steel hover:text-chili" onClick={(e) => { e.preventDefault(); if (confirm("Cancel this booking?")) start(() => { cancelBooking(b.id); }); }}>cancel</button>} />)}{upcoming.length === 0 && <p className="text-sm text-steel">Nothing upcoming.</p>}</div></section>
        <section className="min-w-0"><Head icon={<Moon size={16} />} tone="orange" label="In house" n={inHouse.length} />
          <div className="space-y-3">{inHouse.map((b) => <Row key={b.id} b={b} action={b.check_out <= today ? <Pill tone="alert">due out</Pill> : <Pill tone="gold">night {Math.max(1, Math.round((Date.now() - new Date(b.check_in).getTime()) / 86400000))}</Pill>} />)}{inHouse.length === 0 && <Empty title="No guests in house" hint="Check in an arrival or create a walk-in booking." />}</div></section>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="New booking" wide>
        <BookingForm today={today} rooms={rooms} types={types} guests={guests} onDone={(id) => { setOpen(false); router.push(`/frontdesk/${id}`); }} />
      </Sheet>
    </div>
  );
}

function BookingForm({ today, rooms, guests, onDone }: { today: string; rooms: Room[]; types: RT[]; guests: G[]; onDone: (id: string) => void }) {
  const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ check_in: today, check_out: tomorrow, room_id: "", adults: 2, children: 0, rate: 0, advance: 0, source: "walk_in", notes: "" });
  const [g, setG] = useState({ id: "", full_name: "", phone: "", email: "", id_type: "Aadhaar", id_last4: "", address: "" });
  const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const nights = Math.max(1, Math.round((new Date(f.check_out).getTime() - new Date(f.check_in).getTime()) / 86400000));
  const free = rooms.filter((r) => r.status !== "maintenance");
  const pickRoom = (r: Room) => setF({ ...f, room_id: r.id, rate: Number(r.room_types?.base_rate ?? 0) });
  /* read once when the form opens (it only ever renders in the browser, inside the sheet) and saved
     only when someone picks — an effect that saved on mount wrote "4" over the saved choice */
  const [view, setViewState] = useState<"2" | "3" | "4" | "list">(() => {
    try { const v = localStorage.getItem("df-room-picker"); if (v === "2" || v === "3" || v === "4" || v === "list") return v; } catch { /* storage blocked */ }
    return "4";
  });
  const setView = (v: "2" | "3" | "4" | "list") => { setViewState(v); try { localStorage.setItem("df-room-picker", v); } catch { /* fine */ } };
  const pickGuest = (id: string) => { const x = guests.find((y) => y.id === id); setG(x ? { ...g, id, full_name: x.full_name, phone: x.phone ?? "" } : { ...g, id: "" }); };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3"><Field label="Check-in"><input type="date" value={f.check_in} min={today} onChange={(e) => setF({ ...f, check_in: e.target.value })} className="num" /></Field><Field label="Check-out"><input type="date" value={f.check_out} min={f.check_in} onChange={(e) => setF({ ...f, check_out: e.target.value })} className="num" /></Field></div>
      <Field label={`Room · ${nights} night${nights > 1 ? "s" : ""}`}>
        {/* On a phone the picker can be 2, 3 or 4 across, or a list with the room type in full; the
            choice is remembered on this device. From sm it is the six-across grid it always was. */}
        <div className="sm:hidden flex justify-end -mt-1 mb-2">
          <div role="radiogroup" aria-label="Room picker layout" className="inline-flex p-0.5 rounded-xl bg-[var(--color-fill)]">
            {(["2", "3", "4", "list"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={v === "list" ? "List" : `${v} across`} onClick={() => setView(v)}
                className={cn("h-9 min-w-10 px-2.5 rounded-[10px] text-[13px] font-semibold grid place-items-center transition-colors", view === v ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-[var(--color-label-2)]")}>
                {v === "list" ? <List size={15} /> : v}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("grid gap-2 sm:grid-cols-6", view === "2" ? "grid-cols-2" : view === "3" ? "grid-cols-3" : view === "list" ? "grid-cols-1" : "grid-cols-4")}>{free.map((r) => <RoomPick key={r.id} r={r} on={f.room_id === r.id} view={view} onPick={() => pickRoom(r)} />)}</div>
      </Field>
      <div className="grid grid-cols-3 gap-3"><Field label="Rate / night"><input type="number" className="num" value={f.rate || ""} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} /></Field><Field label="Adults"><input type="number" min={1} className="num" value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></Field><Field label="Children"><input type="number" min={0} className="num" value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} /></Field></div>
      <div className="hairline-gold" />
      <Field label="Returning guest"><select value={g.id} onChange={(e) => pickGuest(e.target.value)}><option value="">— new guest —</option>{guests.map((x) => <option key={x.id} value={x.id}>{x.vip ? "★ " : ""}{x.full_name}{x.phone ? ` · ${x.phone}` : ""}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Guest name"><input value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} required /></Field><Field label="Phone"><input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></Field></div>
      {!g.id && <div className="grid grid-cols-3 gap-3"><Field label="ID type"><select value={g.id_type} onChange={(e) => setG({ ...g, id_type: e.target.value })}><option>Aadhaar</option><option>Passport</option><option>Driving licence</option><option>Voter ID</option></select></Field><Field label="ID last 4"><input maxLength={4} className="num" value={g.id_last4} onChange={(e) => setG({ ...g, id_last4: e.target.value })} /></Field><Field label="Email"><input value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></Field></div>}
      <div className="grid grid-cols-2 gap-3"><Field label="Advance received"><input type="number" className="num" value={f.advance || ""} onChange={(e) => setF({ ...f, advance: Number(e.target.value) })} /></Field><Field label="Source"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="walk_in">Walk-in</option><option value="phone">Phone</option><option value="ota">OTA (MMT / Booking.com)</option><option value="agent">Agent</option></select></Field></div>
      <div className="flex justify-between items-baseline border-t border-dashed border-line pt-3"><span className="text-sm text-steel">{nights} × {formatINR(f.rate)} + room GST</span><span className="num text-2xl font-semibold">{formatINR(nights * f.rate)}</span></div>
      {err && <p className="text-sm text-chili">{err}</p>}
      <Button size="lg" className="w-full" disabled={pending || !f.room_id || !g.full_name} onClick={() => start(async () => { const r = await createBooking({ ...f, guest: g }); if ("error" in r) setErr(r.error!); else onDone(r.id!); })}>{pending ? "Saving…" : "Confirm booking"}</Button>
    </div>
  );
}

/** A section head that reads as one: its icon in a tinted tile, the name in bold, the count as a badge. */
function Head({ icon, label, n, tone }: { icon: ReactNode; label: string; n: number; tone: "green" | "blue" | "orange" }) {
  const c = tone === "green" ? "var(--color-green)" : tone === "blue" ? "var(--color-blue)" : "var(--color-orange)";
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="h-8 w-8 rounded-[10px] grid place-items-center shrink-0" style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }}>{icon}</span>
      <h2 className="text-[17px] !font-bold tracking-[-0.01em] text-[var(--color-label)]">{label}</h2>
      <span className="num h-6 min-w-6 px-2 rounded-full grid place-items-center text-[12px] font-bold" style={{ color: n ? c : "var(--color-label-2)", background: n ? `color-mix(in srgb, ${c} 15%, transparent)` : "var(--color-fill)" }}>{n}</span>
    </div>
  );
}

/** Housekeeping's word on a room, in words and colour. Explicit tokens: --color-saffron is the green
 *  tint in the dark theme, which made "clean" and "inspected" the same green dot. */
const COND_TONE: Record<string, { label: string; c: string }> = {
  inspected: { label: "Inspected", c: "var(--color-green)" }, clean: { label: "Clean", c: "var(--color-orange)" },
  dirty: { label: "Dirty", c: "var(--color-red)" }, pickup: { label: "Pickup", c: "var(--color-blue)" },
};

/**
 * One room in the booking picker. The number and its housekeeping dot sit together on one line
 * (the dot used to float in the corner, jammed against the edge), the type underneath, and where the
 * tile is wide enough the state in words. Picked is a green ring with a tick, not a black slab.
 */
function RoomPick({ r, on, view, onPick }: { r: Room; on: boolean; view: "2" | "3" | "4" | "list"; onPick: () => void }) {
  const t = r.condition ? COND_TONE[r.condition] : null;
  const note = r.status === "cleaning" ? { label: "Cleaning", c: "var(--color-blue)" } : r.status === "reserved" ? { label: "Reserved", c: "var(--color-orange)" } : null;
  const wide = view === "2" || view === "list";
  const dot = t && <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: t.c, boxShadow: `0 0 0 3px color-mix(in srgb, ${t.c} 22%, transparent)` }} />;
  return (
    <button type="button" onClick={onPick} aria-pressed={on} title={[t?.label, note?.label].filter(Boolean).join(" · ") || undefined}
      className={cn("room-pick relative min-w-0 rounded-2xl border text-left transition-all",
        on ? "border-[var(--color-tint)] bg-[var(--color-green-2)] shadow-[0_0_0_3px_rgb(76_217_100/.18)]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] hover:border-[var(--color-label-3)]",
        view === "list" ? "max-sm:flex max-sm:items-center max-sm:gap-3 max-sm:h-14 max-sm:px-4" : "", wide ? "max-sm:px-3.5 max-sm:py-3" : "", "px-2 py-2.5 sm:px-2 sm:py-2.5")}>
      {view === "list" ? (<>
        <span className="sm:hidden font-display text-xl w-12 shrink-0">{r.number}</span>
        <span className="sm:hidden flex-1 min-w-0 text-[13px] truncate">{r.room_types?.name ?? "—"}</span>
        <span className="sm:hidden flex items-center gap-2 shrink-0">
          {note && <span className="text-[11px] font-semibold" style={{ color: note.c }}>{note.label}</span>}
          {t && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: t.c }}>{dot}{t.label}</span>}
        </span>
      </>) : null}
      <span className={cn("flex flex-col", view === "list" && "max-sm:hidden", !wide && "items-center text-center", wide && "max-sm:items-start sm:items-center sm:text-center")}>
        <span className="flex items-center gap-1.5"><span className="font-display text-[19px] leading-none">{r.number}</span>{view === "2" ? <span className="max-sm:hidden contents">{dot}</span> : dot}</span>
        <span className={cn("mt-1 text-[11px] text-[var(--color-label-2)] truncate max-w-full", !wide && "sm:max-w-full")}>{wide ? r.room_types?.name : r.room_types?.name?.split(" ")[0]}</span>
        {wide && (t || note) && <span className="sm:hidden mt-1.5 flex flex-wrap gap-1">
          {t && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold inline-flex items-center" style={{ color: t.c, background: `color-mix(in srgb, ${t.c} 14%, transparent)` }}>{t.label}</span>}
          {note && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold inline-flex items-center" style={{ color: note.c, background: `color-mix(in srgb, ${note.c} 14%, transparent)` }}>{note.label}</span>}
        </span>}
      </span>
      {on && <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] grid place-items-center shadow"><Check size={12} strokeWidth={3} /></span>}
    </button>
  );
}
