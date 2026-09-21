"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Check, Bell, Printer, Boxes, Timer, Tv, RotateCcw } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Ticket } from "@/components/ui/Ticket";
import { Button, cn } from "@/components/ui";
import { minsSince, fmtAge, fmtQty, fmtSince } from "@/lib/format";
import { Flip, listV } from "@/components/ui";
import { setKotStatus, setItemStatus, setItemsStatus, recallKot } from "../orders/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";

type Line = { id: string; name_snapshot: string; qty: number; status: string; notes: string | null; menu_items?: { station: string | null; categories: { station: string | null } | null } | null };
type Kot = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string;
  orders: { order_no: number; type: string; customer_name: string | null; promised_at: string | null; dining_tables: { name: string } | null } | null;
  order_items: Line[] };
export type Bumped = { id: string; kot_no: number; served_at: string; orders: { order_no: number; type: string; customer_name: string | null; dining_tables: { name: string } | null } | null };
/** Per ticket: what its dishes draw from the pantry, whether the shelf covers it, whether it has drawn already. */
export type Needs = Record<string, { started: boolean; unmapped: string[]; needs: { ingredient_id: string; name: string; unit: string; need: number; stock: number; short: boolean }[] }>;

/** A line prints at its dish's station, else its category's, else nowhere in particular — the expo view only. */
const stationOf = (i: Line) => i.menu_items?.station || i.menu_items?.categories?.station || null;
const live = (i: Line) => i.status !== "cancelled";
const where = (k: { orders: { type: string; customer_name: string | null; dining_tables: { name: string } | null } | null }) =>
  k.orders?.dining_tables?.name ?? (k.orders?.type === "takeaway" ? "Takeaway" : k.orders?.type === "room_service" ? `Room · ${k.orders?.customer_name ?? ""}` : "Delivery");

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
  const { online } = useOffline();

  /* The station is remembered on the device: the grill's tablet stays the grill's tablet across
     reloads, and the expo screen stays on everything. */
  const [station, setStationState] = useState("all");
  useEffect(() => { try { const s = localStorage.getItem("df-kds-station"); if (s) setStationState(s); } catch { /* storage blocked: the board starts on everything */ } }, []);
  const setStation = (s: string) => { setStationState(s); try { localStorage.setItem("df-kds-station", s); } catch { /* fine */ } };

  /** The ticket moves on screen at once; with no line the write waits in the outbox and lands in order. */
  const move = (id: string, status: "preparing" | "ready" | "served") => {
    setOptimistic((o) => ({ ...o, [id]: status }));
    if (!online) { void enqueue("kot_status", { id, status }, `Kitchen · ticket ${status}`); return; }
    start(async () => { await setKotStatus(id, status); });
  };
  /** Station view: only this station's lines move; the ticket as a whole follows when every station is done. */
  const moveLines = (ids: string[], status: "preparing" | "ready") => {
    if (!ids.length) return;
    if (!online) { void enqueue("item_status", { ids, status }, `Kitchen · ${station} · ${status}`); return; }
    start(async () => { await setItemsStatus(ids, status); });
  };
  const recall = (id: string) => {
    setRecalled((r) => ({ ...r, [id]: true }));
    setOptimistic((o) => { const n = { ...o }; delete n[id]; return n; });
    start(async () => { await recallKot(id); });
  };

  const initial = raw.map((k) => (optimistic[k.id] ? { ...k, status: optimistic[k.id] as Kot["status"] } : k)).filter((k) => optimistic[k.id] !== "served");
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

  const cols: { key: Kot["status"]; title: string; Icon: typeof Flame }[] = [{ key: "pending", title: "New", Icon: Bell }, { key: "preparing", title: "On the fire", Icon: Flame }, { key: "ready", title: "Ready to serve", Icon: Check }];
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Kitchen display{view !== "all" && <> · {view}</>}</div><h1 className="text-3xl md:text-4xl">{board.length ? `${board.length} ticket${board.length > 1 ? "s" : ""} live` : "All clear"}</h1></div>
        <div className="flex items-center gap-3">
          <Link href="/kitchen/board" title="The customer-facing board: what is being prepared and what is ready to collect" className="h-10 px-3.5 rounded-full grid place-items-center text-sm font-semibold bg-card border border-line hover:bg-[var(--color-fill)] transition-colors"><span className="flex items-center gap-1.5"><Tv size={15} /> Order board</span></Link>
          <div className="text-right"><div className="num text-sm text-steel">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>{stale > 0 && <div className="text-[11px] text-chili mt-0.5" title="Older than a day and never marked ready — they are not on the board">{stale} older ticket{stale > 1 ? "s" : ""} still open</div>}</div>
        </div>
      </div>

      {known.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {["all", ...known].map((s) => (
            <button key={s} onClick={() => setStation(s)} className={cn("h-9 rounded-full px-3.5 text-sm font-semibold transition-colors", view === s ? "bg-ink text-on-label" : "bg-card border border-line hover:bg-[var(--color-fill)]")}>
              {s === "all" ? "Expo · everything" : s}<span className={cn("num ml-1.5", view === s ? "opacity-70" : "text-steel")}>{countAt(s)}</span>
            </button>
          ))}
          {unrouted > 0 && view === "all" && <span className="text-[11px] text-steel ml-1">{unrouted} line{unrouted > 1 ? "s" : ""} with no station — set one on the Menu page</span>}
        </div>
      )}

      {allDay.length > 0 && (
        <div className="mb-4 -mx-1 px-1 overflow-x-auto"><div className="flex items-center gap-2 min-w-max">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-steel mr-1" title="Every portion still to cook, summed by dish — what the grill batches by">All day</span>
          {allDay.map(([name, qty]) => <span key={name} className="rounded-xl bg-card border border-line px-3 py-1.5 text-sm whitespace-nowrap"><span className="num font-bold">{qty}</span> × {name}</span>)}
        </div></div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(({ key, title, Icon }) => {
          const list = board.filter((k) => k.status === key);
          return (
            <section key={key} className={cn("rounded-[20px] p-3 md:min-h-[60dvh]", key === "pending" && "bg-[var(--color-fill)]", key === "preparing" && "bg-[rgb(255_179_64/.08)]", key === "ready" && "bg-[var(--color-green-2)]")}>
              <div className="flex items-center gap-2 px-1 pb-3 text-sm font-semibold"><Icon size={16} />{title}<span className="num ml-auto text-steel">{list.length}</span></div>
              <motion.div className="space-y-4" variants={listV} initial="hidden" animate="show">
                <AnimatePresence mode="popLayout">
                  {list.map((k) => {
                    /* Two clocks, both the owner's: past "hurry" the ticket goes amber, past "late" it goes
                       red and counts against speed of service. A promised ticket carries its own deadline,
                       and missing that costs the property the whole bill, so it outranks both. */
                    const age = minsSince(k.created_at); const late = key !== "ready" && age >= lateAt; const warn = key !== "ready" && !late && age >= warnAt; const since = fmtAge(k.created_at);
                    const due = k.orders?.promised_at ? new Date(k.orders.promised_at) : null;
                    const leftMin = due ? Math.round((due.getTime() - Date.now()) / 60000) : null;
                    const overdue = leftMin !== null && leftMin < 0;
                    const lines = linesOf(k); const others = k.order_items.filter(live).length - lines.length; const hotkey = keyOf(k.id);
                    const stationDone = view !== "all" && key !== "ready" && lines.every((i) => i.status === "ready");
                    return (
                      <Ticket key={k.id} layoutId={k.id} no={k.kot_no} title={where(k)} meta={`Order #${k.orders?.order_no}${hotkey ? ` · key ${hotkey}` : ""}`} tone={late || overdue ? "alert" : warn ? "warn" : key}
                        aside={<Flip value={since.value} label={since.label} size="xs" tone={late || overdue ? "alert" : key === "ready" ? "live" : undefined} />}
                        footer={
                          <div className="flex gap-2">
                            {key === "pending" ? <Button className="flex-1" disabled={pending} onClick={() => advance(k)}><Flame size={16} /> {view === "all" ? "Start cooking" : `Start ${view}`}</Button>
                            : key === "preparing" ? <Button className="flex-1" variant="ink" disabled={pending || stationDone} onClick={() => advance(k)}><Check size={16} /> {view === "all" ? "All ready" : stationDone ? `${view} done` : `${view} ready`}</Button>
                            : <Button className="flex-1" variant="outline" disabled={pending} onClick={() => move(k.id, "served")}>Picked up</Button>}
                            <Button variant="ghost" title="Reprint this ticket" onClick={() => { void printKot({ kotNo: `KOT ${k.kot_no}`, when: new Date(k.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: where(k), reprint: true, items: k.order_items.filter(live).map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.notes })) }); }}><Printer size={16} /></Button>
                          </div>}>
                        {warn && !due && (
                          <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold bg-[rgb(255_179_64/.18)] text-[var(--color-orange)]"><Timer size={12} /> {age} min on the board — {lateAt - age} min to target</div>
                        )}
                        {late && !due && (
                          <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold bg-[var(--color-red-2)] text-[var(--color-red)]"><Timer size={12} /> {age} min — over the {lateAt}-minute target</div>
                        )}
                        {leftMin !== null && (
                          <div className={cn("mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold",
                            overdue ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : leftMin <= 5 ? "bg-[rgb(255_179_64/.18)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-[var(--color-tint)]")}>
                            <Timer size={12} />
                            {overdue ? `Promised ${Math.abs(leftMin)} min ago — this bill is now free` : `Promised in ${leftMin} min`}
                          </div>
                        )}
                        {lines.map((i) => (
                          <button key={i.id} disabled={pending || key === "ready"} onClick={() => { const next = i.status === "ready" ? "preparing" : "ready"; if (!online) { void enqueue("item_status", { ids: [i.id], status: next }, `Kitchen · ${i.name_snapshot}`); return; } start(() => { setItemStatus(i.id, next); }); }}
                            className={cn("w-full flex items-start gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 transition", key !== "ready" && "hover:bg-porcelain", i.status === "ready" && "text-steel")}>
                            <span className="num text-lg font-bold leading-6 w-8">{i.qty}</span>
                            <span className="flex-1"><span className={cn("text-base font-semibold leading-6", i.status === "ready" && "line-through")}>{i.name_snapshot}</span>{i.notes && <span className="block text-xs text-chili font-medium">{i.notes}</span>}</span>
                            {i.status === "ready" && key !== "ready" && <Check size={16} className="text-mint mt-1" />}
                          </button>
                        ))}
                        {others > 0 && <div className="text-[11px] text-steel mt-1">+{others} line{others > 1 ? "s" : ""} at other stations</div>}
                        {stationDone && <div className="text-[11px] text-mint font-semibold mt-1">This station is done — waiting on the rest</div>}
                        <NeedsPanel n={needs[k.id]} col={key} />
                      </Ticket>
                    );
                  })}
                </AnimatePresence>
                {list.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-steel px-1">—</motion.p>}
                {/* the recall strip: what was just picked up, one press from coming back */}
                {key === "ready" && bumpedLive.length > 0 && (
                  <div className="pt-3 border-t border-dashed border-[var(--color-line)]">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] text-steel mb-2 flex items-center gap-1.5"><RotateCcw size={12} /> Picked up · press R to recall the latest</div>
                    <ul className="space-y-1.5">
                      {bumpedLive.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 text-sm">
                          <span className="num text-steel">#{b.kot_no}</span><span className="flex-1 truncate">{where(b)}</span>
                          <span className="text-[11px] text-steel num">{fmtSince(b.served_at)} ago</span>
                          <button disabled={pending} onClick={() => recall(b.id)} className="text-xs font-semibold text-ink hover:underline">Recall</button>
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
      <p className="mt-4 text-[11px] text-steel">Keys <span className="num font-semibold">1</span>–<span className="num font-semibold">9</span> bump tickets in order, <span className="num font-semibold">R</span> recalls the last one picked up. A bump bar or keyboard plugged into this screen works the same way.</p>
    </div>
  );
}
