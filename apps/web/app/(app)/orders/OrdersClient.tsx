"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Users, Clock, ChevronRight, Armchair, ShoppingBag, BedDouble, Bike } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { cn, Empty, Button } from "@/components/ui";
import { formatINR, fmtSince } from "@/lib/format";
import { setTableStatus } from "./actions";

type Table = { id: string; name: string; capacity: number; zone: string; status: "free" | "occupied" | "reserved" };
type St = "pending" | "preparing" | "ready" | "served";
/* the kitchen's own words (New · On the fire · Ready to serve), as the floor reads them */
const ST: Record<St, { label: string; short: string; color: string }> = {
  pending: { label: "Waiting", short: "waiting", color: "var(--color-label-3)" },
  preparing: { label: "On the fire", short: "on the fire", color: "var(--color-orange)" },
  ready: { label: "Ready to serve", short: "ready", color: "var(--color-green)" },
  served: { label: "Served", short: "served", color: "var(--color-blue)" },
};
const KIND: Record<string, { label: string; Icon: typeof Armchair }> = {
  dine_in: { label: "Dine-in", Icon: Armchair }, takeaway: { label: "Takeaway", Icon: ShoppingBag },
  room_service: { label: "Room service", Icon: BedDouble }, delivery: { label: "Delivery", Icon: Bike },
};
/** an order open longer than a service is a table someone forgot to bill or close (Pulse's STALE) */
const STALE_MS = 12 * 3600e3;
const stOf = (s: string): St => (s === "preparing" || s === "ready" || s === "served" ? s : "pending");
type Order = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; order_items: { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string }[] };

export function OrdersClient({ tables, orders }: { tables: Table[]; orders: Order[] }) {
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["orders", "order_items", "dining_tables"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const byTable = Object.fromEntries(orders.filter((o) => o.table_id).map((o) => [o.table_id!, o]));
  const zones = [...new Set(tables.map((t) => t.zone))];
  const stateOf = (o: Order): St => { const live = o.order_items.filter((x) => x.status !== "cancelled");
    return live.some((x) => x.status === "pending") ? "pending" : live.some((x) => x.status === "preparing") ? "preparing" : live.length && live.every((x) => x.status === "served") ? "served" : "ready"; };
  const tally = (["ready", "preparing", "pending"] as St[]).map((k) => ({ k, n: orders.filter((o) => stateOf(o) === k).length })).filter((x) => x.n);

  return (
    /* The floor, then the open orders under it at every width — the orders as a grid of cards: one
       across on a phone, two on an iPad or tablet, three on a laptop, four on a desktop. They were a
       380px column beside the floor from 1280 up and a full-width list below it, one card stretched
       across the whole screen per order. */
    <div className="space-y-8">
      <section className="min-w-0">
        {zones.map((z) => (
          <div key={z} className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-3">{z}</div>
            <div className="grid grid-cols-2 min-[520px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
              {tables.filter((t) => t.zone === z).map((t, i) => {
                const o = byTable[t.id];
                const total = o?.order_items.filter((x) => x.status !== "cancelled").reduce((s, x) => s + Number(x.price_snapshot) * x.qty, 0) ?? 0;
                const anyReady = o?.order_items.some((x) => x.status === "ready");
                return (
                  /* One card per table, whatever its state: the tap target on top, and — for a table
                     with no ticket — a Reserve button inside the card. Reserve used to be a line of
                     11px text floating under the card, which made free cards look shorter than the
                     occupied ones beside them and was a 16px target. Reserved is amber, never
                     --color-saffron: that aliases to the green tint in the dark theme. */
                  <motion.div key={t.id} className={cn("feather feather-lift flex flex-col relative overflow-hidden",
                      t.status === "occupied" && "filled", t.status === "reserved" && "!border-[var(--color-orange)] border-dashed")}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                    <Link href={o ? `/orders/${o.id}` : `/orders/new?table=${t.id}`} className="flex-1 min-h-[5.75rem] p-3 flex flex-col">
                      <div className="flex justify-between items-start gap-1.5"><span className="font-display text-2xl leading-none">{t.name}</span><span className="flex items-center gap-1.5 shrink-0">{anyReady && <span className="ready-flag">Ready</span>}<span className="text-[11px] flex items-center gap-1 text-[var(--card-muted)]"><Users size={11} />{t.capacity}</span></span></div>
                      <div className="mt-auto">
                        {o ? (<><div className="num text-xs text-[var(--card-muted)] truncate">#{o.order_no} · {fmtSince(o.created_at)}</div><div className="num font-semibold">{formatINR(total)}</div></>)
                          : <div className={cn("text-xs font-semibold flex items-center gap-1.5", t.status === "reserved" ? "text-[var(--color-orange)]" : "text-steel")}><span className={cn("h-1.5 w-1.5 rounded-full", t.status === "reserved" ? "bg-[var(--color-orange)]" : "bg-[var(--color-green)]")} />{t.status === "reserved" ? "Reserved" : "Free"}</div>}
                      </div>
                    </Link>
                    {!o && (
                      <div className="px-1.5 pb-1.5">
                        <button type="button" onClick={() => start(() => { setTableStatus(t.id, t.status === "reserved" ? "free" : "reserved"); })} disabled={pending}
                          aria-label={`${t.status === "reserved" ? "Unreserve" : "Reserve"} ${t.name}`} className="room-act w-full text-[12px] font-semibold">{t.status === "reserved" ? "Unreserve" : "Reserve"}</button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
        {tables.length === 0 && <Empty title="No tables set up" hint="Add tables in Settings, or take a takeaway order right away." action={<Link href="/orders/new"><Button>New takeaway order</Button></Link>} />}
      </section>

      <section data-open-orders>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Open orders</h2>
          <span className="h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold num grid place-items-center" data-count>{orders.length}</span>
          {tally.length > 0 && <span className="ml-auto hidden sm:flex items-center gap-3 text-[11.5px] text-steel">{tally.map(({ k, n }) => <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 rounded-full" style={{ background: ST[k].color }} /><b className="num text-[var(--color-label)]">{n}</b> {ST[k].short}</span>)}</span>}
        </div>
        {orders.length === 0
          ? <div className="rounded-[22px] border border-dashed border-[var(--color-separator)] p-8 text-center text-sm text-steel">Nothing open. Quiet before the rush.</div>
          : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[100rem]:grid-cols-4 gap-3 lg:gap-4" data-order-grid>
          {orders.map((o, i) => {
            const live = o.order_items.filter((x) => x.status !== "cancelled");
            const total = live.reduce((s, x) => s + Number(x.price_snapshot) * x.qty, 0);
            const items = live.reduce((s, x) => s + x.qty, 0);
            const st = stateOf(o);
            const tbl = tables.find((t) => t.id === o.table_id);
            const kind = KIND[o.type] ?? KIND.dine_in;
            const stale = Date.now() - new Date(o.created_at).getTime() > STALE_MS;
            /* how far the kitchen has got, by plates: served, ready, on the fire, waiting */
            const by = (k: St) => live.filter((x) => stOf(x.status) === k).reduce((s, x) => s + x.qty, 0);
            const parts = (["served", "ready", "preparing", "pending"] as St[]).map((k) => ({ k, n: by(k) })).filter((p) => p.n);
            return (
              /* one card per order: what and where on top with its state, the kitchen's progress as a bar,
                 the first dishes with their own state, and the total in a footer strip edge to edge */
              <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="min-w-0">
              <Link href={`/orders/${o.id}`} data-order={o.order_no} data-state={st}
                className="feather feather-lift group relative overflow-hidden h-full flex flex-col"
                style={st === "ready" ? { background: "color-mix(in srgb, var(--color-green) 7%, var(--color-bg-2))", borderColor: "color-mix(in srgb, var(--color-green) 35%, transparent)" } : undefined}>
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: ST[st].color }} />
                <div className="p-4 pl-5 flex flex-col gap-3 flex-1 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="h-11 w-11 rounded-[14px] bg-[var(--color-fill)] grid place-items-center shrink-0 text-[var(--color-label-2)]" aria-hidden>
                      {tbl ? <span className="font-display text-[17px] leading-none text-[var(--color-label)] num">{tbl.name}</span> : <kind.Icon size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold truncate" data-title>{tbl ? `Table ${tbl.name}` : kind.label}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-steel num min-w-0">
                        <span className="shrink-0">#{o.order_no}</span><span aria-hidden>·</span><span className="shrink-0">{items} item{items === 1 ? "" : "s"}</span><span aria-hidden>·</span>
                        <span className={cn("inline-flex items-center gap-1 shrink-0", stale && "text-[var(--color-orange)] font-semibold")} title={stale ? "Open longer than a service — bill it or close it" : undefined} data-age><Clock size={11} />{fmtSince(o.created_at)}</span>
                      </div>
                      {o.customer_name && <div className="mt-0.5 text-[12.5px] truncate">{o.customer_name}</div>}
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap" data-status
                      style={{ background: `color-mix(in srgb, ${st === "pending" ? "var(--color-label-2)" : ST[st].color} ${st === "pending" ? 14 : 16}%, transparent)`, color: st === "pending" ? "var(--color-label-2)" : ST[st].color }}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", st === "ready" && "animate-pulse")} style={{ background: st === "pending" ? "var(--color-label-2)" : ST[st].color }} />{ST[st].label}
                    </span>
                  </div>

                  {/* the kitchen's progress, plate by plate */}
                  <div data-progress>
                    <div className="h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden flex gap-px">
                      {parts.map((p) => <span key={p.k} className="h-full" style={{ width: `${(p.n / Math.max(1, items)) * 100}%`, background: ST[p.k].color }} />)}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-steel flex flex-wrap gap-x-2.5">{parts.slice().reverse().map((p) => <span key={p.k} className="num whitespace-nowrap inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ST[p.k].color }} />{p.n} {ST[p.k].short}</span>)}</div>
                  </div>

                  {/* the first dishes, each with its own state */}
                  <ul className="space-y-1 min-w-0" data-dishes>
                    {live.slice(0, 3).map((x) => (
                      <li key={x.id} className="flex items-center gap-2 text-[13px] min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: ST[stOf(x.status)].color }} title={ST[stOf(x.status)].label} />
                        <span className="num text-steel shrink-0">{x.qty}×</span><span className="truncate">{x.name_snapshot}</span>
                      </li>
                    ))}
                    {live.length > 3 && <li className="text-[12px] text-steel pl-3.5">+{live.length - 3} more</li>}
                  </ul>
                </div>
                {/* the total, in a footer strip from edge to edge */}
                <div className="mt-auto flex items-center justify-between gap-3 px-4 pl-5 h-12 border-t border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)]">
                  <span className="font-display num text-[19px] leading-none" data-total>{formatINR(total)}</span>
                  <span className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-steel group-hover:text-[var(--color-label)] transition-colors">View order<ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
              </motion.div>
            );
          })}
        </div>}
      </section>
    </div>
  );
}
