"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Drumstick, Minus, Plus, Search, ChevronLeft, Send, AlertTriangle, Mic, MicOff, Sparkles, Loader2, X, Timer } from "lucide-react";
import { Button, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { placeOrder, parseOrder } from "../actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import Link from "next/link";

type Cat = { id: string; name: string };
type Item = { id: string; name: string; price: number; is_veg: boolean; category_id: string | null; is_available: boolean };
type Table = { id: string; name: string; status: string };
type Guest = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };
/** What the pantry can still cover, keyed by dish. A dish that is absent has no recipe: it moves no
 *  stock, so there is nothing true to say about it, and it is always sellable. */
type Cover = { portions: number; short: { name: string; unit: string; per: number; stock: number }[] };
type Running = { id: string; order_no: number; table_id: string };

export function PosClient({ categories, items, tables, initialTable, inHouse = [], stock = {}, running = [], ai = false, promise = null }: { categories: Cat[]; items: Item[]; tables: Table[]; initialTable: string | null; inHouse?: Guest[]; stock?: Record<string, Cover>; running?: Running[]; ai?: boolean; promise?: { minutes: number; pct: number } | null }) {
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
  /* The ticket that is already running on a table the waiter has just tapped. Not set when the table
     arrived in the URL: that is the "Add more" button on an open order, where a second ticket on the
     same table is exactly what was asked for. */
  const [busy, setBusy] = useState<Running | null>(null);
  /* Set once the waiter has been shown what the pantry is short of. The second press sends it: this
     is a warning, never a refusal — a count that drifted must not be able to stop a service. */
  const [warned, setWarned] = useState(false);
  /* The on-time promise, when the property offers one. Off unless the guest asks for it: it is a
     deadline the kitchen has to meet and a charge the guest has to agree to, so it is never a default. */
  const [promised, setPromised] = useState(false);
  /* Taking the order in words. The model turns "two biryani, one Jain, table four" into cart lines
     on this menu; everything lands in the same cart, notes and table the waiter would have tapped
     in, and the same Send button is still the only thing that reaches the kitchen. */
  const toast = useToast();
  const [said, setSaid] = useState(""); const [hearing, setHearing] = useState(false); const [reading, setReading] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const rec = useRef<SpeechRecognition | null>(null);
  const canHear = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const takeOrder = async (text: string) => {
    if (!text.trim() || reading) return;
    setReading(true); setUnresolved([]);
    try {
      const r = await parseOrder(text);
      if ("error" in r) { toast(r.error!, "err"); return; }
      // add to what is already on the ticket rather than replacing it — a second sentence is a second round
      setCart((c) => { const n = { ...c }; for (const l of r.lines) n[l.menu_item_id] = (n[l.menu_item_id] ?? 0) + l.qty; return n; });
      setNotes((c) => { const n = { ...c }; for (const l of r.lines) if (l.note) n[l.menu_item_id] = c[l.menu_item_id] ? `${c[l.menu_item_id]} · ${l.note}` : l.note; return n; });
      setWarned(false);
      if (r.order_type) setType(r.order_type);
      if (r.table_id) { const t = tables.find((x) => x.id === r.table_id); if (t) pickTable(t); }
      if (r.customer_name) setCustomer((x) => ({ ...x, name: r.customer_name! }));
      setUnresolved(r.unresolved);
      const n = r.lines.reduce((a, l) => a + l.qty, 0);
      toast(n ? `${n} item${n > 1 ? "s" : ""} added${r.table_name ? ` · ${r.table_name}` : ""} — check the ticket, then send` : "Nothing on the menu matched", n ? "ok" : "err");
      if (n) setSaid("");
    } finally { setReading(false); }
  };
  const hear = () => {
    const SR = window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition; if (!Ctor) return;
    if (hearing) { rec.current?.stop(); setHearing(false); return; }
    const r = new Ctor(); r.lang = "en-IN"; r.interimResults = true; rec.current = r; setHearing(true);
    r.onresult = (e: SpeechRecognitionEvent) => { const t = Array.from({ length: e.results.length }, (_, k) => e.results[k][0].transcript).join(""); setSaid(t); if (e.results[e.results.length - 1].isFinal) { setHearing(false); void takeOrder(t); } };
    r.onend = () => setHearing(false); r.onerror = () => setHearing(false); r.start();
  };

  const visible = useMemo(() => items.filter((i) => i.is_available && (cat === "all" || i.category_id === cat) && i.name.toLowerCase().includes(q.toLowerCase())), [items, cat, q]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty }));
  const total = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const add = (id: string, d: number) => { setWarned(false); setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) })); };
  const coverOf = (id: string) => stock[id];
  /** Dishes on this ticket the pantry cannot cover, with how far short it is. */
  const shortfalls = lines
    .map(({ item, qty }) => ({ item, qty, cover: coverOf(item.id) }))
    .filter((l) => l.cover && l.qty > l.cover.portions);
  const pickTable = (t: Table) => {
    setTableId(t.id);
    const open = running.find((o) => o.table_id === t.id);
    setBusy(t.id === initialTable ? null : open ?? null);
  };

  const submit = () => start(async () => {
    setErr(null);
    if (type === "dine_in" && !tableId) return setErr("Pick a table");
    // The pantry gets one say, and only one. Warning and then standing aside is the whole point:
    // the shelf is the authority here, not the count.
    if (shortfalls.length > 0 && !warned) return setWarned(true);
    if (type === "room_service" && !room) return setErr("Pick the guest room");
    const label = type === "dine_in" ? (tables.find((t) => t.id === tableId)?.name ?? "Table") : type === "room_service" ? customer.name : type.replace("_", " ");
    const payload = { type, promise: promised, table_id: type === "dine_in" ? tableId : null, customer_name: customer.name || null, customer_phone: customer.phone || null,
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
        <>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tables.map((t) => <button key={t.id} onClick={() => pickTable(t)} className={cn("h-9 min-w-11 px-2 rounded-lg text-sm font-semibold border", tableId === t.id ? "bg-ink text-on-label border-ink" : t.status === "occupied" ? "bg-line/60 border-line text-steel" : "border-line hover:bg-porcelain")}>{t.name}</button>)}
        </div>
        {busy && (
          <div className="mt-2 rounded-xl border border-line bg-[var(--color-fill)] p-2.5 text-xs">
            <div className="font-semibold">{tables.find((t) => t.id === busy.table_id)?.name ?? "That table"} already has order #{busy.order_no} running.</div>
            <div className="mt-2 flex gap-2">
              <Link href={`/orders/${busy.id}`} className="btn btn-gray !h-8 !text-xs flex-1 justify-center">Open #{busy.order_no}</Link>
              <button onClick={() => setBusy(null)} className="btn btn-outline !h-8 !text-xs flex-1">Start a separate one</button>
            </div>
          </div>
        )}
        </>
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
                <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{item.name}</div><div className="num text-xs text-steel">{formatINR(Number(item.price))} × {qty}</div>
                  {coverOf(item.id) && qty > coverOf(item.id)!.portions && <div className="text-[11px] font-semibold text-[var(--color-orange)]">pantry covers {coverOf(item.id)!.portions}</div>}</div>
                <div className="flex items-center gap-1"><button onClick={() => add(item.id, -1)} className="h-8 w-8 rounded-lg border border-line grid place-items-center"><Minus size={14} /></button><span className="num w-6 text-center font-semibold">{qty}</span><button onClick={() => add(item.id, 1)} className="h-8 w-8 rounded-lg bg-ink text-on-label grid place-items-center"><Plus size={14} /></button></div>
              </div>
              <input className="mt-1.5 !py-1.5 !text-xs" placeholder="Note for kitchen (less spicy…)" value={notes[item.id] ?? ""} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {promise && (
        <button type="button" onClick={() => setPromised((v) => !v)} aria-pressed={promised}
          className={cn("mt-3 w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition", promised ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-line hover:bg-[var(--color-fill)]")}>
          <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", promised ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-steel")}><Timer size={16} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">On-time promise · {promise.minutes} min</span>
            <span className="block text-xs text-steel mt-0.5">{promised ? `+${promise.pct}% on the food. Late and the whole bill is free.` : `Guest pays ${promise.pct}% more. If it is late, the food is free.`}</span>
          </span>
          <span className={cn("num text-xs font-semibold shrink-0", promised ? "text-[var(--color-tint)]" : "text-steel")}>{promised ? `+${formatINR(total * promise.pct / 100)}` : "off"}</span>
        </button>
      )}
      <div className="pt-4 mt-2 border-t border-dashed border-line">
        <div className="flex justify-between items-baseline"><span className="text-sm text-steel">{count} items</span><span className="num text-2xl font-semibold">{formatINR(total + (promised && promise ? total * promise.pct / 100 : 0))}</span></div>
        {err && <p className="text-sm text-chili mt-2">{err}</p>}
        {warned && shortfalls.length > 0 && (
          <div className="mt-2 rounded-xl border border-[var(--color-orange)]/40 bg-[rgb(255_179_64/.08)] p-2.5 text-xs">
            <div className="font-semibold text-[var(--color-orange)] flex items-center gap-1.5"><AlertTriangle size={13} /> The pantry is short</div>
            <ul className="mt-1 space-y-0.5 text-steel">
              {shortfalls.map(({ item, qty, cover }) => <li key={item.id}>{item.name} · {qty} ordered, {cover!.portions} covered{cover!.short[0] ? ` (${cover!.short[0].name} is out)` : ""}</li>)}
            </ul>
            <p className="mt-1.5 text-steel">Send it anyway if the shelf says otherwise — the count is only as good as the last delivery someone logged.</p>
          </div>
        )}
        <Button size="lg" className="w-full mt-3" disabled={pending || lines.length === 0} onClick={submit}><Send size={16} /> {pending ? "Sending…" : warned && shortfalls.length > 0 ? "Send anyway" : "Send to kitchen"}</Button>
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
        {ai && (
          <div className="mb-3">
            <form className={cn("feather flex items-center gap-2 p-2 pl-3.5", !online && "opacity-60")} onSubmit={(e) => { e.preventDefault(); void takeOrder(said); }}>
              <Sparkles size={16} className="text-[var(--color-tint)] shrink-0" />
              <input value={said} onChange={(e) => setSaid(e.target.value)} disabled={!online || reading} className="!border-0 !bg-transparent !shadow-none !px-1 flex-1 min-w-0"
                placeholder={online ? "Say or type the order — “two chicken biryani, one Jain, and a lime soda for table 4”" : "Taking orders by voice needs a connection"} />
              {canHear && <button type="button" onClick={hear} disabled={!online || reading} aria-label={hearing ? "Stop listening" : "Speak the order"}
                className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0 transition", hearing ? "bg-[var(--color-red)] text-white" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)]")}>{hearing ? <MicOff size={16} /> : <Mic size={16} />}</button>}
              <Button type="submit" size="sm" disabled={!online || reading || !said.trim()}>{reading ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : "Add to ticket"}</Button>
            </form>
            {unresolved.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--color-orange)]/40 bg-[rgb(255_179_64/.08)] px-3 py-2 text-xs">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--color-orange)]" />
                <span className="flex-1"><b className="text-[var(--color-orange)]">Not on the menu:</b> {unresolved.join(", ")} — tell the guest, or add the dish in Menu.</span>
                <button type="button" onClick={() => setUnresolved([])} aria-label="Dismiss" className="text-steel hover:text-[var(--color-label)]"><X size={14} /></button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {[{ id: "all", name: "All" }, ...categories].map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full px-4 h-9 text-sm font-semibold", cat === c.id ? "bg-ink text-on-label" : "bg-card border border-line")}>{c.name}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {visible.map((it) => {
            const qty = cart[it.id] ?? 0;
            return (
              <motion.button key={it.id} whileTap={{ scale: 0.97 }} onClick={() => add(it.id, 1)} className={cn("feather text-left p-3.5 relative transition-colors", qty > 0 && "border-saffron bg-saffron/5")}>
                <div className="flex items-center gap-1.5 text-[11px]">{it.is_veg ? <Leaf size={12} className="text-mint" /> : <Drumstick size={12} className="text-chili" />}<span className="num text-steel">{formatINR(Number(it.price))}</span></div>
                <div className="font-semibold text-sm mt-1 leading-snug">{it.name}</div>
                {(() => {
                  const c = coverOf(it.id);
                  if (!c) return null;                                    // no recipe: nothing to claim
                  if (c.portions === 0) return <div className="mt-1.5 text-[11px] font-semibold text-[var(--color-orange)]">Pantry short{c.short[0] ? ` · ${c.short[0].name}` : ""}</div>;
                  if (c.portions <= 5) return <div className="mt-1.5 text-[11px] text-steel num">{c.portions} left in the pantry</div>;
                  return null;
                })()}
                <AnimatePresence>{qty > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-2 right-2 num h-6 min-w-6 px-1.5 rounded-full bg-saffron text-on-tint text-xs font-bold grid place-items-center">{qty}</motion.span>}</AnimatePresence>
              </motion.button>
            );
          })}
          {visible.length === 0 && <p className="col-span-full text-sm text-steel py-8">No dishes match. Check Menu → availability.</p>}
        </div>
      </section>
      <aside className="hidden lg:block feather p-5 sticky top-6 h-[calc(100dvh-3rem)]">{CartPanel}</aside>
      {/* mobile cart bar */}
      <div className="lg:hidden fixed bottom-[72px] inset-x-4 z-30">
        <motion.button animate={{ y: count ? 0 : 80 }} onClick={() => setCartOpen(true)} className="w-full h-13 rounded-2xl bg-ink text-on-label flex items-center justify-between px-5 shadow-lift">
          <span className="text-sm font-semibold">{count} items</span><span className="num font-semibold">{formatINR(total)}</span><span className="text-sm font-semibold text-saffron">Review →</span>
        </motion.button>
      </div>
      <AnimatePresence>
        {cartOpen && (<>
          <motion.div className="lg:hidden cursor-pointer fixed inset-0 z-40 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
          <motion.div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-[24px] p-5 h-[85dvh]" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>{CartPanel}</motion.div>
        </>)}
      </AnimatePresence>
    </div>
  );
}
