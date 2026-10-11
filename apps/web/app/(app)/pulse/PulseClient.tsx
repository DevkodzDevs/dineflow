"use client";
import { useState, useTransition, useEffect } from "react";
import { Phone, Bell, Armchair, X, QrCode, UserPlus, MessageCircle, Users, CalendarClock, AlertTriangle, Check, Copy, ExternalLink, Printer } from "lucide-react";
import Link from "next/link";
import { QR, qrDataUrl } from "@/components/QR";
import { waHref, firstName } from "@/lib/wa";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, Flip, useToast, cn } from "@/components/ui";
import { motion } from "framer-motion";
import { listV, itemV } from "@/lib/motion";
import { useLive } from "@/lib/useLive";
import { fmtSince } from "@/lib/format";
import { addWalkin, setWalkin, quote } from "./actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { copyText } from "@/lib/clipboard";

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

/** A door sign for the queue: the property, the code, how to use it — printed from a window of its own. */
async function printPoster(url: string, name: string) {
  const img = await qrDataUrl(url, 640);
  const w = window.open("", "_blank", "width=720,height=960"); if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Join the queue · ${esc(name)}</title><style>
    @page{size:A4;margin:18mm}body{font-family:system-ui,-apple-system,sans-serif;color:#111;text-align:center;margin:0;padding:40px 24px}
    h1{font-size:44px;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:22px;font-weight:500;color:#555;margin:0 0 28px}
    img{width:340px;height:340px;border:1px solid #ddd;border-radius:24px;padding:16px}ol{display:inline-block;text-align:left;font-size:19px;line-height:1.7;margin:28px 0 0}
    .u{margin-top:22px;font:14px ui-monospace,monospace;color:#666}</style></head><body>
    <h1>Join the queue</h1><h2>${esc(name)}</h2><img src="${img}" alt=""><ol><li>Scan with your phone camera</li><li>Add your name and party size</li><li>We'll message you when your table is ready</li></ol>
    <div class="u">${esc(url)}</div><script>onload=()=>{print()}</script></body></html>`);
  w.document.close();
}

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
  const joinUrl = `${base}/queue/${slug}`;

  return (
    <div>
      <PageHeader eyebrow="Honest wait times" title="Pulse" sub={pulse.history_days >= 7 ? `Learned from ${pulse.history_days} days of your own service. Numbers move as tickets move.` : "Using a 45-minute sitting until a week of history builds up."} />
      {/* Two cards that line up, not three tiles floating over an empty corner beside a form. The
          tiles sit in a "Right now" card centred in its height; the quote card reads top to bottom:
          party size (an even grid, not a wrapping row), the wait it gets, who, add. */}
      {/* The left track is a share of the row, not `auto`: .flip-fit is an inline-size container,
          which has no width of its own, so an auto track collapsed to nothing and the three tiles
          stacked into a 600px column beside a half-empty quote card. Under the tiles, the tables
          that free next — the thing a host quoting a wait looks at anyway. */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5 mb-8 items-stretch" data-pulse-top>
        <Card className="flex flex-col min-w-0">
          <div className="card-title"><h3>Right now</h3><span className="more num">{pulse.free_now} of {pulse.tables.length} tables free</span></div>
          <div className="flip-fit py-1"><div className="flip-row"><Flip value={queue.length} label="waiting" tone={queue.length ? "alert" : undefined} /><Flip value={pulse.next_free_min ?? 0} label="next free · min" tone={pulse.free_now ? "live" : undefined} /><Flip value={pulse.free_now} label="tables free" /></div></div>
          {(() => { const soon = busy.filter((t) => t.age <= STALE).sort((a, b) => a.mins_left - b.mins_left).slice(0, 3); return (
            <div className="mt-auto pt-4 border-t border-line" data-frees-next>
              <div className="text-[11px] uppercase tracking-wide text-steel mb-2">Frees next</div>
              {soon.length === 0 ? <p className="text-sm text-steel">{busy.length ? "Only tables open for days — bill or close them below." : "Every table is free — seat straight away."}</p> : (
                <div className="grid grid-cols-3 gap-2">
                  {soon.map((t) => (
                    <div key={t.id} className="rounded-xl bg-[var(--color-fill)] px-3 py-2 min-w-0">
                      <div className="flex items-center justify-between gap-1"><span className="font-display text-[17px] leading-none truncate">{t.name}</span><span className="text-[11px] text-steel inline-flex items-center gap-0.5 shrink-0"><Users size={11} />{t.capacity}</span></div>
                      <div className="mt-1 num text-[13px] font-semibold text-[var(--color-tint)]">{t.mins_left <= 0 ? "any minute" : `~${dur(t.mins_left)}`}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>); })()}
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
          {/* Free · Reserved · In use as tabs, each with its count; the tables as tiles you can read
              from across the floor. In use is sorted by when it frees (a forgotten table first). */}
          <div role="tablist" aria-label="Tables" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--color-fill)] mb-3">
            {([["all", "All"], ["free", "Free"], ["reserved", "Reserved"], ["busy", "In use"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("!min-h-[52px] sm:!min-h-[44px] rounded-xl px-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[12.5px] sm:text-[13px] font-semibold transition-colors min-w-0",
                  tab === k ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
                <span className="truncate max-w-full">{label}</span>
                <span className={cn("num text-[11px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center", tab === k ? "bg-[color-mix(in_srgb,var(--color-on-label)_18%,transparent)]" : "bg-[var(--color-fill-2)]")}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <motion.div key={tab} className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]" variants={listV} initial="hidden" animate="show">
            {shown.map((t) => {
              const kind = kindOf(t); const r = nextBooking(t.id); const stale = kind === "busy" && t.age > STALE;
              const share = kind === "busy" && !stale ? Math.min(100, Math.round((t.age / Math.max(1, t.age + t.mins_left)) * 100)) : 0;
              return (
                <motion.div key={t.id} variants={itemV} data-table={kind}
                  className={cn("min-w-0 rounded-2xl border p-3.5 flex flex-col gap-2.5",
                    stale ? "border-[color-mix(in_srgb,var(--color-orange)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-orange)_7%,transparent)]"
                      : kind === "free" ? "border-[color-mix(in_srgb,var(--color-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-green)_6%,transparent)]"
                        : kind === "reserved" ? "border-[color-mix(in_srgb,var(--color-blue)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-blue)_7%,transparent)]"
                          : "border-[var(--color-separator)] bg-[var(--color-fill)]")}>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[24px] leading-none">{t.name}</span>
                    <span className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill-2)] text-[11.5px] font-semibold text-[var(--color-label-2)] num"><Users size={12} />{t.capacity}</span>
                  </div>
                  {kind === "free" && <>
                    <span className="self-start inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11.5px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={12} strokeWidth={3} />Free</span>
                    <span className="text-[13px] text-[var(--color-label-2)]">Ready to seat</span>
                  </>}
                  {kind === "reserved" && r && <>
                    <span className="self-start inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11.5px] font-bold bg-[var(--color-blue-2)] text-[var(--color-blue)]"><CalendarClock size={12} />Reserved · {clock(r.at_time)}</span>
                    <span className="text-[13px] min-w-0"><span className="font-semibold truncate block">{r.guest_name}</span><span className="text-[var(--color-label-2)]">party of {r.party_size}</span></span>
                  </>}
                  {kind === "busy" && <>
                    <span className={`pill self-start ${STAGE[t.stage][1]}`}>{STAGE[t.stage][0]}</span>
                    {stale
                      ? <span className="text-[12.5px] leading-snug text-[var(--color-orange)] font-semibold flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-px" />Open {dur(t.age)} — bill or close it</span>
                      : <div>
                          <div className="flex items-baseline justify-between gap-2"><span className="num text-[20px] font-semibold leading-none">{dur(t.mins_left)}</span><span className="text-[11.5px] text-[var(--color-label-2)] num">frees ~{t.free_at}</span></div>
                          <div className="h-1.5 rounded-full bg-[var(--color-fill-2)] overflow-hidden mt-2"><div className="h-full rounded-full bg-[var(--color-tint)]" style={{ width: `${share}%` }} /></div>
                          <div className="text-[11.5px] text-[var(--color-label-2)] mt-1.5">seated {dur(t.age)} ago</div>
                        </div>}
                    {r && <span className="text-[11.5px] text-[var(--color-blue)] font-semibold truncate">Next: {r.guest_name} · {clock(r.at_time)}</span>}
                  </>}
                </motion.div>
              );
            })}
            {shown.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-[var(--color-separator)] p-6 text-center text-sm text-[var(--color-label-2)]">
              {tab === "free" ? "No table is free right now." : tab === "reserved" ? "No table is held for a booking today." : tab === "busy" ? "Every table is free." : "No tables yet — add them in Settings → Tables."}
            </div>}
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
          {/* the door QR, as the real code: guests scan it to join the queue and watch their place. It
              was a QR *icon* beside the address, so there was nothing to scan and nothing to print.
              The code sits on white in both themes (a scanner wants dark on light); Print poster
              opens a door sign — the property, the code, three words of instruction. */}
          <Card className="@container">
            {listed ? (
              <div className="flex flex-col @[26rem]:flex-row items-center @[26rem]:items-stretch gap-4" data-joinqr>
                <div className="shrink-0 rounded-[18px] bg-white p-2.5 shadow-[0_0_0_1px_var(--color-separator)]" data-code><QR value={joinUrl} size={148} /></div>
                <div className="min-w-0 flex-1 flex flex-col items-center @[26rem]:items-start text-center @[26rem]:text-left">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-tint)]"><QrCode size={13} /> Join by QR</div>
                  <div className="font-display text-[22px] leading-tight mt-1">Scan to join the queue</div>
                  <p className="text-[13px] text-steel mt-1 leading-snug">Guests add themselves from their own phone and watch their place move up — no app, no sign-in.</p>
                  <button type="button" onClick={() => { void copyText(joinUrl); toast("Link copied"); }} title="Copy the link"
                    className="mt-3 max-w-full inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-full bg-[var(--color-fill)] text-[12px] num text-[var(--color-label-2)] hover:text-[var(--color-label)]">
                    <span className="truncate">{joinUrl.replace(/^https?:\/\//, "")}</span><Copy size={13} className="shrink-0" />
                  </button>
                  <div className="mt-3 @[26rem]:mt-auto pt-0 @[26rem]:pt-3 grid grid-cols-2 gap-2 w-full">
                    <Button variant="outline" size="sm" onClick={() => window.open(joinUrl, "_blank", "noopener")}><ExternalLink size={14} /> Open</Button>
                    <Button size="sm" onClick={() => void printPoster(joinUrl, restaurant)}><Printer size={14} /> Print poster</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="h-14 w-14 shrink-0 rounded-[16px] grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><QrCode size={26} /></span>
                <div className="min-w-0 flex-1"><div className="font-semibold text-[15px]">Join by QR is off</div>
                  <div className="text-[13px] text-steel mt-0.5">Turn on <b>Listed publicly</b> to give guests a code to scan at the door.</div>
                  <Link href="/settings/storefront" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-tint)] min-h-11 -my-2">Open Storefront settings →</Link></div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
