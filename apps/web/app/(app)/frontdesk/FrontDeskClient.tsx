"use client";
import { useEffect, useState, useTransition, type ReactNode, type ComponentType, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, LogIn, CalendarDays, Moon, Star, ClipboardCheck, CheckCircle2, ArrowRightLeft, Sparkles, ChevronRight, Armchair, BedDouble, Users } from "lucide-react";
import { suggestRoom } from "@/lib/roomsuggest";
import { useLive } from "@/lib/useLive";
import { Button, Sheet, StatTile, cn, useToast, ask } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";
import { checkIn, cancelBooking, moveRoom } from "./actions";
import { BookingForm, COND_TONE, type Room, type RoomTax } from "./BookingForm";
import sc from "./StayCard.module.css";
import bd from "./Board.module.css";

type Booking = { id: string; room_id: string | null; precheckin_at?: string | null; precheckin?: { arrival_time?: string | null } | null; booking_no: number; check_in: string; check_out: string; status: string; rate: number; adults: number; children: number; guests: { full_name: string; phone: string | null; vip?: boolean; preferences?: string | null } | null; rooms: { number: string; condition?: string | null; room_types: { name: string } | null } | null };
type RT = { id: string; name: string; base_rate: number; capacity: number };
type G = { id: string; full_name: string; phone: string | null; vip?: boolean };
/** A table booking today (page.tsx), with its table and the staying guest's room when it names one (0157). */
type TB = { id: string; at_time: string; guest_name: string; party_size: number; status: string; table: { name: string } | null; stay: { rooms: { number: string } | null } | null };

export function FrontDeskClient({ today, bookings, rooms, types, guests, inspectRule = false, tableBookings = [], canBook = false, tax, openNew = null }: { today: string; bookings: Booking[]; rooms: Room[]; types: RT[]; guests: G[]; inspectRule?: boolean; tableBookings?: TB[]; canBook?: boolean; tax?: RoomTax; openNew?: { room: string } | null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  /* /frontdesk?new=1&room=<id> opens Book a room with that room picked — a ready room's card on Rooms comes here (2026-11-03) */
  const [open, setOpenState] = useState(!!openNew); const [startRoom, setStartRoom] = useState(openNew?.room ?? ""); const toast = useToast();
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) { setStartRoom(""); if (window.location.search) window.history.replaceState(null, "", window.location.pathname); }   // a reload does not open it again
  };
  useLive(["bookings", "rooms", "reservations"].map(String));
  const arrivals = bookings.filter((b) => b.status === "reserved" && b.check_in <= today);
  const departures = bookings.filter((b) => b.status === "checked_in" && b.check_out <= today);
  const inHouse = bookings.filter((b) => b.status === "checked_in");
  const upcoming = bookings.filter((b) => b.status === "reserved" && b.check_in > today);
  const occ = rooms.length ? Math.round((rooms.filter((r) => r.status === "occupied").length / rooms.length) * 100) : 0;

  /* One booking as a stay ticket (StayCard.module.css; 2026-10-24, the owner twice: "ultra modern, user friendly,
     properly fit"). A band in the section's colour with the room big and where the stay stands; a tear line; the guest
     with an initials avatar; the stay read like a boarding pass — in and out with their weekdays, the nights on the
     track between; what the desk should know as chips (the room's state, online check-in), the guest's note, Move to;
     and a foot with the rate and the one thing to do. An arrival still says whether its room is actually ready — the
     thing a five-star desk checks before it says "welcome". */
  const Row = ({ b, kind, action }: { b: Booking; kind: "arrival" | "upcoming" | "inhouse"; action?: React.ReactNode }) => {
    const cond = b.status === "reserved" ? b.rooms?.condition : null;
    /* the room booked is not ready: offer a ready one of the same type, one tap to move (0081) */
    const better = b.status === "reserved" && b.check_in <= today ? suggestRoom(b, rooms, bookings, inspectRule) : null;
    const tone = cond ? COND_TONE[cond] : null;
    const state = cond && cond !== "inspected" ? { text: cond === "dirty" ? "Room not cleaned yet" : cond === "clean" ? (inspectRule ? "Room awaits inspection" : "Room cleaned") : "Room needs a touch-up", c: cond === "dirty" ? "var(--color-red)" : "var(--color-orange)" }
      : cond === "inspected" ? { text: "Room ready", c: "var(--color-green)" } : null;
    const at = (d: string) => new Date(d + "T12:00:00");   // midday, so no time zone moves the date
    const nights = Math.max(1, Math.round((at(b.check_out).getTime() - at(b.check_in).getTime()) / 86400000));
    const party = b.adults + b.children;
    const dueOut = kind === "inhouse" && b.check_out <= today;
    const night = Math.min(nights, Math.max(1, Math.round((at(today).getTime() - at(b.check_in).getTime()) / 86400000) + 1));
    const inDays = Math.max(1, Math.round((at(b.check_in).getTime() - at(today).getTime()) / 86400000));
    const outIn = Math.round((at(b.check_out).getTime() - at(today).getTime()) / 86400000);
    const outChip = kind === "inhouse" ? (outIn <= 0 ? { text: outIn < 0 ? "Past check-out" : "Checks out today", c: "var(--color-red)" } : { text: outIn === 1 ? "Checks out tomorrow" : `Checks out in ${outIn} days`, c: "var(--color-blue)" }) : null;
    const badge = kind === "arrival" ? (b.check_in < today ? `Due since ${fmtDate(at(b.check_in).toISOString())}` : "Arriving today")
      : kind === "upcoming" ? (inDays === 1 ? "Tomorrow" : `In ${inDays} days`)
      : dueOut ? "Due out" : `Night ${night} of ${nights}`;
    const toneVar = dueOut ? "var(--color-red)" : kind === "arrival" ? "var(--color-green)" : kind === "upcoming" ? "var(--color-blue)" : "var(--color-orange)";
    const name = b.guests?.full_name ?? "Guest";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
    const wd = (d: string) => at(d).toLocaleDateString("en-IN", { weekday: "short" });
    return (
      <Link href={`/frontdesk/${b.id}`} className={sc.card} style={{ "--tone": toneVar } as React.CSSProperties} data-booking={b.booking_no} data-kind={kind}>
        <div className={sc.band}>
          <div className={sc.room}>
            <div className={sc.roomLabel}>Room</div>
            <div className={sc.roomNo}><span className="num">{b.rooms?.number ?? "—"}</span>{tone && <span className={sc.dot} title={`Housekeeping: ${tone.label}`} style={{ background: tone.c, boxShadow: `0 0 0 3px color-mix(in srgb, ${tone.c} 22%, transparent)` }} data-room-dot />}</div>
            <div className={sc.roomType}>{b.rooms?.room_types?.name ?? "Room"}</div>
          </div>
          <span className={sc.badge} data-badge><span className={sc.badgeDot} aria-hidden />{badge}</span>
        </div>
        <div className={sc.perf} aria-hidden />
        <div className={sc.body}>
          <div className={sc.guest}>
            <span className={sc.avatar} aria-hidden>{initials || "G"}</span>
            <div className={sc.who}>
              <div className={sc.name}>{b.guests?.vip && <Star size={15} className="text-champagne fill-current shrink-0" aria-label="VIP" />}<span>{name}</span></div>
              <div className={sc.meta}><span className="num">{party}</span> {party === 1 ? "guest" : "guests"} · <span className="num">#{b.booking_no}</span></div>
            </div>
          </div>
          <div className={sc.stay} data-stay>
            <div className={sc.end}><div className={sc.endLabel}>Check-in</div><div className={sc.endDate}>{fmtDate(at(b.check_in).toISOString())}</div><div className={sc.endDay}>{wd(b.check_in)}</div></div>
            <div className={sc.track}><span className={sc.nights}><Moon size={12} aria-hidden />{nights === 1 ? "1 night" : `${nights} nights`}</span></div>
            <div className={cn(sc.end, sc.out)}><div className={sc.endLabel}>Check-out</div><div className={sc.endDate}>{fmtDate(at(b.check_out).toISOString())}</div><div className={sc.endDay}>{wd(b.check_out)}</div></div>
          </div>
          {/* every card has this row (2026-11-02, the owner: "cards look zigzag"): an in-house stay says when it leaves, so
              it is the same shape as the arrival beside it rather than a chip-row shorter */}
          {(state || outChip || (b.precheckin_at && b.status === "reserved")) && (
            <div className={sc.chips} data-chips>
              {outChip && <span className={sc.chip} style={{ color: outChip.c, background: `color-mix(in srgb, ${outChip.c} 12%, transparent)` }} data-out-chip><span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: outChip.c }} /><span>{outChip.text}</span></span>}
              {state &&<span className={sc.chip} style={{ color: state.c, background: `color-mix(in srgb, ${state.c} 12%, transparent)` }} data-room-state><span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: state.c }} /><span>{state.text}</span></span>}
              {b.precheckin_at && b.status === "reserved" && <span className={cn(sc.chip, "bg-[var(--color-green-2)] text-[var(--color-green)]")}><CheckCircle2 size={13} className="shrink-0" aria-hidden /><span>Checked in online{b.precheckin?.arrival_time ? ` · arriving ${b.precheckin.arrival_time}` : ""}</span></span>}
            </div>
          )}
          {b.guests?.preferences && <div className={sc.note}><Sparkles size={14} aria-hidden /><span>{b.guests.preferences}</span></div>}
          {better && (
            <button type="button" title={`Room ${better.number} (${better.condition}) is ready — same type`} aria-label={`Move to room ${better.number}, which is ready`} disabled={pending} onClick={(e) => { e.preventDefault(); start(async () => { const r = await moveRoom(b.id, better.id); if ("error" in r) toast(r.error!, "err"); else toast(`${b.guests?.full_name ?? "Guest"} moved to room ${r.number}`); }); }}
              className="mt-3 min-h-10 [@media(pointer:coarse)]:min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold bg-[var(--color-green-2)] text-[var(--color-green)] hover:brightness-110 transition max-w-full">
              <ArrowRightLeft size={14} className="shrink-0" /><span className="truncate">{`Move to ${better.number} · ready now`}</span>
            </button>
          )}
        </div>
        <div className={sc.foot}>
          <span className={sc.rate}><b className="num">{formatINR(Number(b.rate), { whole: true })}</b><small> / night</small></span>
          <span className={sc.act}>{action ?? <span className={sc.folio}>Folio <ChevronRight size={16} aria-hidden /></span>}</span>
        </div>
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
      <div className="flex flex-wrap items-center gap-2"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Today</div>
        {/* under 440px the two buttons take a row of their own and share it — "New booking" ran off a 360px phone */}
        <div className="ml-auto flex items-center gap-2 max-[440px]:w-full max-[440px]:ml-0 max-[440px]:[&>*]:flex-1">
          <Link href="/frontdesk/night-audit" className="h-11 px-4 rounded-full grid place-items-center whitespace-nowrap text-sm font-semibold bg-card border border-line hover:bg-[var(--color-fill)] transition-colors"><span className="flex items-center gap-1.5"><ClipboardCheck size={16} /> Night audit</span></Link>
          <Button onClick={() => setOpen(true)} data-fd-new-booking><Plus size={16} /> Book a room</Button>
        </div></div>
      {/* Four sections in one grid (2026-11-02, the owner: "cards alignment looks zigzag"). Two independent columns let
          Upcoming and Table bookings start at whatever height the column above them ended; as rows, Arrivals | In house and
          Upcoming | Table bookings start level. One column below lg, in the order it always had (order-*). */}
      {/* rows stretch (2026-11-02): an empty board takes its row-mate's height (Board.module.css), so both cells of a row end level */}
      <div className="grid gap-x-6 gap-y-7 lg:grid-cols-2" data-fd-grid>
        <section className="min-w-0 flex flex-col max-lg:order-1"><Head icon={<LogIn size={16} />} tone="green" label="Arrivals" n={arrivals.length} />
          <div className="flex-1 flex flex-col gap-3">{arrivals.map((b) => <Row key={b.id} b={b} kind="arrival" action={<Button size="sm" variant="ink" disabled={pending} data-check-in onClick={(e) => { e.preventDefault(); start(async () => { const r = await checkIn(b.id); if ("error" in r) toast(r.error!, "err"); }); }}><LogIn size={15} /> Check in</Button>} />)}{arrivals.length === 0 && <BoardEmpty icon={LogIn} tone="green" title="No arrivals waiting" hint="Today's check-ins" kind="arrivals" action={<button type="button" onClick={() => setOpen(true)} className="svc-btn quiet sm !px-3.5"><Plus size={15} aria-hidden /> Booking</button>} />}</div></section>
        <section className="min-w-0 flex flex-col max-lg:order-2 lg:order-3"><Head icon={<CalendarDays size={16} />} tone="blue" label="Upcoming" n={upcoming.length} />
          <div className="flex-1 flex flex-col gap-3">{upcoming.slice(0, 8).map((b) => <Row key={b.id} b={b} kind="upcoming" action={<button type="button" className="min-h-10 [@media(pointer:coarse)]:min-h-11 px-3.5 rounded-full text-[13px] font-semibold text-[var(--color-label-2)] bg-[var(--color-fill)] hover:text-[var(--color-red)] hover:bg-[var(--color-red-2)] transition-colors" onClick={async (e) => { e.preventDefault(); if (await ask({ title: "Cancel booking?", body: "The guest's booking is cancelled.", ok: "Cancel booking", cancel: "Keep it", tone: "danger", icon: "alert" })) start(async () => { const r = await cancelBooking(b.id); if ("error" in r) toast(r.error!, "err"); else toast("Booking cancelled"); }); }}>Cancel</button>} />)}{upcoming.length === 0 && <BoardEmpty icon={CalendarDays} tone="blue" title="Nothing coming up" hint="Future bookings" kind="upcoming" action={<button type="button" onClick={() => setOpen(true)} className="svc-btn quiet sm !px-3.5"><Plus size={15} aria-hidden /> Booking</button>} />}</div></section>
        <section className="min-w-0 flex flex-col order-3 lg:order-2"><Head icon={<Moon size={16} />} tone="orange" label="In house" n={inHouse.length} />
          <div className="flex-1 flex flex-col gap-3">{inHouse.map((b) => <Row key={b.id} b={b} kind="inhouse" action={canBook ? <span className="inline-flex items-center gap-2">
              {/* a table for this guest: New booking opens with their room chosen (0157) */}
              <button type="button" className="min-h-10 [@media(pointer:coarse)]:min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors" data-book-table={b.rooms?.number ?? ""}
                onClick={(e) => { e.preventDefault(); router.push(`/reservations?new=1&stay=${b.id}`); }}><Armchair size={14} aria-hidden /> Table</button>
              <span className={sc.folio}>Folio <ChevronRight size={16} aria-hidden /></span></span> : undefined} />)}{inHouse.length === 0 && <BoardEmpty icon={Moon} tone="orange" title="No guests in house" hint="Checked-in stays" kind="inhouse" action={<Button size="sm" onClick={() => setOpen(true)}><Plus size={15} /> New booking</Button>} />}</div></section>
        {/* today's table bookings (2026-10-30, the owner: "show the table reservations here too"): when, who, how many, the
            table and — a guest staying here — their room; tap one for Reservations, + for a new one */}
        <section className="min-w-0 flex flex-col order-4"><div><Head icon={<Armchair size={16} />} tone="violet" label="Table bookings" n={tableBookings.length}
            action={canBook ? <Link href="/reservations?new=1" className="h-10 [@media(pointer:coarse)]:h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" data-fd-book-table><Plus size={15} aria-hidden /> Book a table</Link> : undefined} /></div>
          <div className="flex-1 flex flex-col gap-2" data-fd-tables>
            {tableBookings.map((r) => <TableRow key={r.id} r={r} today={today} link={canBook} />)}
            {tableBookings.length === 0 && <BoardEmpty icon={Armchair} tone="violet" title="No tables booked today" hint="Today's table bookings" kind="tables" />}
          </div></section>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Book a room" wide>
        <BookingForm key={startRoom} today={today} rooms={rooms} types={types} guests={guests} bookings={bookings} inspectRule={inspectRule} tax={tax} initialRoom={startRoom} onDone={(id) => { setOpen(false); router.push(`/frontdesk/${id}`); }} />
      </Sheet>
    </div>
  );
}

/** A section head that reads as one: its icon in a tinted tile, the name in bold, the count as a badge. */
const TONE = { green: ["var(--color-green)", "var(--color-green-2)"], blue: ["var(--color-blue)", "var(--color-blue-2)"], orange: ["var(--color-orange)", "var(--color-orange-2)"], violet: ["var(--color-violet)", "var(--color-violet-2)"] } as const;
type Tone = keyof typeof TONE;

/** An empty board (Board.module.css): the hue, the icon twice — on a glowing tile and faint in the corner — the words and the
 *  action. Stretches to its row-mate's height from lg and stacks when it is tall. */
function BoardEmpty({ icon: Icon, tone, title, hint, action, kind }: { icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>; tone: Tone; title: string; hint: string; action?: ReactNode; kind: string }) {
  return (
    <div role="status" className={bd.empty} style={{ "--hue": TONE[tone][0], "--hue-2": TONE[tone][1] } as CSSProperties} data-fd-empty={kind}>
      <span className={bd.mark} aria-hidden><Icon strokeWidth={1.4} aria-hidden /></span>
      <div className={bd.inner}>
        <span className={bd.icon} aria-hidden><Icon size={21} strokeWidth={2.1} aria-hidden /></span>
        <span className={bd.words}><b className={bd.title}>{title}</b><span className={bd.hint}>{hint}</span></span>
        {action && <span className={bd.act}>{action}</span>}
      </div>
    </div>
  );
}

/** A board's head — one height (44px) with or without its button, so the two heads of a row stand level (2026-11-02). */
function Head({ icon, label, n, tone, action }: { icon: ReactNode; label: string; n: number; tone: Tone; action?: ReactNode }) {
  const c = TONE[tone][0];
  return (
    <div className="mb-3 min-h-11 flex items-center gap-2.5">
      <span className="h-8 w-8 rounded-[10px] grid place-items-center shrink-0" style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }}>{icon}</span>
      <h2 className="text-[17px] !font-bold tracking-[-0.01em] text-[var(--color-label)]">{label}</h2>
      <span className="num h-6 min-w-6 px-2 rounded-full grid place-items-center text-[12px] font-bold" style={{ color: n ? c : "var(--color-label-2)", background: n ? `color-mix(in srgb, ${c} 15%, transparent)` : "var(--color-fill)" }}>{n}</span>
      {action && <span className="ml-auto shrink-0">{action}</span>}
    </div>
  );
}

/** One table booking today on the front desk, as a ticket like the stays above it (2026-10-30, the owner: "ultra-modern, unique"):
 *  the time on a stub in its state's colour — blue coming, red late (15 minutes after), green at the table — a torn edge, then
 *  who, and the party, the table and — staying here — the room as small pills; where it stands at the end. A link to Reservations
 *  for whoever holds it. */
function TableRow({ r, today, link }: { r: TB; today: string; link: boolean }) {
  const [h, m] = r.at_time.split(":").map(Number);
  // the clock is read in the browser only, so the server's page and the first paint agree (no hydration mismatch)
  const [now, setNow] = useState<number | null>(null); useEffect(() => { setNow(Date.now()); }, []);
  const ist = now === null ? null : new Date(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const late = !!ist && r.status !== "seated" && ist.getHours() * 60 + ist.getMinutes() - (h * 60 + m) > 15;
  const st = r.status === "seated" ? { w: "At table", c: "var(--color-green)" } : late ? { w: "Late", c: "var(--color-red)" } : { w: "Coming", c: "var(--color-blue)" };
  const body = (
    <>
      <span className="fdt-time"><b className="num">{((h + 11) % 12) + 1}:{String(m).padStart(2, "0")}</b><small>{h < 12 ? "AM" : "PM"}</small></span>
      <span className="fdt-perf" aria-hidden />
      <span className="fdt-body">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[15.5px] font-bold truncate">{r.guest_name}</span>
          <span className="fdt-st"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{st.w}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="fdt-chip"><Users size={12} aria-hidden /><span className="num">{r.party_size}</span></span>
          {r.table?.name && <span className="fdt-chip"><Armchair size={12} aria-hidden />{r.table.name}</span>}
          {r.stay?.rooms?.number && <span className="fdt-chip fdt-room" data-fd-table-room><BedDouble size={12} aria-hidden />Room {r.stay.rooms.number}</span>}
        </span>
      </span>
      {link && <span className="fdt-go" aria-hidden><ChevronRight size={16} /></span>}
    </>
  );
  const style = { "--hue": st.c } as React.CSSProperties;
  return link
    ? <Link href={`/reservations?date=${today}`} className="fdt" style={style} data-fd-table={r.guest_name}>{body}</Link>
    : <div className="fdt" style={style} data-fd-table={r.guest_name}>{body}</div>;
}
