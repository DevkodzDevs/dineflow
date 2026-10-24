"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, LogIn, LogOut, Sparkles, Star, ChevronRight } from "lucide-react";
import { Button, Card, Field, Pill, StatTile, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { runNightAudit } from "../actions";

type Row = { id: string; no: number; room: string; guest: string; vip: boolean };
export type Audit = {
  date: string; rooms_total: number; ooo_rooms: number; rooms_sellable: number; dirty_rooms: number; occupied: number; in_house: number;
  room_revenue: number; occupancy_pct: number; adr: number; revpar: number;
  arrivals: number; arrived: number; not_arrived: Row[]; no_shows: number; departures: number; departed: number; due_out: Row[];
  discrepancies: { kind: string; room: string; who: string | null }[];
  closed: { closed_at: string; notes: string | null; no_shows: number } | null;
};
type Hist = { business_date: string; occupied: number; rooms_sellable: number; occupancy_pct: number; adr: number; revpar: number; room_revenue: number; arrivals: number; departures: number; no_shows: number; discrepancies: number; notes: string | null; closed_at: string };

const DISC: Record<string, string> = {
  occupied_no_guest: "Shown occupied, but nobody is checked in",
  guest_room_not_occupied: "is checked in, but the room shows empty",
  sellable_but_dirty: "On sale, but housekeeping says dirty",
  stayed_past_checkout: "was due out before this date and is still in",
};
/* each kind of disagreement: a short name for its tag, its colour, and the screen that settles it */
const KIND: Record<string, { tag: string; c: string; fix: string; where: string }> = {
  occupied_no_guest: { tag: "No guest", c: "var(--color-orange)", fix: "/rooms", where: "Rooms" },
  guest_room_not_occupied: { tag: "Room shows empty", c: "var(--color-blue)", fix: "/rooms", where: "Rooms" },
  sellable_but_dirty: { tag: "Dirty on sale", c: "var(--color-red)", fix: "/housekeeping", where: "Housekeeping" },
  stayed_past_checkout: { tag: "Overstay", c: "var(--color-orange)", fix: "/frontdesk", where: "Front desk" },
};

/** A list of bookings with the room first, the way a desk reads it. Declared here, not inside the page, so React keeps it mounted. */
function People({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-steel">{empty}</p>;
  return (
    <ul className="space-y-1.5">{rows.map((r) => (
      <li key={r.id}><Link href={`/frontdesk/${r.id}`} className="flex items-center gap-3 text-sm hover:underline min-h-10 [@media(pointer:coarse)]:min-h-11"><span className="keycard h-8 w-10 grid place-items-center font-display text-sm shrink-0">{r.room}</span><span className="flex items-center gap-1.5 truncate">{r.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}{r.guest}</span><span className="num text-xs text-steel ml-auto">#{r.no}</span></Link></li>
    ))}</ul>
  );
}

export function NightAuditClient({ today, date, audit, history, canClose }: { today: string; date: string; audit: Audit | null; history: Hist[]; canClose: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [noShows, setNoShows] = useState(true); const [notes, setNotes] = useState("");
  const shift = (d: number) => { const x = new Date(date + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  if (!audit) return <Card><p className="text-sm text-steel">Could not load the audit. Refresh the page.</p></Card>;
  const a = audit;
  const ready = a.not_arrived.length === 0 && a.due_out.length === 0 && a.discrepancies.length === 0;
  const close = () => start(async () => { const r = await runNightAudit(date, noShows, notes); if ("error" in r && r.error) toast(r.error, "err"); else { toast(`${date} closed`); setNotes(""); } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/frontdesk/night-audit?date=${shift(-1)}`} className="h-9 [@media(pointer:coarse)]:h-11 px-3 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line num">‹ {shift(-1).slice(5)}</Link>
        <div className="text-lg font-semibold px-2">{new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
        {date < today && <Link href={`/frontdesk/night-audit?date=${shift(1)}`} className="h-9 [@media(pointer:coarse)]:h-11 px-3 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line num">{shift(1).slice(5)} ›</Link>}
        {a.closed && <Pill tone="ready">closed {new Date(a.closed.closed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Pill>}
      </div>

      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <StatTile label="Occupancy" value={`${Math.round(Number(a.occupancy_pct))}%`} sub={`${a.occupied} of ${a.rooms_sellable} sellable · ${a.ooo_rooms} out of order`} tone={Number(a.occupancy_pct) >= 80 ? "good" : undefined} />
        <StatTile label="ADR" value={formatINR(Number(a.adr))} sub="average rate per night sold" delay={0.05} />
        <StatTile label="RevPAR" value={formatINR(Number(a.revpar))} sub="revenue per sellable room" delay={0.1} />
        <StatTile label="Room revenue" value={formatINR(Number(a.room_revenue))} sub={`${a.in_house} in house right now`} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="text-lg mb-1 flex items-center gap-2"><LogIn size={16} /> Arrivals <span className="num text-steel text-sm ml-auto">{a.arrived}/{a.arrivals}</span></h3>
          <p className="text-xs text-steel mb-3">{a.no_shows > 0 ? `${a.no_shows} marked no-show · ` : ""}{a.not_arrived.length ? "Still expected:" : "Everyone expected has arrived."}</p>
          <People rows={a.not_arrived} empty="—" />
        </Card>
        <Card>
          <h3 className="text-lg mb-1 flex items-center gap-2"><LogOut size={16} /> Departures <span className="num text-steel text-sm ml-auto">{a.departed}/{a.departures}</span></h3>
          <p className="text-xs text-steel mb-3">{a.due_out.length ? "Past check-out, still in:" : "Every departure has checked out."}</p>
          <People rows={a.due_out} empty="—" />
        </Card>
        <Card>
          <h3 className="text-lg mb-1 flex items-center gap-2"><Sparkles size={16} /> Housekeeping</h3>
          <ul className="text-sm space-y-1.5 mt-3">
            <li className="flex justify-between"><span>Dirty rooms</span><span className={cn("num font-semibold", a.dirty_rooms > 0 && "text-chili")}>{a.dirty_rooms}</span></li>
            <li className="flex justify-between"><span>Out of order</span><span className="num font-semibold">{a.ooo_rooms}</span></li>
            <li className="flex justify-between"><span>Rooms in total</span><span className="num font-semibold">{a.rooms_total}</span></li>
          </ul>
          <Link href="/housekeeping" className="tap text-xs font-semibold text-steel hover:text-[var(--color-label)] mt-3 inline-flex min-h-10">Open housekeeping →</Link>
        </Card>
      </div>

      {/* Discrepancies (2026-10-24, the owner: "upgrade this card"): a head with the state as a tinted tile and the count
          as a badge; each disagreement its own row — the room as a tile, the guest in bold and what is wrong, a tag
          naming the kind in its colour, and the screen that settles it. All clear is a green tile and one line. */}
      <section className={cn("feather overflow-hidden", a.discrepancies.length && "!border-[color-mix(in_srgb,var(--color-orange)_45%,transparent)]")} data-discrepancies>
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <span className="h-10 w-10 rounded-[13px] grid place-items-center shrink-0" style={{ color: a.discrepancies.length ? "var(--color-orange)" : "var(--color-green)", background: `color-mix(in srgb, ${a.discrepancies.length ? "var(--color-orange)" : "var(--color-green)"} 14%, transparent)` }}>
            {a.discrepancies.length ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] !font-bold tracking-[-0.01em] leading-tight">Discrepancies</h3>
            <p className="text-[12.5px] text-[var(--color-label-2)] mt-0.5">{a.discrepancies.length ? "Desk and housekeeping disagree" : "Desk and housekeeping agree."}</p>
          </div>
          <span className="num h-7 min-w-7 px-2.5 rounded-full grid place-items-center text-[13px] font-bold shrink-0"
            style={{ color: a.discrepancies.length ? "var(--color-orange)" : "var(--color-label-2)", background: a.discrepancies.length ? "color-mix(in srgb, var(--color-orange) 14%, transparent)" : "var(--color-fill)" }}>{a.discrepancies.length}</span>
        </div>
        {a.discrepancies.length > 0 && (
          <ul className="border-t border-[var(--color-separator)]">
            {a.discrepancies.map((d, i) => { const k = KIND[d.kind] ?? { tag: "Check", c: "var(--color-orange)", fix: "/rooms", where: "Rooms" };
              return (
                <li key={i} className="border-b border-[var(--color-separator)] last:border-b-0">
                  <Link href={k.fix} className="flex items-center gap-3.5 px-4 sm:px-5 py-3.5 min-h-[68px] hover:bg-[var(--color-fill)] transition-colors" data-discrepancy={d.kind}>
                    <span className="relative h-12 w-12 shrink-0 rounded-[15px] grid place-items-center content-center" style={{ background: `color-mix(in srgb, ${k.c} 12%, var(--color-fill))`, boxShadow: `inset 0 0 0 .5px color-mix(in srgb, ${k.c} 30%, transparent)` }}>
                      <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-[var(--color-label-3)] leading-none">Room</span>
                      <span className="font-display text-[18px] leading-none mt-0.5 num">{d.room}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] leading-snug">{d.who ? <><b className="font-semibold">{d.who}</b> {DISC[d.kind] ?? d.kind}</> : DISC[d.kind] ?? d.kind}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold" style={{ color: k.c, background: `color-mix(in srgb, ${k.c} 13%, transparent)` }}><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: k.c }} />{k.tag}</span>
                        <span className="text-[12px] text-[var(--color-label-3)]">{`Settle in ${k.where}`}</span>
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
                  </Link>
                </li>); })}
          </ul>
        )}
      </section>

      <Card>
        <h3 className="text-lg mb-1">{a.closed ? "Close the day again" : "Close the day"}</h3>
        <p className="text-xs text-steel mb-4">{ready ? "Nothing is outstanding." : "Settle first — open items save as-is."}{a.closed ? " Closing again replaces the old numbers." : ""}</p>
        {canClose ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5" checked={noShows} onChange={(e) => setNoShows(e.target.checked)} />
              <span>Mark the {a.not_arrived.length} arrival{a.not_arrived.length === 1 ? "" : "s"} that never came as no-shows<span className="block text-xs text-steel mt-0.5">Rooms reopen. Late arrivals need a new booking.</span></span></label>
            <Field label="Notes for the record"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Power cut 9–10 pm; 204 comped for the noise…" /></Field>
            <Button size="lg" disabled={pending} onClick={close}>{pending ? "Closing…" : `Close ${date}`}</Button>
            {a.closed?.notes && <p className="text-xs text-steel">On record: {a.closed.notes}</p>}
          </div>
        ) : <p className="text-sm text-steel">Only owner, manager, supervisor or front desk can close.</p>}
      </Card>

      {history.length > 0 && (
        <Card><h3 className="text-lg mb-3">Closed days</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[560px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Date</th><th className="text-right">Occ.</th><th className="text-right">ADR</th><th className="text-right">RevPAR</th><th className="text-right">Revenue</th><th className="text-right">No-shows</th><th className="text-right">Disc.</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.business_date} className="border-t border-line"><td className="py-2 num"><Link href={`/frontdesk/night-audit?date=${h.business_date}`} className="hover:underline">{h.business_date}</Link></td><td className="text-right num">{Math.round(Number(h.occupancy_pct))}%</td><td className="text-right num">{formatINR(Number(h.adr))}</td><td className="text-right num">{formatINR(Number(h.revpar))}</td><td className="text-right num font-semibold">{formatINR(Number(h.room_revenue))}</td><td className={cn("text-right num", h.no_shows > 0 && "text-chili")}>{h.no_shows}</td><td className={cn("text-right num", h.discrepancies > 0 && "text-[var(--color-orange)]")}>{h.discrepancies}</td></tr>)}</tbody></table></div></Card>
      )}
    </div>
  );
}
