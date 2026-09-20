"use client";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Check, Bell, Printer, Boxes, Timer } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Ticket } from "@/components/ui/Ticket";
import { Button, cn } from "@/components/ui";
import { minsSince, fmtAge, fmtQty } from "@/lib/format";
import { Flip, listV } from "@/components/ui";
import { setKotStatus, setItemStatus } from "../orders/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";

type Kot = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string;
  orders: { order_no: number; type: string; customer_name: string | null; promised_at: string | null; dining_tables: { name: string } | null } | null;
  order_items: { id: string; name_snapshot: string; qty: number; status: string; notes: string | null }[] };
/** Per ticket: what its dishes draw from the pantry, whether the shelf covers it, whether it has drawn already. */
export type Needs = Record<string, { started: boolean; unmapped: string[]; needs: { ingredient_id: string; name: string; unit: string; need: number; stock: number; short: boolean }[] }>;

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

export function KitchenClient({ initial: raw, needs, stale = 0 }: { initial: Kot[]; needs: Needs; stale?: number }) {
  const { printKot } = usePrinters();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["kots", "order_items", "ingredients"], 15000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  // Optimistic: the ticket jumps columns the moment you tap; the server catches up behind it.
  const [optimistic, setOptimistic] = useState<Record<string, Kot["status"] | "served">>({});
  const { online } = useOffline();
  /** The ticket moves on screen at once; with no line the write waits in the outbox and lands in order. */
  const move = (id: string, status: "preparing" | "ready" | "served") => {
    setOptimistic((o) => ({ ...o, [id]: status }));
    if (!online) { void enqueue("kot_status", { id, status }, `Kitchen · ticket ${status}`); return; }
    start(async () => { await setKotStatus(id, status); });
  };

  const initial = raw.map((k) => (optimistic[k.id] ? { ...k, status: optimistic[k.id] as Kot["status"] } : k)).filter((k) => optimistic[k.id] !== "served");
  const cols: { key: Kot["status"]; title: string; Icon: typeof Flame }[] = [{ key: "pending", title: "New", Icon: Bell }, { key: "preparing", title: "On the fire", Icon: Flame }, { key: "ready", title: "Ready to serve", Icon: Check }];
  const where = (k: Kot) => k.orders?.dining_tables?.name ?? (k.orders?.type === "takeaway" ? "Takeaway" : k.orders?.type === "room_service" ? `Room · ${k.orders?.customer_name ?? ""}` : "Delivery");

  return (
    <div>
      <div className="flex items-end justify-between mb-5">
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Kitchen display</div><h1 className="text-3xl md:text-4xl">{initial.length ? `${initial.length} ticket${initial.length > 1 ? "s" : ""} live` : "All clear"}</h1></div>
        <div className="text-right"><div className="num text-sm text-steel">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>{stale > 0 && <div className="text-[11px] text-chili mt-0.5" title="Older than a day and never marked ready — they are not on the board">{stale} older ticket{stale > 1 ? "s" : ""} still open</div>}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(({ key, title, Icon }) => {
          const list = initial.filter((k) => k.status === key);
          return (
            <section key={key} className={cn("rounded-[20px] p-3 md:min-h-[60dvh]", key === "pending" && "bg-[var(--color-fill)]", key === "preparing" && "bg-[rgb(255_179_64/.08)]", key === "ready" && "bg-[var(--color-green-2)]")}>
              <div className="flex items-center gap-2 px-1 pb-3 text-sm font-semibold"><Icon size={16} />{title}<span className="num ml-auto text-steel">{list.length}</span></div>
              <motion.div className="space-y-4" variants={listV} initial="hidden" animate="show">
                <AnimatePresence mode="popLayout">
                  {list.map((k) => {
                    const age = minsSince(k.created_at); const late = key !== "ready" && age >= 15; const since = fmtAge(k.created_at);
                    /* A promised ticket carries a deadline the kitchen has to beat, and missing it
                       costs the property the whole bill — so it outranks the usual 15-minute nudge. */
                    const due = k.orders?.promised_at ? new Date(k.orders.promised_at) : null;
                    const leftMin = due ? Math.round((due.getTime() - Date.now()) / 60000) : null;
                    const overdue = leftMin !== null && leftMin < 0;
                    return (
                      <Ticket key={k.id} layoutId={k.id} no={k.kot_no} title={where(k)} meta={`Order #${k.orders?.order_no}`} tone={late || overdue ? "alert" : key} aside={<Flip value={since.value} label={since.label} size="xs" tone={late ? "alert" : key === "ready" ? "live" : undefined} />}
                        footer={
                          <div className="flex gap-2">
                            {key === "pending" ? <Button className="flex-1" disabled={pending} onClick={() => move(k.id, "preparing")}><Flame size={16} /> Start cooking</Button>
                            : key === "preparing" ? <Button className="flex-1" variant="ink" disabled={pending} onClick={() => move(k.id, "ready")}><Check size={16} /> All ready</Button>
                            : <Button className="flex-1" variant="outline" disabled={pending} onClick={() => move(k.id, "served")}>Picked up</Button>}
                            <Button variant="ghost" title="Reprint this ticket" onClick={() => { void printKot({ kotNo: `KOT ${k.kot_no}`, when: new Date(k.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: where(k), reprint: true, items: k.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.notes })) }); }}><Printer size={16} /></Button>
                          </div>}>
                        {leftMin !== null && (
                          <div className={cn("mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold",
                            overdue ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : leftMin <= 5 ? "bg-[rgb(255_179_64/.18)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-[var(--color-tint)]")}>
                            <Timer size={12} />
                            {overdue ? `Promised ${Math.abs(leftMin)} min ago — this bill is now free` : `Promised in ${leftMin} min`}
                          </div>
                        )}
                        {k.order_items.filter((i) => i.status !== "cancelled").map((i) => (
                          <button key={i.id} disabled={pending || key === "ready"} onClick={() => { const next = i.status === "ready" ? "preparing" : "ready"; if (!online) { void enqueue("item_status", { ids: [i.id], status: next }, `Kitchen · ${i.name_snapshot}`); return; } start(() => { setItemStatus(i.id, next); }); }}
                            className={cn("w-full flex items-start gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 transition", key !== "ready" && "hover:bg-porcelain", i.status === "ready" && "text-steel")}>
                            <span className="num text-lg font-bold leading-6 w-8">{i.qty}</span>
                            <span className="flex-1"><span className={cn("text-base font-semibold leading-6", i.status === "ready" && "line-through")}>{i.name_snapshot}</span>{i.notes && <span className="block text-xs text-chili font-medium">{i.notes}</span>}</span>
                            {i.status === "ready" && key !== "ready" && <Check size={16} className="text-mint mt-1" />}
                          </button>
                        ))}
                        <NeedsPanel n={needs[k.id]} col={key} />
                      </Ticket>
                    );
                  })}
                </AnimatePresence>
                {list.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-steel px-1">—</motion.p>}
              </motion.div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
