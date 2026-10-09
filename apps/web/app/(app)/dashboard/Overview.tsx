"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Wallet, Users, Timer, BedDouble, Bike, Boxes, ConciergeBell, Sparkles, Flame, ReceiptText } from "lucide-react";
import { Flip, cn } from "@/components/ui";
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
const TRACKS: Record<number, string> = {
  4: "grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5 [&>:last-child]:col-span-2 xl:[&>:last-child]:col-span-1",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  7: "grid-cols-2 md:grid-cols-4 [&>:last-child]:col-span-2",
};

/** One colour per source, shared by the arc and the dot in its key so they can never disagree. */
const ARC: Record<Tone, string> = { mint: "var(--color-tint)", amber: "var(--color-orange)", sky: "var(--color-blue)",
  chili: "var(--color-red)", plain: "var(--color-label-3)" };

/**
 * A headline figure in its own tile, with a way through to the screen behind it.
 *
 * The type sizes itself to the figure. These are not all counts: "₹2,550.00" and "2 in · 1 out"
 * are as much a headline as "6%", and one size for all of them either shrinks the counts to
 * nothing or runs the money off the edge of a 190px tile.
 */
function Stat({ icon, label, value, sub, tone = "plain", href }: Tile) {
  const Icon = ICON[icon], n = String(value).length;
  const size = n > 9 ? "!text-[20px]" : n > 6 ? "!text-[24px]" : n > 4 ? "!text-[28px]" : "";
  return (
    <Link href={href} className={cn("feather feather-lift stat", TONE[tone])}>
      <span className="stat-head">
        <span className="stat-chip"><Icon size={15} /></span>
        <span className="stat-label">{label}</span>
        <ArrowUpRight size={14} className="stat-go" />
      </span>
      <span className={cn("stat-value num font-semibold", size)}><span className="min-w-0 truncate">{value}</span></span>
      {sub && (
        <span className="stat-base">
          <span className="stat-foot">{tone !== "plain" && <span className="stat-dot" />}<span className="stat-sub">{sub}</span></span>
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
      {!traded ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">No bills settled in the last seven days.</p> : (<>
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
  const tracks = TRACKS[all.length] ?? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] text-steel">{greet}</div>
          <h1 className="text-[28px] md:text-[38px] leading-none mt-0.5 truncate">{property}</h1>
        </div>
        <div className="text-right shrink-0"><div className="text-[11px] text-steel uppercase tracking-wide">{date}</div><div className="num text-xl">{clock}</div></div>
      </header>

      {/* The split-flap row, back where it belongs. It reads from the pass, which no stat card
          does, and it is the one piece of this app that is unmistakably this app. */}
      <div className="flip-row">
        {flaps.map((f) => (
          <Link key={f.label} href={f.href} className="rounded-2xl focus-visible:outline-none">
            <Flip value={f.value} label={f.label} tone={f.tone} />
          </Link>
        ))}
      </div>

      <div className={cn("stat-grid", tracks)}>{all.map((t) => <Stat key={t.label} {...t} />)}</div>

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
          {shown.rows.length === 0 ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">{shown.empty}</p> : (
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
        <Ranked title="Selling today" rows={dishes} href="/reports" empty="Nothing sold yet — the first order of the day lands here." />
        <div className="feather p-5 flex flex-col min-w-0">
          <Head title="Settled" href="/billing" label="Billing" />
          {tx.length === 0 ? <p className="flex-1 grid place-items-center text-sm text-steel text-center py-6">No bills settled yet today.</p> : (
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
            {staff.length > 6 && <div className="mt-auto pt-3 text-[11px] text-steel num">+{staff.length - 6} more on the books</div>}
          </div>
        )}
      </div>
    </div>
  );
}
