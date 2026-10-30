"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ArrowRightLeft, Merge, Scissors, Flame, PauseCircle } from "lucide-react";
import { getClient } from "@/lib/supabase/lazy";
import { calmRefresher } from "@/lib/liveRefresh";
import { Ticket } from "@/components/ui/Ticket";
import { PrinterHead } from "@/components/receipt/PrinterHead";
import { Button, Pill, Card, cn, useToast, ask } from "@/components/ui";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { formatINR, fmtTime, fmtSince } from "@/lib/format";
import { lineExtras } from "@dineflow/shared";
import { setItemStatus, cancelOrder, cancelLine, moveOrder, mergeOrders, splitOrder, fireKot } from "../actions";

type Item = { id: string; kot_id: string | null; name_snapshot: string; qty: number; price_snapshot: number; status: string; notes: string | null; course?: number; addons?: { name: string; price: number }[] | null; components?: { name: string; qty: number }[] | null };
type Kot = { id: string; kot_no: number; status: string; held?: boolean; created_at: string };
type Order = { id: string; order_no: number; status: string; table_id: string | null; created_at: string; split_from?: string | null; type?: string; token_no?: number | null; customer_name?: string | null; customer_phone?: string | null; delivery_address?: string | null; kots: Kot[]; order_items: Item[] };
type Table = { id: string; name: string; status: string };
type Open = { id: string; order_no: number; table_id: string | null; dining_tables: { name: string } | null };

/** One ticket on the order page, hanging from its own printer: the slot is inset px-3.5 and so is the
 *  paper, tucked 4px up under the machine (which paints above it) so the teeth bite its top edge. */
function PrintedTicket({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0" data-unit>
      <PrinterHead label="Kitchen printer" status={status} />
      <div className="relative z-[1] -mt-1 px-3.5">{children}</div>
    </div>
  );
}

export function OrderDetail({ order, tables = [], open = [] }: { order: Order; tables?: Table[]; open?: Open[] }) {
  const router = useRouter(); const [pending, start] = useTransition(); const toast = useToast();
  useEffect(() => {
    // the socket arrives just after the screen does, so the ticket paints without waiting for it. A change refreshes
    // through lib/liveRefresh.ts: one refresh for a burst (three dishes added are three events), and never over the
    // answer of an action this screen just sent — it used to refresh on every event and cancel that answer
    const r = calmRefresher(() => router.refresh(), 800);
    let sb: SupabaseClient | null = null, ch: RealtimeChannel | null = null, gone = false;
    void (async () => {
      const c = await getClient(); if (gone) return;
      // signed in before joining, as useLive does: joined as anon the channel hears nothing behind RLS
      try { const { data } = await c.auth.getSession(); if (data.session) c.realtime.setAuth(data.session.access_token); } catch { /* the action answers still update the screen */ }
      if (gone) return;
      sb = c;
      ch = c.channel(`order-${order.id}`).on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` }, r.bump).subscribe();
    })();
    return () => { gone = true; r.stop(); if (sb && ch) sb.removeChannel(ch); };
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
  /* a cancel asks why first — the reason goes on the line or the order and into the audit trail (0087) */
  const [cancelling, setCancelling] = useState<{ kind: "order" } | { kind: "line"; item: Item } | null>(null);

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
      {isOpen && ["pending", "preparing", "ready"].includes(i.status) && mode !== "split" && <button type="button" className="text-xs text-steel hover:text-chili !min-h-0 h-10 [@media(pointer:coarse)]:h-11 -my-2.5 px-2 inline-flex items-center rounded-lg" disabled={pending} onClick={() => setCancelling({ kind: "line", item: i })} data-cancel-line>cancel</button>}
      {i.status !== "pending" && <Pill tone={tone(i.status)}>{i.status}</Pill>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* every ticket comes out of a kitchen printer, the way the bill comes out of the counter printer —
          one machine per ticket, so on a phone the second and third tickets do not hang in the air under
          the first one's machine; two across from sm, each with its own */}
      <div className="grid gap-5 sm:grid-cols-2 items-start min-w-0">
        {[...order.kots].sort((a, b) => a.kot_no - b.kot_no).map((k) => {
          const course = Math.max(1, ...order.order_items.filter((i) => i.kot_id === k.id).map((i) => i.course ?? 1));
          return (
            <PrintedTicket key={k.id} status={k.held ? "HELD" : k.status.toUpperCase()}><Ticket top="slot" no={k.kot_no} title={k.held ? `Course ${course} · held` : `${fmtTime(k.created_at)} · ${fmtSince(k.created_at)} ago`} tone={k.held ? "warn" : tone(k.status)}
              footer={<div className="flex justify-between items-center">
                {k.held ? <Pill tone="gold"><PauseCircle size={11} /> held</Pill> : <Pill tone={tone(k.status)}>{k.status}</Pill>}
                {k.held && isOpen && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await fireKot(k.id); if ("error" in r) fail(r.error!); })}><Flame size={14} /> Fire to kitchen</Button>}
                {k.status === "ready" && isOpen && <Button size="sm" variant="ink" disabled={pending} onClick={() => start(async () => { for (const i of order.order_items.filter((x) => x.kot_id === k.id && x.status === "ready")) await setItemStatus(i.id, "served"); })}>Mark served</Button>}</div>}>
              {order.order_items.filter((i) => i.kot_id === k.id).map((i) => <Line key={i.id} i={i} />)}
            </Ticket></PrintedTicket>
          );
        })}
        {orphans.length > 0 && (
          <PrintedTicket status="SPLIT"><Ticket top="slot" no={order.order_no} title={order.split_from ? "Split from another bill" : "Lines"} tone="served"
            footer={<div className="text-[11px] text-steel">From original ticket</div>}>
            {orphans.map((i) => <Line key={i.id} i={i} />)}
          </Ticket></PrintedTicket>
        )}
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">Running total</div>
        <div className="num text-3xl font-display mt-1">{formatINR(total)}</div>
        <div className="text-xs text-steel mt-1">{live.reduce((s, i) => s + i.qty, 0)} items · plus tax</div>
        {/* a parcel's token and a delivery's address (0103, 0105): what the counter calls and where the rider goes */}
        {(order.token_no || order.delivery_address) && (
          <div className="mt-3 rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-[13.5px] space-y-1" data-deliver-to>
            {order.token_no ? <div className="font-extrabold">Token {order.token_no}{order.customer_name ? ` · ${order.customer_name}` : ""}</div> : null}
            {order.delivery_address && <div><span className="font-bold">Deliver to:</span> {order.delivery_address}{order.customer_phone ? <> · <a className="underline num" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></> : null}</div>}
          </div>
        )}
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
                <div className="flex gap-2">
                  <select value={toTable} onChange={(e) => setToTable(e.target.value)} className="flex-1"><option value="">Choose a table</option>{tables.filter((t) => t.id !== order.table_id).map((t) => <option key={t.id} value={t.id}>{t.name}{t.status !== "free" ? ` · ${t.status}` : ""}</option>)}</select>
                  <Button disabled={pending || !toTable} onClick={() => start(async () => { const r = await moveOrder(order.id, toTable); if ("error" in r) fail(r.error!); else { toast("Moved"); setMode(null); } })}>Move</Button>
                </div>
              </div>
            )}
            {mode === "merge" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-steel">Joins another order</p>
                {open.length === 0 ? <p className="text-xs text-steel">No open orders</p> : (
                  <div className="flex gap-2">
                    <select value={intoOrder} onChange={(e) => setIntoOrder(e.target.value)} className="flex-1"><option value="">Choose an order</option>{open.map((o) => <option key={o.id} value={o.id}>#{o.order_no} · {o.dining_tables?.name ?? "no table"}</option>)}</select>
                    <Button disabled={pending || !intoOrder} onClick={async () => { if (!(await ask({ title: "Merge orders?", body: `Order #${order.order_no} moves into #${open.find((o) => o.id === intoOrder)?.order_no}.`, ok: "Merge", tone: "go", icon: "check" }))) return; start(async () => { const r = await mergeOrders(order.id, intoOrder); if ("error" in r) fail(r.error!); else { toast("Merged"); router.push(`/orders/${intoOrder}`); } }); }}>Merge</Button>
                  </div>
                )}
              </div>
            )}
            {mode === "split" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-steel">Pick items to split</p>
                <div className="flex items-center justify-between text-sm"><span className="text-steel">{picked.length} line{picked.length === 1 ? "" : "s"} chosen</span><span className="num font-semibold">{formatINR(pickedTotal)}</span></div>
                {allPicked && <p className="text-xs text-chili">Leave at least one item on this bill.</p>}
                <Button className="w-full" disabled={pending || picked.length === 0 || allPicked} onClick={() => start(async () => {
                  const r = await splitOrder(order.id, picked.map(([id, qty]) => ({ id, qty })));
                  if ("error" in r) fail(r.error!); else { toast(`Order #${r.orderNo} split off`); router.push(`/orders/${r.orderId}`); }
                })}><Scissors size={14} /> Split bill</Button>
              </div>
            )}
          </div>
        )}

        {isOpen && <Button variant="danger" size="sm" className="w-full mt-5" disabled={pending} onClick={() => setCancelling({ kind: "order" })} data-cancel-order>Cancel order</Button>}
        {!isOpen && <div className="mt-4"><Pill tone="served">{order.status}</Pill></div>}
      </Card>
      <ReasonDialog open={cancelling?.kind === "order"} onClose={() => setCancelling(null)} title={`Cancel order #${order.order_no}?`}
        hint="Used stock not returned"
        chips={["Guest left without eating", "Wrong table", "Duplicate order", "Kitchen could not make it", "Guest complaint"]} confirmLabel="Cancel the order"
        onConfirm={async (reason) => { const r = await cancelOrder(order.id, reason); if ("error" in r) return { error: r.error }; router.push("/orders"); }} />
      <ReasonDialog open={cancelling?.kind === "line"} onClose={() => setCancelling(null)} title={cancelling?.kind === "line" ? `Cancel ${cancelling.item.qty}× ${cancelling.item.name_snapshot}?` : ""}
        hint={cancelling?.kind === "line" && cancelling.item.status !== "pending" ? "Cooking · manager only" : "Removes from bill"}
        chips={["Guest changed mind", "Wrong item punched", "Out of stock", "Duplicate", "Took too long"]} confirmLabel="Cancel the dish"
        onConfirm={async (reason) => { if (cancelling?.kind !== "line") return; const r = await cancelLine(cancelling.item.id, reason); if ("error" in r) return { error: r.error }; }} />
    </div>
  );
}
