"use client";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Plus, Waves, Flower2, Tent, Pencil, Clock, Users, CalendarPlus } from "lucide-react";
import { Button, Sheet, Field, Card, Pill } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveFacility, bookFacility, cancelFacilityBooking } from "./actions";

type F = { id: string; name: string; kind: string; rate: number; duration_minutes: number; capacity: number };
type S = { id: string; facility_id?: string; starts_at: string; people: number; amount: number; guest_name: string | null; facilities: { name: string; kind: string } | null; bookings: { booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null } | null };
type IH = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };
/* Each kind keeps one colour everywhere: spa green, activities blue, venues amber. */
const KIND_TONE: Record<string, string> = {
  spa: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  activity: "bg-[var(--color-blue-2)] text-[var(--color-blue)]",
  venue: "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]",
};
const at = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const KIcon = ({ k, size = 16 }: { k: string; size?: number }) => (k === "spa" ? <Flower2 size={size} /> : k === "venue" ? <Tent size={size} /> : <Waves size={size} />);

export function FacilitiesClient({ facilities, slots, inHouse }: { facilities: F[]; slots: S[]; inHouse: IH[] }) {
  const [edit, setEdit] = useState<Partial<F> | null>(null); const [book, setBook] = useState<F | null>(null); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const [bf, setBf] = useState({ when: new Date(Date.now() + 5.5 * 3600e3 + 3600e3).toISOString().slice(0, 16), people: 1, booking: "", guest: "" });
  const grouped = ["spa", "activity", "venue"].map((k) => ({ k, items: facilities.filter((f) => f.kind === k) })).filter((g) => g.items.length);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="flex justify-end"><Button onClick={() => setEdit({ kind: "activity", duration_minutes: 60, capacity: 1 })}><Plus size={16} /> Facility</Button></div>
        {grouped.map((g) => (
          <section key={g.k}><div className="flex items-center gap-2 mb-3"><span className={`h-7 w-7 rounded-lg grid place-items-center ${KIND_TONE[g.k]}`}><KIcon k={g.k} size={14} /></span><span className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{g.k === "venue" ? "Venues" : g.k === "spa" ? "Spa & wellness" : "Activities"}</span><span className="num h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{g.items.length}</span></div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">{g.items.map((f, i) => (
              <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                {/* One compact card: what it is on top, what it costs and the Book button below. The
                    old card was a big icon, a gap, then name and price far apart — mostly air on a phone. */}
                {(() => {
                  const upcoming = slots.filter((x) => x.facility_id === f.id && new Date(x.starts_at).getTime() > Date.now());
                  return (
                    <div className="feather feather-lift h-full flex flex-col p-4 gap-3.5">
                      <div className="flex items-start gap-3.5">
                        <span className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 ${KIND_TONE[f.kind] ?? KIND_TONE.activity}`}><KIcon k={f.kind} size={22} /></span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-sans font-semibold text-[16px] leading-snug line-clamp-2">{f.name}</h3>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold text-[var(--color-label-2)]"><Clock size={11} /> {f.duration_minutes} min</span>
                            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold text-[var(--color-label-2)]"><Users size={11} /> up to {f.capacity}</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => setEdit(f)} aria-label={`Edit ${f.name}`} className="icon-btn !rounded-full shrink-0 -mt-1 -mr-1 text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]"><Pencil size={15} /></button>
                      </div>
                      <div className="mt-auto flex items-end gap-3 pt-3.5 border-t border-[var(--color-separator)]">
                        <div className="flex-1 min-w-0">
                          <div className="num font-display text-[22px] leading-none whitespace-nowrap">{formatINR(Number(f.rate), { whole: true })}</div>
                          <div className="text-[11.5px] mt-1.5 truncate"><span className="text-[var(--color-label-2)]">per person · </span>{upcoming.length ? <span className="text-[var(--color-green)] font-semibold">{upcoming.length} booked · next {at(upcoming[0].starts_at)}</span> : <span className="text-[var(--color-label-2)]">free to book</span>}</div>
                        </div>
                        <Button className="shrink-0" onClick={() => { setBook(f); setErr(null); }}><CalendarPlus size={16} /> Book</Button>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>))}</div></section>
        ))}
        {facilities.length === 0 && <p className="text-sm text-steel">Add spa treatments, activities and venues. Bookings post straight to the guest's room folio.</p>}
      </div>
      <Card className="h-fit lg:sticky lg:top-24"><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Schedule</div>
        <ul className="space-y-2">{slots.map((s) => <li key={s.id} className="flex items-center gap-3 text-sm"><span className="num text-xs text-steel w-16">{new Date(s.starts_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "")}</span><div className="flex-1 min-w-0"><div className="font-semibold truncate">{s.facilities?.name}</div><div className="text-xs text-steel truncate">{s.bookings ? `Room ${s.bookings.rooms?.number} · ${s.bookings.guests?.full_name}` : s.guest_name || "Walk-in"} · {s.people} pax</div></div>{s.bookings ? <Pill tone="gold">folio</Pill> : <Pill tone="pending">{formatINR(Number(s.amount))}</Pill>}<button onClick={() => start(() => { cancelFacilityBooking(s.id); })} className="text-xs text-steel hover:text-chili">×</button></li>)}{slots.length === 0 && <li className="text-sm text-steel">Nothing booked.</li>}</ul></Card>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit facility" : "New facility"}>
        <form className="space-y-4" action={(fd) => start(async () => { const r = await saveFacility(fd); if ("error" in r) setErr(r.error!); else setEdit(null); })}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <Field label="Name"><input name="name" defaultValue={edit?.name} required placeholder="Sunset catamaran ride" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Kind"><select name="kind" defaultValue={edit?.kind ?? "activity"}><option value="spa">Spa</option><option value="activity">Activity</option><option value="venue">Venue</option></select></Field><Field label="Rate"><input name="rate" type="number" className="num" defaultValue={edit?.rate ?? 0} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Duration (min)"><input name="duration_minutes" type="number" className="num" defaultValue={edit?.duration_minutes ?? 60} /></Field><Field label="Capacity"><input name="capacity" type="number" className="num" defaultValue={edit?.capacity ?? 1} /></Field></div>
          {err && <p className="text-sm text-chili">{err}</p>}<Button className="w-full" disabled={pending}>Save</Button>
        </form>
      </Sheet>
      <Sheet open={!!book} onClose={() => setBook(null)} title={`Book · ${book?.name ?? ""}`}>
        {book && <div className="space-y-4">
          <Field label="When"><input type="datetime-local" className="num" value={bf.when} onChange={(e) => setBf({ ...bf, when: e.target.value })} /></Field>
          <Field label="People"><input type="number" min={1} max={book.capacity} className="num" value={bf.people} onChange={(e) => setBf({ ...bf, people: Number(e.target.value) })} /></Field>
          <Field label="Charge to room (in-house guest)"><select value={bf.booking} onChange={(e) => setBf({ ...bf, booking: e.target.value })}><option value="">— walk-in / pay now —</option>{inHouse.map((b) => <option key={b.id} value={b.id}>Room {b.rooms?.number} · {b.guests?.full_name}</option>)}</select></Field>
          {!bf.booking && <Field label="Guest name"><input value={bf.guest} onChange={(e) => setBf({ ...bf, guest: e.target.value })} /></Field>}
          <div className="flex justify-between border-t border-dashed border-line pt-3"><span className="text-sm text-steel">{bf.people} × {formatINR(Number(book.rate))}</span><span className="num text-xl font-semibold">{formatINR(bf.people * Number(book.rate))}</span></div>
          {err && <p className="text-sm text-chili">{err}</p>}
          <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await bookFacility(book.id, new Date(bf.when).toISOString(), bf.people, bf.people * Number(book.rate), bf.booking || null, bf.guest); if ("error" in r) setErr(r.error!); else setBook(null); })}>{bf.booking ? "Book & post to folio" : "Book"}</Button>
        </div>}
      </Sheet>
    </div>
  );
}
