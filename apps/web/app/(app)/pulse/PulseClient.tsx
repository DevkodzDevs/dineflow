"use client";
import { useState, useTransition, useEffect } from "react";
import { Phone, Bell, Armchair, X, QrCode, UserPlus, MessageCircle } from "lucide-react";
import { waHref, firstName } from "@/lib/wa";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, Flip, useToast } from "@/components/ui";
import { motion } from "framer-motion";
import { listV, itemV } from "@/lib/motion";
import { useLive } from "@/lib/useLive";
import { fmtSince } from "@/lib/format";
import { addWalkin, setWalkin, quote } from "./actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";

type T = { id: string; name: string; capacity: number; stage: "free" | "ordered" | "eating" | "served" | "billed"; age: number; mins_left: number; free_at: string };
type Pulse = { tables: T[]; free_now: number; seats_free_now: number; next_free_min: number | null; avg_dwell: number; history_days: number };
type W = { id: string; token: string; name: string; phone: string | null; party: number; quoted_min: number | null; status: "waiting" | "called"; joined_at: string; table_id: string | null };

const STAGE = { free: ["free", "pill-ready"], ordered: ["ordered", "pill-pending"], eating: ["eating", "pill-preparing"], served: ["served", "pill-sky"], billed: ["bill out", "pill-gold"] } as const;

export function PulseClient({ pulse, queue, slug, base, listed, restaurant = "" }: { pulse: Pulse; queue: W[]; slug: string; base: string; listed: boolean; restaurant?: string }) {
  useLive(["orders", "order_items", "bills", "dining_tables", "walkins"]);
  const toast = useToast(); const [pending, start] = useTransition(); const { online } = useOffline();
  const [party, setParty] = useState(2); const [q, setQ] = useState<number | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", phone: "" }); const [seat, setSeat] = useState<W | null>(null);
  useEffect(() => { let on = true; quote(party).then((m) => { if (on) setQ(m); }); return () => { on = false; }; }, [party, pulse]);
  const busy = pulse.tables.filter((t) => t.stage !== "free");
  const joinUrl = `${base}/queue/${slug}`;

  return (
    <div>
      <PageHeader eyebrow="Honest wait times" title="Pulse" sub={pulse.history_days >= 7 ? `Learned from ${pulse.history_days} days of your own service. Numbers move as tickets move.` : "Using a 45-minute sitting until a week of history builds up."} />
      {/* Two cards that line up, not three tiles floating over an empty corner beside a form. The
          tiles sit in a "Right now" card centred in its height; the quote card reads top to bottom:
          party size (an even grid, not a wrapping row), the wait it gets, who, add. */}
      <div className="grid xl:grid-cols-[auto_minmax(0,1fr)] gap-5 mb-8 items-stretch">
        <Card className="flex flex-col">
          <div className="card-title"><h3>Right now</h3><span className="more num">{pulse.free_now} of {pulse.tables.length} tables free</span></div>
          <div className="flip-fit flex-1 grid place-items-center py-2"><div className="flip-row"><Flip value={queue.length} label="waiting" tone={queue.length ? "alert" : undefined} /><Flip value={pulse.next_free_min ?? 0} label="next free · min" tone={pulse.free_now ? "live" : undefined} /><Flip value={pulse.free_now} label="tables free" /></div></div>
        </Card>
        <Card className="min-w-0">
          <div className="card-title"><h3>Quote a wait</h3><span className="more num">avg sitting {pulse.avg_dwell} min</span></div>
          <div className="text-[11px] uppercase tracking-wide text-steel mb-2">Party size</div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <button key={n} onClick={() => setParty(n)} aria-pressed={party === n}
              className={`h-11 rounded-xl num text-[15px] font-semibold transition-colors ${party === n ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"}`}>{n}</button>)}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3">
            <span className="text-sm text-steel">Wait for a party of <b className="num text-[var(--color-label)]">{party}</b></span>
            <span className="num text-[34px] leading-none">{q === undefined ? "…" : q === null ? "—" : q === 0 ? "now" : `~${q} min`}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input placeholder="Guest name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Phone (optional)" inputMode="tel" className="num" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="mt-2">
            <Button className="w-full" disabled={!form.name || pending} onClick={() => { if (!online) { void enqueue("walkin_add", { name: form.name, phone: form.phone, party }, `Queue · ${form.name}`); toast(`${form.name} added — will send when the line is back`); setForm({ name: "", phone: "" }); return; } start(async () => { const r = await addWalkin(form.name, form.phone, party); if ("error" in r) toast(r.error ?? "Could not add", "err"); else { toast(`${form.name} added · ~${r.quoted_min ?? "?"} min`); setForm({ name: "", phone: "" }); } }); }}><UserPlus size={16} /> Add to queue</Button>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="min-w-0">
          <div className="card-title"><h3>Tables · when they free up</h3><span className="more">{busy.length} in use · {pulse.seats_free_now} seats free</span></div>
          <motion.div className="group" variants={listV} initial="hidden" animate="show">
            {pulse.tables.map((t) => <motion.div key={t.id} variants={itemV} className="row">
              <span className="font-display text-xl w-12">{t.name}</span>
              <span className="text-xs text-steel w-14">{t.capacity} seats</span>
              <span className={`pill ${STAGE[t.stage][1]}`}>{STAGE[t.stage][0]}</span>
              <span className="flex-1 text-[13px] text-steel">{t.stage === "free" ? "" : `seated ${t.age} min ago`}</span>
              {t.stage === "free" ? <span className="num text-mint">free now</span> : <><span className="num text-lg">{t.mins_left} min</span><span className="num text-steel text-sm w-12 text-right">{t.free_at}</span></>}
            </motion.div>)}
          </motion.div>
        </div>
        <div className="stack">
          <div className="card-title"><h3>Queue</h3><span className="more">{queue.length} waiting</span></div>
          {queue.length === 0 && <Card><p className="text-sm text-steel">Nobody waiting. Quote a wait above, or let guests join by QR.</p></Card>}
          {queue.map((w, i) => <Card key={w.id} className={w.status === "called" ? "ring-2 ring-[var(--color-tint)]" : ""}>
            <div className="flex items-start gap-3">
              <span className="flip xs !min-w-10 !h-10 !text-[18px] !rounded-[10px]"><span className="flip-face">{i + 1}</span></span>
              <div className="flex-1 min-w-0"><div className="font-semibold text-[15px] truncate">{w.name} <span className="text-steel font-normal">· {w.party}</span></div>
                <div className="text-xs text-steel">{fmtSince(w.joined_at)} waiting{w.quoted_min != null && ` · quoted ${w.quoted_min}`}{w.status === "called" && " · called"}</div></div>
              {w.phone && <a href={`tel:${w.phone}`} aria-label={`Ring ${w.name}`} className="h-9 w-9 rounded-full bg-[var(--color-fill)] grid place-items-center"><Phone size={15} /></a>}
              {/* "Your table is ready" on WhatsApp, with their place-in-line link. Sending it is calling them. */}
              {(() => { const href = waHref(w.phone, `Hi ${firstName(w.name)}, your table at ${restaurant} is ready. Please come to the host stand.${slug ? ` ${base}/queue/${slug}?t=${w.token}` : ""}`); return href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Tell ${w.name} on WhatsApp their table is ready`} title="Table ready — WhatsApp"
                onClick={() => { if (w.status === "waiting" && online) start(async () => { await setWalkin(w.id, "called"); }); }}
                className="h-9 w-9 rounded-full bg-[var(--color-green-2)] text-[var(--color-green)] grid place-items-center"><MessageCircle size={15} /></a>; })()}
            </div>
            <div className="flex gap-2 mt-3">
              {w.status === "waiting" && <Button size="sm" variant="tinted" onClick={() => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "called" }, `Queue · called ${w.name}`); return; } start(async () => { await setWalkin(w.id, "called"); }); }}><Bell size={14} /> Call</Button>}
              <Button size="sm" onClick={() => setSeat(w)}><Armchair size={14} /> Seat</Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "left" }, `Queue · ${w.name} left`); return; } start(async () => { await setWalkin(w.id, "left"); }); }}><X size={14} /></Button>
            </div>
            {seat?.id === w.id && <div className="mt-3 pt-3 border-t border-line flex flex-wrap gap-1.5">
              {pulse.tables.filter((t) => t.stage === "free" && t.capacity >= w.party).map((t) => <button key={t.id} className="chip" onClick={() => { if (!online) { void enqueue("walkin_set", { id: w.id, status: "seated", table: t.id }, `Queue · ${w.name} seated`); setSeat(null); toast(`${w.name} seated at ${t.name}`); return; } start(async () => { await setWalkin(w.id, "seated", t.id); setSeat(null); toast(`${w.name} seated at ${t.name}`); }); }}>{t.name} · {t.capacity}</button>)}
              {pulse.tables.filter((t) => t.stage === "free" && t.capacity >= w.party).length === 0 && <span className="text-xs text-steel">No free table big enough yet.</span>}
            </div>}
          </Card>)}
          <Card>
            <div className="flex items-center gap-4">
              <span className="h-16 w-16 rounded-xl grid place-items-center bg-[var(--color-label)] text-[var(--color-on-label)]"><QrCode size={30} /></span>
              <div className="flex-1 min-w-0"><div className="font-semibold text-[15px]">Join by QR</div>
                <div className="text-xs text-steel mt-0.5">{listed ? "Print this for the door. Guests join the queue and watch their place on their own phone." : "Turn on Listed publicly in Settings → Storefront to let guests join from their phones."}</div>
                {listed && <div className="num text-xs mt-1.5 break-all">{joinUrl}</div>}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
