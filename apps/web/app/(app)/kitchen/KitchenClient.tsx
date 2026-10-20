"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Check, Bell, BellRing, CheckCheck, Clock, AlertTriangle, Printer, Boxes, Timer, Tv, RotateCcw, PauseCircle } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { cn, useToast, FlapShuffle, FlapClock } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import type { Word } from "@/lib/say";
import { minsSince, fmtAge, fmtQty, fmtSince } from "@/lib/format";
import { lineExtras } from "@dineflow/shared";
import { listV } from "@/components/ui";
import { setKotStatus, setItemStatus, setItemsStatus, recallKot, fireKot } from "../orders/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";

type Line = { id: string; name_snapshot: string; qty: number; status: string; notes: string | null; course?: number; addons?: { name: string }[] | null; components?: { name: string; qty: number }[] | null; menu_items?: { station: string | null; categories: { station: string | null } | null } | null };
type Kot = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string; held?: boolean; cook?: string | null;
  orders: { order_no: number; type: string; customer_name: string | null; token_no?: number | null; promised_at: string | null; dining_tables: { name: string } | null } | null;
  order_items: Line[] };
export type Bumped = { id: string; kot_no: number; served_at: string; orders: { order_no: number; type: string; customer_name: string | null; dining_tables: { name: string } | null } | null };
/** Per ticket: what its dishes draw from the pantry, whether the shelf covers it, whether it has drawn already. */
export type Needs = Record<string, { started: boolean; unmapped: string[]; needs: { ingredient_id: string; name: string; unit: string; need: number; stock: number; short: boolean }[] }>;

/** A line prints at its dish's station, else its category's, else nowhere in particular — the expo view only. */
const stationOf = (i: Line) => i.menu_items?.station || i.menu_items?.categories?.station || null;
const live = (i: Line) => i.status !== "cancelled";
/** a parcel's daily token (0103) rides with it — the number the counter calls and the TV shows */
const where = (k: { orders: { type: string; customer_name: string | null; token_no?: number | null; dining_tables: { name: string } | null } | null }) =>
  k.orders?.dining_tables?.name ?? (k.orders?.type === "room_service" ? `Room · ${k.orders?.customer_name ?? ""}` : `${k.orders?.type === "takeaway" ? "Takeaway" : "Delivery"}${k.orders?.token_no ? ` · Token ${k.orders.token_no}` : ""}`);

/** The pantry lines under a ticket. Before the fire: what starting it will draw, with anything the shelf
 *  cannot cover in red. After: a note that the pantry has moved. Dishes with no recipe are named, so the
 *  owner knows their stock will not move rather than wondering later why the count came up long. */
function NeedsPanel({ n, col }: { n?: Needs[string]; col: Kot["status"] }) {
  if (!n) return null;
  if (col !== "pending") {
    return n.started ? <div className="mt-2 pt-2 border-t border-dashed border-[var(--color-line)] text-[11px] text-steel flex items-center gap-1.5"><Boxes size={12} /> Pantry updated{n.unmapped.length > 0 && <span> · no recipe for {n.unmapped.join(", ")}</span>}</div> : null;
  }
  if (!n.needs.length && !n.unmapped.length) return null;
  const short = n.needs.filter((x) => x.short); const shown = n.needs.slice(0, 6); const more = n.needs.length - shown.length;
  return (
    <div className="mt-2 pt-2 border-t border-dashed border-[var(--color-line)]">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-steel mb-1 flex items-center gap-1.5"><Boxes size={12} /> From the pantry
        {short.length > 0 && <span className="ml-auto normal-case tracking-normal font-semibold text-chili">short on {short.length}</span>}</div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
        {shown.map((x) => (
          <li key={x.ingredient_id} className={cn("flex justify-between gap-2", x.short && "text-chili font-semibold")}>
            <span className="truncate">{x.name}</span>
            <span className="num shrink-0">{fmtQty(x.need, x.unit)}{x.short && <span className="text-[10px] font-normal opacity-80"> / {fmtQty(x.stock, x.unit)} left</span>}</span>
          </li>))}
      </ul>
      {more > 0 && <div className="text-[11px] text-steel mt-0.5">+{more} more</div>}
      {n.unmapped.length > 0 && <div className="text-[11px] text-steel mt-1">No recipe yet: {n.unmapped.join(", ")} — the pantry won't move for {n.unmapped.length === 1 ? "it" : "these"}.</div>}
    </div>
  );
}

/**
 * The kitchen video system. What a chain's screen does and this one now does too: every station
 * sees only its own lines, the colour of a ticket follows the property's own clock, an "all day"
 * strip sums what is still to cook, a bumped ticket can be recalled, and the number keys bump.
 */
export function KitchenClient({ initial: raw, needs, stale = 0, bumped = [], stations = [], warnAt = 10, lateAt = 15 }:
  { initial: Kot[]; needs: Needs; stale?: number; bumped?: Bumped[]; stations?: string[]; warnAt?: number; lateAt?: number }) {
  const { printKot } = usePrinters();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["kots", "order_items", "ingredients"], 15000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  // Optimistic: the ticket jumps columns the moment you tap; the server catches up behind it.
  const [optimistic, setOptimistic] = useState<Record<string, Kot["status"] | "served">>({});
  const [recalled, setRecalled] = useState<Record<string, true>>({});
  const toast = useToast();
  const { online } = useOffline();

  /* The station is remembered on the device: the grill's tablet stays the grill's tablet across
     reloads, and the expo screen stays on everything. */
  const [station, setStationState] = useState("all");
  useEffect(() => { try { const s = localStorage.getItem("df-kds-station"); if (s) setStationState(s); } catch { /* storage blocked: the board starts on everything */ } }, []);
  const setStation = (s: string) => { setStationState(s); try { localStorage.setItem("df-kds-station", s); } catch { /* fine */ } };

  /** The ticket moves on screen at once; with no line the write waits in the outbox and lands in order. Its buttons are
   *  never held while an answer is on its way (2026-10-18): every one of them disabled itself on `pending`, so one tap
   *  greyed the whole board for the 0.4–1.8 s the server took, and the cook could not start the next ticket. A move,
   *  a fire and a recall show at once and need no hold; only the station view, which waits for the server to move a
   *  line, still holds its own two buttons. */
  const move = (id: string, status: "preparing" | "ready" | "served") => {
    setOptimistic((o) => ({ ...o, [id]: status }));
    if (!online) { void enqueue("kot_status", { id, status }, `Kitchen · ticket ${status}`); return; }
    start(async () => { const r = await setKotStatus(id, status); if ("error" in r) { toast(r.error!, "err"); setOptimistic((o) => { const n = { ...o }; delete n[id]; return n; }); } });
  };
  /** Station view: only this station's lines move; the ticket as a whole follows when every station is done. */
  const moveLines = (ids: string[], status: "preparing" | "ready") => {
    if (!ids.length) return;
    if (!online) { void enqueue("item_status", { ids, status }, `Kitchen · ${station} · ${status}`); return; }
    start(async () => { const r = await setItemsStatus(ids, status); if ("error" in r) toast(r.error!, "err"); });
  };
  /* A held course fired from here leaves the strip at once; the server restarts its clock and prints it. */
  const [fired, setFired] = useState<Record<string, true>>({});
  const fire = (id: string) => {
    setFired((f) => ({ ...f, [id]: true }));
    if (!online) { void enqueue("kot_fire", { id }, "Kitchen · fire course"); return; }
    // a course that did not fire comes back to the strip: hidden for good, the kitchen would never get it
    start(async () => { const r = await fireKot(id); if ("error" in r) { toast(r.error!, "err"); setFired((f) => { const n = { ...f }; delete n[id]; return n; }); } });
  };
  const heldList = raw.filter((k) => k.held && !fired[k.id]);
  const courseOf = (k: Kot) => Math.max(1, ...k.order_items.map((i) => i.course ?? 1));
  const recall = (id: string) => {
    setRecalled((r) => ({ ...r, [id]: true }));
    setOptimistic((o) => { const n = { ...o }; delete n[id]; return n; });
    start(async () => { const r = await recallKot(id); if ("error" in r) { toast(r.error!, "err"); setRecalled((x) => { const n = { ...x }; delete n[id]; return n; }); } });
  };

  const initial = raw.filter((k) => !k.held || fired[k.id]).map((k) => (optimistic[k.id] ? { ...k, status: optimistic[k.id] as Kot["status"] } : k)).filter((k) => optimistic[k.id] !== "served");
  // the stations the owner named, plus any a line still carries from before a rename
  const known = useMemo(() => { const set = new Set(stations); raw.forEach((k) => k.order_items.forEach((i) => { const s = stationOf(i); if (s) set.add(s); })); return [...set]; }, [raw, stations]);
  // a remembered station that no longer exists falls back to everything rather than an empty board
  const view = station === "all" || known.includes(station) ? station : "all";
  const linesOf = (k: Kot) => k.order_items.filter((i) => live(i) && (view === "all" || stationOf(i) === view));
  const board = view === "all" ? initial : initial.filter((k) => linesOf(k).length > 0);
  const unrouted = known.length ? initial.reduce((n, k) => n + k.order_items.filter((i) => live(i) && !stationOf(i)).length, 0) : 0;
  const countAt = (s: string) => (s === "all" ? initial.length : initial.filter((k) => k.order_items.some((i) => live(i) && stationOf(i) === s)).length);

  /* "All day": every portion still to cook, summed by dish. It is what a grill cook batches by —
     seven butter chickens across five tickets go into one pan, not five. */
  const allDay = useMemo(() => {
    const m = new Map<string, number>();
    board.forEach((k) => { if (k.status === "ready") return; linesOf(k).forEach((i) => { if (i.status === "ready") return; m.set(i.name_snapshot, (m.get(i.name_snapshot) ?? 0) + i.qty); }); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [board, view]); // eslint-disable-line react-hooks/exhaustive-deps

  /* one colour per column, the floor's: New is blue, Cooking amber, Ready green */
  const cols: { key: Kot["status"]; w: Word; cls: string; Icon: typeof Flame }[] = [{ key: "pending", w: "new", cls: "st-new", Icon: Bell }, { key: "preparing", w: "cooking", cls: "st-cook", Icon: Flame }, { key: "ready", w: "ready_take", cls: "st-ready", Icon: BellRing }];
  // the bump-bar order: keys 1–9 read the board left to right, top to bottom
  const ordered = cols.flatMap((c) => board.filter((k) => k.status === c.key));
  const keyOf = (id: string) => { const i = ordered.findIndex((x) => x.id === id); return i >= 0 && i < 9 ? i + 1 : null; };
  const bumpedLive = bumped.filter((b) => !recalled[b.id]);

  /** One press does the obvious next thing to a ticket — the bump bar's whole idea. */
  const advance = (k: Kot) => {
    if (k.status === "ready") { move(k.id, "served"); return; }
    const next = k.status === "pending" ? "preparing" : "ready";
    if (view === "all") move(k.id, next);
    else moveLines(linesOf(k).filter((i) => i.status !== "ready").map((i) => i.id), next);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { const k = ordered[Number(e.key) - 1]; if (k) { e.preventDefault(); advance(k); } }
      else if (e.key === "r" || e.key === "R") { const b = bumpedLive[0]; if (b) { e.preventDefault(); recall(b.id); } }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  return (
    <div>
      {/* the head: what this screen is, in one sentence a new cook can follow, with the clock and the
          board for the guests on the right */}
      <SvcHead icon="kitchen" title={<>Kitchen{view !== "all" && <span className="text-[var(--color-label-2)]"> · {view}</span>}</>}
        sub={board.length ? `${board.length} ticket${board.length > 1 ? "s" : ""} · tap the big button when you start, and again when the food is ready` : "All clear — new tickets appear here by themselves"}
        actions={<>
          <span className="h-11 px-4 rounded-full bg-[var(--color-fill)] inline-flex items-center justify-center gap-2 text-[15px] font-bold num" data-clock><Clock size={16} aria-hidden />{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          <Link href="/kitchen/board" title="The customer-facing board: what is being prepared and what is ready to collect" className="h-11 px-4 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors"><Tv size={16} aria-hidden /> Order board</Link>
        </>} />
      {stale > 0 && <p className="-mt-3 mb-4 text-[13px] font-semibold text-chili" title="Older than a day and never marked ready — they are not on the board">{stale} older ticket{stale > 1 ? "s" : ""} still open from earlier</p>}

      {known.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4" data-stations>
          {["all", ...known].map((s) => (
            <button key={s} onClick={() => setStation(s)} aria-pressed={view === s} className={cn("h-11 rounded-full px-4 text-[15px] font-bold transition-colors", view === s ? "bg-ink text-on-label" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
              {s === "all" ? "Everything" : s}<span className={cn("num ml-2", view === s ? "opacity-70" : "text-steel")}>{countAt(s)}</span>
            </button>
          ))}
          {unrouted > 0 && view === "all" && <span className="text-[12px] text-steel ml-1">{unrouted} line{unrouted > 1 ? "s" : ""} with no station — set one on the Menu page</span>}
        </div>
      )}

      {heldList.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[var(--color-orange)]/50 p-3" data-held>
          <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-orange)] mb-2 flex items-center gap-1.5"><PauseCircle size={14} /> Waiting courses — start when the table is ready</div>
          <div className="flex flex-wrap gap-2">
            {heldList.map((k) => (
              <div key={k.id} className="rounded-2xl bg-card border border-line pl-3.5 pr-1.5 py-1.5 text-[15px] flex items-center gap-3">
                <span><b>{where(k)}</b> · course {courseOf(k)} · {k.order_items.filter(live).map((i) => `${i.qty} ${i.name_snapshot}`).join(", ")}</span>
                <button type="button" className="svc-btn st st-cook sm" onClick={() => fire(k.id)}><Flame size={16} aria-hidden /> Fire</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {allDay.length > 0 && (
        /* Every portion still to cook, summed by dish — what the grill batches by. A rail of chips,
           the count in a dark disc, no scrollbar; a long name ends in an ellipsis and is whole in its title. */
        <div className="mb-4 flex items-center gap-3 min-w-0" data-all-day>
          <div className="rail-fade flex-1 min-w-0 -mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allDay.map(([name, qty]) => (
              <span key={name} title={`${qty} × ${name}`} className="shrink-0 h-11 max-w-[16rem] inline-flex items-center gap-2 rounded-full bg-[var(--color-fill)] pl-1.5 pr-4 text-[14.5px] font-bold">
                <span className="num h-8 min-w-8 px-1.5 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center text-[15px] font-bold">{qty}</span>
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
          <span className="hidden sm:block shrink-0 text-[13px] font-semibold text-steel" title="Every portion still to cook, summed by dish">to cook in all · <b className="num text-[var(--color-label)]">{allDay.reduce((t, [, q]) => t + Number(q), 0)}</b></span>
        </div>
      )}

      {/* three columns, one colour each: New (blue), Cooking (amber), Ready (green) */}
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(({ key, w, cls, Icon }) => {
          const list = board.filter((k) => k.status === key);
          return (
            <section key={key} className={cn("kcol md:min-h-[60dvh]", cls)} data-col={key}>
              <div className="kcol-head"><Icon size={20} aria-hidden /><Say w={w} start /><b className="num sr-only">{list.length}</b><span className="ml-auto" data-kcol-count><FlapShuffle value={list.length} pad={0} size="xs" tile="40px" bare say={`${list.length}`} /></span></div>
              <motion.div className="space-y-3" variants={listV} initial="hidden" animate="show">
                <AnimatePresence mode="popLayout">
                  {list.map((k) => {
                    /* Two clocks, both the owner's: past "hurry" the ticket goes amber, past "late" it goes
                       red and counts against speed of service. A promised ticket carries its own deadline,
                       and missing that costs the property the whole bill, so it outranks both. */
                    const age = minsSince(k.created_at); const late = key !== "ready" && age >= lateAt; const warn = key !== "ready" && !late && age >= warnAt;
                    const due = k.orders?.promised_at ? new Date(k.orders.promised_at) : null;
                    const leftMin = due ? Math.round((due.getTime() - Date.now()) / 60000) : null;
                    const overdue = leftMin !== null && leftMin < 0;
                    const lines = linesOf(k); const others = k.order_items.filter(live).length - lines.length; const hotkey = keyOf(k.id);
                    const stationDone = view !== "all" && key !== "ready" && lines.every((i) => i.status === "ready");
                    return (
                      <motion.article key={k.id} layout layoutId={k.id} initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14, ease: "easeOut" } }}
                        transition={{ type: "spring", stiffness: 340, damping: 32 }} className={cn("kt", cls, (late || overdue) && "late", warn && !overdue && "warn")} data-kot={k.kot_no} data-late={late || overdue || undefined}>
                        <div className="kt-head">
                          <span className="where">{where(k)}</span>
                          {/* 2026-10-20: the ticket's age as a ticking flip clock (mm:ss) — emerald, amber at the hurry minutes, red when
                              late (Flap.tsx); the words stay for a screen reader */}
                          <span className="ml-auto flex items-center" title={`${age} minutes since it was sent`} data-kt-age>
                            <span className="sr-only">{fmtAge(k.created_at).value} {fmtAge(k.created_at).label}</span>
                            <FlapClock since={k.created_at} hurry={key !== "ready" ? warnAt : null} late={key !== "ready" ? lateAt : null} size="xs" tile="34px" bare tone={overdue ? "alert" : undefined} />
                          </span>
                        </div>
                        <div className="px-3.5 pt-2 kt-sub num">KOT #{k.kot_no} · order #{k.orders?.order_no}{hotkey ? ` · key ${hotkey}` : ""}{k.cook && <span className="font-sans" data-cook> · {k.cook}</span>}</div>
                        <div className="px-3.5">
                          {leftMin !== null && (
                            <div className={cn("mt-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-bold",
                              overdue ? "bg-[var(--color-red-2)] text-chili" : leftMin <= 5 ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-mint")}>
                              <Timer size={14} />{overdue ? `Promised ${Math.abs(leftMin)} min ago — this bill is now free` : `Promised in ${leftMin} min`}
                            </div>
                          )}
                          {(late || warn) && !due && <div className={cn("mt-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-bold", late ? "bg-[var(--color-red-2)] text-chili" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")}><Timer size={14} />{late ? `Over the ${lateAt}-minute target` : `${lateAt - age} min to the target`}</div>}
                          {lines.map((i) => (
                            <button key={i.id} type="button" disabled={pending || key === "ready"} title={key === "ready" ? undefined : i.status === "ready" ? "Tap: not ready after all" : "Tap: this dish is ready"}
                              onClick={() => { const next = i.status === "ready" ? "preparing" : "ready"; if (!online) { void enqueue("item_status", { ids: [i.id], status: next }, `Kitchen · ${i.name_snapshot}`); return; } start(() => { setItemStatus(i.id, next); }); }}
                              className={cn("kt-line !min-h-0 disabled:opacity-100", key !== "ready" && "hover:bg-[var(--color-fill)] rounded-lg")}>
                              <span className={cn("kt-q", i.status === "ready" && key !== "ready" && "!bg-[var(--color-mint)]")}>{i.status === "ready" && key !== "ready" ? <Check size={18} /> : i.qty}</span>
                              <span className="flex-1 min-w-0">
                                <span className={cn("kt-name block", i.status === "ready" && key !== "ready" && "line-through opacity-50")}>{i.qty > 1 && i.status === "ready" && key !== "ready" ? `${i.qty} × ` : ""}{i.name_snapshot}</span>
                                {lineExtras(i).map((x, j) => <span key={j} className={cn("block text-[13px] font-semibold", x.startsWith("+") ? "text-chili" : "kt-sub")}>{x}</span>)}
                                {i.notes && <span className="kt-note"><AlertTriangle size={14} aria-hidden className="shrink-0" />{i.notes}</span>}
                              </span>
                            </button>
                          ))}
                          {others > 0 && <div className="kt-sub mt-1">+{others} line{others > 1 ? "s" : ""} at other stations</div>}
                          {stationDone && <div className="text-[13px] text-mint font-bold mt-1">This station is done — waiting on the rest</div>}
                          <NeedsPanel n={needs[k.id]} col={key} />
                        </div>
                        {/* one big button, always in the same place: start → ready → served */}
                        <div className="p-3.5 pt-3 flex gap-2">
                          {key === "pending" ? <button type="button" className="svc-btn st st-cook flex-1" disabled={view !== "all" && pending} onClick={() => advance(k)} data-kot-go><Flame size={21} aria-hidden />{view === "all" ? <Say w="start_cooking" /> : `Start ${view}`}</button>
                            : key === "preparing" ? <button type="button" className="svc-btn go flex-1" disabled={(view !== "all" && pending) || stationDone} onClick={() => advance(k)} data-kot-go><BellRing size={21} aria-hidden />{view === "all" ? <Say w="food_ready" /> : stationDone ? `${view} done` : `${view} ready`}</button>
                            : <button type="button" className="svc-btn flex-1 bg-[var(--color-paper-ink)] text-[var(--color-paper)]" onClick={() => move(k.id, "served")} data-kot-go><CheckCheck size={21} aria-hidden /><Say w="served" /></button>}
                          <button type="button" title="Reprint this ticket" aria-label="Reprint this ticket" className="h-14 w-14 shrink-0 rounded-[18px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"
                            onClick={() => { void printKot({ kotNo: `KOT ${k.kot_no}`, when: new Date(k.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: where(k), reprint: true, items: k.order_items.filter(live).map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.notes, extras: lineExtras(i), station: stationOf(i) })) }); }}><Printer size={19} /></button>
                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
                {list.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[14px] text-steel px-2 py-6 text-center">{key === "pending" ? "No new tickets" : key === "preparing" ? "Nothing cooking" : "Nothing waiting at the pass"}</motion.p>}
                {/* the recall strip: what was just picked up, one press from coming back */}
                {key === "ready" && bumpedLive.length > 0 && (
                  <div className="pt-3 border-t border-dashed border-[var(--color-line)]" data-recall>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-steel mb-2 flex items-center gap-1.5"><RotateCcw size={13} /> Picked up · R brings the latest back</div>
                    <ul className="space-y-1">
                      {bumpedLive.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 text-[14px]">
                          <span className="num text-steel">#{b.kot_no}</span><span className="flex-1 truncate font-semibold">{where(b)}</span>
                          <span className="text-[12px] text-steel num">{fmtSince(b.served_at)} ago</span>
                          <button type="button" onClick={() => recall(b.id)} className="h-10 px-3 rounded-full text-[13px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]">Recall</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-[12px] text-steel">Keys <span className="num font-semibold">1</span>–<span className="num font-semibold">9</span> move tickets on in order, <span className="num font-semibold">R</span> brings back the last one picked up. A bump bar or keyboard plugged into this screen works the same way.</p>
    </div>
  );
}
