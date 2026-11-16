"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Wallet, Users, Timer, BedDouble, Bike, Boxes, ConciergeBell, Sparkles, Flame, ReceiptText } from "lucide-react";
import { cn, FlapShuffle, FlapPercent } from "@/components/ui";
import { AnalogClock } from "@/components/ui/AnalogClock";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatINR } from "@/lib/format";

/**
 * The control room as one board: what came in, where it came from, what is moving, and who is on.
 *
 * It is built in bands, not in columns. Three independent `space-y` columns each stacked cards of
 * whatever height their content happened to be, so no two panels on the screen started or ended on
 * the same line — six panels at six different tops on a 1440 laptop. A band is a row of panels that
 * share a top and a bottom, which is the only way a dense screen reads as designed rather than as
 * whatever fell out of the markup.
 *
 * Band 1 is every number, in one self-sizing row. Band 2 is what is happening now, beside where the
 * money came from. Band 3 is the three ledgers. Nothing here polls on its own; <Live> above
 * re-renders the whole board when orders, bills, rooms or stock change.
 */

export type Money = { label: string; value: number; tone: Tone };
/* The icon travels as a name, not as a component. A server component cannot hand a function
   across the boundary — React has to serialise what it sends, and a Lucide icon is a function. */
export type IconName = keyof typeof ICON;
export type Tile = { icon: IconName; label: string; value: string | number; sub?: string; tone?: Tone; href: string };
export type Rank = { name: string; value: number };
export type Tx = { id: string; no: number; total: number; at: string; method: string | null };
export type Who = { id: string; name: string; role: string };
/* The split-flap tiles: the three numbers you can read from across a kitchen. They were the
   old board's headline and the app is named for them — the new board keeps them. */
export type Flap = { value: number | string; label: string; href: string; tone?: "live" | "alert" };
/** A row on the live panel: where it is, how many items, and what it comes to. */
export type LiveRow = { id: string; where: string; items: number; total: number; href: string };
export type Tone = "mint" | "amber" | "chili" | "sky" | "plain";

const ICON = { Wallet, Users, Timer, BedDouble, Bike, Boxes, ConciergeBell, Sparkles, Flame, ReceiptText } as const;

/** A tile only takes colour when it is saying something, and the word is always beside the colour. */
const TONE: Record<Tone, string> = { mint: "stat-good", amber: "stat-warn", chili: "stat-alert", sky: "", plain: "" };

/**
 * One hole in a row of tiles is the most visible thing on a board, and this row is five tiles for
 * a restaurant and six for a resort — any one column count leaves a hole at all but one of them.
 * The tracks are chosen per count, and where a count will not divide them the last tile takes the
 * slack instead of leaving a gap beside it.
 */
/* --stat-cols says the same thing as grid-cols-N, as a number the flap tiles can do arithmetic with: a tile's height comes
   from the width of one card (.stat-grid in globals.css), and CSS cannot read a column count back out of a grid. Keep the
   two in step — a count without its --stat-cols sizes the flaps for the wrong card. */
const TRACKS: Record<number, string> = {
  4: "grid-cols-2 [--stat-cols:2] xl:grid-cols-4 xl:[--stat-cols:4]",
  5: "grid-cols-2 [--stat-cols:2] md:grid-cols-3 md:[--stat-cols:3] xl:grid-cols-5 xl:[--stat-cols:5] [&>:last-child]:col-span-2 xl:[&>:last-child]:col-span-1",
  6: "grid-cols-2 [--stat-cols:2] md:grid-cols-3 md:[--stat-cols:3] xl:grid-cols-6 xl:[--stat-cols:6]",
  7: "grid-cols-2 [--stat-cols:2] md:grid-cols-4 md:[--stat-cols:4] [&>:last-child]:col-span-2",
};
const TRACKS_OTHER = "grid-cols-2 [--stat-cols:2] md:grid-cols-3 md:[--stat-cols:3] xl:grid-cols-4 xl:[--stat-cols:4]";

/** One colour per source, shared by the arc and the dot in its key so they can never disagree. */
const ARC: Record<Tone, string> = { mint: "var(--color-tint)", amber: "var(--color-orange)", sky: "var(--color-blue)",
  chili: "var(--color-red)", plain: "var(--color-label-3)" };

/* ── a tile's figure, cut into what goes on flaps and what stays beside them ──────────────────────────
   "₹2,155.00" → ₹ · [2] · , · [155] · .00     "1 in · 5 out" → [1] · in · · [5] · out     "21%" → [21] · %     "8" → [08]
   A lone count is padded to a pair of cards, as every other flap in the app is; a figure of several runs is not, or
   "1 in · 5 out" would read "01 in · 05 out".

   The widths are in tile-heights, because the tile's height is the one thing CSS is solving for. They were measured,
   not reasoned (2026-11-16, statflap.mjs `cal` — testing-and-gates.md): a housing of n cards is .098 + .562n of its
   height plus a 3px rim (a tenth of a 30px tile, where it matters), and never under .8; the words are set at .36 of the
   tile (globals.css, .stat-unit), " out" 1.85em of that, ".00" 1.57em. Each runs a hair generous on purpose — an
   estimate that comes up short pushes the last card under the edge of the tile, one that runs long costs a pixel of
   height. */
type Part = { text: string; digits: boolean; paise: boolean };
const CARD = 0.562, HOUSING = 0.098, RIM = 0.1, GAP = 0.07, WORD = 0.36, SLACK = 1.02;
/** The widest figure, in tile-heights, that any card here can show on flaps: the roomiest card is ~263px and the
 *  smallest tile 30px. Past this a figure is plain type on every screen. */
const FLAP_MOST = 8;
const group = (n: number) => Math.max(0.8, n * CARD + HOUSING + RIM);
const glyph = (c: string) => (c === " " ? 0.25 : /[,.:]/.test(c) ? 0.3 : c === "·" ? 0.25 : c === "/" ? 0.42 : c === "%" ? 0.9 : c === "₹" ? 0.62 : /\d/.test(c) ? 0.64 : /[il]/.test(c) ? 0.28 : 0.56);
const word = (s: string) => [...s].reduce((w, c) => w + glyph(c), 0) * WORD;
function figure(value: string | number) {
  const raw = String(value);
  const money = raw.startsWith("₹");
  const parts: Part[] = (raw.match(/(\.\d+|\d+|[^\d.]+|\.)/g) ?? [raw]).map((text) => ({ text, digits: /^\d+$/.test(text), paise: money && /^\.\d+$/.test(text) }));
  const pad = /^\d+%?$/.test(raw) ? 2 : 0;
  const wide = (keepPaise: boolean) => {
    const shown = parts.filter((p) => keepPaise || !p.paise);
    return (shown.reduce((w, p) => w + (p.digits ? group(Math.max(p.text.length, pad)) : word(p.text)), 0) + Math.max(0, shown.length - 1) * GAP) * SLACK;
  };
  /* the plain figure, in ems of its own type: a digit of the display face measured .5em, the words sit at .4em */
  const em = parts.reduce((w, p) => w + (p.digits ? p.text.length * 0.53 : word(p.text) / WORD * 0.4), 0) * 1.05;
  return { parts, pad, full: wide(true), own: wide(false), em };
}

/**
 * A headline figure in its own tile, with a way through to the screen behind it.
 *
 * The type sizes itself to the figure. These are not all counts: "₹2,550.00" and "2 in · 1 out"
 * are as much a headline as "6%", and one size for all of them either shrinks the counts to
 * nothing or runs the money off the edge of a 190px tile.
 */
function Stat({ icon, label, value, sub, tone = "plain", href }: Tile) {
  const Icon = ICON[icon];
  const fig = figure(value);
  return (
    <Link href={href} className={cn("feather feather-lift stat", TONE[tone])}>
      <span className="stat-head">
        <span className="stat-chip"><Icon size={16} /></span>
        <span className="stat-label">{label}</span>
        <ArrowUpRight size={14} className="stat-go" />
      </span>
      {/* 2026-11-16, the owner: "make this the time-flap design". The number was a pale pill with a 1px line drawn
          across it — a picture of a hinge, which on a light theme read as a figure struck through. It is the real
          split-flap tile now (FlapShuffle, the same one the row above and every other counter wears): each run of
          digits is its own housing of cards, like the hours and minutes of a flip clock, and the words between them
          ("₹", ",", "%", "in · out", the paise) stay small text beside the cards. It shuffles and settles on a change.
          Two copies are drawn and the card's own width picks one (globals.css, .stat-value): the flaps, or — when
          even a 30px tile would not fit, a six-figure sum in a 114px card — the plain figure. A screen reader gets
          the value once, as written. */}
      <div className="stat-value" style={{ "--stat-own": fig.own, "--stat-em": fig.em } as React.CSSProperties}>
        <span className="sr-only">{String(value)}</span>
        <div className="stat-flaps" aria-hidden>
          {fig.parts.map((p, i) => p.digits
            ? <FlapShuffle key={i} value={p.text} pad={fig.pad} tile="var(--stat-tile)" bare tone={tone === "chili" ? "alert" : undefined} />
            : <span key={i} className={cn("stat-unit", p.paise && "stat-paise")}>{p.text}</span>)}
        </div>
        <div className="stat-plain num font-semibold" aria-hidden>
          {fig.parts.map((p, i) => (p.digits ? <span key={i}>{p.text}</span> : <span key={i} className="stat-unit">{p.text}</span>))}
        </div>
      </div>
      {sub && (
        <span className="stat-base">
          <span className="stat-foot" title={sub}>{tone !== "plain" && <span className="stat-dot" />}<span className="stat-sub">{sub}</span></span>
        </span>
      )}
    </Link>
  );
}

/** Every panel on the board wears the same head, so the eye only learns one shape. */
function Head({ title, note, href, label }: { title: string; note?: string; href?: string; label?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <h3 className="text-lg truncate">{title}</h3>
      {note && <span className="num text-sm font-semibold shrink-0">{note}</span>}
      {href && <Link href={href} className="tap min-w-11 justify-end text-[11px] font-semibold text-steel hover:text-[var(--color-label)] shrink-0">{label ?? "All"} →</Link>}
    </div>
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
    <div className="feather p-5 flex flex-col">
      <Head title="Where it came from" href="/reports" label="Reports" />
      {/* my-auto: in a band the panel is as tall as its neighbour, and the slack belongs around
          the dial rather than under it */}
      <div className="relative mx-auto my-auto w-full max-w-[230px]" style={{ aspectRatio: "210 / 118" }}>
        <svg viewBox="0 0 210 118" className="w-full h-full" role="img" aria-label="Today's takings by source">
          <path d="M 23 105 A 82 82 0 0 1 187 105" fill="none" stroke="var(--color-fill)" strokeWidth="15" strokeLinecap="round" />
          {sum > 0 && parts.filter((p) => p.value > 0).map((p) => {
            const len = (p.value / sum) * C, off = run; run += len;
            return (
              <motion.path key={p.label} d="M 23 105 A 82 82 0 0 1 187 105" fill="none" strokeWidth="15" strokeLinecap="round"
                stroke={ARC[p.tone]}
                strokeDasharray={`${len} ${C}`} initial={{ strokeDashoffset: -off, opacity: 0 }} animate={{ strokeDashoffset: -off, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="num text-[25px] font-semibold leading-none truncate">{formatINR(total)}</div>
          <div className="text-[11px] text-steel mt-1">taken today</div>
        </div>
      </div>
      {/* a line per source rather than three columns: this panel is a third of the board, and
          "Rooms tonight" over "₹7,800.00" does not fit in 82px of it */}
      <div className="mt-4 pt-4 border-t border-line space-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ARC[p.tone] }} />
            <span className="text-[13px] text-steel flex-1 min-w-0 truncate">{p.label}</span>
            <span className="num text-sm font-semibold shrink-0">{formatINR(p.value)}</span>
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
    <div className="feather p-5 flex flex-col">
      <Head title={title} href={href} />
      {rows.length === 0 ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">{empty}</p> : (
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
    <div className="feather p-5 flex flex-col">
      <Head title="This week" note={formatINR(total)} />
      {!traded ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">No bills this week</p> : (<>
      {/* the curve takes whatever height the band leaves it, so a short panel is never half air */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-[88px] mt-1" preserveAspectRatio="none" role="img" aria-label="Takings over the last seven days">
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
  greet, property, money, parts, tiles, flaps, dishes, tx, staff, days, floor, rooms, web, onFloor,
}: {
  /* `owner` and `kitchen` are still taken — the page passes them and both are one line from being
     wanted again — but nothing on the board reads them now: the owner card said only what the
     sidebar already says, and the kitchen count is the flap next to it. */
  greet: string; property: string; owner: string;
  money: number; parts: Money[]; tiles: Tile[]; flaps: Flap[];
  dishes: Rank[]; tx: Tx[]; staff: Who[]; days: { day: string; value: number }[];
  floor: LiveRow[]; rooms: LiveRow[]; web: LiveRow[]; onFloor: number; kitchen: number;
}) {
  /* One panel, three lists — the floor, the rooms, the orders coming off the internet. They are
     the same shape, so they share a row and a tab rather than three cards the eye must re-learn. */
  const panels = [
    { key: "floor", label: "Floor", rows: floor, href: "/orders", empty: "No open orders", hint: "Updates live", go: "Take an order", Icon: ConciergeBell, hue: "tint" as const },
    ...(rooms.length ? [{ key: "rooms", label: "In house", rows: rooms, href: "/frontdesk", empty: "Nobody checked in.", hint: "Check-ins show here", go: "Front desk", Icon: BedDouble, hue: "blue" as const }] : []),
    ...(web.length ? [{ key: "web", label: "Online", rows: web, href: "/online-orders", empty: "No online orders", hint: "Swiggy, Zomato, website", go: "Online orders", Icon: Bike, hue: "orange" as const }] : []),
  ];
  const [tab, setTab] = useState(panels[0].key);
  const shown = panels.find((p) => p.key === tab) ?? panels[0];
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const t = () => setNow(new Date()); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, []);
  const weekday = now ? now.toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }) : "";
  const dayMonth = now ? now.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";

  /* Every number on the board in one row. They were two grids in two columns — five tiles in a
     two-column grid leaves a hole at the end of it, and the other two sat in a grid of their own
     a column over, at a different width, so seven tiles of one kind read as two unrelated groups.
     "In the kitchen" is not among them any more: the flap beside it already carries that exact
     count, in bigger type, and the tile added nothing to it but the word "cooking". */
  const all: Tile[] = [
    ...tiles.slice(0, 2),
    { icon: "Wallet", label: "On the floor", value: formatINR(onFloor), sub: onFloor ? "not yet billed" : "everything is billed", tone: onFloor ? "amber" : "plain", href: "/orders" },
    ...tiles.slice(2),
  ];
  const tracks = TRACKS[all.length] ?? TRACKS_OTHER;
  /* One tile height for the whole row, set by its widest figure — a row where "08" stood at 52px beside a sum at 36px
     read as two designs. Two widths, because the paise are the first thing to go when a card is narrow: with them, and
     without. A figure too wide for flaps at any size (it falls back to plain type, see Stat) does not get a vote — past
     FLAP_MOST tile-heights no card in this grid fits it, and counting it would shrink every other tile for nothing. */
  const figs = all.map((t) => figure(t.value));
  const votes = figs.filter((f) => f.own <= FLAP_MOST);
  const widest = (pick: (f: (typeof figs)[number]) => number) => Math.max(2.2, ...votes.map(pick));
  const row = { "--stat-w": widest((f) => (f.full <= FLAP_MOST ? f.full : f.own)), "--stat-w-np": widest((f) => f.own) } as React.CSSProperties;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] text-steel">{greet}</div>
          <h1 className="text-[28px] md:text-[38px] leading-none mt-0.5 truncate">{property}</h1>
        </div>
        {/* the day, and the time as a wall clock — it was "SAT, 10 OCT" over "12:09" in small type */}
        <div className="flex items-center gap-3 shrink-0" data-clock>
          <div className="text-right leading-tight"><div className="text-[11px] text-steel uppercase tracking-[0.14em]">{weekday}</div><div className="num text-lg md:text-xl mt-0.5">{dayMonth}</div></div>
          <AnalogClock className="h-16 w-16 md:h-[76px] md:w-[76px]" />
        </div>
      </header>

      {/* The split-flap row, back where it belongs. It reads from the pass, which no stat card
          does, and it is the one piece of this app that is unmistakably this app. */}
      {/* 2026-10-20 flap numbers: each counter shuffles and settles when it changes; a resort's "% full" counts up
          to its percentage over a filling bar (components/ui/Flap.tsx) */}
      <div className="flip-row">
        {flaps.map((f) => (
          <Link key={f.label} href={f.href} className="rounded-2xl focus-visible:outline-none">
            {f.label === "% full"
              ? <FlapPercent value={Number(f.value)} label="full" size="md" tone={f.tone} />
              : <FlapShuffle value={f.value} label={f.label} tone={f.tone} size="md" />}
          </Link>
        ))}
      </div>

      <div className={cn("stat-grid", tracks)} style={row}>{all.map((t) => <Stat key={t.label} {...t} />)}</div>

      {/* ── band: what is happening now, beside where today's money came from ──
         Three columns needed about 1280px to breathe and an iPad in landscape is 1194, which used
         to drop the densest screen in the app to one very long column. Two thirds and one third
         from 1024 keeps the board a board on a tablet. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="feather p-5 flex flex-col lg:col-span-2 min-w-0">
          <Head title="On now" href={shown.href} />
          <div className="chip-rail mb-3">
            {panels.map((p) => (
              <button key={p.key} type="button" onClick={() => setTab(p.key)}
                className={cn("tap h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors justify-center",
                  tab === p.key ? "bg-ink text-on-label" : "text-steel hover:text-[var(--color-label)]")}>{p.label}</button>
            ))}
          </div>
          {shown.rows.length === 0 ? (
            /* an empty list, said properly (2026-10-24): the list's icon in a turning ring, what fills it, and the way there */
            <EmptyState icon={shown.Icon} hue={shown.hue} title={shown.empty} hint={shown.hint} className="flex-1 justify-center" data-on-now-empty={shown.key}
              actions={<Link href={shown.href} className="svc-btn quiet sm !px-4 inline-flex items-center gap-1.5">{shown.go} <ArrowUpRight size={15} aria-hidden /></Link>} />
          ) : (
            /* flex-1 so the list takes the height the band gives it, min-h-0 so it may shrink
               below its content, and the fade so a row cut by the scroll edge reads as a list
               that continues rather than as a row that broke */
            <div className="list-fade flex-1 min-h-0 max-h-[26rem] overflow-y-auto space-y-2 pr-0.5">
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
        <div className="flex flex-col gap-4 min-w-0">
          <Gauge parts={parts} total={money} />
          {/* the week absorbs whatever height the taller panel beside it sets, so the band's two
              sides end on the same line */}
          <div className="flex-1 flex flex-col [&>*]:flex-1"><Week days={days} /></div>
        </div>
      </div>

      {/* ── band: the three ledgers. A flex row rather than a grid: the rota is only drawn when
         somebody else is on the books, and a three-column grid holding two cards leaves a hole. ── */}
      <div className="board-row">
        <Ranked title="Selling today" rows={dishes} href="/reports" empty="Nothing sold yet today." />
        <div className="feather p-5 flex flex-col min-w-0">
          <Head title="Settled" href="/billing" label="Billing" />
          {tx.length === 0 ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">No bills yet</p> : (
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
        {staff.length > 0 && (
          <div className="feather p-5 flex flex-col min-w-0">
            <Head title="On the rota" href="/staff" label="Staff" />
            {/* names, not a huddle of overlapping initials: the name used to live in a title
                attribute, which a finger cannot open */}
            <ul className="space-y-2.5">
              {staff.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full bg-ink text-on-label grid place-items-center font-display text-sm shrink-0">{p.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{p.name}</span>
                    <span className="block text-[11px] text-steel capitalize truncate">{p.role}</span>
                  </span>
                </li>
              ))}
            </ul>
            {staff.length > 6 && <div className="mt-auto pt-3 text-[11px] text-steel num">+{staff.length - 6} more</div>}
          </div>
        )}
      </div>
    </div>
  );
}
