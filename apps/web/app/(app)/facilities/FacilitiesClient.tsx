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
const KINDS = [{ key: "spa", label: "Spa & wellness" }, { key: "activity", label: "Activities" }, { key: "venue", label: "Venues" }];
const at = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const KIcon = ({ k, size = 16 }: { k: string; size?: number }) => (k === "spa" ? <Flower2 size={size} /> : k === "venue" ? <Tent size={size} /> : <Waves size={size} />);

export function FacilitiesClient({ facilities, slots, inHouse }: { facilities: F[]; slots: S[]; inHouse: IH[] }) {
  const [edit, setEdit] = useState<Partial<F> | null>(null); const [book, setBook] = useState<F | null>(null); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const [bf, setBf] = useState({ when: new Date(Date.now() + 5.5 * 3600e3 + 3600e3).toISOString().slice(0, 16), people: 1, booking: "", guest: "" });
  const [show, setShow] = useState("all");
  const grouped = ["spa", "activity", "venue"].map((k) => ({ k, items: facilities.filter((f) => f.kind === k) })).filter((g) => g.items.length);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5 min-w-0">
        {/* Filter by kind, with counts, and the one action, in the shared toolbar. */}
        <div className="toolbar !mb-5"><div className="toolbar-group">
          {[["all", "All", facilities.length], ...KINDS.map((k) => [k.key, k.label, facilities.filter((f) => f.kind === k.key).length] as const)].map(([key, label, n]) => (
            <button key={key} type="button" onClick={() => setShow(key as string)} className={`chip ${show === key ? "on" : ""}`}>{label}<span className="num text-[11px] opacity-70">{n}</span></button>
          ))}
        </div><div className="toolbar-group toolbar-end">
          <Button onClick={() => setEdit({ kind: show === "all" ? "activity" : show, duration_minutes: 60, capacity: 1 })}><Plus size={16} /> Facility</Button>
        </div></div>

        {/* One panel per kind, a full-width row per facility: nothing narrow, no half-empty rows.
            On a phone a row stacks (name and edit, then the chips, then price and Book); from md it
            reads straight across (.fac-row in globals.css). */}
        {grouped.filter((g) => show === "all" || g.k === show).map((g) => {
          const kind = KINDS.find((k) => k.key === g.k)!;
          const from = Math.min(...g.items.map((f) => Number(f.rate)));
          return (
            <motion.section key={g.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="feather overflow-hidden">
              <header className="flex items-center gap-3 px-4 md:px-5 py-3.5 border-b border-[var(--color-separator)]">
                <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${KIND_TONE[g.k]}`}><KIcon k={g.k} size={17} /></span>
                <h2 className="font-display text-[19px] leading-none">{kind.label}</h2>
                <span className="num h-6 min-w-6 px-2 rounded-full bg-[var(--color-fill)] text-[12px] font-bold grid place-items-center">{g.items.length}</span>
                <span className="ml-auto text-xs text-[var(--color-label-2)] whitespace-nowrap">from <b className="num text-[var(--color-label)]">{formatINR(from, { whole: true })}</b></span>
              </header>
              <ul className="divide-y divide-[var(--color-separator)]">
                {g.items.map((f) => {
                  const upcoming = slots.filter((x) => x.facility_id === f.id && new Date(x.starts_at).getTime() > Date.now());
                  return (
                    <li key={f.id} className="fac-row hover:bg-[var(--color-fill)] transition-colors">
                      <span className={`fa-icon h-12 w-12 rounded-2xl grid place-items-center ${KIND_TONE[f.kind] ?? KIND_TONE.activity}`}><KIcon k={f.kind} size={22} /></span>
                      <div className="fa-name min-w-0 font-semibold text-[16px] leading-snug line-clamp-2 md:line-clamp-1">{f.name}</div>
                      <div className="fa-meta flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold text-[var(--color-label-2)]"><Clock size={11} /> {f.duration_minutes} min</span>
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold text-[var(--color-label-2)]"><Users size={11} /> up to {f.capacity}</span>
                        {upcoming.length > 0 && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-green-2)] text-[11.5px] font-semibold text-[var(--color-green)]">{upcoming.length} booked · next {at(upcoming[0].starts_at)}</span>}
                      </div>
                      <div className="fa-price min-w-0">
                        <div className="num font-display text-[22px] leading-none whitespace-nowrap">{formatINR(Number(f.rate), { whole: true })}</div>
                        <div className="text-[11.5px] text-[var(--color-label-2)] mt-1">per person</div>
                      </div>
                      <Button className="fa-book" onClick={() => { setBook(f); setErr(null); }}><CalendarPlus size={16} /> Book</Button>
                      <button type="button" onClick={() => setEdit(f)} aria-label={`Edit ${f.name}`} className="fa-edit icon-btn !rounded-full text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)]"><Pencil size={15} /></button>
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          );
        })}
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
