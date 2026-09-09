"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Ticket } from "@/components/ui/Ticket";
import { Button, Pill, Card } from "@/components/ui";
import { formatINR, fmtTime, minsSince } from "@/lib/format";
import { setItemStatus, cancelOrder } from "../actions";

type Item = { id: string; kot_id: string | null; name_snapshot: string; qty: number; price_snapshot: number; status: string; notes: string | null };
type Order = { id: string; status: string; created_at: string; kots: { id: string; kot_no: number; status: string; created_at: string }[]; order_items: Item[] };

export function OrderDetail({ order }: { order: Order }) {
  const router = useRouter(); const [pending, start] = useTransition();
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`order-${order.id}`).on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` }, () => router.refresh()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [order.id, router]);
  const live = order.order_items.filter((i) => i.status !== "cancelled");
  const total = live.reduce((s, i) => s + Number(i.price_snapshot) * i.qty, 0);
  const tone = (s: string) => (s === "ready" ? "ready" : s === "preparing" ? "preparing" : s === "served" ? "served" : "pending") as "ready" | "preparing" | "served" | "pending";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {[...order.kots].sort((a, b) => a.kot_no - b.kot_no).map((k) => (
          <Ticket key={k.id} no={k.kot_no} title={`${fmtTime(k.created_at)} · ${minsSince(k.created_at)} min ago`} tone={tone(k.status)}
            footer={<div className="flex justify-between items-center"><Pill tone={tone(k.status)}>{k.status}</Pill>
              {k.status === "ready" && order.status === "open" && <Button size="sm" variant="ink" disabled={pending} onClick={() => start(async () => { for (const i of order.order_items.filter((x) => x.kot_id === k.id && x.status === "ready")) await setItemStatus(i.id, "served"); })}>Mark served</Button>}</div>}>
            {order.order_items.filter((i) => i.kot_id === k.id).map((i) => (
              <div key={i.id} className="flex items-start gap-2 text-sm">
                <span className="num w-7 font-semibold">{i.qty}×</span>
                <span className={i.status === "cancelled" ? "line-through text-steel flex-1" : "flex-1"}>{i.name_snapshot}{i.notes && <span className="block text-xs text-steel">{i.notes}</span>}</span>
                {order.status === "open" && i.status === "pending" && <button className="text-xs text-steel hover:text-chili" disabled={pending} onClick={() => start(() => { setItemStatus(i.id, "cancelled"); })}>cancel</button>}
                {i.status !== "pending" && <Pill tone={tone(i.status)}>{i.status}</Pill>}
              </div>
            ))}
          </Ticket>
        ))}
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">Running total</div>
        <div className="num text-3xl font-display mt-1">{formatINR(total)}</div>
        <div className="text-xs text-steel mt-1">{live.reduce((s, i) => s + i.qty, 0)} items · taxes added at billing</div>
        <ul className="mt-4 space-y-1.5 text-sm">{live.map((i) => <li key={i.id} className="flex justify-between"><span className="truncate">{i.qty}× {i.name_snapshot}</span><span className="num">{formatINR(Number(i.price_snapshot) * i.qty)}</span></li>)}</ul>
        {order.status === "open" && <Button variant="danger" size="sm" className="w-full mt-5" disabled={pending} onClick={() => { if (confirm("Cancel this whole order? Stock will be returned.")) start(async () => { await cancelOrder(order.id); router.push("/orders"); }); }}>Cancel order</Button>}
        {order.status !== "open" && <div className="mt-4"><Pill tone="served">{order.status}</Pill></div>}
      </Card>
    </div>
  );
}
