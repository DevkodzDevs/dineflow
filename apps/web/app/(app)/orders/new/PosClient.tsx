"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Drumstick, Minus, Plus, Search, ChevronLeft, Send } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { placeOrder } from "../actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import Link from "next/link";

type Cat = { id: string; name: string };
type Item = { id: string; name: string; price: number; is_veg: boolean; category_id: string | null; is_available: boolean };
type Table = { id: string; name: string; status: string };
type Guest = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };

export function PosClient({ categories, items, tables, initialTable, inHouse = [] }: { categories: Cat[]; items: Item[]; tables: Table[]; initialTable: string | null; inHouse?: Guest[] }) {
  const router = useRouter();
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery" | "room_service">("dine_in");
  const [room, setRoom] = useState("");
  const [tableId, setTableId] = useState<string | null>(initialTable);
  const [cat, setCat] = useState("all"); const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);
  const { online } = useOffline();
  const { printKot } = usePrinters();
  const [pending, start] = useTransition();
  const [cartOpen, setCartOpen] = useState(false);

  const visible = useMemo(() => items.filter((i) => i.is_available && (cat === "all" || i.category_id === cat) && i.name.toLowerCase().includes(q.toLowerCase())), [items, cat, q]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty }));
  const total = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));

  const submit = () => start(async () => {
    setErr(null);
    if (type === "dine_in" && !tableId) return setErr("Pick a table");
    if (type === "room_service" && !room) return setErr("Pick the guest room");
    const label = type === "dine_in" ? (tables.find((t) => t.id === tableId)?.name ?? "Table") : type === "room_service" ? customer.name : type.replace("_", " ");
    const payload = { type, table_id: type === "dine_in" ? tableId : null, customer_name: customer.name || null, customer_phone: customer.phone || null,
      items: lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, notes: notes[l.item.id] || undefined })) };

    // The kitchen ticket prints from this device, so it works with or without internet.
    try { await printKot({ kotNo: "KOT", when: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: label, items: lines.map((l) => ({ name: l.item.name, qty: l.qty, note: notes[l.item.id] || null })) }); }
    catch { /* never block an order because a printer is off */ }

    if (!online) {
      // Offline: keep the order on this device and send it the moment the connection returns.
      await enqueue("place_order", { ...payload, client_id: crypto.randomUUID(), placed_at: new Date().toISOString() }, `Order · ${label} · ${count} items`);
      setCart({}); setNotes({});
      router.push("/orders?queued=1");
      return;
    }
    const r = await placeOrder(payload);
    if ("error" in r) return setErr(r.error!);
    router.push(`/orders/${r.orderId}`);
  });

  const CartPanel = (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-1 bg-porcelain rounded-xl">
        {(["dine_in", "takeaway", "delivery", ...(inHouse.length ? ["room_service" as const] : [])] as const).map((t) => <button key={t} onClick={() => setType(t)} className={cn("flex-1 h-9 rounded-lg text-xs font-semibold capitalize", type === t ? "bg-card shadow-feather" : "text-steel")}>{t === "room_service" ? "Room" : t.replace("_", " ")}</button>)}
      </div>
      {type === "dine_in" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tables.map((t) => <button key={t.id} onClick={() => setTableId(t.id)} className={cn("h-9 min-w-11 px-2 rounded-lg text-sm font-semibold border", tableId === t.id ? "bg-ink text-white border-ink" : t.status === "occupied" ? "bg-line/60 border-line text-steel" : "border-line hover:bg-porcelain")}>{t.name}</button>)}
        </div>
      ) : type === "room_service" ? (
        <select className="mt-3" value={room} onChange={(e) => { setRoom(e.target.value); const g = inHouse.find((x) => x.id === e.target.value); setCustomer({ name: g ? `Room ${g.rooms?.number} · ${g.guests?.full_name}` : "", phone: "" }); }}><option value="">Choose in-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2"><input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /><input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
      )}
      <div className="mt-4 flex-1 overflow-y-auto ticket-rail pl-4 space-y-3">
        <AnimatePresence initial={false}>
          {lines.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-steel">Tap dishes to add them to this ticket.</motion.p>}
          {lines.map(({ item, qty }) => (
            <motion.div key={item.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{item.name}</div><div className="num text-xs text-steel">{formatINR(Number(item.price))} × {qty}</div></div>
                <div className="flex items-center gap-1"><button onClick={() => add(item.id, -1)} className="h-8 w-8 rounded-lg border border-line grid place-items-center"><Minus size={14} /></button><span className="num w-6 text-center font-semibold">{qty}</span><button onClick={() => add(item.id, 1)} className="h-8 w-8 rounded-lg bg-ink text-white grid place-items-center"><Plus size={14} /></button></div>
              </div>
              <input className="mt-1.5 !py-1.5 !text-xs" placeholder="Note for kitchen (less spicy…)" value={notes[item.id] ?? ""} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="pt-4 mt-2 border-t border-dashed border-line">
        <div className="flex justify-between items-baseline"><span className="text-sm text-steel">{count} items</span><span className="num text-2xl font-semibold">{formatINR(total)}</span></div>
        {err && <p className="text-sm text-chili mt-2">{err}</p>}
        <Button size="lg" className="w-full mt-3" disabled={pending || lines.length === 0} onClick={submit}><Send size={16} /> {pending ? "Sending…" : "Send to kitchen"}</Button>
      </div>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 -mx-4 md:mx-0 px-4 md:px-0">
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/orders" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
          <h1 className="text-2xl md:text-3xl">New order</h1>
          <div className="relative ml-auto w-full max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" /><input className="!pl-9" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {[{ id: "all", name: "All" }, ...categories].map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full px-4 h-9 text-sm font-semibold", cat === c.id ? "bg-ink text-white" : "bg-card border border-line")}>{c.name}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {visible.map((it) => {
            const qty = cart[it.id] ?? 0;
            return (
              <motion.button key={it.id} whileTap={{ scale: 0.97 }} onClick={() => add(it.id, 1)} className={cn("feather text-left p-3.5 relative transition-colors", qty > 0 && "border-saffron bg-saffron/5")}>
                <div className="flex items-center gap-1.5 text-[11px]">{it.is_veg ? <Leaf size={12} className="text-mint" /> : <Drumstick size={12} className="text-chili" />}<span className="num text-steel">{formatINR(Number(it.price))}</span></div>
                <div className="font-semibold text-sm mt-1 leading-snug">{it.name}</div>
                <AnimatePresence>{qty > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-2 right-2 num h-6 min-w-6 px-1.5 rounded-full bg-saffron text-ink text-xs font-bold grid place-items-center">{qty}</motion.span>}</AnimatePresence>
              </motion.button>
            );
          })}
          {visible.length === 0 && <p className="col-span-full text-sm text-steel py-8">No dishes match. Check Menu → availability.</p>}
        </div>
      </section>
      <aside className="hidden lg:block feather p-5 sticky top-6 h-[calc(100dvh-3rem)]">{CartPanel}</aside>
      {/* mobile cart bar */}
      <div className="lg:hidden fixed bottom-[72px] inset-x-4 z-30">
        <motion.button animate={{ y: count ? 0 : 80 }} onClick={() => setCartOpen(true)} className="w-full h-13 rounded-2xl bg-ink text-white flex items-center justify-between px-5 shadow-lift">
          <span className="text-sm font-semibold">{count} items</span><span className="num font-semibold">{formatINR(total)}</span><span className="text-sm font-semibold text-saffron">Review →</span>
        </motion.button>
      </div>
      <AnimatePresence>
        {cartOpen && (<>
          <motion.div className="lg:hidden fixed inset-0 z-40 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
          <motion.div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-[24px] p-5 h-[85dvh]" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>{CartPanel}</motion.div>
        </>)}
      </AnimatePresence>
    </div>
  );
}
