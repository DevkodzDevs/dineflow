"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Users, Phone, Check, X, Armchair, Plus, Star, PartyPopper, Percent, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, Field, Pill, StatTile, Sheet, Select, Segmented, cn, Empty, useToast } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { useLive } from "@/lib/useLive";
import { setReservation, addWalkIn, replyReview } from "./actions";

type R = { id: string; reservation_no: number; guest_name: string; guest_phone: string; on_date: string; at_time: string; party_size: number; occasion: string | null; note: string | null; status: string; table_id: string | null; offer_label: string | null; discount_pct: number; source: string; created_at: string };
type T = { id: string; name: string; capacity: number; status: string };
type V = { id: string; guest_name: string | null; rating: number; body: string | null; reply: string | null; created_at: string };

export function ReservationsClient({ day, list, tables, reviews }: { day: string; list: R[]; tables: T[]; reviews: V[] }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [tab, setTab] = useState<"today" | "reviews">("today");
  const [walkIn, setWalkIn] = useState(false); const [seating, setSeating] = useState<R | null>(null);
  const [w, setW] = useState({ name: "", phone: "", date: day, time: "19:30", party: 2, note: "" });
  const [replyTo, setReplyTo] = useState<V | null>(null); const [reply, setReply] = useState("");
  useLive(["reservations"], 30000);

  const upcoming = list.filter((r) => ["requested", "confirmed"].includes(r.status));
  const seated = list.filter((r) => r.status === "seated");
  const covers = list.filter((r) => r.status !== "cancelled" && r.status !== "no_show").reduce((t, r) => t + r.party_size, 0);
  const move = (d: number) => { const x = new Date(day); x.setDate(x.getDate() + d); return `/reservations?date=${x.toISOString().slice(0, 10)}`; };
  const act = (r: R, status: Parameters<typeof setReservation>[1], table?: string) => start(async () => { const x = await setReservation(r.id, status, table); if ("error" in x) toast(x.error!, "err"); else { toast(status === "seated" ? `${r.guest_name} seated` : `Marked ${status}`); setSeating(null); } });

  const Row = ({ r }: { r: R }) => (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} className="card p-4">
      <div className="flex items-start gap-3">
        <div className="text-center shrink-0"><div className="num font-display text-2xl leading-none">{r.at_time.slice(0, 5)}</div><div className="text-[11px] text-[var(--color-label-2)] mt-1 flex items-center justify-center gap-0.5"><Users size={10} /> {r.party_size}</div></div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-2">{r.guest_name}
            {r.occasion && <span className="pill pill-gold"><PartyPopper size={10} /> {r.occasion}</span>}
            {r.offer_label && <span className="pill pill-preparing"><Percent size={10} /> {r.discount_pct}%</span>}</div>
          <div className="text-xs text-[var(--color-label-2)] num flex items-center gap-2">#{r.reservation_no} · {r.guest_phone} · {r.source}</div>
          {r.note && <p className="text-xs text-[var(--color-label-2)] mt-1">“{r.note}”</p>}
        </div>
        <a href={`tel:${r.guest_phone}`} className="h-9 w-9 rounded-full bg-[var(--color-fill)] grid place-items-center shrink-0"><Phone size={15} /></a>
      </div>
      <div className="mt-3 flex gap-2">
        {r.status === "seated" ? <>
          <Pill tone="ready">seated{r.table_id ? ` · ${tables.find((t) => t.id === r.table_id)?.name ?? ""}` : ""}</Pill>
          <Button size="sm" variant="gray" className="ml-auto" onClick={() => act(r, "completed")}>Done</Button>
        </> : <>
          <Button size="sm" className="flex-1" onClick={() => setSeating(r)}><Armchair size={14} /> Seat them</Button>
          <Button size="sm" variant="gray" onClick={() => act(r, "no_show")}>No show</Button>
          <Button size="sm" variant="danger" onClick={() => { if (confirm(`Cancel ${r.guest_name}'s booking?`)) act(r, "cancelled"); }}><X size={14} /></Button>
        </>}
      </div>
    </motion.div>
  );

  return (
    <>
      <PageHeader eyebrow="Tables booked from your storefront" title="Reser" accent="vations"
        sub="Every booking a guest makes online lands here, with their offer already applied."
        actions={<div className="flex gap-2">
          <Link href={move(-1)}><Button variant="gray" aria-label="Previous day"><ChevronLeft size={16} /></Button></Link>
          <Link href={move(1)}><Button variant="gray" aria-label="Next day"><ChevronRight size={16} /></Button></Link>
          <Button onClick={() => setWalkIn(true)}><Plus size={16} /> Phone booking</Button>
        </div>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Bookings" value={String(list.filter((r) => r.status !== "cancelled").length)} sub={new Date(day).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} />
        <StatTile label="Covers expected" value={String(covers)} delay={.05} />
        <StatTile label="Waiting to arrive" value={String(upcoming.length)} tone={upcoming.length ? "alert" : "good"} delay={.1} />
        <StatTile label="Seated now" value={String(seated.length)} delay={.15} />
      </div>

      <Segmented value={tab} onChange={setTab} className="mb-5" options={[{ value: "today", label: "Bookings" }, { value: "reviews", label: `Reviews${reviews.length ? ` · ${reviews.length}` : ""}` }]} />

      {tab === "today" ? (
        list.length === 0 ? <Empty title="No bookings for this day" hint="Guests book from your public page. Switch the storefront on in Settings → Storefront, then share the link." action={<Link href="/settings/storefront"><Button>Set up the storefront</Button></Link>} /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div><div className="eyebrow mb-3">Arriving</div><div className="space-y-3"><AnimatePresence>{upcoming.map((r) => <Row key={r.id} r={r} />)}</AnimatePresence>{upcoming.length === 0 && <p className="text-sm text-[var(--color-label-2)]">Nobody left to arrive.</p>}</div></div>
            <div><div className="eyebrow mb-3">At the table</div><div className="space-y-3"><AnimatePresence>{seated.map((r) => <Row key={r.id} r={r} />)}</AnimatePresence>{seated.length === 0 && <p className="text-sm text-[var(--color-label-2)]">Nobody seated yet.</p>}</div></div>
          </div>
        )
      ) : (
        reviews.length === 0 ? <Empty title="No reviews yet" hint="Guests can leave one after they visit. A reply from you shows publicly under it." /> : (
          <div className="space-y-3">{reviews.map((v) => (
            <Card key={v.id}>
              <div className="flex items-center gap-2"><Pill tone={v.rating >= 4 ? "ready" : v.rating >= 3 ? "preparing" : "alert"}><Star size={11} fill="currentColor" /> {v.rating}</Pill>
                <span className="font-semibold text-sm">{v.guest_name ?? "Guest"}</span>
                <span className="text-xs text-[var(--color-label-3)] ml-auto">{new Date(v.created_at).toLocaleDateString("en-IN")}</span></div>
              {v.body && <p className="text-sm mt-2">{v.body}</p>}
              {v.reply ? <p className="text-sm mt-2 pl-3 border-l-2 border-[var(--color-champagne)] text-[var(--color-label-2)]"><b>You replied:</b> {v.reply}</p>
                : <Button size="sm" variant="gray" className="mt-3" onClick={() => { setReplyTo(v); setReply(""); }}>Reply publicly</Button>}
            </Card>))}</div>
        )
      )}

      <Sheet open={!!seating} onClose={() => setSeating(null)} title={`Seat ${seating?.guest_name ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-label-2)]">Pick a table — it turns occupied on the floor, and you can take their order straight away.</p>
          <div className="grid grid-cols-4 gap-2">
            {tables.map((t) => (
              <button key={t.id} disabled={t.status === "occupied"} onClick={() => seating && act(seating, "seated", t.id)}
                className={cn("card p-3 text-center disabled:opacity-35", t.capacity < (seating?.party_size ?? 0) && "border-[var(--color-red)]/40")}>
                <div className="font-display text-lg">{t.name}</div><div className="text-[10px] text-[var(--color-label-2)]">{t.capacity} seats</div>
              </button>
            ))}
          </div>
          <Button variant="gray" className="w-full" onClick={() => seating && act(seating, "seated")}>Seat without a table</Button>
        </div>
      </Sheet>

      <Sheet open={walkIn} onClose={() => setWalkIn(false)} title="Booking taken on the phone">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
            <Field label="Phone"><input value={w.phone} onChange={(e) => setW({ ...w, phone: e.target.value })} className="num" /></Field>
            <Field label="Date"><input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} className="num" /></Field>
            <Field label="Time"><input type="time" value={w.time} onChange={(e) => setW({ ...w, time: e.target.value })} className="num" /></Field>
          </div>
          <Field label="How many"><div className="flex gap-1.5 flex-wrap">{[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => <button key={n} onClick={() => setW({ ...w, party: n })} className={cn("chip !h-9", w.party === n && "on")}>{n}</button>)}</div></Field>
          <Field label="Note"><input value={w.note} onChange={(e) => setW({ ...w, note: e.target.value })} placeholder="Window table, birthday cake…" /></Field>
          <Button className="w-full" loading={pending} disabled={!w.name || !w.phone} onClick={() => start(async () => { const r = await addWalkIn(w); if ("error" in r) toast(r.error!, "err"); else { setWalkIn(false); toast("Booking added"); } })}>Add booking</Button>
        </div>
      </Sheet>

      <Sheet open={!!replyTo} onClose={() => setReplyTo(null)} title="Reply publicly">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-label-2)]">Your reply appears under the review on your public page. Keep it short and human.</p>
          <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank you for coming — sorry the biryani was late that evening, we have added a second cook on weekends." />
          <Button className="w-full" loading={pending} disabled={!reply} onClick={() => start(async () => { await replyReview(replyTo!.id, reply); setReplyTo(null); toast("Reply posted"); })}>Post reply</Button>
        </div>
      </Sheet>
    </>
  );
}
