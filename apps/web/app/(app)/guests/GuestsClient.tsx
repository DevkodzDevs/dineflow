"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Star, Phone, Mail, MapPin, MessageCircle, BedDouble, CalendarDays, Wallet, ChevronRight } from "lucide-react";
import { Field, Sheet, Pill, cn, useToast } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";
import { saveGuestFlags, saveGuestNotes } from "./actions";

export type Booking = { id: string; booking_no: number; check_in: string; check_out: string; status: string; rate: number; rooms: { number: string } | null };
export type Guest = {
  id: string; full_name: string; phone: string | null; email: string | null;
  id_type: string | null; id_last4: string | null; address: string | null; notes: string | null;
  vip: boolean; preferences: string | null; created_at: string; bookings: Booking[];
};

const nights = (b: Booking) => Math.max(1, Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000));
const live = (g: Guest) => (g.bookings ?? []).filter((b) => b.status !== "cancelled");
const revenueOf = (g: Guest) => live(g).reduce((t, b) => t + nights(b) * Number(b.rate), 0);
const byNewest = (a: Booking, b: Booking) => b.check_in.localeCompare(a.check_in);
const lastStay = (g: Guest) => [...live(g)].sort(byNewest)[0] ?? null;
/** wa.me wants the country on the number; ten digits on their own is an Indian one. */
const waLink = (phone: string) => { const d = phone.replace(/\D/g, ""); return `https://wa.me/${d.length === 10 ? "91" + d : d}`; };
const tone = (s: string) => (s === "checked_in" ? "ready" : s === "reserved" ? "pending" : s === "checked_out" ? "served" : "alert") as "ready" | "pending" | "served" | "alert";

export function GuestsClient({ guests }: { guests: Guest[] }) {
  const [open, setOpen] = useState<Guest | null>(null);
  // the row that was clicked, kept fresh when its own edits change it
  const current = useMemo(() => (open ? guests.find((g) => g.id === open.id) ?? open : null), [open, guests]);

  return (
    <>
      <div className="feather overflow-x-auto table-wrap">
        <table className="w-full text-sm min-w-[860px]">
          <thead><tr>
            <th className="text-left px-4 py-3">Guest</th>
            <th className="text-left px-4 py-3">Contact</th>
            <th className="text-left px-4 py-3">Looks after</th>
            <th className="text-right px-4 py-3">Stays</th>
            <th className="text-left px-4 py-3">Last stay</th>
            <th className="text-right px-4 py-3">Lifetime room revenue</th>
            <th className="px-2 py-3" />
          </tr></thead>
          <tbody>
            {guests.map((g, i) => {
              const bs = live(g); const last = lastStay(g);
              return (
                <motion.tr key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 16) * 0.02 }}
                  onClick={() => setOpen(g)} tabIndex={0} role="button" aria-label={`Open ${g.full_name}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(g); } }}
                  className="border-t border-line cursor-pointer hover:bg-porcelain/60 focus:bg-porcelain/60 focus:outline-none">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 rounded-full bg-ink text-on-label grid place-items-center font-display shrink-0">{g.full_name.slice(0, 1)}</span>
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-1.5">
                          <span className="truncate">{g.full_name}</span>
                          {g.vip && <Star size={13} className="fill-champagne text-champagne shrink-0" aria-label="VIP" />}
                        </div>
                        <div className="text-xs text-steel">{g.id_type} ••••{g.id_last4}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-steel">{g.phone}{g.email ? <div className="text-xs truncate max-w-[190px]">{g.email}</div> : null}</td>
                  {/* read-only here, edited in the sheet: a text box in every row fought the row itself for the click */}
                  <td className="px-4 py-3 text-steel max-w-[240px]">
                    {g.preferences ? <span className="line-clamp-2 text-[13px]">{g.preferences}</span> : <span className="text-[13px] text-line">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right num font-semibold">{bs.length}</td>
                  <td className="px-4 py-3 num text-steel whitespace-nowrap">{last ? `${last.check_in} → ${last.check_out}` : "—"}</td>
                  <td className="px-4 py-3 text-right num font-semibold">{formatINR(revenueOf(g))}</td>
                  <td className="px-2 py-3 text-steel"><ChevronRight size={16} /></td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.full_name ?? ""} wide>
        {current && <GuestDetail key={current.id} g={current} />}
      </Sheet>
    </>
  );
}

function GuestDetail({ g }: { g: Guest }) {
  const bs = useMemo(() => [...live(g)].sort(byNewest), [g]);
  const allNights = bs.reduce((t, b) => t + nights(b), 0);
  const revenue = revenueOf(g);
  const first = bs[bs.length - 1] ?? null;
  const [vip, setVip] = useState(g.vip);
  const [pref, setPref] = useState(g.preferences ?? "");
  const [notes, setNotes] = useState(g.notes ?? "");
  const [savedPref, setSavedPref] = useState(g.preferences ?? "");
  const [savedNotes, setSavedNotes] = useState(g.notes ?? "");
  const [pending, start] = useTransition(); const toast = useToast();

  const saveFlags = (nextVip: boolean, nextPref: string) => start(async () => {
    const r = await saveGuestFlags(g.id, nextVip, nextPref);
    if ("error" in r && r.error) toast(r.error, "err"); else setSavedPref(nextPref);
  });
  const saveNote = (next: string) => start(async () => {
    const r = await saveGuestNotes(g.id, next);
    if ("error" in r && r.error) toast(r.error, "err"); else setSavedNotes(next);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="h-12 w-12 rounded-full bg-ink text-on-label grid place-items-center font-display text-xl shrink-0">{g.full_name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-steel">{g.id_type ? `${g.id_type} ••••${g.id_last4}` : "No ID on file"} · known since {fmtDate(g.created_at)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {bs.some((b) => b.status === "checked_in") && <Pill tone="ready">in house now</Pill>}
            {bs.length >= 3 && <Pill tone="gold">{bs.length} stays</Pill>}
          </div>
        </div>
        <button type="button" disabled={pending} aria-pressed={vip} title={vip ? "VIP — tap to clear" : "Mark as VIP"}
          onClick={() => { const n = !vip; setVip(n); saveFlags(n, pref); }}
          className={cn("h-10 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors",
            vip ? "bg-champagne-2 border-champagne text-champagne" : "border-line text-steel hover:text-[var(--color-label)]")}>
          <Star size={14} className={vip ? "fill-current" : ""} /> VIP
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Stays" value={String(bs.length)} />
        <Stat label="Nights" value={String(allNights)} />
        <Stat label="Room revenue" value={formatINR(revenue)} />
        <Stat label="Average night" value={formatINR(allNights ? revenue / allNights : 0)} />
      </div>

      <div className="rounded-2xl border border-line divide-y divide-line">
        {g.phone && (
          <Row icon={<Phone size={15} />} label={g.phone}>
            <a href={`tel:${g.phone}`} className="btn btn-outline !h-8 !text-xs">Call</a>
            <a href={waLink(g.phone)} target="_blank" rel="noreferrer" className="btn btn-outline !h-8 !text-xs"><MessageCircle size={13} /> WhatsApp</a>
          </Row>
        )}
        {g.email && <Row icon={<Mail size={15} />} label={g.email}><a href={`mailto:${g.email}`} className="btn btn-outline !h-8 !text-xs">Email</a></Row>}
        {g.address && <Row icon={<MapPin size={15} />} label={g.address} />}
        {!g.phone && !g.email && !g.address && <div className="px-3 py-3 text-sm text-steel">No contact details on file.</div>}
      </div>

      <Field label="How they like their stay" hint={pref !== savedPref ? "not saved yet" : undefined}>
        <input value={pref} onChange={(e) => setPref(e.target.value)} maxLength={300}
          onBlur={() => { if (pref !== savedPref) saveFlags(vip, pref); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="High floor, no feather pillows, late check-out…" />
      </Field>

      <Field label="Notes for the desk" hint={notes !== savedNotes ? "not saved yet" : undefined}>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000}
          onBlur={() => { if (notes !== savedNotes) saveNote(notes); }}
          placeholder="Travels with a driver who needs parking. Asked for the corner room last time and would again." />
      </Field>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1.5"><CalendarDays size={13} /> Every stay</div>
        {bs.length === 0 ? <p className="text-sm text-steel">No stays yet — this guest was added without a booking.</p> : (
          <div className="rounded-2xl border border-line divide-y divide-line">
            {bs.map((b) => (
              /* the dates need ~12rem to stay off the pill, so on a phone the pill and the amount
                 drop to a line of their own rather than sitting on top of them */
              <Link key={b.id} href={`/frontdesk/${b.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm hover:bg-porcelain/60">
                <span className="h-8 w-8 rounded-lg bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><BedDouble size={14} /></span>
                <span className="min-w-[12rem] flex-1">
                  <span className="block font-medium">{b.rooms?.number ? `Room ${b.rooms.number}` : `Booking #${b.booking_no}`}</span>
                  <span className="block text-xs text-steel num">{b.check_in} → {b.check_out} · {nights(b)} night{nights(b) === 1 ? "" : "s"}</span>
                </span>
                <span className="flex items-center gap-3 ml-auto shrink-0">
                  <Pill tone={tone(b.status)}>{b.status.replace("_", " ")}</Pill>
                  <span className="num font-semibold w-24 text-right">{formatINR(nights(b) * Number(b.rate))}</span>
                  <ChevronRight size={15} className="text-steel shrink-0" />
                </span>
              </Link>
            ))}
          </div>
        )}
        {first && <p className="text-[11px] text-steel mt-2">First stayed {first.check_in}. <Wallet size={11} className="inline" /> {formatINR(revenue)} across {bs.length} stay{bs.length === 1 ? "" : "s"}.</p>}
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-[var(--color-fill)] px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wide text-steel">{label}</div>
    <div className="num text-lg font-semibold mt-0.5">{value}</div>
  </div>
);

const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-3 py-2.5">
    <span className="text-steel shrink-0">{icon}</span>
    <span className="flex-1 min-w-0 text-sm break-words">{label}</span>
    {children && <span className="flex gap-1.5 shrink-0">{children}</span>}
  </div>
);
