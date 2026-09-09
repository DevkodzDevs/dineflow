"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Pill, cn, Empty, Button } from "@/components/ui";
import { formatINR, minsSince } from "@/lib/format";
import { setTableStatus } from "./actions";

type Table = { id: string; name: string; capacity: number; zone: string; status: "free" | "occupied" | "reserved" };
type Order = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; order_items: { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string }[] };

export function OrdersClient({ tables, orders }: { tables: Table[]; orders: Order[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["orders", "order_items", "dining_tables"], 30000);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const byTable = Object.fromEntries(orders.filter((o) => o.table_id).map((o) => [o.table_id!, o]));
  const zones = [...new Set(tables.map((t) => t.zone))];
  const tone = (s: string) => (s === "ready" ? "ready" : s === "preparing" ? "preparing" : s === "served" ? "served" : "pending");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section>
        {zones.map((z) => (
          <div key={z} className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-3">{z}</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
              {tables.filter((t) => t.zone === z).map((t, i) => {
                const o = byTable[t.id];
                const total = o?.order_items.filter((x) => x.status !== "cancelled").reduce((s, x) => s + Number(x.price_snapshot) * x.qty, 0) ?? 0;
                const anyReady = o?.order_items.some((x) => x.status === "ready");
                return (
                  <motion.div key={t.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                    <Link href={o ? `/orders/${o.id}` : `/orders/new?table=${t.id}`}
                      className={cn("feather feather-lift block aspect-[5/4] p-3 flex flex-col relative overflow-hidden",
                        t.status === "occupied" && "bg-ink text-white border-ink", t.status === "reserved" && "border-saffron border-dashed")}>
                      <div className="flex justify-between items-start"><span className="font-display text-2xl">{t.name}</span><span className={cn("text-[11px] flex items-center gap-1", t.status === "occupied" ? "text-white/60" : "text-steel")}><Users size={11} />{t.capacity}</span></div>
                      <div className="mt-auto">
                        {o ? (<><div className="num text-xs text-white/60">#{o.order_no} · {minsSince(o.created_at)}m</div><div className="num font-semibold">{formatINR(total)}</div></>)
                          : <div className={cn("text-xs font-semibold", t.status === "reserved" ? "text-saffron" : "text-steel")}>{t.status === "reserved" ? "Reserved" : "Free"}</div>}
                      </div>
                      {anyReady && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-mint pulse-dot text-mint" />}
                    </Link>
                    {!o && <button onClick={() => start(() => { setTableStatus(t.id, t.status === "reserved" ? "free" : "reserved"); })} disabled={pending} className="mt-1 text-[11px] text-steel hover:text-ink w-full text-center">{t.status === "reserved" ? "Unreserve" : "Reserve"}</button>}
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
              <Link key={o.id} href={`/orders/${o.id}`} className="feather feather-lift block p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{tbl ? tbl.name : o.type === "takeaway" ? "Takeaway" : o.type === "room_service" ? "Room service" : "Delivery"}{o.customer_name && <span className="text-steel font-normal"> · {o.customer_name}</span>}</div>
                  <Pill tone={tone(worst)}>{worst}</Pill>
                </div>
                <div className="num text-xs text-steel mt-0.5">#{o.order_no} · {live.reduce((s, x) => s + x.qty, 0)} items · {minsSince(o.created_at)} min</div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-steel truncate">{live.slice(0, 3).map((x) => x.name_snapshot).join(", ")}{live.length > 3 ? "…" : ""}</span><span className="num font-semibold">{formatINR(total)}</span></div>
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
