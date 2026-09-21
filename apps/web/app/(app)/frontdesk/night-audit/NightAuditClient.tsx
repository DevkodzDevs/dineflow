"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, LogIn, LogOut, Sparkles, Star } from "lucide-react";
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
  guest_room_not_occupied: "is checked in, but the room is not marked occupied",
  sellable_but_dirty: "On sale, but housekeeping says dirty",
  stayed_past_checkout: "was due out before this date and is still in",
};

/** A list of bookings with the room first, the way a desk reads it. Declared here, not inside the page, so React keeps it mounted. */
function People({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-steel">{empty}</p>;
  return (
    <ul className="space-y-1.5">{rows.map((r) => (
      <li key={r.id}><Link href={`/frontdesk/${r.id}`} className="flex items-center gap-3 text-sm hover:underline"><span className="keycard h-8 w-10 grid place-items-center font-display text-sm shrink-0">{r.room}</span><span className="flex items-center gap-1.5 truncate">{r.vip && <Star size={12} className="text-champagne fill-current shrink-0" />}{r.guest}</span><span className="num text-xs text-steel ml-auto">#{r.no}</span></Link></li>
    ))}</ul>
  );
}

export function NightAuditClient({ today, date, audit, history, canClose }: { today: string; date: string; audit: Audit | null; history: Hist[]; canClose: boolean }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [noShows, setNoShows] = useState(true); const [notes, setNotes] = useState("");
  const shift = (d: number) => { const x = new Date(date + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  if (!audit) return <Card><p className="text-sm text-steel">The audit could not be read. Refresh the page, or check the server log.</p></Card>;
  const a = audit;
  const ready = a.not_arrived.length === 0 && a.due_out.length === 0 && a.discrepancies.length === 0;
  const close = () => start(async () => { const r = await runNightAudit(date, noShows, notes); if ("error" in r && r.error) toast(r.error, "err"); else { toast(`${date} closed`); setNotes(""); router.refresh(); } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/frontdesk/night-audit?date=${shift(-1)}`} className="h-9 px-3 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line num">‹ {shift(-1).slice(5)}</Link>
        <div className="text-lg font-semibold px-2">{new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
        {date < today && <Link href={`/frontdesk/night-audit?date=${shift(1)}`} className="h-9 px-3 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line num">{shift(1).slice(5)} ›</Link>}
        {a.closed && <Pill tone="ready">closed {new Date(a.closed.closed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Pill>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          <p className="text-xs text-steel mb-3">{a.due_out.length ? "Still in a room they should have left:" : "Every departure has checked out."}</p>
          <People rows={a.due_out} empty="—" />
        </Card>
        <Card>
          <h3 className="text-lg mb-1 flex items-center gap-2"><Sparkles size={16} /> Housekeeping</h3>
          <ul className="text-sm space-y-1.5 mt-3">
            <li className="flex justify-between"><span>Dirty rooms</span><span className={cn("num font-semibold", a.dirty_rooms > 0 && "text-chili")}>{a.dirty_rooms}</span></li>
            <li className="flex justify-between"><span>Out of order</span><span className="num font-semibold">{a.ooo_rooms}</span></li>
            <li className="flex justify-between"><span>Rooms in total</span><span className="num font-semibold">{a.rooms_total}</span></li>
          </ul>
          <Link href="/housekeeping" className="text-xs font-semibold text-steel hover:text-[var(--color-label)] mt-3 inline-block">Open housekeeping →</Link>
        </Card>
      </div>

      <Card className={cn(a.discrepancies.length && "!border-[var(--color-orange)]/50")}>
        <h3 className="text-lg mb-2 flex items-center gap-2">{a.discrepancies.length ? <AlertTriangle size={16} className="text-[var(--color-orange)]" /> : <CheckCircle2 size={16} className="text-mint" />} Discrepancies <span className="num text-steel text-sm ml-auto">{a.discrepancies.length}</span></h3>
        {a.discrepancies.length === 0 ? <p className="text-sm text-steel">The front office and housekeeping agree on every room.</p>
          : <ul className="text-sm space-y-1">{a.discrepancies.map((d, i) => <li key={i} className="flex gap-3"><span className="num font-semibold w-12 shrink-0">{d.room}</span><span>{d.who ? `${d.who} ${DISC[d.kind] ?? d.kind}` : DISC[d.kind] ?? d.kind}</span></li>)}</ul>}
      </Card>

      <Card>
        <h3 className="text-lg mb-1">{a.closed ? "Close the day again" : "Close the day"}</h3>
        <p className="text-xs text-steel mb-4">{ready ? "Nothing is outstanding." : "Anything still listed above goes into the record as it stands — settle what you can first."}{a.closed ? " Closing again replaces the snapshot with the numbers as they are now." : ""}</p>
        {canClose ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="w-4 h-4 accent-saffron mt-0.5" checked={noShows} onChange={(e) => setNoShows(e.target.checked)} />
              <span>Mark the {a.not_arrived.length} arrival{a.not_arrived.length === 1 ? "" : "s"} that never came as no-shows<span className="block text-xs text-steel mt-0.5">Their rooms go back on sale. A guest who turns up later gets a fresh booking.</span></span></label>
            <Field label="Notes for the record"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Power cut 9–10 pm; 204 comped for the noise…" /></Field>
            <Button size="lg" disabled={pending} onClick={close}>{pending ? "Closing…" : `Close ${date}`}</Button>
            {a.closed?.notes && <p className="text-xs text-steel">On record: {a.closed.notes}</p>}
          </div>
        ) : <p className="text-sm text-steel">An owner, manager, supervisor or front-desk login closes the day.</p>}
      </Card>

      {history.length > 0 && (
        <Card><h3 className="text-lg mb-3">Closed days</h3>
          <div className="overflow-x-auto -mx-2 px-2 table-wrap"><table className="w-full text-sm min-w-[560px]"><thead className="text-xs uppercase text-steel"><tr><th className="text-left py-1">Date</th><th className="text-right">Occ.</th><th className="text-right">ADR</th><th className="text-right">RevPAR</th><th className="text-right">Revenue</th><th className="text-right">No-shows</th><th className="text-right">Disc.</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.business_date} className="border-t border-line"><td className="py-2 num"><Link href={`/frontdesk/night-audit?date=${h.business_date}`} className="hover:underline">{h.business_date}</Link></td><td className="text-right num">{Math.round(Number(h.occupancy_pct))}%</td><td className="text-right num">{formatINR(Number(h.adr))}</td><td className="text-right num">{formatINR(Number(h.revpar))}</td><td className="text-right num font-semibold">{formatINR(Number(h.room_revenue))}</td><td className={cn("text-right num", h.no_shows > 0 && "text-chili")}>{h.no_shows}</td><td className={cn("text-right num", h.discrepancies > 0 && "text-[var(--color-orange)]")}>{h.discrepancies}</td></tr>)}</tbody></table></div></Card>
      )}
    </div>
  );
}
