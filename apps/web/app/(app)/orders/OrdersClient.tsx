"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Pill, cn, Empty, Button } from "@/components/ui";
import { formatINR, fmtSince } from "@/lib/format";
import { setTableStatus } from "./actions";

type Table = { id: string; name: string; capacity: number; zone: string; status: "free" | "occupied" | "reserved" };
type Order = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; order_items: { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string }[] };

export function OrdersClient({ tables, orders }: { tables: Table[]; orders: Order[] }) {
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["orders", "order_items", "dining_tables"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const byTable = Object.fromEntries(orders.filter((o) => o.table_id).map((o) => [o.table_id!, o]));
  const zones = [...new Set(tables.map((t) => t.zone))];
  const tone = (s: string) => (s === "ready" ? "ready" : s === "preparing" ? "preparing" : s === "served" ? "served" : "pending");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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

      <aside>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-3">Open orders · {orders.length}</div>
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-sm text-steel">Nothing open. Quiet before the rush.</p>}
          {orders.map((o) => {
            const live = o.order_items.filter((x) => x.status !== "cancelled");
            const total = live.reduce((s, x) => s + Number(x.price_snapshot) * x.qty, 0);
            const worst = live.some((x) => x.status === "pending") ? "pending" : live.some((x) => x.status === "preparing") ? "preparing" : live.every((x) => x.status === "served") ? "served" : "ready";
            const tbl = tables.find((t) => t.id === o.table_id);
            return (
              /* the order's state as a strip down its edge, so a list of four reads at a glance */
              <Link key={o.id} href={`/orders/${o.id}`} className="feather feather-lift block p-4 pl-5 relative overflow-hidden">
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", worst === "ready" ? "bg-[var(--color-green)]" : worst === "preparing" ? "bg-[var(--color-orange)]" : worst === "served" ? "bg-[var(--color-blue)]" : "bg-[var(--color-label-3)]")} />
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold min-w-0 truncate">{tbl ? tbl.name : o.type === "takeaway" ? "Takeaway" : o.type === "room_service" ? "Room service" : "Delivery"}{o.customer_name && <span className="text-steel font-normal"> · {o.customer_name}</span>}</div>
                  <Pill tone={tone(worst)}>{worst}</Pill>
                </div>
                <div className="num text-xs text-steel mt-0.5">#{o.order_no} · {live.reduce((s, x) => s + x.qty, 0)} items · {fmtSince(o.created_at)}</div>
                <div className="mt-2.5 pt-2.5 border-t border-[var(--color-separator)] flex items-baseline justify-between gap-3 text-sm"><span className="text-steel truncate min-w-0">{live.slice(0, 3).map((x) => x.name_snapshot).join(", ")}{live.length > 3 ? "…" : ""}</span><span className="num font-semibold shrink-0">{formatINR(total)}</span></div>
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
