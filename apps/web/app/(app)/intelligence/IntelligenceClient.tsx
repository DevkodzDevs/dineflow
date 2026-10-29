"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Banknote, Check, CheckCircle2, ChefHat, Flag, Info, Percent, Puzzle, Scissors, Tractor, Dog, Sparkles, Star, TrendingDown, Wallet } from "lucide-react";
import { Card, Segmented, cn, FlapShuffle } from "@/components/ui";
import { formatINR } from "@/lib/format";

export type Dish = { id: string; name: string; category: string | null; price: number; qty: number; revenue: number; plate_cost: number | null; margin: number | null; margin_pct: number | null; unpriced: number; class: "star" | "plowhorse" | "puzzle" | "dog" | "uncosted" | "unsold" };
export type Engineering = { days: number; avg_qty: number; avg_margin: number; sold_items: number; with_recipe: number; total_items: number; revenue: number; food_cost_pct: number | null; items: Dish[] };
type Who = string | null;
export type Exceptions = {
  days: number;
  discounts: { count: number; amount: number; per_day: number; base_per_day: number; by_cashier: { name: string; count: number; amount: number }[]; top: { bill_no: number; amount: number; pct: number; coupon: string | null; points: number; total: number; at: string; by: Who }[] };
  voids: { count: number; amount: number; base_per_day: number; list: { bill_no: number; total: number; reason: string | null; at: string; by: Who }[] };
  cancellations: { lines: number; value: number; orders: number; base_lines_per_day: number; list: { order_no: number; name: string; qty: number; value: number; reason: string | null; at: string; by: Who; whole_order: boolean }[]; orders_list: { order_no: number; value: number; reason: string | null; at: string; by: Who }[] };
  cash: { in: number; out: number; moves: number; variance_total: number; variance_abs: number; shift_count: number; shifts: { date: string; at: string; expected: number; counted: number | null; float: number; variance: number | null; note: string | null; by: Who }[] };
};
type Day = { bills: number; sales: number; avg_bill: number; discounts: number; voids: number; cancelled_lines: number; waste_value: number; orders: number };
export type Compare = { today: Day; yesterday: Day; last_week: Day; today_date: string; low_stock: number; open_orders: number; unpaid_bills: number; last_shift: { date: string; variance: number | null; at: string } | null };

const CLASS: Record<Dish["class"], { label: string; hint: string; tone: string }> = {
  star: { label: "Star", hint: "Sells & earns well", tone: "bg-[var(--color-green-2)] text-[var(--color-green)]" },
  plowhorse: { label: "Plowhorse", hint: "Sells well, earns little", tone: "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" },
  puzzle: { label: "Puzzle", hint: "Earns well, sells little", tone: "bg-[color-mix(in_srgb,var(--color-sky,var(--color-tint))_16%,transparent)] text-[var(--color-label)]" },
  dog: { label: "Dog", hint: "Sells & earns little", tone: "bg-[var(--color-red-2)] text-[var(--color-red)]" },
  uncosted: { label: "No recipe", hint: "Add recipe in Menu", tone: "bg-[var(--color-fill)] text-[var(--color-label-2)]" },
  unsold: { label: "Not sold", hint: "None sold", tone: "bg-[var(--color-fill)] text-[var(--color-label-3)]" },
};
/* each class's colour and picture on iPad and up */
const HUE: Record<"star" | "plowhorse" | "puzzle" | "dog", { hue: string; hue2: string; Icon: typeof Star }> = {
  star: { hue: "var(--color-green)", hue2: "var(--color-green-2)", Icon: Star },
  plowhorse: { hue: "var(--color-orange)", hue2: "var(--color-orange-2)", Icon: Tractor },
  puzzle: { hue: "var(--color-blue)", hue2: "var(--color-blue-2)", Icon: Puzzle },
  dog: { hue: "var(--color-red)", hue2: "var(--color-red-2)", Icon: Dog },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const inr = (n: number) => formatINR(Number(n || 0), { whole: true });
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

type Note = { tone: "warn" | "ok" | "info"; text: string; href?: string };

/** The briefing: plain sentences, each one a sum the owner can open. */
function briefing(c: Compare | null, ex: Exceptions | null, eng: Engineering | null): Note[] {
  const out: Note[] = [];
  if (c) {
    const y = c.yesterday, lw = c.last_week, t = c.today;
    if (y.bills > 0 || lw.bills > 0) {
      const p = pct(y.sales, lw.sales);
      out.push({ tone: p == null ? "info" : p < -15 ? "warn" : "ok", text: `Yesterday ${inr(y.sales)} · ${y.bills} bill${y.bills === 1 ? "" : "s"}${p == null ? "" : ` · ${Math.abs(p)}% ${p >= 0 ? "up" : "down"} vs last week`}`, href: "/reports?days=7" });
    } else out.push({ tone: "info", text: "No bills yesterday or last week", href: "/reports" });
    out.push({ tone: c.unpaid_bills > 0 || c.open_orders > 5 ? "info" : "ok", text: `Today ${inr(t.sales)} · ${t.bills} bill${t.bills === 1 ? "" : "s"} · ${c.open_orders} open · ${c.unpaid_bills} unpaid`, href: "/billing" });
    if (y.waste_value > 0 || lw.waste_value > 0) out.push({ tone: y.waste_value > lw.waste_value * 1.5 && y.waste_value > 200 ? "warn" : "info", text: `Wastage yesterday ${inr(y.waste_value)}${lw.waste_value > 0 ? ` (last week ${inr(lw.waste_value)})` : ""}`, href: "/inventory" });
    if (c.low_stock > 0) out.push({ tone: "warn", text: `${c.low_stock} ingredient${c.low_stock === 1 ? "" : "s"} low`, href: "/inventory" });
    if (c.last_shift && c.last_shift.variance != null) { const v = Number(c.last_shift.variance); out.push({ tone: Math.abs(v) >= 100 ? "warn" : "ok", text: `Last shift (${day(c.last_shift.date)}): ${Math.abs(v) < 1 ? "exact" : `${inr(Math.abs(v))} ${v > 0 ? "over" : "short"}`}`, href: "/controls" }); }
  }
  if (ex) {
    const d = ex.discounts; const base = d.base_per_day;
    if (d.count > 0) out.push({ tone: base > 0 && d.per_day > base * 1.5 && d.count >= 3 ? "warn" : "info", text: `${d.count} discount${d.count === 1 ? "" : "s"} · ${inr(d.amount)}${d.by_cashier[0] ? ` · most by ${d.by_cashier[0].name}` : ""}` });
    else out.push({ tone: "ok", text: `No discounts in ${ex.days} days` });
    if (ex.voids.count > 0) out.push({ tone: ex.voids.count >= 3 || (ex.voids.base_per_day > 0 && ex.voids.count / ex.days > ex.voids.base_per_day * 1.5) ? "warn" : "info", text: `${ex.voids.count} void${ex.voids.count === 1 ? "" : "s"} · ${inr(ex.voids.amount)}${ex.voids.list[0]?.reason ? ` · "${ex.voids.list[0].reason}"` : ""}`, href: "/controls" });
    const cl = ex.cancellations;
    if (cl.lines > 0) out.push({ tone: cl.base_lines_per_day > 0 && cl.lines / ex.days > cl.base_lines_per_day * 1.5 && cl.lines >= 3 ? "warn" : "info", text: `${cl.lines} dish${cl.lines === 1 ? "" : "es"} cancelled · ${inr(cl.value)}`, href: "/controls" });
    if (ex.cash.shift_count > 1 && ex.cash.variance_abs >= 200) out.push({ tone: "warn", text: `Cash variance ${inr(ex.cash.variance_abs)} · ${ex.cash.shift_count} closes`, href: "/controls" });
  }
  if (eng) {
    const stars = eng.items.filter((i) => i.class === "star").length, dogs = eng.items.filter((i) => i.class === "dog").length;
    if (eng.food_cost_pct != null) out.push({ tone: eng.food_cost_pct > 40 ? "warn" : "ok", text: `Food cost ${eng.food_cost_pct}% · ${stars} star${stars === 1 ? "" : "s"} · ${dogs} dog${dogs === 1 ? "" : "s"}` });
    const missing = eng.total_items - eng.with_recipe;
    if (missing > 0) out.push({ tone: "info", text: `${missing} dish${missing === 1 ? "" : "es"} without recipe`, href: "/menu" });
  }
  return out;
}

export function IntelligenceClient({ days, engineering, exceptions, compare, error }: { days: number; engineering: Engineering | null; exceptions: Exceptions | null; compare: Compare | null; error: string | null }) {
  const router = useRouter();
  const [klass, setKlass] = useState<"all" | Dish["class"]>("all");
  const notes = briefing(compare, exceptions, engineering);
  const warn = notes.filter((n) => n.tone === "warn").length;
  const items = engineering?.items ?? [];
  const counts = items.reduce<Record<string, number>>((m, i) => ((m[i.class] = (m[i.class] ?? 0) + 1), m), {});
  const shown = klass === "all" ? items : items.filter((i) => i.class === klass);
  const stars = counts.star ?? 0, dogs = counts.dog ?? 0;
  return (
    <div className="space-y-6" data-intelligence>
      {/* the window: one control, full width on a phone; the note beside it where there is room */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-period>
        <Segmented value={String(days)} onChange={(v) => router.push(`/intelligence?days=${v}`)} className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none"
          options={[{ value: "7", label: "7 days" }, { value: "28", label: "28 days" }, { value: "90", label: "90 days" }]} />
      </div>
      {error && <p className="rounded-xl bg-[var(--color-red-2)] px-4 py-3 text-sm text-[var(--color-red)]">{error}</p>}

      {/* the scoreboard: four figures in one strip, the same type and the same rhythm for each —
          a percentage, two counts and a flag count used to be four tiles of three different kinds */}
      <Scoreboard foodCost={engineering?.food_cost_pct ?? null} costed={engineering ? [engineering.with_recipe, engineering.total_items] : null} stars={stars} dogs={dogs} warn={warn} />

      {/* the briefing */}
      <Card data-briefing>
        <div className="flex items-start gap-3 mb-3">
          <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><Sparkles size={16} /></span>
          <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Owner&apos;s briefing</h3><p className="text-xs text-steel mt-0.5">Yesterday vs last week</p></div>
        </div>
        <ul className="divide-y divide-[var(--color-separator)]">
          {notes.map((n, i) => {
            const Icon = n.tone === "warn" ? AlertTriangle : n.tone === "ok" ? CheckCircle2 : Info;
            const row = <><span className={cn("h-7 w-7 shrink-0 rounded-lg grid place-items-center", n.tone === "warn" ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" : n.tone === "ok" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}><Icon size={14} /></span><span className="text-[14px] leading-snug min-w-0 flex-1">{n.text}</span></>;
            return <li key={i} className="py-2.5 first:pt-0 last:pb-0">{n.href ? <Link href={n.href} className="flex items-start gap-3 min-w-0 hover:opacity-80 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">{row}</Link> : <div className="flex items-start gap-3 min-w-0">{row}</div>}</li>;
          })}
          {notes.length === 0 && <li className="py-2 text-sm text-steel">After your first bill</li>}
        </ul>
      </Card>

      {/* menu engineering */}
      <Card data-menu-engineering>
        <div className="flex items-start gap-3 mb-4">
          <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><ChefHat size={16} /></span>
          <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Menu engineering · {days} days</h3><p className="text-xs text-steel mt-0.5">At today&apos;s prices</p></div>
        </div>
        {/* iPad and up (2026-10-24, the owner: "number flap design"): each class a tile in its own colour — its icon, the
            name, the count on the StatTile flap, what to do. Phones keep the compact tiles below. */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-classes>
          {(["star", "plowhorse", "puzzle", "dog"] as const).map((k) => { const h = HUE[k]; const on = klass === k; return (
            <button key={k} type="button" onClick={() => setKlass(on ? "all" : k)} aria-pressed={on} data-class={k}
              style={{ ["--hue" as string]: h.hue, ["--hue-2" as string]: h.hue2 }}
              className={cn("@container relative overflow-hidden rounded-[20px] p-4 text-left min-w-0 border bg-[var(--color-bg-2)] transition flex flex-col gap-3",
                on ? "border-[var(--hue)] shadow-[0_0_0_3px_var(--hue-2)]" : "border-[var(--color-separator)] hover:border-[color-mix(in_srgb,var(--hue)_45%,transparent)]")}>
              <span className="absolute inset-x-0 top-0 h-1 bg-[var(--hue)]" aria-hidden />
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]"><h.Icon size={19} aria-hidden /></span>
                <span className="text-[14px] font-extrabold uppercase tracking-[.08em] text-[color-mix(in_srgb,var(--hue)_62%,var(--color-label))] truncate">{CLASS[k].label}</span>
                {on && <span className="ml-auto h-6 w-6 rounded-full grid place-items-center bg-[var(--hue)] text-[var(--color-on-tint)]"><Check size={14} strokeWidth={3} aria-hidden /></span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flip-stat shrink-0"><FlapShuffle value={counts[k] ?? 0} pad={2} size="sm" say={`${counts[k] ?? 0} ${CLASS[k].label}`} /></div>
                <span className="min-w-0 flex-1 basis-24 text-[12px] text-[var(--color-label-2)]">{(counts[k] ?? 0) === 1 ? "dish" : "dishes"}</span>
              </div>
              <div className="text-[13px] text-[var(--color-label-2)] leading-snug">{CLASS[k].hint}</div>
            </button>); })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 md:hidden">
          {(["star", "plowhorse", "puzzle", "dog"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKlass(klass === k ? "all" : k)} aria-pressed={klass === k}
              className={cn("rounded-2xl p-3 text-left min-w-0 border transition", klass === k ? "border-[var(--color-label)]" : "border-[var(--color-separator)] hover:bg-[var(--color-fill)]")}>
              <div className="flex items-center gap-2"><span className={cn("text-[11px] font-semibold uppercase tracking-[.1em] rounded-full px-2 py-0.5", CLASS[k].tone)}>{CLASS[k].label}</span><span className="ml-auto num text-lg font-semibold">{counts[k] ?? 0}</span></div>
              <div className="text-[12px] text-[var(--color-label-2)] mt-1.5 leading-snug">{CLASS[k].hint}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["all", "uncosted", "unsold"] as const).map((k) => <button key={k} type="button" onClick={() => setKlass(k)} className={cn("chip", klass === k && "on")}>{k === "all" ? `All ${items.length}` : `${CLASS[k].label} ${counts[k] ?? 0}`}</button>)}
          <span className="ml-auto text-xs text-steel self-center num">avg sold {engineering?.avg_qty ?? 0} · avg margin {inr(engineering?.avg_margin ?? 0)}</span>
        </div>
        <div className="feather overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[760px]">
          <thead><tr><th className="text-left px-4 py-3">Dish</th><th className="text-right px-3 py-3">Sold</th><th className="text-right px-3 py-3">Revenue</th><th className="text-right px-3 py-3">Price</th><th className="text-right px-3 py-3">Plate cost</th><th className="text-right px-3 py-3">Margin</th><th className="text-right px-3 py-3">%</th><th className="px-4 py-3 text-left">Class</th></tr></thead>
          <tbody>{shown.map((i) => (
            <tr key={i.id} className="border-t border-line" data-dish>
              <td className="px-4 py-2.5"><div className="font-semibold truncate max-w-[260px]">{i.name}</div><div className="text-xs text-steel truncate">{i.category ?? "—"}{i.unpriced > 0 && ` · ${i.unpriced} unpriced`}</div></td>
              <td className="px-3 py-2.5 text-right num">{i.qty}</td>
              <td className="px-3 py-2.5 text-right num">{inr(i.revenue)}</td>
              <td className="px-3 py-2.5 text-right num">{inr(i.price)}</td>
              <td className="px-3 py-2.5 text-right num text-steel">{i.plate_cost != null ? formatINR(i.plate_cost) : "—"}</td>
              <td className={cn("px-3 py-2.5 text-right num font-semibold", i.margin != null && i.margin < 0 && "text-chili")}>{i.margin != null ? formatINR(i.margin) : "—"}</td>
              <td className="px-3 py-2.5 text-right num text-steel">{i.margin_pct != null ? `${i.margin_pct}%` : "—"}</td>
              <td className="px-4 py-2.5"><span className={cn("inline-block text-[11px] font-semibold uppercase tracking-[.08em] rounded-full px-2 py-0.5 whitespace-nowrap", CLASS[i.class].tone)}>{CLASS[i.class].label}</span></td>
            </tr>))}
            {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-steel">None here</td></tr>}
          </tbody></table></div>
      </Card>

      {/* exceptions */}
      {exceptions && (
        <div className="grid gap-4 lg:grid-cols-2" data-exceptions>
          <Card>
            <Head icon={<Percent size={16} />} title={`Discounts · ${exceptions.days} days`} sub={`${exceptions.discounts.count} bills · ${inr(exceptions.discounts.amount)} · ${exceptions.discounts.per_day}/day (usual ${exceptions.discounts.base_per_day})`} trend={exceptions.discounts.base_per_day > 0 ? exceptions.discounts.per_day - exceptions.discounts.base_per_day : null} />
            {exceptions.discounts.by_cashier.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{exceptions.discounts.by_cashier.map((c) => <span key={c.name} className="chip !cursor-default">{c.name} · {c.count} · {inr(c.amount)}</span>)}</div>}
            <List rows={exceptions.discounts.top.map((t) => ({ k: `${t.bill_no}-${t.at}`, a: `Bill ${t.bill_no}`, b: [t.pct > 0 ? `${t.pct}%` : null, t.coupon ? `coupon ${t.coupon}` : null, t.points > 0 ? `${t.points} pts` : null, t.by].filter(Boolean).join(" · "), c: when(t.at), amt: `− ${inr(t.amount)}` }))} empty="No discounts" />
          </Card>
          <Card>
            <Head icon={<Banknote size={16} />} title="Voided bills" sub={`${exceptions.voids.count} · ${inr(exceptions.voids.amount)} · usual ${exceptions.voids.base_per_day}/day`} />
            <List rows={exceptions.voids.list.map((v) => ({ k: `${v.bill_no}-${v.at}`, a: `Bill ${v.bill_no}`, b: [v.reason ?? "no reason", v.by].filter(Boolean).join(" · "), c: when(v.at), amt: inr(v.total) }))} empty="No voided bills." />
          </Card>
          <Card>
            <Head icon={<Scissors size={16} />} title="Cancelled dishes" sub={`${exceptions.cancellations.lines} lines · ${inr(exceptions.cancellations.value)} · ${exceptions.cancellations.orders} orders · usual ${exceptions.cancellations.base_lines_per_day}/day`} />
            <List rows={exceptions.cancellations.list.map((l, i) => ({ k: `${l.order_no}-${i}`, a: `${l.qty}× ${l.name}`, b: [`order #${l.order_no}`, l.whole_order ? "whole order" : null, l.reason ?? "no reason", l.by].filter(Boolean).join(" · "), c: when(l.at), amt: inr(l.value) }))} empty="No cancelled dishes." />
          </Card>
          <Card>
            <Head icon={<Wallet size={16} />} title="Cash & shift closes" sub={`in ${inr(exceptions.cash.in)} · out ${inr(exceptions.cash.out)} · ${exceptions.cash.shift_count} closes · variance ${inr(exceptions.cash.variance_abs)}`} />
            <List rows={exceptions.cash.shifts.map((s) => ({ k: `${s.date}-${s.at}`, a: day(s.date), b: [`expected ${inr(s.expected)}`, s.counted != null ? `counted ${inr(Number(s.counted) - Number(s.float))}` : null, s.by, s.note].filter(Boolean).join(" · "), c: when(s.at), amt: s.variance == null ? "—" : Math.abs(Number(s.variance)) < 1 ? "exact" : `${Number(s.variance) > 0 ? "+" : "−"}${inr(Math.abs(Number(s.variance)))}`, bad: s.variance != null && Math.abs(Number(s.variance)) >= 100 }))} empty="No shift closes" />
            <Link href="/controls" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-tint)] [@media(pointer:coarse)]:min-h-11">Cash & controls <ArrowUpRight size={14} /></Link>
          </Card>
        </div>
      )}
    </div>
  );
}

function Head({ icon, title, sub, trend }: { icon: React.ReactNode; title: string; sub: string; trend?: number | null }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel">{icon}</span>
      <div className="min-w-0 pt-1 flex-1"><h3 className="text-base font-semibold">{title}</h3><p className="text-xs text-steel mt-0.5">{sub}</p></div>
      {trend != null && trend !== 0 && <span className={cn("shrink-0 inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-1", trend > 0 ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]")}>{trend > 0 ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />} {trend > 0 ? "above usual" : "below usual"}</span>}
    </div>
  );
}
function List({ rows, empty }: { rows: { k: string; a: string; b: string; c: string; amt: string; bad?: boolean }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-steel">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--color-separator)]">
      {rows.map((r) => (
        <li key={r.k} className="py-2 flex items-center gap-3 min-w-0 first:pt-0">
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{r.a}</div><div className="text-xs text-steel truncate">{r.b}</div></div>
          <div className="text-right shrink-0"><div className={cn("num text-sm font-semibold", r.bad && "text-chili")}>{r.amt}</div><div className="text-[11px] text-steel num">{r.c}</div></div>
        </li>
      ))}
    </ul>
  );
}

/** A ring that fills to a percentage — the food-cost figure's icon. */
function Ring({ pct, tone }: { pct: number | null; tone: string }) {
  const r = 15, c = 2 * Math.PI * r, p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 40 40" className={cn("h-6 w-6 -rotate-90", tone)} aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} />
    </svg>
  );
}

/**
 * The four figures of the page in one strip. Each cell is the same shape — a tinted mark, a display
 * numeral, a label and a line under it — so a percentage and a count read as one set. 2 × 2 on a phone,
 * four across from 900px, hairlines between. With no recipes the first cell says what to do, not "—".
 */
function Scoreboard({ foodCost, costed, stars, dogs, warn }: { foodCost: number | null; costed: [number, number] | null; stars: number; dogs: number; warn: number }) {
  /* tone → icon colour and its wash, written out in full: Tailwind only generates classes it can read
     in the source, so a wash built from the colour string at runtime never existed (Dogs had none) */
  const TONE = {
    green: "text-[var(--color-green)] bg-[color-mix(in_srgb,var(--color-green)_14%,transparent)]",
    red: "text-[var(--color-red)] bg-[color-mix(in_srgb,var(--color-red)_14%,transparent)]",
    orange: "text-[var(--color-orange)] bg-[color-mix(in_srgb,var(--color-orange)_14%,transparent)]",
    mute: "text-[var(--color-label-3)] bg-[var(--color-fill)]",
  } as const;
  const fc = foodCost == null ? "mute" : foodCost > 40 ? "red" : foodCost > 35 ? "orange" : "green";
  const cells: { key: string; mark: React.ReactNode; tone: keyof typeof TONE; value: React.ReactNode; label: string; sub: React.ReactNode }[] = [
    { key: "food-cost", mark: <Ring pct={foodCost} tone="" />, tone: fc, label: "Food cost",
      value: foodCost != null ? <>{foodCost}<span className="text-[0.55em] font-semibold ml-0.5">%</span></> : <span className="text-[16px] font-semibold leading-tight">No recipes</span>,
      sub: costed && costed[0] > 0 ? `${costed[0]} of ${costed[1]} costed` : <Link href="/menu" className="text-[var(--color-tint)] font-semibold">Add in Menu →</Link> },
    { key: "stars", mark: <Star size={18} />, tone: stars > 0 ? "green" : "mute", value: stars, label: "Stars", sub: "sell & earn well" },
    { key: "dogs", mark: <TrendingDown size={18} />, tone: dogs > 0 ? "red" : "mute", value: dogs, label: "Dogs", sub: "sell & earn little" },
    { key: "flags", mark: warn > 0 ? <Flag size={18} /> : <CheckCircle2 size={18} />, tone: warn > 0 ? "orange" : "green", value: warn, label: "Needs a look", sub: warn > 0 ? "in the briefing" : "all in range" },
  ];
  return (
    <Card className="!p-0 overflow-hidden" data-scoreboard>
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 [&>*]:border-[var(--color-separator)] [&>*:nth-child(even)]:border-l min-[900px]:[&>*:nth-child(3)]:border-l max-[899px]:[&>*:nth-child(n+3)]:border-t">
        {cells.map((c) => (
          /* stacked in every cell: the mark and the label on one line, the figure under them, one line
             of context — so on a phone nothing wraps beside the icon and the four figures line up */
          <div key={c.key} className="p-4 sm:p-5 min-w-0 flex flex-col" data-score={c.key}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center", TONE[c.tone])}>{c.mark}</span>
              <span className="eyebrow truncate">{c.label}</span>
            </div>
            <div className="num font-display text-[34px] sm:text-[38px] leading-none tracking-tight tabular-nums mt-3 min-h-[34px] flex items-end">{c.value}</div>
            <div className="text-[12px] text-[var(--color-label-2)] mt-1.5 truncate">{c.sub}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
