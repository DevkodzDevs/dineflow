"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Phone, X, Armchair, Plus, Star, PartyPopper, Percent, ChevronLeft, ChevronRight, MessageCircle, Clock, AlarmClock, MoreHorizontal, ClipboardList, Check, CalendarDays, List } from "lucide-react";
import { waHref, waDate, waTime, firstName } from "@/lib/wa";
import { Button, Card, Field, Pill, Sheet, Segmented, cn, Empty, useToast } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import { useLive } from "@/lib/useLive";
import { setReservation, addWalkIn, replyReview, draftReviewReply } from "./actions";
import { AiButton } from "@/components/ui/AiButton";
import { Calendar, type Day } from "./Calendar";

type R = { id: string; reservation_no: number; guest_name: string; guest_phone: string; on_date: string; at_time: string; party_size: number; occasion: string | null; note: string | null; status: string; table_id: string | null; offer_label: string | null; discount_pct: number; source: string; created_at: string };
type T = { id: string; name: string; capacity: number; status: string };
type V = { id: string; guest_name: string | null; rating: number; body: string | null; reply: string | null; created_at: string };
type Kind = "coming" | "late" | "seated";
/** minutes into the day, in India — a booking's time is the restaurant's wall clock */
const nowIST = () => { const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }).split(":").map(Number); return h * 60 + m; };
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
/** a booking this many minutes past its time, not yet seated, is late */
const LATE_AFTER = 15;

/**
 * Who is coming to eat (globals.css SIMPLE SERVICE): a strip of the next seven days with how many tables
 * are booked on each; chips for Coming (blue), Late (red) and At table (green); then one card per
 * booking — the time big, the name, how many — with Seat now, a call and the WhatsApp confirmation. The
 * month grid and the guests' reviews are the other two tabs.
 */
export function ReservationsClient({ day, today, days, list, tables, reviews, month, ai = false, restaurant = "" }: { day: string; today: string; days: { date: string; n: number }[]; list: R[]; tables: T[]; reviews: V[]; month: Day[]; ai?: boolean; restaurant?: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [tab, setTab] = useState<"day" | "month" | "reviews">("day");
  const [walkIn, setWalkIn] = useState(false); const [seating, setSeating] = useState<R | null>(null);
  const [w, setW] = useState({ name: "", phone: "", date: day, time: "19:30", party: 2, note: "" });
  const [replyTo, setReplyTo] = useState<V | null>(null); const [reply, setReply] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [more, setMore] = useState<string | null>(null);
  const [only, setOnly] = useState<Kind | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(nowIST()); const t = setInterval(() => setNow(nowIST()), 30000); return () => clearInterval(t); }, []);
  useLive(["reservations"], 30000);

  const lateBy = (r: R) => (now !== null && r.on_date === today ? now - mins(r.at_time) : -1);
  const kindOf = (r: R): Kind | null => r.status === "seated" ? "seated" : ["requested", "confirmed"].includes(r.status) ? (lateBy(r) > LATE_AFTER ? "late" : "coming") : null;
  const live = list.filter((r) => kindOf(r));
  const count = (k: Kind) => live.filter((r) => kindOf(r) === k).length;
  // late first (they are standing at the door or not coming), then by time; the seated after
  const order: Record<Kind, number> = { late: 0, coming: 1, seated: 2 };
  const shown = live.filter((r) => !only || kindOf(r) === only).sort((a, b) => order[kindOf(a)!] - order[kindOf(b)!] || a.at_time.localeCompare(b.at_time));
  const covers = list.filter((r) => r.status !== "cancelled" && r.status !== "no_show").reduce((t, r) => t + r.party_size, 0);
  const move = (d: number) => { const x = new Date(`${day}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return `/reservations?date=${x.toISOString().slice(0, 10)}`; };
  const act = (r: R, status: Parameters<typeof setReservation>[1], table?: string) => start(async () => { const x = await setReservation(r.id, status, table); if ("error" in x) toast(x.error!, "err"); else { toast(status === "seated" ? `${r.guest_name} seated` : `Marked ${status.replace("_", " ")}`); setSeating(null); setMore(null); } });
  const K: Record<Kind, { cls: string; w: "coming" | "late" | "at_table"; Icon: typeof Clock }> = { coming: { cls: "st-new", w: "coming", Icon: Clock }, late: { cls: "st-late", w: "late", Icon: AlarmClock }, seated: { cls: "st-ready", w: "at_table", Icon: Armchair } };

  /** one booking: the time big, who and how many, where it stands; Seat now, a call, the WhatsApp confirmation */
  const card = (r: R, i: number) => {
    const k = kindOf(r)!; const meta = K[k]; const [h, mm] = r.at_time.split(":").map(Number); const late = lateBy(r);
    const wa = ["requested", "confirmed"].includes(r.status) ? waHref(r.guest_phone, `Hi ${firstName(r.guest_name)}, your table for ${r.party_size} at ${restaurant} is confirmed for ${waDate(r.on_date)} at ${waTime(r.at_time)}. Booking #${r.reservation_no}. See you soon!`) : null;
    const tbl = r.table_id ? tables.find((t) => t.id === r.table_id) : null;
    return (
      <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ delay: Math.min(i, 8) * 0.02 }}
        className={cn("feather !rounded-[22px] relative overflow-hidden p-4 pl-5 min-w-0", meta.cls)} data-res={r.id} data-kind={k}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ background: "var(--st)" }} />
        <div className="flex items-start gap-3 min-w-0">
          <div className="text-center shrink-0 w-[4.5rem]">
            <div className="font-display num text-[34px] leading-none">{((h + 11) % 12) + 1}:{String(mm).padStart(2, "0")}</div>
            <div className="mt-1 text-[12px] font-bold text-steel">{h < 12 ? "AM" : "PM"}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[17px] leading-tight line-clamp-2 break-words">{r.guest_name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-semibold text-steel">
              <span className="inline-flex items-center gap-1"><Users size={15} aria-hidden />{r.party_size}</span>
              {r.occasion && <span className="inline-flex items-center gap-1"><PartyPopper size={14} aria-hidden />{r.occasion}</span>}
              {r.offer_label && <span className="inline-flex items-center gap-1 text-[var(--color-orange)]"><Percent size={13} aria-hidden />{r.discount_pct}% off</span>}
            </div>
            {r.note && <p className="text-[13px] text-steel mt-1 truncate">“{r.note}”</p>}
          </div>
          <span className={cn("svc-chip lone !min-h-8 !text-[13px] !px-3 shrink-0", meta.cls)}><meta.Icon size={14} aria-hidden />{k === "late" ? <span className="num">Late {late} min</span> : k === "seated" && tbl ? <span>At {tbl.name}</span> : <Say w={meta.w} start />}</span>
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          {r.status === "seated"
            ? <>{tbl ? <Link href={`/orders/new?table=${tbl.id}`} className="svc-btn quiet sm flex-1"><ClipboardList size={18} aria-hidden /><Say w="take_order" /></Link> : null}
                <button type="button" className={cn("svc-btn quiet sm", !tbl && "flex-1")} disabled={pending} onClick={() => act(r, "completed")}><Check size={18} aria-hidden /> Done</button></>
            : <button type="button" className="svc-btn go sm flex-1" onClick={() => setSeating(r)} data-seat><Armchair size={18} aria-hidden /><Say w="seat_now" /></button>}
          <a href={`tel:${r.guest_phone}`} aria-label={`Call ${r.guest_name}`} title="Call" className="h-11 w-11 [@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><Phone size={18} /></a>
          {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label={`Send ${r.guest_name} the confirmation on WhatsApp`} title="Confirm on WhatsApp" className="h-11 w-11 [@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[var(--color-green)]"><MessageCircle size={18} /></a>}
          {r.status !== "seated" && <button type="button" onClick={() => setMore((x) => (x === r.id ? null : r.id))} aria-expanded={more === r.id} aria-label={`More for ${r.guest_name}`} className="h-11 w-11 [@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><MoreHorizontal size={18} /></button>}
        </div>
        {more === r.id && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="svc-btn quiet sm" disabled={pending} onClick={() => act(r, "no_show")}>Did not come</button>
            <button type="button" className="svc-btn no sm" disabled={pending} onClick={() => { if (confirm(`Cancel ${r.guest_name}'s booking?`)) act(r, "cancelled"); }}><X size={16} aria-hidden /> Cancel booking</button>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <>
      <SvcHead icon="reservations" title="Reservations" sub="Who is coming to eat — tap Seat now when they arrive"
        actions={<button type="button" className="svc-btn go sm !px-5" onClick={() => { setW((x) => ({ ...x, date: day })); setWalkIn(true); }} data-new-booking><Plus size={19} aria-hidden /><Say w="new_booking" /></button>} />

      {/* the next seven days, each with how many tables are booked; the arrows step a day either way */}
      <div className="flex items-center gap-2 mb-4 min-w-0" data-days>
        <Link href={move(-1)} aria-label="Previous day" className="hidden sm:grid h-[84px] w-11 shrink-0 place-items-center rounded-[18px] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><ChevronLeft size={18} /></Link>
        <div className="rail-fade flex-1 min-w-0 flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {days.map((d) => {
            const on = d.date === day; const dt = new Date(`${d.date}T00:00:00Z`);
            return (
              <Link key={d.date} href={`/reservations?date=${d.date}`} aria-current={on ? "date" : undefined} className={cn("shrink-0 w-[76px] sm:flex-1 sm:w-auto min-h-[84px] rounded-[18px] flex flex-col items-center justify-center gap-0.5 transition-colors", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                <span className="text-[12px] font-extrabold">{d.date === today ? "Today" : dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span>
                <span className="font-display num text-[26px] leading-none">{dt.getUTCDate()}</span>
                <span className={cn("text-[11px] font-bold num", on ? "opacity-70" : "text-steel")}>{d.n} table{d.n === 1 ? "" : "s"}</span>
                {on && covers > 0 && <span className="text-[11px] font-bold num opacity-70" data-guests>{covers} guest{covers === 1 ? "" : "s"}</span>}
              </Link>
            );
          })}
        </div>
        <Link href={move(1)} aria-label="Next day" className="hidden sm:grid h-[84px] w-11 shrink-0 place-items-center rounded-[18px] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><ChevronRight size={18} /></Link>
      </div>

      {/* the chips: on a phone one compact row of equal parts (they wrapped onto two lines); the day's guest
          count sits in its tile in the strip above */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 mb-5">
        <div className="grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:flex-wrap min-w-0" data-res-chips>
          {(["coming", "late", "seated"] as Kind[]).map((k) => { const meta = K[k]; const n = count(k); if (k === "late" && !n) return null; return (
            <button key={k} type="button" onClick={() => setOnly((x) => (x === k ? null : k))} aria-pressed={only === k} className={cn("svc-chip min-w-0 max-sm:justify-center max-sm:!px-2 max-sm:!gap-1.5 max-sm:!text-[13px]", meta.cls)} data-state-chip={k}><meta.Icon size={15} aria-hidden className="shrink-0" /><Say w={meta.w} start /><b className="num shrink-0">{n}</b></button>
          ); })}
        </div>
        <Segmented value={tab} onChange={setTab} className="sm:ml-auto max-sm:w-full max-sm:[&>button]:flex-1" options={[
          { value: "day", label: <span className="inline-flex items-center gap-1.5"><List size={15} /> Day</span> },
          { value: "month", label: <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} /> Month</span> },
          { value: "reviews", label: `Reviews${reviews.length ? ` · ${reviews.length}` : ""}` }]} />
      </div>

      {tab === "day" ? (
        list.length === 0 ? <Empty title="No bookings for this day" hint="Take one on the phone with New booking, or switch the storefront on in Settings → Storefront and guests book themselves." action={<Link href="/settings/storefront"><Button variant="gray">Set up the storefront</Button></Link>} /> : (
          <div className="grid gap-3 md:grid-cols-2 min-[100rem]:grid-cols-3" data-bookings>
            <AnimatePresence>{shown.map((r, i) => card(r, i))}</AnimatePresence>
            {shown.length === 0 && <p className="text-[15px] text-steel py-6 md:col-span-2">{only ? "Nobody in this group right now." : "Everyone has been and gone — nobody left to arrive."}</p>}
          </div>
        )
      ) : tab === "month" ? (
        /* the month grid: which days are busy; tap one and it opens on Day */
        <div className="min-w-0" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setTab("day"); }}><Calendar day={day} month={month} today={today} /></div>
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
          <p className="text-sm text-[var(--color-label-2)]">Pick a table — it turns occupied on the floor, and you can take their order straight away. {seating ? `${seating.party_size} people.` : ""}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {tables.map((t) => (
              <button key={t.id} disabled={t.status === "occupied"} onClick={() => seating && act(seating, "seated", t.id)}
                className={cn("card !min-h-16 p-3 text-center disabled:opacity-35", t.capacity < (seating?.party_size ?? 0) && "border-[var(--color-red)]/40")}>
                <div className="font-display text-xl">{t.name}</div><div className="text-[11px] text-[var(--color-label-2)]">{t.capacity} seats</div>
              </button>
            ))}
          </div>
          <Button variant="gray" className="w-full" onClick={() => seating && act(seating, "seated")}>Seat without a table</Button>
        </div>
      </Sheet>

      <Sheet open={walkIn} onClose={() => setWalkIn(false)} title="New booking">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
            <Field label="Phone"><input value={w.phone} inputMode="tel" onChange={(e) => setW({ ...w, phone: e.target.value })} className="num" /></Field>
            <Field label="Date"><input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} className="num" /></Field>
            <Field label="Time"><input type="time" value={w.time} onChange={(e) => setW({ ...w, time: e.target.value })} className="num" /></Field>
          </div>
          <Field label="How many"><div className="flex gap-1.5 flex-wrap">{[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => <button key={n} type="button" onClick={() => setW({ ...w, party: n })} className={cn("chip !h-11 !min-w-11 justify-center", w.party === n && "on")}>{n}</button>)}</div></Field>
          <Field label="Note"><input value={w.note} onChange={(e) => setW({ ...w, note: e.target.value })} placeholder="Window table, birthday cake…" /></Field>
          <Button className="w-full" size="lg" loading={pending} disabled={!w.name || !w.phone} onClick={() => start(async () => { const r = await addWalkIn(w); if ("error" in r) toast(r.error!, "err"); else { setWalkIn(false); toast("Booking added"); } })}>Add booking</Button>
        </div>
      </Sheet>

      <Sheet open={!!replyTo} onClose={() => setReplyTo(null)} title="Reply publicly">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <p className="text-sm text-[var(--color-label-2)] flex-1">Your reply appears under the review on your public page. Keep it short and human.</p>
            {ai && <AiButton label="Draft it" busy={drafting} onClick={() => { setDrafting(true); void draftReviewReply(replyTo!.id).then((r) => { if ("error" in r) toast(r.error!, "err"); else setReply(r.reply); }).finally(() => setDrafting(false)); }} />}
          </div>
          <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank you for coming — sorry the biryani was late that evening, we have added a second cook on weekends." />
          <Button className="w-full" loading={pending} disabled={!reply} onClick={() => start(async () => { await replyReview(replyTo!.id, reply); setReplyTo(null); toast("Reply posted"); })}>Post reply</Button>
        </div>
      </Sheet>
    </>
  );
}
