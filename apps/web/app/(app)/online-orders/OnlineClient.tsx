"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Bike, Clock, Link2, AlertTriangle } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Pill, StatTile, Sheet, Field, cn, Empty } from "@/components/ui";
import { formatINR, minsSince } from "@/lib/format";
import { usePrinters } from "@/lib/print/usePrinter";
import { acceptOnline, rejectOnline, setOnlineStatus, mapDish } from "./actions";

type OO = { id: string; external_id: string; display_id: string | null; status: string; customer_name: string | null; customer_phone: string | null; address: string | null; items: { menu_item_id: string | null; name: string; qty: number; price: number; note: string | null }[]; unmatched: string[]; gross: number; commission: number; payout: number; is_prepaid: boolean; placed_at: string; order_id: string | null; order_channels: { kind: string; label: string; prep_minutes: number } | null };
const LOGO: Record<string, string> = { swiggy: "bg-[#fc8019] text-white", zomato: "bg-[#e23744] text-white", website: "bg-ink text-white", ondc: "bg-mint text-ink", other: "bg-porcelain-2 text-ink" };

export function OnlineClient({ orders, channels, menu }: { orders: OO[]; channels: { id: string; kind: string; label: string; is_live: boolean }[]; menu: { id: string; name: string; price: number }[] }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState<{ order: OO; line: string } | null>(null);
  const { printKot } = usePrinters();
  useLive(["online_orders"], 30000);
  const newCount = orders.filter((o) => o.status === "new").length; const prev = useRef(newCount);
  useEffect(() => { if (newCount > prev.current) { try { new Audio("data:audio/wav;base64,UklGRl9vAAA=").play(); } catch { /* muted */ } } prev.current = newCount; }, [newCount]);
  const live = orders.filter((o) => ["new", "accepted", "preparing", "ready"].includes(o.status));
  const news = live.filter((o) => o.status === "new");
  const today = orders.filter((o) => o.status !== "rejected");
  const accept = (o: OO) => start(async () => {
    const r = await acceptOnline(o.id); if ("error" in r) return setErr(r.error!);
    try { await printKot({ kotNo: o.display_id ?? o.external_id, when: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: `${o.order_channels?.label ?? "Online"} · ${o.customer_name ?? ""}`, items: o.items.map((i) => ({ name: i.name, qty: i.qty, note: i.note })) }); } catch { /* ignore */ }
  });
  return (
    <div className="space-y-5">
      {channels.length === 0 && <Card className="!bg-champagne-2 flex items-start gap-3"><Link2 size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>No channels connected yet.</b> Add one on the <Link href="/channels" className="underline font-semibold">Channels</Link> page and give the aggregator your webhook URL. Until Swiggy/Zomato approve your integration you can point your own website or an UrbanPiper-style middleware at the same URL.</div></Card>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Waiting to accept" value={String(news.length)} tone={news.length ? "alert" : "good"} />
        <StatTile label="In the kitchen" value={String(live.length - news.length)} delay={0.05} />
        <StatTile label="Today's online sales" value={formatINR(today.reduce((t, o) => t + Number(o.gross), 0))} delay={0.1} />
        <StatTile label="Commission" value={formatINR(today.reduce((t, o) => t + Number(o.commission), 0))} sub={`payout ${formatINR(today.reduce((t, o) => t + Number(o.payout), 0))}`} delay={0.15} />
      </div>
      {live.length === 0 ? <Empty title="No live online orders" hint="New orders pop up here the second the aggregator sends them." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><AnimatePresence>
          {live.map((o) => (
            <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <Card className={cn("h-full", o.status === "new" && "border-saffron shadow-glow")}>
                <div className="flex items-center gap-2"><span className={cn("px-2 py-0.5 rounded-lg text-[11px] font-bold capitalize", LOGO[o.order_channels?.kind ?? "other"])}>{o.order_channels?.label ?? "Online"}</span>
                  <span className="num text-xs text-steel">#{o.display_id ?? o.external_id}</span><span className="ml-auto num text-xs text-steel flex items-center gap-1"><Clock size={11} /> {minsSince(o.placed_at)}m</span></div>
                <div className="mt-2 font-semibold">{o.customer_name || "Customer"} {o.is_prepaid ? <Pill tone="ready">prepaid</Pill> : <Pill tone="alert">collect cash</Pill>}</div>
                {o.address && <div className="text-xs text-steel truncate">{o.address}</div>}
                <ul className="mt-2 text-sm space-y-0.5">{o.items.map((i, n) => <li key={n} className={cn("flex gap-2", !i.menu_item_id && "text-chili")}><span className="num w-6">{i.qty}×</span><span className="flex-1">{i.name}{i.note ? <span className="text-xs text-steel"> · {i.note}</span> : null}</span><span className="num">{formatINR(i.qty * Number(i.price))}</span></li>)}</ul>
                {o.unmatched.length > 0 && <div className="mt-2 text-xs text-chili flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{o.unmatched.length} item(s) not on your menu. <button onClick={() => setFix({ order: o, line: o.unmatched[0] })} className="underline font-semibold">Map now</button> so stock deducts correctly.</span></div>}
                <div className="mt-2 flex justify-between text-sm border-t border-line pt-2"><span className="text-steel">Payout</span><span className="num font-semibold">{formatINR(Number(o.payout))}</span></div>
                <div className="mt-3 flex gap-2">
                  {o.status === "new" ? <><Button size="sm" className="flex-1" disabled={pending} onClick={() => accept(o)}><Check size={14} /> Accept & print</Button><Button size="sm" variant="danger" disabled={pending} onClick={() => { const r = prompt("Reason for rejecting?") ?? ""; start(() => { rejectOnline(o.id, r); }); }}><X size={14} /></Button></>
                    : o.status === "accepted" ? <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(() => { setOnlineStatus(o.id, "ready"); })}>Mark ready for pickup</Button>
                    : <Button size="sm" variant="ink" className="flex-1" disabled={pending} onClick={() => start(() => { setOnlineStatus(o.id, "picked_up"); })}><Bike size={14} /> Picked up</Button>}
                  {o.order_id && <Link href={`/orders/${o.order_id}`}><Button size="sm" variant="ghost">Order</Button></Link>}
                </div>
              </Card></motion.div>))}
        </AnimatePresence></div>
      )}
      {err && <p className="text-sm text-chili">{err}</p>}
      <Sheet open={!!fix} onClose={() => setFix(null)} title={`Map "${fix?.line ?? ""}"`}>
        <p className="text-sm text-steel mb-3">Pick the dish on your menu that this aggregator line means. Future orders match automatically and deduct stock.</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">{menu.map((m) => <button key={m.id} className="feather feather-lift w-full text-left p-3 flex justify-between" disabled={pending} onClick={() => start(async () => { await mapDish(m.id, fix!.order.order_channels?.kind ?? "other", fix!.line); setFix(null); })}><span>{m.name}</span><span className="num text-steel">{formatINR(Number(m.price))}</span></button>)}</div>
      </Sheet>
    </div>
  );
}
