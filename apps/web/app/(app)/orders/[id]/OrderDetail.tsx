"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ArrowRightLeft, Merge, Scissors, Flame, PauseCircle } from "lucide-react";
import { getClient } from "@/lib/supabase/lazy";
import { Ticket } from "@/components/ui/Ticket";
import { Button, Pill, Card, cn, useToast } from "@/components/ui";
import { formatINR, fmtTime, fmtSince } from "@/lib/format";
import { lineExtras } from "@dineflow/shared";
import { setItemStatus, cancelOrder, moveOrder, mergeOrders, splitOrder, fireKot } from "../actions";

type Item = { id: string; kot_id: string | null; name_snapshot: string; qty: number; price_snapshot: number; status: string; notes: string | null; course?: number; addons?: { name: string; price: number }[] | null; components?: { name: string; qty: number }[] | null };
type Kot = { id: string; kot_no: number; status: string; held?: boolean; created_at: string };
type Order = { id: string; order_no: number; status: string; table_id: string | null; created_at: string; split_from?: string | null; kots: Kot[]; order_items: Item[] };
type Table = { id: string; name: string; status: string };
type Open = { id: string; order_no: number; table_id: string | null; dining_tables: { name: string } | null };

export function OrderDetail({ order, tables = [], open = [] }: { order: Order; tables?: Table[]; open?: Open[] }) {
  const router = useRouter(); const [pending, start] = useTransition(); const toast = useToast();
  useEffect(() => {
    // the socket arrives just after the screen does, so the ticket paints without waiting for it
    let sb: SupabaseClient | null = null, ch: RealtimeChannel | null = null, gone = false;
    void (async () => {
      const c = await getClient(); if (gone) return;
      sb = c;
      ch = c.channel(`order-${order.id}`).on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` }, () => router.refresh()).subscribe();
    })();
    return () => { gone = true; if (sb && ch) sb.removeChannel(ch); };
  }, [order.id, router]);
  const live = order.order_items.filter((i) => i.status !== "cancelled");
  const total = live.reduce((s, i) => s + Number(i.price_snapshot) * i.qty, 0);
  const tone = (s: string) => (s === "ready" ? "ready" : s === "preparing" ? "preparing" : s === "served" ? "served" : "pending") as "ready" | "preparing" | "served" | "pending";

  /* ── the table: move, merge, split ──
     `mode` is which of the three panels is open. Splitting keeps a pick per line: how many of it go
     to the new bill (0 = stays). */
  const [mode, setMode] = useState<"move" | "merge" | "split" | null>(null);
  const [toTable, setToTable] = useState(""); const [intoOrder, setIntoOrder] = useState("");
  const [pick, setPick] = useState<Record<string, number>>({});
  const picked = Object.entries(pick).filter(([, q]) => q > 0);
  const pickedTotal = picked.reduce((s, [id, q]) => { const i = live.find((x) => x.id === id); return s + (i ? Number(i.price_snapshot) * q : 0); }, 0);
  const allPicked = picked.length > 0 && live.every((i) => (pick[i.id] ?? 0) >= i.qty);
  const isOpen = order.status === "open";
  const fail = (m: string) => toast(m, "err");

  /* lines the tickets on this order do not account for: they came over in a split, and still
     belong to the ticket the kitchen printed for the order they were split from */
  const kotIds = new Set(order.kots.map((k) => k.id));
  const orphans = order.order_items.filter((i) => !i.kot_id || !kotIds.has(i.kot_id));

  const Line = ({ i }: { i: Item }) => (
    <div key={i.id} className="flex items-start gap-2 text-sm">
      {mode === "split" && i.status !== "cancelled" && isOpen ? (
        <span className="flex items-center gap-1 shrink-0">
          <button type="button" aria-label="Fewer to the new bill" onClick={() => setPick({ ...pick, [i.id]: Math.max(0, (pick[i.id] ?? 0) - 1) })} className="h-6 w-6 rounded-md border border-line text-xs">−</button>
          <span className={cn("num w-9 text-center text-xs font-semibold", (pick[i.id] ?? 0) > 0 && "text-saffron")}>{pick[i.id] ?? 0}/{i.qty}</span>
          <button type="button" aria-label="More to the new bill" onClick={() => setPick({ ...pick, [i.id]: Math.min(i.qty, (pick[i.id] ?? 0) + 1) })} className="h-6 w-6 rounded-md border border-line text-xs">+</button>
        </span>
      ) : <span className="num w-7 font-semibold">{i.qty}×</span>}
      <span className={i.status === "cancelled" ? "line-through text-steel flex-1" : "flex-1"}>{i.name_snapshot}{lineExtras(i).map((x, j) => <span key={j} className="block text-xs text-steel">{x}</span>)}{i.notes && <span className="block text-xs text-steel">{i.notes}</span>}</span>
      {isOpen && i.status === "pending" && mode !== "split" && <button className="text-xs text-steel hover:text-chili" disabled={pending} onClick={() => start(() => { setItemStatus(i.id, "cancelled"); })}>cancel</button>}
      {i.status !== "pending" && <Pill tone={tone(i.status)}>{i.status}</Pill>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {[...order.kots].sort((a, b) => a.kot_no - b.kot_no).map((k) => {
          const course = Math.max(1, ...order.order_items.filter((i) => i.kot_id === k.id).map((i) => i.course ?? 1));
          return (
            <Ticket key={k.id} no={k.kot_no} title={k.held ? `Course ${course} · held` : `${fmtTime(k.created_at)} · ${fmtSince(k.created_at)} ago`} tone={k.held ? "warn" : tone(k.status)}
              footer={<div className="flex justify-between items-center">
                {k.held ? <Pill tone="gold"><PauseCircle size={11} /> held</Pill> : <Pill tone={tone(k.status)}>{k.status}</Pill>}
                {k.held && isOpen && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await fireKot(k.id); if ("error" in r) fail(r.error!); else router.refresh(); })}><Flame size={14} /> Fire to kitchen</Button>}
                {k.status === "ready" && isOpen && <Button size="sm" variant="ink" disabled={pending} onClick={() => start(async () => { for (const i of order.order_items.filter((x) => x.kot_id === k.id && x.status === "ready")) await setItemStatus(i.id, "served"); })}>Mark served</Button>}</div>}>
              {order.order_items.filter((i) => i.kot_id === k.id).map((i) => <Line key={i.id} i={i} />)}
            </Ticket>
          );
        })}
        {orphans.length > 0 && (
          <Ticket no={order.order_no} title={order.split_from ? "Split from another bill" : "Lines"} tone="served"
            footer={<div className="text-[11px] text-steel">These lines were cooked on the ticket of the order they were split from.</div>}>
            {orphans.map((i) => <Line key={i.id} i={i} />)}
          </Ticket>
        )}
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">Running total</div>
        <div className="num text-3xl font-display mt-1">{formatINR(total)}</div>
        <div className="text-xs text-steel mt-1">{live.reduce((s, i) => s + i.qty, 0)} items · taxes added at billing</div>
        <ul className="mt-4 space-y-1.5 text-sm">{live.map((i) => <li key={i.id} className="flex justify-between"><span className="truncate">{i.qty}× {i.name_snapshot}</span><span className="num">{formatINR(Number(i.price_snapshot) * i.qty)}</span></li>)}</ul>

        {isOpen && (
          <div className="mt-5 pt-4 border-t border-dashed border-line">
            <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">The table</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([["move", "Move", ArrowRightLeft], ["merge", "Merge", Merge], ["split", "Split bill", Scissors]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" onClick={() => { setMode(mode === m ? null : m); setPick({}); }} aria-pressed={mode === m}
                  className={cn("h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition", mode === m ? "bg-ink text-on-label border-ink" : "border-line hover:bg-porcelain")}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            {mode === "move" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-steel">The whole order goes to another table; this one is freed if nothing else is running on it.</p>
                <div className="flex gap-2">
                  <select value={toTable} onChange={(e) => setToTable(e.target.value)} className="flex-1"><option value="">Choose a table</option>{tables.filter((t) => t.id !== order.table_id).map((t) => <option key={t.id} value={t.id}>{t.name}{t.status !== "free" ? ` · ${t.status}` : ""}</option>)}</select>
                  <Button disabled={pending || !toTable} onClick={() => start(async () => { const r = await moveOrder(order.id, toTable); if ("error" in r) fail(r.error!); else { toast("Moved"); setMode(null); router.refresh(); } })}>Move</Button>
                </div>
              </div>
            )}
            {mode === "merge" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-steel">This order&apos;s lines and tickets join the other one, and it is billed there. This order closes as merged.</p>
                {open.length === 0 ? <p className="text-xs text-steel">No other open order to join.</p> : (
                  <div className="flex gap-2">
                    <select value={intoOrder} onChange={(e) => setIntoOrder(e.target.value)} className="flex-1"><option value="">Choose an order</option>{open.map((o) => <option key={o.id} value={o.id}>#{o.order_no} · {o.dining_tables?.name ?? "no table"}</option>)}</select>
                    <Button disabled={pending || !intoOrder} onClick={() => { if (!confirm(`Merge order #${order.order_no} into #${open.find((o) => o.id === intoOrder)?.order_no}?`)) return; start(async () => { const r = await mergeOrders(order.id, intoOrder); if ("error" in r) fail(r.error!); else { toast("Merged"); router.push(`/orders/${intoOrder}`); } }); }}>Merge</Button>
                  </div>
                )}
              </div>
            )}
            {mode === "split" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-steel">Pick how many of each line go to a second bill on the same table — two of the three beers, say. The rest stay here.</p>
                <div className="flex items-center justify-between text-sm"><span className="text-steel">{picked.length} line{picked.length === 1 ? "" : "s"} chosen</span><span className="num font-semibold">{formatINR(pickedTotal)}</span></div>
                {allPicked && <p className="text-xs text-chili">That is everything — leave at least one line on this bill.</p>}
                <Button className="w-full" disabled={pending || picked.length === 0 || allPicked} onClick={() => start(async () => {
                  const r = await splitOrder(order.id, picked.map(([id, qty]) => ({ id, qty })));
                  if ("error" in r) fail(r.error!); else { toast(`Order #${r.orderNo} split off`); router.push(`/orders/${r.orderId}`); }
                })}><Scissors size={14} /> Split to a new bill</Button>
              </div>
            )}
          </div>
        )}

        {isOpen && <Button variant="danger" size="sm" className="w-full mt-5" disabled={pending} onClick={() => { if (confirm("Cancel this whole order? Stock will be returned.")) start(async () => { await cancelOrder(order.id); router.push("/orders"); }); }}>Cancel order</Button>}
        {!isOpen && <div className="mt-4"><Pill tone="served">{order.status}</Pill></div>}
      </Card>
    </div>
  );
}
