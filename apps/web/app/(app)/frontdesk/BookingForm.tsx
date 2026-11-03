"use client";
import { useState, useTransition } from "react";
import { Minus, Plus, List, Check, Star, AlertTriangle } from "lucide-react";
import { roomGstFor } from "@dineflow/shared";
import { Button, Field, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { createBooking } from "./actions";
import s from "./BookingForm.module.css";

export type Room = { id: string; number: string; floor: number; status: string; condition?: string | null; room_type_id: string | null; room_types: { name: string; base_rate: number; capacity: number } | null };
export type RT = { id: string; name: string; base_rate: number; capacity: number };
export type G = { id: string; full_name: string; phone: string | null; vip?: boolean };
type Bk = { room_id: string | null; check_in: string; check_out: string; status: string };
/** The room tax the folio will charge (roomGstFor — 5% up to ₹7,500 a night, 18% above), and whether the property may collect it. */
export type RoomTax = { on: boolean; low: number; high: number; threshold: number };

/** Housekeeping's word on a room, in words and colour. Explicit tokens: --color-saffron is the green
 *  tint in the dark theme, which made "clean" and "inspected" the same green dot. */
export const COND_TONE: Record<string, { label: string; c: string }> = {
  inspected: { label: "Inspected", c: "var(--color-green)" }, clean: { label: "Clean", c: "var(--color-orange)" },
  dirty: { label: "Dirty", c: "var(--color-red)" }, pickup: { label: "Pickup", c: "var(--color-blue)" },
};

/** "YYYY-MM-DD" plus n days, read as a calendar date (UTC arithmetic, so no time zone moves it). */
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
const longDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "G";
const SOURCES = [["walk_in", "Walk-in"], ["phone", "Phone"], ["ota", "OTA"], ["agent", "Agent"]] as const;

/**
 * Book a room (2026-11-03, the owner: "room booking more easily accessible, user friendly and easily understandable").
 * Four numbered steps on one sheet, each turning into a tick when it is done:
 *   1 When — the two dates, and counters for nights, adults and children (moving check-in keeps the nights);
 *   2 Room — the room types as chips with their rate, how many they sleep and how many are free; the picker as before
 *     (0166: a room that cannot take these dates says why and cannot be picked);
 *   3 Guest — one name and phone; a returning guest appears as you type either and one tap fills both;
 *   4 Payment — the rate (the type's, or changed), where the booking came from, the advance, a note.
 * The foot stays in view: the room, the nights and the guests, the room charge with its GST, the total or what is due,
 * and one button that says what is still missing until nothing is.
 */
export function BookingForm({ today, rooms, types, guests, bookings = [], inspectRule = false, tax, initialRoom = "", onDone }: { today: string; rooms: Room[]; types: RT[]; guests: G[]; bookings?: Bk[]; inspectRule?: boolean; tax?: RoomTax; initialRoom?: string; onDone: (id: string) => void }) {
  const first = rooms.find((r) => r.id === initialRoom);
  const [f, setF] = useState({ check_in: today, check_out: addDays(today, 1), room_id: first?.id ?? "", adults: 2, children: 0, rate: Number(first?.room_types?.base_rate ?? 0), advance: 0, source: "walk_in", notes: "" });
  const [g, setG] = useState({ id: "", full_name: "", phone: "", email: "", id_type: "Aadhaar", id_last4: "", address: "" });
  const [typeId, setTypeId] = useState("");
  const [moreGuest, setMoreGuest] = useState(false); const [moreNote, setMoreNote] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const nights = Math.max(1, daysBetween(f.check_in, f.check_out));
  const party = f.adults + f.children;

  /* moving check-in keeps the stay's length; check-out is never on or before check-in */
  const setIn = (d: string) => { if (!d) return; const v = d < today ? today : d; setF({ ...f, check_in: v, check_out: addDays(v, nights) }); };
  const setOut = (d: string) => { if (!d) return; setF({ ...f, check_out: d <= f.check_in ? addDays(f.check_in, 1) : d }); };
  const setNights = (n: number) => setF({ ...f, check_out: addDays(f.check_in, Math.min(60, Math.max(1, n))) });

  const free = rooms.filter((r) => r.status !== "maintenance");
  /* 0166 (the owner: "a room comes to booking free or not by what Room status says"). Any stay: not booked for any of those
     nights. A stay from today: also ready now — no guest still in it, not dirty or being cleaned, no touch-up owed, inspected
     where the property inspects. The same order as the database's _room_not_ready, which create_booking checks. */
  const fromToday = f.check_in <= today;
  const whyNot = (r: Room): string | null => {
    if (bookings.some((b) => b.room_id === r.id && b.check_in < f.check_out && b.check_out > f.check_in)) return "Booked";
    if (!fromToday) return null;
    if (r.status === "occupied" || bookings.some((b) => b.room_id === r.id && b.status === "checked_in")) return "Guest in";
    if (r.condition === "dirty") return "Being cleaned";
    if (r.condition === "pickup") return "Touch-up";
    if (inspectRule && r.condition !== "inspected") return "Not inspected";
    if (r.status === "cleaning") return "Being cleaned";
    return null;
  };
  const ranked = [...free].sort((a, b) => Number(!!whyNot(a)) - Number(!!whyNot(b)));
  const shown = typeId ? ranked.filter((r) => r.room_type_id === typeId) : ranked;
  const open = shown.filter((r) => !whyNot(r)).length;
  const picked = rooms.find((r) => r.id === f.room_id);
  const pickedWhy = picked ? whyNot(picked) : null;
  const roomOk = !!picked && !pickedWhy;
  const sleeps = picked?.room_types?.capacity ?? 0;
  const baseRate = Number(picked?.room_types?.base_rate ?? 0);
  const pickRoom = (r: Room) => setF({ ...f, room_id: r.id, rate: Number(r.room_types?.base_rate ?? 0) });
  /* the room types that have a room to show, with how many of them are free for these dates */
  const typeRows = types.map((t) => ({ t, all: free.filter((r) => r.room_type_id === t.id), open: free.filter((r) => r.room_type_id === t.id && !whyNot(r)).length })).filter((x) => x.all.length);

  /* read once when the form opens (it only ever renders in the browser, inside the sheet) and saved
     only when someone picks — an effect that saved on mount wrote "4" over the saved choice */
  const [view, setViewState] = useState<"2" | "3" | "4" | "list">(() => {
    try { const v = localStorage.getItem("df-room-picker"); if (v === "2" || v === "3" || v === "4" || v === "list") return v; } catch { /* storage blocked */ }
    return "4";
  });
  const setView = (v: "2" | "3" | "4" | "list") => { setViewState(v); try { localStorage.setItem("df-room-picker", v); } catch { /* fine */ } };

  /* a returning guest: whatever is typed in the name or the phone finds them; one tap fills both. Typing over a chosen
     guest's name makes it a new guest again. */
  const digits = g.phone.replace(/\D/g, "");
  const q = g.full_name.trim().toLowerCase();
  const matches = g.id ? [] : guests.filter((x) => (q.length >= 2 && x.full_name.toLowerCase().includes(q)) || (digits.length >= 3 && (x.phone ?? "").replace(/\D/g, "").includes(digits))).slice(0, 4);
  const chosen = g.id ? guests.find((x) => x.id === g.id) : undefined;
  const pickGuest = (x: G) => setG({ ...g, id: x.id, full_name: x.full_name, phone: x.phone ?? "" });
  const forgetGuest = () => setG({ ...g, id: "" });

  /* money: the room for the nights, the GST the folio will add (the slab is by the nightly rate), what is left after the advance */
  const room = nights * (f.rate || 0);
  const pct = tax?.on && f.rate > 0 ? roomGstFor(f.rate, tax.low, tax.high, tax.threshold) : 0;
  const gst = Math.round(room * pct) / 100;
  const total = room + gst;
  const due = Math.max(0, total - (f.advance || 0));

  const missing = !picked ? "Pick a room" : pickedWhy ? `Room ${picked.number}: ${pickedWhy.toLowerCase()} — pick another` : !g.full_name.trim() ? "Add the guest's name" : null;
  const save = () => start(async () => {
    setErr(null);
    const r = await createBooking({ ...f, notes: f.notes.trim() || undefined, guest: g });
    if ("error" in r) setErr(r.error!); else onDone(r.id!);
  });

  return (
    <div className={s.form} data-booking-form>
      {/* 1 · When */}
      <section className={s.step} data-step="when">
        <StepHead n={1} done title="When" aside={`${longDate(f.check_in)} → ${longDate(f.check_out)}`} />
        <div className={s.grid2}>
          <Field label="Check-in"><input type="date" value={f.check_in} min={today} onChange={(e) => setIn(e.target.value)} className="num" data-check-in-date /></Field>
          <Field label="Check-out"><input type="date" value={f.check_out} min={addDays(f.check_in, 1)} onChange={(e) => setOut(e.target.value)} className="num" data-check-out-date /></Field>
        </div>
        <div className={s.counters}>
          <Counter label="Nights" value={nights} min={1} max={60} onChange={setNights} data="nights" />
          <Counter label="Adults" value={f.adults} min={1} max={10} onChange={(n) => setF({ ...f, adults: n })} data="adults" />
          <Counter label="Children" value={f.children} min={0} max={10} onChange={(n) => setF({ ...f, children: n })} data="children" />
        </div>
      </section>

      {/* 2 · Room */}
      <section className={s.step} data-step="room">
        <StepHead n={2} done={roomOk} title="Room" aside={picked ? `Room ${picked.number}${picked.room_types?.name ? ` · ${picked.room_types.name}` : ""}` : `${open} free`} />
        {typeRows.length > 1 && (
          <div className={s.chips} role="group" aria-label="Room type" data-room-types>
            <button type="button" className={cn(s.chip, s.typeChip)} aria-pressed={!typeId} onClick={() => setTypeId("")} data-room-type-chip="">
              <span className={s.typeName}>All rooms</span><small className={ranked.some((r) => !whyNot(r)) ? s.free : s.none}>{ranked.filter((r) => !whyNot(r)).length} free</small>
            </button>
            {typeRows.map(({ t, open: n }) => (
              <button key={t.id} type="button" className={cn(s.chip, s.typeChip)} aria-pressed={typeId === t.id} onClick={() => setTypeId(typeId === t.id ? "" : t.id)} data-room-type-chip={t.name}>
                <span className={s.typeName} title={t.name}>{t.name}</span>
                <small><span className="num">{formatINR(Number(t.base_rate), { whole: true })}</span> · sleeps <span className="num">{t.capacity}</span> · <span className={n ? s.free : s.none}><span className="num">{n}</span> free</span></small>
              </button>
            ))}
          </div>
        )}
        {/* On a phone the picker can be 2, 3 or 4 across, or a list with the room type in full; the
            choice is remembered on this device. From sm it is the six-across grid it always was. */}
        <div className="sm:hidden flex items-center justify-between gap-2 -mb-1">
          <span className={s.line}>Tap a room</span>
          <div role="radiogroup" aria-label="Room picker layout" className="inline-flex p-0.5 rounded-xl bg-[var(--color-fill)]">
            {(["2", "3", "4", "list"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={v === "list" ? "List" : `${v} across`} onClick={() => setView(v)}
                className={cn("h-9 min-w-10 [@media(pointer:coarse)]:min-w-11 px-2.5 rounded-[10px] text-[13px] font-semibold grid place-items-center transition-colors", view === v ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-[var(--color-label-2)]")}>
                {v === "list" ? <List size={15} /> : v}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("grid gap-2 sm:grid-cols-6", view === "2" ? "grid-cols-2" : view === "3" ? "grid-cols-3" : view === "list" ? "grid-cols-1" : "grid-cols-4")}>{shown.map((r) => <RoomPick key={r.id} r={r} on={f.room_id === r.id} view={view} why={whyNot(r)} onPick={() => pickRoom(r)} />)}</div>
        <p className={s.line} data-rooms-open={open}>{open ? `${open} free ${fromToday ? "and ready now" : "for these dates"}` : fromToday ? "No room is ready now" : "No room is free for these dates"}</p>
        {roomOk && sleeps > 0 && party > sleeps && <p className={s.warn} data-sleeps-warn><AlertTriangle size={15} aria-hidden /><span>{`Room ${picked!.number} sleeps ${sleeps} — this booking is for ${party}`}</span></p>}
      </section>

      {/* 3 · Guest */}
      <section className={s.step} data-step="guest">
        <StepHead n={3} done={!!g.full_name.trim()} title="Guest" aside={chosen ? "Returning guest" : g.full_name.trim() ? "New guest" : undefined} />
        {chosen ? (
          <div className={s.known} data-guest-chosen>
            <span className={s.avatar} aria-hidden>{initials(chosen.full_name)}</span>
            <span className={s.matchName}><b className="flex items-center gap-1.5">{chosen.vip && <Star size={13} className="text-champagne fill-current shrink-0" aria-label="VIP" />}<span className="truncate">{chosen.full_name}</span></b><span className="num">{chosen.phone || "No phone saved"}</span></span>
            <button type="button" className={s.change} onClick={forgetGuest}>Change</button>
          </div>
        ) : (<>
          <div className={s.grid2}>
            <Field label="Guest name"><input value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} autoComplete="off" placeholder="Name" required data-guest-name /></Field>
            <Field label="Phone"><input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} inputMode="tel" autoComplete="off" className="num" placeholder="98400 12345" data-guest-phone /></Field>
          </div>
          {matches.length > 0 && (
            <div className={s.matches} data-guest-matches>
              <span className={s.matchLabel}>Returning guest?</span>
              {matches.map((x) => (
                <button key={x.id} type="button" className={s.match} onClick={() => pickGuest(x)} data-guest-match={x.full_name}>
                  <span className={s.avatar} aria-hidden>{initials(x.full_name)}</span>
                  <span className={s.matchName}><b className="flex items-center gap-1.5">{x.vip && <Star size={13} className="text-champagne fill-current shrink-0" aria-label="VIP" />}<span className="truncate">{x.full_name}</span></b><span className="num">{x.phone || "No phone saved"}</span></span>
                  <span className={s.matchGo}>Use</span>
                </button>
              ))}
            </div>
          )}
          {moreGuest ? (
            <div className={s.grid3}>
              <Field label="Email"><input type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} autoComplete="off" /></Field>
              <Field label="ID type"><select value={g.id_type} onChange={(e) => setG({ ...g, id_type: e.target.value })}><option>Aadhaar</option><option>Passport</option><option>Driving licence</option><option>Voter ID</option></select></Field>
              <Field label="ID last 4"><input maxLength={4} inputMode="numeric" className="num" value={g.id_last4} onChange={(e) => setG({ ...g, id_last4: e.target.value })} /></Field>
            </div>
          ) : <button type="button" className={s.more} onClick={() => setMoreGuest(true)} data-guest-more><Plus size={15} aria-hidden /> ID and email</button>}
        </>)}
      </section>

      {/* 4 · Payment */}
      <section className={s.step} data-step="pay">
        <StepHead n={4} done={roomOk && f.rate > 0} title="Payment" />
        <div className={s.grid2}>
          <Field label="Rate / night"><input type="number" min={0} inputMode="numeric" className="num" value={f.rate || ""} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} data-rate /></Field>
          <Field label="Advance received"><input type="number" min={0} inputMode="numeric" className="num" value={f.advance || ""} placeholder="0" onChange={(e) => setF({ ...f, advance: Number(e.target.value) })} data-advance /></Field>
        </div>
        {picked && baseRate > 0 && f.rate !== baseRate && <p className={s.line}>{`${picked.room_types?.name ?? "Room"} rate ${formatINR(baseRate, { whole: true })}`} · <button type="button" className={s.reset} onClick={() => setF({ ...f, rate: baseRate })}>Use it</button></p>}
        {total > 0 && (
          <div className={s.chips} role="group" aria-label="Advance">
            {/* one night is the full stay when the stay is one night — the same amount twice read as a mistake */}
            {([["None", 0], ["1 night", f.rate + Math.round(f.rate * pct) / 100], ...(nights > 1 ? [["Full stay", total]] : [])] as [string, number][]).map(([l, v]) => (
              <button key={l} type="button" className={s.chip} aria-pressed={Math.abs((f.advance || 0) - v) < 0.5} onClick={() => setF({ ...f, advance: Math.round(v) })} data-advance-chip={l}>
                {l}{v > 0 && <small className="num">{formatINR(Math.round(v), { whole: true })}</small>}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <span className={s.counterLabel}>Booked by</span>
          <div className={s.chips} role="radiogroup" aria-label="Booked by" data-source>
            {SOURCES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.source === k} className={s.chip} onClick={() => setF({ ...f, source: k })} data-source-chip={k}>{l}</button>)}
          </div>
        </div>
        {moreNote || f.notes ? (
          <Field label="Note for the stay"><textarea rows={2} maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Early arrival, extra bed…" data-booking-note /></Field>
        ) : <button type="button" className={s.more} onClick={() => setMoreNote(true)} data-note-more><Plus size={15} aria-hidden /> Note</button>}
      </section>

      {/* the foot, held in view (data-no-foot: the kit's own foot would pin the button alone) */}
      <div className={s.foot} data-no-foot data-booking-foot>
        <div className={s.sum}>
          <div className={s.sumText}>
            <span className={s.sumWhat} data-empty={!picked} data-booking-summary>{picked ? `Room ${picked.number}` : "No room yet"} · {nights === 1 ? "1 night" : `${nights} nights`} · {party === 1 ? "1 guest" : `${party} guests`}</span>
            <span className={s.sumMoney} data-booking-money>
              <span className="num">{formatINR(room, { whole: true })}</span>{pct > 0 && <> + GST {pct}% <span className="num">{formatINR(gst)}</span></>}{f.advance > 0 && <> · advance <span className="num">{formatINR(f.advance, { whole: true })}</span></>}
            </span>
          </div>
          <div className={s.total}><small>{f.advance > 0 ? "Due at check-out" : "Total"}</small><b className="num" data-booking-total>{formatINR(f.advance > 0 ? due : total)}</b></div>
        </div>
        {err && <p className={s.err} role="alert">{err}</p>}
        <Button size="lg" className="w-full" disabled={pending || !!missing} onClick={save} data-confirm-booking>{pending ? "Saving…" : missing ?? <><Check size={18} aria-hidden /> Confirm booking</>}</Button>
      </div>
    </div>
  );
}

function StepHead({ n, done, title, aside }: { n: number; done: boolean; title: string; aside?: string }) {
  return (
    <div className={s.head}>
      <span className={s.no} data-done={done} aria-hidden>{done ? <Check size={14} strokeWidth={3} /> : n}</span>
      <h3 className={s.title}>{title}</h3>
      {aside && <span className={cn(s.aside, "truncate")} data-step-aside>{aside}</span>}
    </div>
  );
}

function Counter({ label, value, min, max, onChange, data }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; data: string }) {
  return (
    <div className={s.counter} data-counter={data}>
      <span className={s.counterLabel}>{label}</span>
      <div className={s.ctl}>
        <button type="button" aria-label={`${label}: one fewer`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={17} /></button>
        <output className="num" aria-live="polite" aria-label={label}>{value}</output>
        <button type="button" aria-label={`${label}: one more`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={17} /></button>
      </div>
    </div>
  );
}

/**
 * One room in the booking picker. The number and its housekeeping dot sit together on one line
 * (the dot used to float in the corner, jammed against the edge), the type underneath, and where the
 * tile is wide enough the state in words. Picked is a green ring with a tick, not a black slab.
 */
function RoomPick({ r, on, view, why = null, onPick }: { r: Room; on: boolean; view: "2" | "3" | "4" | "list"; why?: string | null; onPick: () => void }) {
  const t = r.condition ? COND_TONE[r.condition] : null;
  /* 0166: a room that cannot take these dates says why and cannot be picked (create_booking refuses it too) */
  const note = why ? { label: why, c: "var(--color-red)" } : r.status === "cleaning" ? { label: "Cleaning", c: "var(--color-blue)" } : r.status === "reserved" ? { label: "Reserved", c: "var(--color-orange)" } : null;
  const wide = view === "2" || view === "list";
  const dot = t && <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: t.c, boxShadow: `0 0 0 3px color-mix(in srgb, ${t.c} 22%, transparent)` }} />;
  return (
    <button type="button" onClick={onPick} aria-pressed={on} disabled={!!why} data-room-pick={r.number} data-why={why ?? undefined} title={[t?.label, note?.label].filter(Boolean).join(" · ") || undefined}
      className={cn("room-pick relative min-w-0 rounded-2xl border text-left transition-all disabled:opacity-45 disabled:cursor-not-allowed",
        on ? "border-[var(--color-tint)] bg-[var(--color-green-2)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-tint)_18%,transparent)]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] hover:border-[var(--color-label-3)]",
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
        {/* the why, where the type was — on a wide phone tile the type stays and the why is the pill below */}
        <span className={cn("mt-1 text-[11px] text-[var(--color-label-2)] truncate max-w-full", !wide && "sm:max-w-full")}>
          {!why ? (wide ? r.room_types?.name : r.room_types?.name?.split(" ")[0])
            : wide ? <><span className="sm:hidden">{r.room_types?.name}</span><b className="max-sm:hidden text-[var(--color-red)]">{why}</b></>
            : <b className="text-[var(--color-red)]">{why}</b>}
        </span>
        {wide && (t || note) && <span className="sm:hidden mt-1.5 flex flex-wrap gap-1">
          {t && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold inline-flex items-center" style={{ color: t.c, background: `color-mix(in srgb, ${t.c} 14%, transparent)` }}>{t.label}</span>}
          {note && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold inline-flex items-center" style={{ color: note.c, background: `color-mix(in srgb, ${note.c} 14%, transparent)` }}>{note.label}</span>}
        </span>}
      </span>
      {on && <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] grid place-items-center shadow"><Check size={12} strokeWidth={3} /></span>}
    </button>
  );
}

