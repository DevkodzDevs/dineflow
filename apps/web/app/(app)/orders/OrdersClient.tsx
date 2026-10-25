"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Users, Clock, ChevronRight, Armchair, ShoppingBag, BedDouble, Bike, CalendarClock, CalendarX, Plus, LayoutGrid, List, HandPlatter, Check, Sparkles, Phone } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLive } from "@/lib/useLive";
import { cn, Empty, useToast } from "@/components/ui";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { Say } from "@/components/ui/Say";
import { StateChip, SVC_ICON, stClass } from "@/components/ui/Service";
import { Rail } from "@/components/ui/Rail";
import { formatINR, fmtSince } from "@/lib/format";
import { orderState, isLate, SVC_WORD, type Svc } from "@/lib/service";
import { setTableStatus, answerCall } from "./actions";
import { takeJob, finishJob } from "../cleaning/actions";

type Table = { id: string; name: string; capacity: number; zone: string; status: "free" | "occupied" | "reserved" };
type Item = { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string; created_at?: string | null };
type Order = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; token_no?: number | null; order_items: Item[]; bills?: { status: string }[] | null };
type Call = { id: string; table_id: string; kind: "waiter" | "bill" | "water"; created_at: string };
/** A table paid and left, not yet cleaned (0111), with whoever has it. */
export type Clean = { id: string; table_id: string; status: "pending" | "in_progress"; created_at: string; assigned_to: string | null; assigned_name: string | null; taken_by: string | null; taken_name: string | null; taken_at: string | null };
const CALL_WORD: Record<Call["kind"], string> = { waiter: "Calling", bill: "Wants bill", water: "Water" };
const KIND: Record<string, { word: "parcel" | "delivery" | "room" | "dine_in"; Icon: typeof Armchair }> = {
  dine_in: { word: "dine_in", Icon: Armchair }, takeaway: { word: "parcel", Icon: ShoppingBag },
  room_service: { word: "room", Icon: BedDouble }, delivery: { word: "delivery", Icon: Bike },
};
/** an order open longer than a service is a table someone forgot to bill or close (Pulse's STALE) */
const STALE_MS = 12 * 3600e3;
const live = (o: Order) => o.order_items.filter((x) => x.status !== "cancelled");
const totalOf = (o: Order) => live(o).reduce((s, x) => s + Number(x.price_snapshot) * x.qty, 0);
const stateOf = (o: Order): Svc => orderState(o.order_items, (o.bills ?? []).some((b) => b.status === "unpaid"));
/* the plate-by-plate colours of the list view: the same hues as the floor */
const PLATE: Record<string, { word: "ordered" | "cooking" | "food_ready" | "eating"; cls: string }> = {
  pending: { word: "ordered", cls: "st-new" }, preparing: { word: "cooking", cls: "st-cook" }, ready: { word: "food_ready", cls: "st-ready" }, served: { word: "eating", cls: "st-eat" },
};

/**
 * The floor, read by colour (globals.css SIMPLE SERVICE): a free table is a dashed card with Take order;
 * a table with a ticket is filled in its state's colour — ordered, cooking, food ready (ringed), eating,
 * bill — with how long and how much; LATE when a dish is past the kitchen's target. The chips on top
 * count each state and, tapped, show only those tables. "List" is every open order as a card with its
 * dishes, for whoever wants the detail.
 */
export function OrdersClient({ tables, orders, calls = [], lateAt = 15, cleaning = [], me = "", boss = false }: { tables: Table[]; orders: Order[]; calls?: Call[]; lateAt?: number; cleaning?: Clean[]; me?: string; boss?: boolean }) {
  const [pending, start] = useTransition(); const toast = useToast();
  const [, tick] = useState(0);
  useLive(["orders", "order_items", "dining_tables", "bills", "service_calls", "table_cleanings"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  /* Tables · List as the app's one view switch (2026-10-25, the owner: "this design, everywhere it is needed"): a tap shows
     the other for this visit, the pin keeps it as this device's default; a choice kept before (df-orders-view) reads as pinned. */
  const lay = useViewPref("orders", ["tables", "list"] as const, { legacy: "df-orders-view" });
  const view = lay.chosen ?? "tables";
  const [only, setOnly] = useState<Svc | "late" | null>(null);

  const byTable = new Map<string, Order>(); orders.forEach((o) => { if (o.table_id && !byTable.has(o.table_id)) byTable.set(o.table_id, o); });
  const cleanOf = new Map(cleaning.map((c) => [c.table_id, c]));
  const tableState = (t: Table): Svc => { const o = byTable.get(t.id); return o ? stateOf(o) : t.status === "reserved" ? "hold" : t.status === "occupied" ? "eat" : cleanOf.has(t.id) ? "clean" : "free"; };
  const lateOf = (o: Order | undefined) => !!o && isLate(live(o), lateAt, o.created_at);
  const zones = [...new Set(tables.map((t) => t.zone))];
  const loose = orders.filter((o) => !o.table_id);
  // the count on each chip: tables by state, and the parcels and deliveries in theirs
  const counts = new Map<Svc | "late", number>();
  tables.forEach((t) => { const s = tableState(t); counts.set(s, (counts.get(s) ?? 0) + 1); if (lateOf(byTable.get(t.id))) counts.set("late", (counts.get("late") ?? 0) + 1); });
  loose.forEach((o) => { const s = stateOf(o); counts.set(s, (counts.get(s) ?? 0) + 1); if (lateOf(o)) counts.set("late", (counts.get("late") ?? 0) + 1); });
  const chips = (["free", "clean", "hold", "new", "cook", "ready", "eat", "bill", "late"] as const).filter((s) => (counts.get(s) ?? 0) > 0 || s === "free");
  const shows = (s: Svc, late: boolean) => !only || only === s || (only === "late" && late);

  /* A table calling from its QR (0103): an orange pill on the card's top edge — Calling, Wants bill, Water — that
     pulses until a waiter taps it. A tap answers every open call of that table. It sits over the card's link, a
     sibling of it, not inside it. */
  // answered calls, by call id: a later call from the same table shows again (it has a new id)
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const callsOf = (tableId: string) => calls.filter((c) => c.table_id === tableId && !answered[c.id]);
  const callBadge = (t: Table) => {
    const cs = callsOf(t.id); if (!cs.length) return null;
    const kinds = [...new Set(cs.map((c) => c.kind))]; const word = kinds.includes("bill") ? CALL_WORD.bill : kinds.includes("waiter") ? CALL_WORD.waiter : CALL_WORD.water;
    return (
      <button type="button" disabled={pending} data-call={t.name} title={`${t.name}: ${kinds.map((k) => CALL_WORD[k]).join(", ")} — tap when you have gone`} aria-label={`${t.name} ${word} — mark answered`}
        onClick={() => { const ids = cs.map((c) => c.id); setAnswered((a) => ({ ...a, ...Object.fromEntries(ids.map((i) => [i, true as const])) })); start(async () => { const r = await answerCall(t.id); if ("error" in r) { toast(r.error!, "err"); setAnswered((a) => { const n = { ...a }; ids.forEach((i) => delete n[i]); return n; }); } else toast(`${t.name} — answered`); }); }}
        className="group absolute z-[2] -top-6 left-1 !min-h-11 px-1.5 inline-flex items-center rounded-full">
        {/* the pill stays 28px; the button around it is the 44px a finger needs */}
        <span className="h-7 pl-2 pr-2.5 rounded-full bg-[var(--color-orange)] text-[var(--color-bezel)] text-[12px] font-extrabold inline-flex items-center gap-1 shadow-[0_0_0_4px_var(--color-orange-2)] animate-pulse group-hover:animate-none">
          <HandPlatter size={14} aria-hidden />{word}<Check size={13} aria-hidden className="ml-0.5 opacity-70" />
        </span>
      </button>
    );
  };
  const reserve = (t: Table) => start(async () => { const r = await setTableStatus(t.id, t.status === "reserved" ? "free" : "reserved"); if ("error" in r) toast(r.error!, "err"); });

  /** One table: a link to its ticket, or — free — a card whose Take order covers it, with Reserve on top. */
  const tableCard = (t: Table, i: number) => {
    const o = byTable.get(t.id); const s = tableState(t); const late = lateOf(o); const I = SVC_ICON[s];
    const seats = <span className="ml-auto flex items-center gap-1 text-[14px] font-bold text-[var(--color-label-2)] shrink-0"><Users size={16} aria-hidden />{t.capacity}</span>;
    const motionProps = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 12) * 0.012 } };
    /* Paid and left (0111): cyan and dashed — who has it and since when, the one move this person can make (take it,
       or Done), and + to seat the next party anyway (which closes the job as "seated again before it was cleaned"). */
    const c = !o && s === "clean" ? cleanOf.get(t.id) : undefined;
    if (c) {
      const theirs = !!c.assigned_to && c.assigned_to !== me;
      const canTake = c.status === "pending" && (!theirs || boss);
      const canDone = c.status === "in_progress" && (c.taken_by === me || c.assigned_to === me || boss || !c.taken_by);
      const who = c.status === "in_progress" ? `${c.taken_by === me ? "You are on it" : `${c.taken_name ?? "Someone"} is on it`}`
        : c.assigned_to ? `Given to ${c.assigned_to === me ? "you" : c.assigned_name}` : "Waiting for someone";
      const since = fmtSince(c.status === "in_progress" ? c.taken_at ?? c.created_at : c.created_at);
      return (
        <motion.div key={t.id} {...motionProps} className={cn("svc-table", stClass("clean"))} data-table-card={t.name} data-state="clean" data-clean={c.status}>
          {callBadge(t)}
          {/* the same build as every other table (2026-10-21, the owner: "messy"): name and seats, the state, who has it,
              then the foot — how long, and one compact move with + beside it to seat the next party anyway */}
          <div className="flex items-center gap-2 min-w-0"><span className="tname">{t.name}</span>{seats}</div>
          <div className="tstate"><I size={19} aria-hidden /><Say w="cleaning" start /></div>
          <div className="max-md:hidden mt-1 text-[13px] font-semibold text-[var(--color-label-2)] truncate num" data-clean-who>{who} · {since}</div>
          {/* a phone (2026-10-22, the owner: "not looking good" — the live card cut "Waiting for someone · 2d …" and wrapped
              its button): who has it in a few words on the left, how long in a tinted pill on the right that never truncates */}
          <div className="md:hidden mt-2 flex items-center gap-1.5 min-w-0" data-clean-who-phone>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--color-label-2)]" title={who}>
              {c.status === "in_progress" ? (c.taken_by === me ? "You're on it" : `${(c.taken_name ?? "Someone").split(" ")[0]}'s on it`) : c.assigned_to ? `For ${c.assigned_to === me ? "you" : (c.assigned_name ?? "").split(" ")[0]}` : "Nobody yet"}</span>
            <span className="shrink-0 h-6 px-2 rounded-full inline-flex items-center gap-1 text-[12px] font-bold num" style={{ background: "color-mix(in srgb, var(--st) 16%, transparent)", color: "var(--st-ink)" }}><Clock size={12} aria-hidden />{since}</span>
          </div>
          <div className="mt-auto pt-2 flex items-center gap-2 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0 w-full">
              {canTake ? <button type="button" disabled={pending} className="relative flex-1 min-w-0 justify-center h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap overflow-hidden bg-[var(--st)] text-[var(--color-bezel)] active:scale-[.97] transition before:absolute before:-inset-1 before:content-['']" data-clean-take onClick={() => start(async () => { const r = await takeJob("table", c.id); if ("error" in r) toast(r.error!, "err"); else toast(`${t.name} is yours`); })}><Sparkles size={15} aria-hidden className="shrink-0 max-[399.98px]:hidden" /><span className="min-w-0 truncate"><Say w="take_it" /></span></button>
                : canDone ? <button type="button" disabled={pending} className="relative flex-1 min-w-0 justify-center h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap overflow-hidden bg-[var(--color-green)] text-[var(--color-on-tint)] active:scale-[.97] transition before:absolute before:-inset-1 before:content-['']" data-clean-done onClick={() => start(async () => { const r = await finishJob("table", c.id); if ("error" in r) toast(r.error!, "err"); else toast(`${t.name} is clean`); })}><Check size={16} aria-hidden className="shrink-0 max-[399.98px]:hidden" /><span className="min-w-0 truncate"><Say w="clean_done" /></span></button>
                : <Link href="/cleaning" className="relative flex-1 min-w-0 justify-center h-9 px-3 rounded-full inline-flex items-center text-[13px] font-bold bg-[var(--color-fill-2)] before:absolute before:-inset-1 before:content-['']">See who</Link>}
              <Link href={`/orders/new?table=${t.id}`} className="relative h-9 w-9 shrink-0 rounded-full grid place-items-center bg-[var(--color-fill-2)] hover:bg-[var(--color-fill)] before:absolute before:-inset-1 before:content-['']" aria-label={`Take order at ${t.name} anyway`} title="Seat the next party now"><Plus size={17} aria-hidden /></Link>
            </span>
          </div>
        </motion.div>
      );
    }
    if (!o && (s === "free" || s === "hold")) {
      return (
        <motion.div key={t.id} {...motionProps} className={cn("svc-table", stClass(s))} data-table-card={t.name} data-state={s}>
          {callBadge(t)}
          <div className="flex items-center gap-2 min-w-0 -my-1">
            <span className="tname">{t.name}</span>{seats}
            {/* Reserve sits over the card's tap area: the whole card takes the order, this button holds the table */}
            <button type="button" onClick={() => reserve(t)} disabled={pending} aria-label={`${s === "hold" ? "Unreserve" : "Reserve"} ${t.name}`} title={s === "hold" ? "Unreserve" : "Reserve for a booking"}
              className="relative z-[1] -mr-1.5 h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 rounded-xl grid place-items-center text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]">
              {s === "hold" ? <CalendarX size={18} /> : <CalendarClock size={18} />}</button>
          </div>
          {s === "hold" && <div className="tstate"><CalendarClock size={18} aria-hidden /><Say w="reserved" start /></div>}
          <Link href={`/orders/new?table=${t.id}`} className="svc-take mt-auto after:absolute after:inset-0 after:rounded-[20px]" aria-label={`Take order at ${t.name}`}><Plus size={20} aria-hidden /><Say w="take_order" /></Link>
        </motion.div>
      );
    }
    return (
      <motion.div key={t.id} {...motionProps} className="min-w-0 flex relative">
        {callBadge(t)}
        <Link href={o ? `/orders/${o.id}` : `/orders/new?table=${t.id}`} className={cn("svc-table flex-1", stClass(s))} data-table-card={t.name} data-state={s} data-late={late || undefined}>
          <div className="flex items-center gap-2 min-w-0"><span className="tname">{t.name}</span>{seats}</div>
          <div className="tstate"><I size={19} aria-hidden className={cn(s === "ready" && "animate-pulse")} /><Say w={o ? SVC_WORD[s] : "at_table"} start /></div>
          <div className="mt-auto pt-2 flex items-end gap-2 font-bold min-w-0">
            {o ? <><span className={cn("flex items-center gap-1 text-[14px] shrink-0", Date.now() - new Date(o.created_at).getTime() > STALE_MS ? "text-[var(--color-orange)]" : "text-[var(--color-label-2)]")}><Clock size={15} aria-hidden />{fmtSince(o.created_at)}</span>
              <span className="ml-auto font-display num text-[21px] leading-none truncate">{formatINR(totalOf(o), { whole: true })}</span></>
              : <span className="text-[13px] text-[var(--color-label-2)]">No ticket yet — tap to order</span>}
          </div>
          {late && <span className="late-tag"><SVC_ICON.late size={13} aria-hidden /> LATE</span>}
        </Link>
      </motion.div>
    );
  };

  /** A parcel, a delivery or room service: no table, so the card says what it is instead. */
  const looseCard = (o: Order, i: number) => {
    const s = stateOf(o); const late = lateOf(o); const k = KIND[o.type] ?? KIND.takeaway; const I = SVC_ICON[s];
    return (
      <motion.div key={o.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.012 }} className="min-w-0 flex">
        <Link href={`/orders/${o.id}`} className={cn("svc-table flex-1", stClass(s))} data-table-card={`#${o.order_no}`} data-state={s} data-late={late || undefined}>
          <div className="flex items-center gap-2 min-w-0"><k.Icon size={22} aria-hidden className="shrink-0" /><span className="tname !text-[28px]">{o.token_no ? <>Token {o.token_no}</> : <>#{o.order_no}</>}</span></div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--color-label-2)] truncate"><Say w={k.word} start />{o.customer_name ? ` · ${o.customer_name}` : ""}</div>
          <div className="tstate"><I size={19} aria-hidden className={cn(s === "ready" && "animate-pulse")} /><Say w={SVC_WORD[s]} start /></div>
          <div className="mt-auto pt-2 flex items-end gap-2 font-bold"><span className="flex items-center gap-1 text-[14px] text-[var(--color-label-2)] shrink-0"><Clock size={15} aria-hidden />{fmtSince(o.created_at)}</span>
            <span className="ml-auto font-display num text-[21px] leading-none truncate">{formatINR(totalOf(o), { whole: true })}</span></div>
          {late && <span className="late-tag"><SVC_ICON.late size={13} aria-hidden /> LATE</span>}
        </Link>
      </motion.div>
    );
  };

  const GRID = "grid grid-cols-2 min-[35rem]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 min-[87.5rem]:grid-cols-6 gap-3 md:gap-4";
  return (
    <div className="space-y-6">
      {/* what each colour means, with how many tables are in it — tap one to see only those */}
      {/* On a phone the chips are one compact row that slides sideways (they wrapped into three uneven rows);
          from sm they wrap beside Tables · List. .rail-fade's mask is unlayered: only an !important utility
          takes it off. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2" data-legend>
        <Rail wrapClassName="min-w-0 sm:flex-1" arrowClassName="!bottom-0" label="Tables by state"
          className="rail-fade flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:![mask-image:none] sm:![-webkit-mask-image:none] [scrollbar-width:none]">
          {chips.map((s) => <StateChip key={s} s={s} n={counts.get(s) ?? 0} on={only === s} onClick={() => setOnly((x) => (x === s ? null : s))} className="shrink-0 max-sm:!pl-3 max-sm:!pr-1.5 max-sm:!gap-1.5 max-sm:!text-[13px]" />)}
        </Rail>
        <div className="sm:ml-auto shrink-0"><ViewSwitch label="Show orders as" data="orders" shown={view} onPick={lay.pick} saved={lay.saved}
          onKeep={(v) => { lay.keep(v); toast(v === "list" ? "The list is your default here" : "Tables are your default here"); }}
          options={[{ v: "tables", label: "Tables", icon: LayoutGrid, word: "Tables" }, { v: "list", label: "List", icon: List, word: "List" }]} /></div>
      </div>

      {view === "tables" ? (<>
        {zones.map((z) => {
          const here = tables.filter((t) => t.zone === z && shows(tableState(t), lateOf(byTable.get(t.id))));
          if (!here.length) return null;
          return (
            <section key={z} className="min-w-0" data-zone={z}>
              <h2 className="eyebrow !text-[12px] !font-semibold uppercase !tracking-[0.14em] mb-3">{z}</h2>
              <div className={GRID}>{here.map((t, i) => tableCard(t, i))}</div>
            </section>
          );
        })}
        {loose.filter((o) => shows(stateOf(o), lateOf(o))).length > 0 && (
          <section className="min-w-0" data-zone="parcel">
            <h2 className="eyebrow !text-[12px] !font-semibold uppercase !tracking-[0.14em] mb-3">Parcel · delivery · room</h2>
            <div className={GRID}>{loose.filter((o) => shows(stateOf(o), lateOf(o))).map((o, i) => looseCard(o, i))}</div>
          </section>
        )}
        {only && <button type="button" onClick={() => setOnly(null)} className="svc-btn quiet sm w-full sm:w-auto">Show every table</button>}
        {tables.length === 0 && <Empty title="No tables set up" hint="Add tables in Settings." action={<Link href="/orders/new?type=takeaway" className="svc-btn go sm"><ShoppingBag size={18} /> Parcel / Takeaway</Link>} />}
      </>) : (
        <section data-open-orders>
          {orders.length === 0
            ? <>
              <div className="sm:hidden rounded-[22px] border border-dashed border-[var(--color-separator)] p-8 text-center text-sm text-steel">Nothing open. Quiet before the rush.</div>
              {/* iPad and desktop (2026-10-24, the owner): the empty floor said properly, with the two ways to start */}
              <EmptyState from="sm" icon={HandPlatter} hue="blue" title="Nothing open. Quiet before the rush." hint="Orders show here as soon as a table, a parcel or a phone order starts." data-orders-empty
                actions={<><Link href="/orders/new?type=takeaway" className="btn btn-filled" data-empty-parcel><ShoppingBag size={17} aria-hidden />Parcel</Link><Link href="/orders/phone" className="btn btn-gray" data-empty-phone><Phone size={17} aria-hidden />Phone order</Link></>} />
            </>
            : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[100rem]:grid-cols-4 gap-3 lg:gap-4" data-order-grid>
            {orders.filter((o) => shows(stateOf(o), lateOf(o))).map((o, i) => {
              const items = live(o); const plates = items.reduce((s, x) => s + x.qty, 0); const s = stateOf(o); const I = SVC_ICON[s];
              const tbl = tables.find((t) => t.id === o.table_id); const k = KIND[o.type] ?? KIND.dine_in; const late = lateOf(o);
              const by = (st: string) => items.filter((x) => (x.status === "pending" || x.status === "preparing" || x.status === "ready" ? x.status : "served") === st).reduce((t, x) => t + x.qty, 0);
              const parts = (["served", "ready", "preparing", "pending"] as const).map((st) => ({ st, n: by(st) })).filter((p) => p.n);
              return (
                /* one card per order: where and its state on top, the kitchen's progress plate by plate,
                   the first dishes, and the total in a footer strip edge to edge */
                <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.02 }} className="min-w-0">
                  <Link href={`/orders/${o.id}`} data-order={o.order_no} data-state={s} className={cn("feather feather-lift group relative overflow-hidden h-full flex flex-col", stClass(s))}
                    style={{ borderColor: s === "ready" || late ? `color-mix(in srgb, var(${late ? "--color-red" : "--color-green"}) 45%, transparent)` : undefined }}>
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ background: late ? "var(--color-red)" : "var(--st)" }} />
                    <div className="p-4 pl-5 flex flex-col gap-3 flex-1 min-w-0">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="h-12 w-12 rounded-[14px] bg-[var(--color-fill)] grid place-items-center shrink-0" aria-hidden>
                          {tbl ? <span className="font-display text-[18px] leading-none num">{tbl.name}</span> : <k.Icon size={20} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[16px] font-bold truncate" data-title>{tbl ? `Table ${tbl.name}` : <Say w={k.word} start />}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-steel num min-w-0">
                            <span className="shrink-0">#{o.order_no}</span><span aria-hidden>·</span><span className="shrink-0">{plates} item{plates === 1 ? "" : "s"}</span><span aria-hidden>·</span>
                            <span className={cn("inline-flex items-center gap-1 shrink-0", Date.now() - new Date(o.created_at).getTime() > STALE_MS && "text-[var(--color-orange)] font-semibold")} data-age><Clock size={12} />{fmtSince(o.created_at)}</span>
                          </div>
                          {o.customer_name && <div className="mt-0.5 text-[13px] truncate">{o.customer_name}</div>}
                        </div>
                        <span className={cn("svc-chip lone !min-h-8 !text-[13px] !px-2.5 shrink-0", late ? "st-late" : stClass(s))} data-status><I size={14} aria-hidden /><Say w={late ? "late" : SVC_WORD[s]} start /></span>
                      </div>
                      <div data-progress>
                        <div className="h-2 rounded-full bg-[var(--color-fill)] overflow-hidden flex gap-px">
                          {parts.map((p) => <span key={p.st} className={cn("h-full", PLATE[p.st].cls)} style={{ width: `${(p.n / Math.max(1, plates)) * 100}%`, background: "var(--st)" }} />)}
                        </div>
                        <div className="mt-1.5 text-[12px] text-steel flex flex-wrap gap-x-3">{parts.slice().reverse().map((p) => <span key={p.st} className={cn("num whitespace-nowrap inline-flex items-center gap-1", PLATE[p.st].cls)}><span className="h-2 w-2 rounded-full" style={{ background: "var(--st)" }} />{p.n} <Say w={PLATE[p.st].word} /></span>)}</div>
                      </div>
                      <ul className="space-y-1 min-w-0" data-dishes>
                        {items.slice(0, 3).map((x) => (
                          <li key={x.id} className="flex items-center gap-2 text-[14px] min-w-0">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", (PLATE[x.status] ?? PLATE.served).cls)} style={{ background: "var(--st)" }} />
                            <span className="num text-steel shrink-0">{x.qty}×</span><span className="truncate">{x.name_snapshot}</span>
                          </li>
                        ))}
                        {items.length > 3 && <li className="text-[12px] text-steel pl-4">+{items.length - 3} more</li>}
                      </ul>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 px-4 pl-5 h-12 border-t border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)]">
                      <span className="font-display num text-[20px] leading-none" data-total>{formatINR(totalOf(o))}</span>
                      <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-steel group-hover:text-[var(--color-label)] transition-colors">View order<ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>}
        </section>
      )}
    </div>
  );
}
