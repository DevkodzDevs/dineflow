"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Check, Bell, Printer } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Ticket } from "@/components/ui/Ticket";
import { Button, cn } from "@/components/ui";
import { minsSince } from "@/lib/format";
import { Flip, listV, itemV, glide } from "@/components/ui";
import { LayoutGroup } from "framer-motion";
import { setKotStatus, setItemStatus } from "../orders/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";

type Kot = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string;
  orders: { order_no: number; type: string; customer_name: string | null; dining_tables: { name: string } | null } | null;
  order_items: { id: string; name_snapshot: string; qty: number; status: string; notes: string | null }[] };

export function KitchenClient({ initial: raw }: { initial: Kot[] }) {
  const { printKot } = usePrinters();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  useLive(["kots", "order_items"], 15000);
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
        <div className="num text-sm text-steel">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
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
                    const age = minsSince(k.created_at); const late = key !== "ready" && age >= 15;
                    return (
                      <Ticket key={k.id} layoutId={k.id} no={k.kot_no} title={where(k)} meta={`Order #${k.orders?.order_no}`} tone={late ? "alert" : key} aside={<Flip value={age} label="min" size="xs" tone={late ? "alert" : key === "ready" ? "live" : undefined} />}
                        footer={
                          <div className="flex gap-2">
                            {key === "pending" ? <Button className="flex-1" disabled={pending} onClick={() => move(k.id, "preparing")}><Flame size={16} /> Start cooking</Button>
                            : key === "preparing" ? <Button className="flex-1" variant="ink" disabled={pending} onClick={() => move(k.id, "ready")}><Check size={16} /> All ready</Button>
                            : <Button className="flex-1" variant="outline" disabled={pending} onClick={() => move(k.id, "served")}>Picked up</Button>}
                            <Button variant="ghost" title="Reprint this ticket" onClick={() => { void printKot({ kotNo: `KOT ${k.kot_no}`, when: new Date(k.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: where(k), reprint: true, items: k.order_items.filter((i) => i.status !== "cancelled").map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.notes })) }); }}><Printer size={16} /></Button>
                          </div>}>
                        {k.order_items.filter((i) => i.status !== "cancelled").map((i) => (
                          <button key={i.id} disabled={pending || key === "ready"} onClick={() => { const next = i.status === "ready" ? "preparing" : "ready"; if (!online) { void enqueue("item_status", { ids: [i.id], status: next }, `Kitchen · ${i.name_snapshot}`); return; } start(() => { setItemStatus(i.id, next); }); }}
                            className={cn("w-full flex items-start gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 transition", key !== "ready" && "hover:bg-porcelain", i.status === "ready" && "text-steel")}>
                            <span className="num text-lg font-bold leading-6 w-8">{i.qty}</span>
                            <span className="flex-1"><span className={cn("text-base font-semibold leading-6", i.status === "ready" && "line-through")}>{i.name_snapshot}</span>{i.notes && <span className="block text-xs text-chili font-medium">{i.notes}</span>}</span>
                            {i.status === "ready" && key !== "ready" && <Check size={16} className="text-mint mt-1" />}
                          </button>
                        ))}
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
