"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Wallet, Users, Timer, BedDouble, Bike, Boxes, ConciergeBell, Sparkles, Flame, ReceiptText } from "lucide-react";
import { cn } from "@/components/ui";
import { formatINR } from "@/lib/format";

/**
 * The control room as one board: what came in, where it came from, what is moving, and who is on.
 *
 * Three columns on a wide screen, two on a laptop, one on a phone — and every panel is the same
 * card, so the eye only has to learn the shape once. Nothing here polls on its own; <Live> above
 * re-renders the whole board when orders, bills, rooms or stock change.
 */

export type Money = { label: string; value: number; tone: Tone };
/* The icon travels as a name, not as a component. A server component cannot hand a function
   across the boundary — React has to serialise what it sends, and a Lucide icon is a function. */
export type IconName = keyof typeof ICON;
export type Tile = { icon: IconName; label: string; value: React.ReactNode; sub?: string; tone?: Tone; href: string };
export type Rank = { name: string; value: number };
export type Tx = { id: string; no: number; total: number; at: string; method: string | null };
export type Who = { id: string; name: string; role: string };
/** A row on the live panel: where it is, how many items, and what it comes to. */
export type LiveRow = { id: string; where: string; items: number; total: number; href: string };
export type Tone = "mint" | "amber" | "chili" | "sky" | "plain";

const ICON = { Wallet, Users, Timer, BedDouble, Bike, Boxes, ConciergeBell, Sparkles, Flame, ReceiptText } as const;

const TONE: Record<Tone, { card: string; chip: string; text: string }> = {
  mint: { card: "bg-[var(--color-green-2)] border-[var(--color-tint)]/30", chip: "bg-[var(--color-tint)] text-[var(--color-on-tint)]", text: "text-[var(--color-tint)]" },
  amber: { card: "bg-[rgb(255_179_64/.12)] border-[var(--color-orange)]/30", chip: "bg-[var(--color-orange)] text-[var(--color-bezel)]", text: "text-[var(--color-orange)]" },
  chili: { card: "bg-[var(--color-red-2)] border-[var(--color-red)]/30", chip: "bg-[var(--color-red)] text-white", text: "text-[var(--color-red)]" },
  sky: { card: "bg-[var(--color-blue-2)] border-[var(--color-blue)]/30", chip: "bg-[var(--color-blue)] text-white", text: "text-[var(--color-blue)]" },
  plain: { card: "bg-[var(--color-bg-2)] border-[var(--color-separator)]", chip: "bg-[var(--color-fill)] text-[var(--color-label-2)]", text: "text-[var(--color-label)]" },
};

/** One colour per source, shared by the arc and the dot in its key so they can never disagree. */
const ARC: Record<Tone, string> = { mint: "var(--color-tint)", amber: "var(--color-orange)", sky: "var(--color-blue)",
  chili: "var(--color-red)", plain: "var(--color-label-3)" };

/** A headline figure in its own tinted card, with a way through to the screen behind it. */
function Stat({ icon, label, value, sub, tone = "plain", href, big }: {
  icon: IconName; label: string; value: React.ReactNode; sub?: string; tone?: Tone; href: string; big?: boolean;
}) {
  const t = TONE[tone], Icon = ICON[icon];
  return (
    <Link href={href} className={cn("group rounded-2xl border p-3.5 flex flex-col min-w-0 transition-colors", t.card)}>
      <div className="flex items-start gap-2">
        <span className={cn("h-8 w-8 rounded-xl grid place-items-center shrink-0", t.chip)}><Icon size={15} /></span>
        <span className="text-[11px] leading-tight text-steel flex-1 min-w-0 pt-1.5 truncate">{label}</span>
        <ArrowUpRight size={14} className="text-steel shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className={cn("num font-semibold mt-2 leading-none truncate", big ? "text-[26px]" : "text-[21px]")}>{value}</div>
      {sub && <div className="text-[11px] text-steel mt-1 truncate">{sub}</div>}
    </Link>
  );
}

/**
 * Where today's money came from, as one half-circle. The arc is drawn by hand rather than through a
 * chart library: it is four numbers and a total, and the control room is the screen people open
 * most — it should not carry a plotting engine to draw five arcs.
 */
function Gauge({ parts, total }: { parts: Money[]; total: number }) {
  const R = 82, C = Math.PI * R;                       // half a circle's length, for the dash offsets
  const sum = parts.reduce((t, p) => t + p.value, 0);
  let run = 0;
  return (
    <div className="feather p-5">
      <div className="flex items-baseline justify-between mb-1"><h3 className="text-lg">Where it came from</h3><span className="text-[11px] text-steel">today</span></div>
      <div className="relative mx-auto" style={{ width: 210, height: 118 }}>
        <svg viewBox="0 0 210 118" className="w-full h-full" role="img" aria-label="Today's takings by source">
          <path d="M 23 105 A 82 82 0 0 1 187 105" fill="none" stroke="var(--color-fill)" strokeWidth="18" strokeLinecap="round" />
          {sum > 0 && parts.filter((p) => p.value > 0).map((p) => {
            const len = (p.value / sum) * C, off = run; run += len;
            return (
              <motion.path key={p.label} d="M 23 105 A 82 82 0 0 1 187 105" fill="none" strokeWidth="18" strokeLinecap="round"
                stroke={ARC[p.tone]}
                strokeDasharray={`${len} ${C}`} initial={{ strokeDashoffset: -off, opacity: 0 }} animate={{ strokeDashoffset: -off, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <div className="num text-[26px] font-semibold leading-none">{formatINR(total)}</div>
          <div className="text-[11px] text-steel mt-1">taken today</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ARC[p.tone] }} />
              <span className="text-[11px] text-steel truncate">{p.label}</span>
            </div>
            <div className="num text-sm font-semibold mt-0.5 truncate">{formatINR(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A ranked list where the bar carries the comparison and the number only confirms it. */
function Ranked({ title, rows, href, unit, empty }: { title: string; rows: Rank[]; href?: string; unit?: string; empty: string }) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="feather p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg">{title}</h3>
        {href && <Link href={href} className="tap text-[11px] font-semibold text-steel hover:text-[var(--color-label)]">All →</Link>}
      </div>
      {rows.length === 0 ? <p className="text-sm text-steel">{empty}</p> : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.name}>
              <div className="flex items-center gap-2.5 text-sm">
                <span className="h-7 w-7 rounded-lg bg-[var(--color-fill)] grid place-items-center font-display text-xs shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{r.name}</span>
                <span className="num font-semibold shrink-0">{r.value}{unit}</span>
              </div>
              <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(r.value / peak) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full bg-[var(--color-tint)]" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A time on its own means today. Anything older says which day, or it reads as money just in. */
function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Seven days of takings. Drawn straight into an SVG path — no chart library on the busiest screen. */
function Week({ days }: { days: { day: string; value: number }[] }) {
  const W = 300, H = 92, peak = Math.max(1, ...days.map((d) => d.value));
  const x = (i: number) => (i / Math.max(1, days.length - 1)) * W;
  const y = (v: number) => H - (v / peak) * (H - 10);
  const line = days.map((d, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const total = days.reduce((t, d) => t + d.value, 0);
  const traded = days.some((d) => d.value > 0);
  return (
    <div className="feather p-5">
      <div className="flex items-baseline justify-between mb-1"><h3 className="text-lg">This week</h3><span className="num text-sm font-semibold">{formatINR(total)}</span></div>
      {!traded ? <p className="text-sm text-steel mt-2 mb-6">No bills settled in the last seven days.</p> : (<>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" style={{ height: 92 }} preserveAspectRatio="none" role="img" aria-label="Takings over the last seven days">
        <defs><linearGradient id="wk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-tint)" stopOpacity="0.32" /><stop offset="100%" stopColor="var(--color-tint)" stopOpacity="0" />
        </linearGradient></defs>
        <motion.path d={area} fill="url(#wk)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
        <motion.path d={line} fill="none" stroke="var(--color-tint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-steel">{days.map((d, i) => <span key={i}>{d.day}</span>)}</div>
      </>)}
    </div>
  );
}

export function Overview({
  greet, property, owner, money, parts, tiles, dishes, tx, staff, days, floor, rooms, web, onFloor, kitchen,
}: {
  greet: string; property: string; owner: string;
  money: number; parts: Money[]; tiles: Tile[];
  dishes: Rank[]; tx: Tx[]; staff: Who[]; days: { day: string; value: number }[];
  floor: LiveRow[]; rooms: LiveRow[]; web: LiveRow[]; onFloor: number; kitchen: number;
}) {
  /* One panel, three lists — the floor, the rooms, the orders coming off the internet. They are
     the same shape, so they share a row and a tab rather than three cards the eye must re-learn. */
  const panels = [
    { key: "floor", label: "Floor", rows: floor, href: "/orders", empty: "No open orders right now." },
    ...(rooms.length ? [{ key: "rooms", label: "In house", rows: rooms, href: "/frontdesk", empty: "Nobody checked in." }] : []),
    ...(web.length ? [{ key: "web", label: "Online", rows: web, href: "/online-orders", empty: "Nothing from the aggregators today." }] : []),
  ];
  const [tab, setTab] = useState(panels[0].key);
  const shown = panels.find((p) => p.key === tab) ?? panels[0];
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const t = () => setNow(new Date()); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, []);
  const clock = now ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "";
  const date = now ? now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", weekday: "short", timeZone: "Asia/Kolkata" }) : "";

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] text-steel">{greet}</div>
          <h1 className="text-[28px] md:text-[38px] leading-none mt-0.5 truncate">{property}</h1>
        </div>
        <div className="text-right shrink-0"><div className="text-[11px] text-steel uppercase tracking-wide">{date}</div><div className="num text-xl">{clock}</div></div>
      </header>

      {/* Three columns need about 1280px to breathe; an iPad in landscape is 1194 and was
         dropping all the way to one, which turned the densest screen in the app into a very
         long scroll. Two columns from 1024 keeps the board a board on a tablet. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.95fr)]">
        {/* ── what needs a person, then where the money came from, then what is selling ── */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
            {tiles.map((t) => <Stat key={t.label} {...t} />)}
          </div>
          <Gauge parts={parts} total={money} />
          <Ranked title="Selling today" rows={dishes} href="/reports" empty="Nothing sold yet — the first order of the day lands here." />
        </div>

        {/* ── the floor itself ── */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon="Wallet" label="Still on the floor" value={formatINR(onFloor)} sub="not yet billed" tone="amber" href="/orders" big />
            <Stat icon="Flame" label="In the kitchen" value={kitchen} sub="tickets cooking" tone={kitchen ? "mint" : "plain"} href="/kitchen" big />
          </div>
          <div className="feather p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="chip-rail">
                {panels.map((p) => (
                  <button key={p.key} type="button" onClick={() => setTab(p.key)}
                    className={cn("tap h-8 rounded-full px-3 text-[13px] font-semibold transition-colors justify-center",
                      tab === p.key ? "bg-ink text-on-label" : "text-steel hover:text-[var(--color-label)]")}>{p.label}</button>
                ))}
              </div>
              <Link href={shown.href} className="tap text-[11px] font-semibold text-steel hover:text-[var(--color-label)] shrink-0">All →</Link>
            </div>
            {shown.rows.length === 0 ? <p className="text-sm text-steel">{shown.empty}</p> : (
              <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-0.5">
                {shown.rows.map((o) => (
                  <Link key={o.id} href={o.href} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-porcelain/60">
                    <span className="h-9 min-w-10 px-1.5 rounded-lg bg-[var(--color-fill)] grid place-items-center font-display text-sm shrink-0">{o.where}</span>
                    <span className="flex-1 min-w-0 text-sm truncate">{o.items} item{o.items === 1 ? "" : "s"}</span>
                    <span className="num font-semibold shrink-0">{formatINR(o.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {staff.length > 0 && (
            <div className="feather p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-lg">On the rota</h3><Link href="/staff" className="tap text-[11px] font-semibold text-steel hover:text-[var(--color-label)]">Staff →</Link></div>
              <div className="flex items-center">
                {staff.slice(0, 6).map((p, i) => (
                  <span key={p.id} title={`${p.name} · ${p.role}`} style={{ marginLeft: i ? -10 : 0, zIndex: 10 - i }}
                    className="h-10 w-10 rounded-full bg-ink text-on-label grid place-items-center font-display ring-2 ring-[var(--color-bg-2)] shrink-0">{p.name.slice(0, 1)}</span>
                ))}
                {staff.length > 6 && <span className="ml-2 text-xs text-steel num">+{staff.length - 6}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── the owner's own column: the week, and the money that landed ── */}
        <div className="space-y-4 min-w-0">
          <div className="feather p-5">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-2xl bg-ink text-on-label grid place-items-center font-display text-xl shrink-0">{owner.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{owner}</div><div className="text-[11px] text-steel">signed in · {clock}</div></div>
            </div>
          </div>
          <Week days={days} />
          <div className="feather p-5">
            <div className="flex items-baseline justify-between mb-3"><h3 className="text-lg">Settled</h3><Link href="/billing" className="tap text-[11px] font-semibold text-steel hover:text-[var(--color-label)]">Billing →</Link></div>
            {tx.length === 0 ? <p className="text-sm text-steel">No bills settled yet today.</p> : (
              <div className="space-y-2.5">
                {tx.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-[var(--color-green-2)] text-[var(--color-tint)] grid place-items-center shrink-0"><ReceiptText size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold num">Bill #{t.no}</span>
                      <span className="block text-[11px] text-steel truncate">{when(t.at)}{t.method ? ` · ${t.method}` : ""}</span>
                    </span>
                    <span className="num font-semibold text-[var(--color-tint)] shrink-0">+{formatINR(t.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

