"use client";
import { useState, useTransition, useEffect, type ReactNode } from "react";
import { Phone, Bell, BellRing, Armchair, X, QrCode, UserPlus, MessageCircle, Users, CalendarClock, AlertTriangle, Check, Hourglass, Clock, Timer, ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { waHref, firstName } from "@/lib/wa";
import { Card, useToast, cn, FlapShuffle, FlapSpell, FlapClock, FlapBreathe } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import { motion } from "framer-motion";
import { listV, itemV } from "@/lib/motion";
import { useLive } from "@/lib/useLive";
import { fmtSince } from "@/lib/format";
import { addWalkin, setWalkin, quote } from "./actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";

type T = { id: string; name: string; capacity: number; stage: "free" | "ordered" | "eating" | "served" | "billed"; age: number; mins_left: number; free_at: string };
type Pulse = { tables: T[]; free_now: number; seats_free_now: number; next_free_min: number | null; avg_dwell: number; history_days: number };
type R = { id: string; table_id: string; guest_name: string; party_size: number; at_time: string };
type W = { id: string; token: string; name: string; phone: string | null; party: number; quoted_min: number | null; status: "waiting" | "called"; joined_at: string; table_id: string | null };

const STAGE = { free: ["free", "pill-ready"], ordered: ["ordered", "pill-pending"], eating: ["eating", "pill-preparing"], served: ["served", "pill-sky"], billed: ["bill out", "pill-gold"] } as const;
/** Minutes as a person says them: 25 min, 2h 10m, 3 days — never "34736 min". */
const dur = (m: number) => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.floor(m / 1440)} day${m >= 2880 ? "s" : ""}`;
/** 20:30:00 → 8:30 pm */
const clock = (t: string) => { const [h, mm] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
/** An order open longer than this is not a sitting, it is a table someone forgot to bill or close. */
const STALE = 12 * 60;
type Tab = "all" | "free" | "reserved" | "busy";
const PARTY = [1, 2, 3, 4, 5, 6, 8, 10];

/** A numbered step: the number in a disc, the words beside it — the add-a-guest card reads 1 · 2 · 3. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center text-[13px] font-bold num" aria-hidden>{n}</span>
      <h3 className="text-[15px] font-bold leading-tight">{children}</h3>
    </div>
  );
}

/** A section's title with one plain line under it, saying what the block is for. */
function Head({ title, sub, end }: { title: ReactNode; sub: string; end?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[18px] font-extrabold leading-tight">{title}</h2>
        <p className="text-[13px] text-steel mt-0.5 leading-snug">{sub}</p>
      </div>
      {end}
    </div>
  );
}

/* A row action under a waiting guest: an icon in a 44px square (48 on touch); its word shows beside the icon
   once the card is wide enough to carry it (the card is an @container). */
const ACT = "h-11 [@media(pointer:coarse)]:h-12 min-w-11 [@media(pointer:coarse)]:min-w-12 px-3 shrink-0 rounded-[14px] inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors";

export function PulseClient({ pulse, queue, booked = [], slug, base, listed, restaurant = "" }: { pulse: Pulse; queue: W[]; booked?: R[]; slug: string; base: string; listed: boolean; restaurant?: string }) {
  useLive(["orders", "order_items", "bills", "dining_tables", "walkins"]);
  const toast = useToast(); const [pending, start] = useTransition(); const { online } = useOffline();
  const [party, setParty] = useState(2); const [q, setQ] = useState<number | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", phone: "" }); const [seat, setSeat] = useState<W | null>(null);
  useEffect(() => { let on = true; quote(party).then((m) => { if (on) setQ(m); }); return () => { on = false; }; }, [party, pulse]);
  const busy = pulse.tables.filter((t) => t.stage !== "free");
  /* The floor in three kinds. A free table with a booking still to come today is Reserved, not Free —
     seating a walk-in there is how a booked party ends up waiting. A table in use keeps its booking as
     a note ("next: Meera 8:30 pm"). */
  const minsOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const nowMin = minsOf(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(11, 16));
  // a booking still counts for half an hour after its time — the party may be running late
  const nextBooking = (id: string) => booked.find((r) => r.table_id === id && minsOf(r.at_time) >= nowMin - 30);
  const kindOf = (t: T): Exclude<Tab, "all"> => t.stage !== "free" ? "busy" : nextBooking(t.id) ? "reserved" : "free";
  const counts = { all: pulse.tables.length, free: 0, reserved: 0, busy: 0 } as Record<Tab, number>;
  pulse.tables.forEach((t) => { counts[kindOf(t)]++; });
  const [tab, setTab] = useState<Tab>("all");
  const order = (t: T) => kindOf(t) === "busy" ? (t.age > STALE ? -1 : t.mins_left) : kindOf(t) === "reserved" ? 1e4 : 2e4 + t.capacity;
  const shown = pulse.tables.filter((t) => tab === "all" || kindOf(t) === tab).sort((a, b) => order(a) - order(b));
  const soon = busy.filter((t) => t.age <= STALE).sort((a, b) => a.mins_left - b.mins_left).slice(0, 4);
  const STAGE_CLS: Record<T["stage"], string> = { free: "st-free", ordered: "st-new", eating: "st-cook", served: "st-eat", billed: "st-bill" };
  /* The answer to "how long?", in words a host can say at the door: the free table that fits (the smallest
     one, never one held for a booking), or the wait, or why there is no figure. quote_wait answers null when
     no table seats the party, or when more parties of that size are waiting than there are tables for them. */
  const fit = pulse.tables.filter((t) => kindOf(t) === "free" && t.capacity >= party).sort((a, b) => a.capacity - b.capacity)[0];
  const bigEnough = pulse.tables.some((t) => t.capacity >= party);
  const wait = q === undefined ? { tone: "st-new", big: "…", small: "Working out the wait" }
    : q === 0 ? { tone: "st-ready", big: "Seat now", small: fit ? `${fit.name} is free and seats ${fit.capacity}` : "A table that fits is free" }
      : q === null ? { tone: "st-cook", big: bigEnough ? "Long wait" : "No table fits", small: bigEnough ? "More parties this size are waiting than there are tables" : `No single table seats ${party} — put two together` }
        : { tone: "st-new", big: `About ${dur(q)}`, small: `until a table for ${party} is likely free` };
  const add = () => { if (!online) { void enqueue("walkin_add", { name: form.name, phone: form.phone, party }, `Queue · ${form.name}`); toast(`${form.name} added — will send when the line is back`); setForm({ name: "", phone: "" }); return; } start(async () => { const r = await addWalkin(form.name, form.phone, party); if ("error" in r) toast(r.error ?? "Could not add", "err"); else { toast(`${form.name} added · ~${r.quoted_min ?? "?"} min`); setForm({ name: "", phone: "" }); } }); };
  const callNow = (w: W) => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "called" }, `Queue · called ${w.name}`); return; } start(async () => { await setWalkin(w.id, "called"); }); };
  const glance = [
    { k: "free", Icon: Armchair, n: String(counts.free), of: `of ${pulse.tables.length}`, label: "Tables free to seat", tone: "var(--color-green)" },
    { k: "wait", Icon: Users, n: String(queue.length), of: "", label: queue.length === 1 ? "Party waiting" : "Parties waiting", tone: "var(--color-blue)" },
    { k: "sit", Icon: Timer, n: dur(pulse.avg_dwell), of: "", label: "A sitting usually takes", tone: "var(--color-orange)" },
  ];

  return (
    <div>
      <SvcHead icon="pulse" title="Pulse" sub="Who is waiting at the door, and which table frees up next"
        actions={<Link href="/pulse/qr" className="svc-btn quiet sm" data-joinqr-link><QrCode size={18} aria-hidden /><span>Join by QR</span></Link>} />

      {/* the floor in three numbers, before anything else: what is free, who is waiting, how long a table takes */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5" data-pulse-glance>
        {glance.map(({ k, Icon, n, of, label, tone }) => (
          <Card key={k} className="!p-3 sm:!p-4 !rounded-[20px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-[12px] grid place-items-center" style={{ color: tone, background: `color-mix(in srgb, ${tone} 15%, transparent)` }}><Icon size={19} aria-hidden /></span>
            <div className="min-w-0">
              {/* 2026-10-20 flap numbers: who is waiting breathes, what is free shuffles when it changes; a duration stays words */}
              {k === "wait" ? <div className="py-1" data-glance-n={n}><FlapBreathe value={queue.length} pad={0} size="xs" tile="clamp(32px, 6vw, 40px)" say={`${n} ${label}`} /></div>
                : k === "free" ? <div className="flex items-end gap-1.5 flex-wrap" data-glance-n={n}><FlapShuffle value={counts.free} pad={0} size="xs" tile="clamp(32px, 6vw, 40px)" bare say={`${n} ${of} ${label}`} /><span className="font-sans text-[12px] sm:text-[13px] font-semibold text-steel">{of}</span></div>
                : <div className="font-display num text-[22px] sm:text-[28px] leading-none truncate">{n}{of && <span className="font-sans text-[12px] sm:text-[13px] font-semibold text-steel"> {of}</span>}</div>}
              <div className="text-[12px] sm:text-[13px] text-steel mt-1 leading-tight">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Left: a guest at the door, in three numbered steps — how many, who, add — with the wait as the
          answer to step 1. Right: who is waiting, each with one big next move. Side by side from lg. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 mb-8 items-start" data-pulse-top>
        <Card className="min-w-0 !rounded-[24px] @container" data-quote>
          <Head title="Add a guest who is waiting" sub="Three steps — the wait is worked out for you from your own tables." />

          <Step n={1}>How many people?</Step>
          <div className="grid grid-cols-4 @[34rem]:grid-cols-8 gap-2" role="group" aria-label="Party size">
            {PARTY.map((n) => <button key={n} type="button" onClick={() => setParty(n)} aria-pressed={party === n}
              className={cn("h-14 @[34rem]:h-16 rounded-[16px] font-display num text-[24px] transition-colors", party === n ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>{n}</button>)}
          </div>
          {/* the answer: as large as the buttons above it, in the floor's colours — green to seat, blue to wait */}
          <div className={cn("mt-3 flex items-center gap-3.5 rounded-[18px] px-4 py-3.5 border", wait.tone)} style={{ background: "var(--st-2)", borderColor: "color-mix(in srgb, var(--st) 35%, transparent)" }} data-wait aria-live="polite">
            <span className="h-12 w-12 shrink-0 rounded-[14px] grid place-items-center" style={{ background: "color-mix(in srgb, var(--st) 18%, transparent)", color: "var(--st-ink)" }}>
              {q === 0 ? <Armchair size={24} aria-hidden /> : q === null ? <AlertTriangle size={22} aria-hidden /> : <Hourglass size={22} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold" style={{ color: "var(--st-ink)" }}>For <span className="num">{party}</span> {party === 1 ? "person" : "people"}</div>
              {/* the table to seat is spelled on the flaps ("T4"); a quoted wait counts its minutes on them */}
              {q === 0 && fit ? <div className="flex items-center gap-3 mt-1 flex-wrap"><span className="font-display num text-[28px] @[28rem]:text-[34px] leading-none" style={{ color: "var(--st-ink)" }}>{wait.big}</span><FlapSpell text={fit.name.slice(0, 5)} size="xs" tile="40px" bare tone="live" say={`table ${fit.name}`} /></div>
                : typeof q === "number" && q > 0 && q < 100 ? <div className="flex items-end gap-2 mt-1"><span className="font-display text-[22px] leading-none pb-1" style={{ color: "var(--st-ink)" }}>About</span><FlapShuffle value={q} pad={0} size="xs" tile="40px" bare say={`about ${q} minutes`} /><span className="font-display text-[22px] leading-none pb-1" style={{ color: "var(--st-ink)" }}>min</span></div>
                : <div className="font-display num text-[28px] @[28rem]:text-[34px] leading-none mt-1" style={{ color: "var(--st-ink)" }}>{wait.big}</div>}
              <div className="text-[13px] font-semibold mt-1.5 leading-snug" style={{ color: "var(--st-ink)" }}>{wait.small}</div>
            </div>
          </div>

          <div className="mt-5"><Step n={2}>Their name and phone</Step></div>
          <div className="grid grid-cols-1 @[26rem]:grid-cols-2 gap-2">
            <input placeholder="Name" aria-label="Guest's name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="!h-12" autoComplete="off" />
            <input placeholder="Phone (optional)" aria-label="Guest's phone (optional)" inputMode="tel" className="num !h-12" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="off" />
          </div>
          <p className="mt-1.5 text-[12px] text-steel">With a phone number you can tell them on WhatsApp when the table is ready.</p>

          <div className="mt-5"><Step n={3}>Put them on the list</Step></div>
          <button type="button" className="svc-btn go xl w-full" disabled={!form.name.trim() || pending} onClick={add} data-add-walkin><UserPlus size={21} aria-hidden /><Say w="add_waiting" /></button>
          <p className="mt-2 text-[12px] text-steel">{pulse.history_days >= 7 ? `Wait times learned from ${pulse.history_days} days of your own service.` : "Using a 45-minute sitting until a week of history builds up."}</p>
        </Card>

        <Card className="min-w-0 !rounded-[24px]" data-queue>
          <Head title={<>Waiting now <span className="ml-1 align-middle inline-grid place-items-center min-w-7 h-7 px-2 rounded-full bg-[var(--color-fill-2)] text-[14px] font-bold num">{queue.length}</span></>}
            sub="First come, first served. Tap Table ready when one frees up, then Seat them." />
          {queue.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-[var(--color-separator)] px-5 py-8 text-center">
              <span className="mx-auto h-14 w-14 rounded-[18px] grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><Users size={26} aria-hidden /></span>
              <div className="mt-3 text-[16px] font-bold">Nobody is waiting</div>
              <p className="mt-1 text-[13px] text-steel">Add a guest here, or let guests join by scanning the QR at the door.</p>
              <Link href="/pulse/qr" className="mt-3 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13px] font-semibold"><QrCode size={15} aria-hidden /> Show the door QR <ArrowRight size={14} aria-hidden /></Link>
            </div>
          )}
          <div className="space-y-2.5">
            {queue.map((w, i) => {
              const wa = waHref(w.phone, `Hi ${firstName(w.name)}, your table at ${restaurant} is ready. Please come to the host stand.${slug ? ` ${base}/queue/${slug}?t=${w.token}` : ""}`);
              const fits = pulse.tables.filter((t) => t.stage === "free" && t.capacity >= w.party).sort((a, b) => a.capacity - b.capacity);
              return (
                <div key={w.id} className={cn("@container rounded-[20px] border p-3.5 min-w-0 bg-[var(--color-bg)]", w.status === "called" ? "border-[var(--color-tint)] ring-2 ring-[var(--color-tint)]/30" : "border-[var(--color-separator)]")} data-walkin={w.status}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-14 w-14 shrink-0 rounded-[16px] bg-[var(--color-fill)] grid place-items-center leading-none" title={`Party of ${w.party}`}>
                      <span className="font-display num text-[26px]">{w.party}</span><span className="text-[9.5px] font-bold uppercase tracking-wider text-steel -mt-1.5">{w.party === 1 ? "guest" : "guests"}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0"><span className="text-[11.5px] font-bold text-steel num shrink-0">#{i + 1}</span><span className="font-extrabold text-[17px] truncate">{w.name}</span></div>
                      <div className="mt-0.5 text-[13px] font-semibold text-steel inline-flex items-center gap-1 num whitespace-nowrap"><Clock size={13} aria-hidden />waiting <span className="sr-only">{fmtSince(w.joined_at)}</span><FlapClock since={w.joined_at} hurry={w.quoted_min} late={w.quoted_min != null ? w.quoted_min + 10 : null} size="xs" tile="30px" bare />{w.quoted_min != null && <span className="font-normal"> · told {w.quoted_min} min</span>}</div>
                    </div>
                    {w.status === "called" && <span className="svc-chip lone st-ready !min-h-8 !text-[13px] !px-3 shrink-0"><BellRing size={14} aria-hidden /> Called</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {w.status === "waiting"
                      ? <button type="button" className="svc-btn go sm flex-1 !px-3" onClick={() => callNow(w)} data-table-ready><Bell size={18} aria-hidden /><Say w="table_ready" /></button>
                      : <button type="button" className="svc-btn go sm flex-1" onClick={() => setSeat(seat?.id === w.id ? null : w)} aria-expanded={seat?.id === w.id} data-seat-walkin><Armchair size={18} aria-hidden /><Say w="seat_now" /></button>}
                    {w.phone && <a href={`tel:${w.phone}`} aria-label={`Call ${w.name}`} title="Call" className={ACT}><Phone size={18} aria-hidden /><span className="hidden @[36rem]:inline">Call</span></a>}
                    {/* "Your table is ready" on WhatsApp, with their place-in-line link. Sending it is calling them. */}
                    {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label={`Tell ${w.name} on WhatsApp their table is ready`} title="Table ready — WhatsApp" onClick={() => { if (w.status === "waiting" && online) start(async () => { await setWalkin(w.id, "called"); }); }}
                      className={cn(ACT, "text-[var(--color-green)]")}><MessageCircle size={18} aria-hidden /><span className="hidden @[36rem]:inline">WhatsApp</span></a>}
                    {w.status === "waiting" && <button type="button" onClick={() => setSeat(seat?.id === w.id ? null : w)} aria-label={`Seat ${w.name}`} aria-expanded={seat?.id === w.id} title="Seat at a table" className={cn(ACT, "max-sm:hidden")}><Armchair size={18} aria-hidden /><span className="hidden @[36rem]:inline">Seat</span></button>}
                    <button type="button" aria-label={`${w.name} left`} title="Left — take them off the list" className={cn(ACT, "!bg-transparent text-steel hover:!bg-[var(--color-red-2)] hover:text-[var(--color-red)]")}
                      onClick={() => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "left" }, `Queue · ${w.name} left`); return; } start(async () => { await setWalkin(w.id, "left"); }); }}><X size={18} aria-hidden /><span className="hidden @[36rem]:inline">Left</span></button>
                  </div>
                  {seat?.id === w.id && <div className="mt-3 pt-3 border-t border-[var(--color-separator)]">
                    <div className="text-[13px] font-semibold text-steel mb-2">Pick a free table for {w.party}</div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                      {fits.map((t) => {
                        const r = nextBooking(t.id);
                        return (
                          <button key={t.id} type="button" className={cn("min-h-14 px-2 py-1.5 rounded-[14px] flex flex-col items-center justify-center leading-tight transition-colors", r ? "bg-[var(--color-orange-2)] hover:brightness-105" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}
                            onClick={() => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "seated", table: t.id }, `Queue · ${w.name} seated`); setSeat(null); toast(`${w.name} seated at ${t.name}`); return; } start(async () => { await setWalkin(w.id, "seated", t.id); setSeat(null); toast(`${w.name} seated at ${t.name}`); }); }}>
                            <span className="font-display text-[20px]">{t.name}</span>
                            <span className={cn("text-[11.5px] font-semibold", r ? "text-[var(--color-orange)]" : "text-steel")}>{r ? `booked ${clock(r.at_time)}` : `seats ${t.capacity}`}</span>
                          </button>
                        );
                      })}
                    </div>
                    {fits.length === 0 && <p className="text-[13px] text-steel">No free table big enough yet — it will show here when one frees up.</p>}
                  </div>}
                </div>
              );
            })}
          </div>
          {queue.length > 0 && <p className="mt-3 text-[12px] text-steel flex gap-1.5"><Info size={14} className="shrink-0 mt-px" aria-hidden />Table ready tells them (on WhatsApp too, if they gave a number). ✕ takes off someone who left.</p>}
        </Card>
      </div>

      {/* the tables that free next — what a host quoting a wait looks at */}
      <section className="mb-8" data-frees-next>
        <Head title="Next tables to free up" sub="Use these when a guest asks how long." />
        {soon.length === 0 ? <p className="text-[15px] text-steel">{busy.length ? "Only tables open for days — bill or close them below." : "Every table is free — seat straight away."}</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {soon.map((t) => (
              <div key={t.id} className={cn("rounded-[20px] border-2 p-3.5 min-w-0", STAGE_CLS[t.stage])} style={{ borderColor: "var(--st)", background: "var(--st-2)" }}>
                <div className="flex items-center justify-between gap-1"><span className="font-display text-[28px] leading-none truncate">{t.name}</span><span className="text-[13px] font-bold text-steel inline-flex items-center gap-1 shrink-0"><Users size={14} aria-hidden />{t.capacity}</span></div>
                <div className="mt-2 num text-[16px] font-extrabold" style={{ color: "var(--st-ink)" }}>{t.mins_left <= 0 ? "any minute" : `in ${dur(t.mins_left)}`}</div>
                <div className="text-[12px] font-semibold text-steel mt-0.5">{STAGE[t.stage][0]}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0">
        <Head title="Every table" sub="Free to seat, held for a booking, or in use — and when each one frees."
          end={<span className="text-[12.5px] font-semibold text-steel num shrink-0 mt-1 hidden sm:block">{busy.length} in use · {pulse.seats_free_now} seats free</span>} />
        {/* Free · Reserved · In use as tabs, each with its count; the tables as tiles you can read
            from across the floor. In use is sorted by when it frees (a forgotten table first). */}
        <div role="tablist" aria-label="Tables" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--color-fill)] mb-3 max-w-[40rem]">
          {([["all", "All"], ["free", "Free"], ["reserved", "Reserved"], ["busy", "In use"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("!min-h-[52px] sm:!min-h-[44px] rounded-xl px-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[12.5px] sm:text-[13px] font-semibold transition-colors min-w-0",
                tab === k ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
              <span className="truncate max-w-full">{label}</span>
              <span className={cn("num text-[11px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center", tab === k ? "bg-[color-mix(in_srgb,var(--color-on-label)_18%,transparent)]" : "bg-[var(--color-fill-2)]")}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <motion.div key={tab} className="grid gap-2.5 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]" variants={listV} initial="hidden" animate="show">
          {shown.map((t) => {
            const kind = kindOf(t); const r = nextBooking(t.id); const stale = kind === "busy" && t.age > STALE;
            const share = kind === "busy" && !stale ? Math.min(100, Math.round((t.age / Math.max(1, t.age + t.mins_left)) * 100)) : 0;
            return (
              <motion.div key={t.id} variants={itemV} data-table={kind}
                className={cn("min-w-0 rounded-2xl border p-3.5 flex flex-col gap-2.5",
                  stale ? "border-[color-mix(in_srgb,var(--color-orange)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-orange)_7%,transparent)]"
                    : kind === "free" ? "border-dashed border-[var(--color-line-2)] bg-[var(--color-bg-2)]"
                      : kind === "reserved" ? "border-dashed border-[var(--color-orange)] bg-[var(--color-orange-2)]"
                        : cn("border-[var(--st)] bg-[var(--st-2)]", STAGE_CLS[t.stage]))}>
                <div className="flex items-center gap-2">
                  <span className="font-display text-[24px] leading-none truncate">{t.name}</span>
                  <span className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill-2)] text-[11.5px] font-semibold text-[var(--color-label-2)] num shrink-0" title={`Seats ${t.capacity}`}><Users size={12} aria-hidden />{t.capacity}</span>
                </div>
                {kind === "free" && <>
                  <span className="self-start inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11.5px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={12} strokeWidth={3} aria-hidden />Free</span>
                  <span className="text-[13px] text-[var(--color-label-2)]">Ready to seat</span>
                </>}
                {kind === "reserved" && r && <>
                  <span className="self-start inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11.5px] font-bold bg-[var(--color-bg-2)] text-[var(--color-orange)]"><CalendarClock size={12} aria-hidden />Reserved · {clock(r.at_time)}</span>
                  <span className="text-[13px] min-w-0"><span className="font-semibold truncate block">{r.guest_name}</span><span className="text-[var(--color-label-2)]">party of {r.party_size}</span></span>
                </>}
                {kind === "busy" && <>
                  <span className="self-start inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-bold bg-[var(--color-fill-2)]" style={{ color: "var(--st-ink)" }}>{STAGE[t.stage][0]}</span>
                  {stale
                    ? <span className="text-[12.5px] leading-snug text-[var(--color-orange)] font-semibold flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden />Open {dur(t.age)} — bill or close it</span>
                    : <div>
                        <div className="flex items-baseline justify-between gap-2"><span className="num text-[20px] font-semibold leading-none">{dur(t.mins_left)}</span><span className="text-[11.5px] text-[var(--color-label-2)] num">frees ~{t.free_at}</span></div>
                        <div className="h-1.5 rounded-full bg-[var(--color-fill-2)] overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: `${share}%`, background: "var(--st)" }} /></div>
                        <div className="text-[11.5px] text-[var(--color-label-2)] mt-1.5">seated {dur(t.age)} ago</div>
                      </div>}
                  {r && <span className="text-[11.5px] text-[var(--color-orange)] font-semibold truncate">Next: {r.guest_name} · {clock(r.at_time)}</span>}
                </>}
              </motion.div>
            );
          })}
          {shown.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-[var(--color-separator)] p-6 text-center text-sm text-[var(--color-label-2)]">
            {tab === "free" ? "No table is free right now." : tab === "reserved" ? "No table is held for a booking today." : tab === "busy" ? "Every table is free." : "No tables yet — add them in Settings → Tables."}
          </div>}
        </motion.div>
      </section>
      {/* Join by QR moved to its own screen (/pulse/qr, 2026-10-20); `listed` stays a prop for the link's wording */}
      {!listed && <p className="mt-6 text-[12.5px] text-steel">Guests cannot join by QR yet — <Link href="/pulse/qr" className="font-semibold text-[var(--color-tint)] inline-flex min-h-11 items-center -my-3">see how to turn it on</Link>.</p>}
    </div>
  );
}
