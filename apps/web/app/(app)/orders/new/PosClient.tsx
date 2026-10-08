"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Drumstick, Minus, Plus, Search, ChevronLeft, Send, AlertTriangle, Mic, MicOff, Sparkles, Loader2, X, Timer, SlidersHorizontal, Layers, ListOrdered } from "lucide-react";
import { Button, Pill, cn, useToast } from "@/components/ui";
import { formatINR, fmtSince } from "@/lib/format";
import { placeOrder, parseOrder } from "../actions";
import { lookupCustomer } from "../../billing/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import { OptionChooser } from "@/components/OptionChooser";
import { hasOptions, defaultVariant, linePrice, lineKey, lineName, lineExtras, optionProblem, tilePrice, type Optioned, type Variant, type Addon } from "@dineflow/shared";
import Link from "next/link";

type Cat = { id: string; name: string };
type Item = Optioned & { is_veg: boolean; category_id: string | null; is_available: boolean; image_url: string | null };
type Table = { id: string; name: string; status: string };
type Guest = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };
/** What the pantry can still cover, keyed by dish. A dish that is absent has no recipe: it moves no
 *  stock, so there is nothing true to say about it, and it is always sellable. */
type Cover = { portions: number; short: { name: string; unit: string; per: number; stock: number }[] };
type Running = { id: string; order_no: number; table_id: string; created_at: string; order_items: { qty: number }[]; dining_tables: { name: string } | null };
/** One line of the ticket: a dish with the size and extras it was chosen with. The same dish as
 *  Half and as Full is two lines. `ask` marks a line that still owes a required choice — a voice
 *  order can put a dish on the ticket before anyone has said which bread. */
type Line = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number; note: string; ask?: boolean; course: number };

export function PosClient({ categories, items, tables, initialTable, inHouse = [], stock = {}, running = [], ai = false, promise = null }: { categories: Cat[]; items: Item[]; tables: Table[]; initialTable: string | null; inHouse?: Guest[]; stock?: Record<string, Cover>; running?: Running[]; ai?: boolean; promise?: { minutes: number; pct: number } | null }) {
  const router = useRouter();
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery" | "room_service">("dine_in");
  const [room, setRoom] = useState("");
  const [tableId, setTableId] = useState<string | null>(initialTable);
  const [cat, setCat] = useState("all"); const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  /* The question a dish asks before it goes on the ticket. `replace` is the line being answered
     for — a voice-added dish that still owes a choice — and goes away when the answer lands. */
  const [chooser, setChooser] = useState<{ item: Item; replace?: string; qty?: number; note?: string } | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  /* A phone makes the guest a customer: the name fills itself in, and the ticket says who is back. */
  const [known, setKnown] = useState<{ name: string | null; visits: number; points: number; notes: string | null } | null>(null);
  useEffect(() => {
    if (customer.phone.replace(/\D/g, "").length < 10) { setKnown(null); return; }
    let on = true;
    lookupCustomer(customer.phone).then((r) => { if (!on || "error" in r) return; setKnown(r.customer); if (r.customer?.name) setCustomer((c) => (c.name ? c : { ...c, name: r.customer!.name! })); });
    return () => { on = false; };
  }, [customer.phone]);
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
  /* Courses. Off, every line is course 1 and the ticket goes as one. On, each line carries a
     course; the first goes to the kitchen now and the rest are held until somebody fires them. */
  const [coursing, setCoursing] = useState(false);
  /* One request for the whole ticket — "all mild", "serve together". Per-line notes still exist
     for the dish that needs its own. */
  const [ticketNote, setTicketNote] = useState(""); const [askNote, setAskNote] = useState(false);
  /* Which lines have their note field showing. A line that already carries a note always shows it. */
  const [noteOpen, setNoteOpen] = useState<Set<string>>(new Set());

  /* ── the ticket ── */
  const qtyOf = (id: string) => lines.filter((l) => l.item.id === id).reduce((s, l) => s + l.qty, 0);
  const putLine = (item: Item, variant: Variant | null, addons: Addon[], d: number, note = "", replace?: string) => {
    setWarned(false);
    setLines((ls) => {
      const base = replace ? ls.filter((l) => l.key !== replace) : ls;
      const key = lineKey(item.id, variant?.id, addons.map((a) => a.id));
      const at = base.findIndex((l) => l.key === key);
      if (at < 0) return d > 0 ? [...base, { key, item, variant, addons, qty: d, note, ask: optionProblem(item, addons) !== null, course: 1 }] : base;
      const next = [...base]; const n = next[at].qty + d;
      if (n <= 0) next.splice(at, 1); else next[at] = { ...next[at], qty: n, note: note || next[at].note };
      return next;
    });
  };
  const bump = (key: string, d: number) => { setWarned(false); setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0)); };
  const setNote = (key: string, note: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, note } : l)));
  const cycleCourse = (key: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, course: l.course >= 3 ? 1 : l.course + 1 } : l)));
  const courses = [...new Set(lines.map((l) => (coursing ? l.course : 1)))].sort();
  /** Tapping a tile: a dish that asks a question opens it; the rest go straight on the ticket. */
  const tap = (it: Item) => (hasOptions(it) ? setChooser({ item: it }) : putLine(it, null, [], 1));
  /** The minus under a tile takes one off the most recent line of that dish. With sizes on the
   *  ticket the tile cannot know which one is meant, and the one just added is the one in hand. */
  const takeOne = (it: Item) => {
    setWarned(false);
    setLines((ls) => {
      for (let i = ls.length - 1; i >= 0; i--) {
        if (ls[i].item.id !== it.id) continue;
        const next = [...ls];
        if (next[i].qty <= 1) next.splice(i, 1); else next[i] = { ...next[i], qty: next[i].qty - 1 };
        return next;
      }
      return ls;
    });
  };
  /** The cross clears the dish outright — every size and every extra of it. */
  const clearItem = (it: Item) => { setWarned(false); setLines((ls) => ls.filter((l) => l.item.id !== it.id)); };
  /** The minus on a cart line for a dish that was tapped by voice takes one off its last line, whichever size. */
  const askFor = (l: Line) => setChooser({ item: l.item, replace: l.key, qty: l.qty, note: l.note });

  /* Taking the order in words. The model turns "two biryani, one Jain, table four" into cart lines
     on this menu; everything lands in the same cart, notes and table the waiter would have tapped
     in, and the same Send button is still the only thing that reaches the kitchen. A dish sold in
     sizes lands in its default size; one with a required choice is flagged until it is made. */
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
      setLines((prev) => {
        const n = [...prev];
        for (const l of r.lines) {
          const item = items.find((i) => i.id === l.menu_item_id); if (!item) continue;
          const v = defaultVariant(item); const key = lineKey(item.id, v?.id, []);
          const at = n.findIndex((x) => x.key === key);
          if (at >= 0) n[at] = { ...n[at], qty: n[at].qty + l.qty, note: l.note ? (n[at].note ? `${n[at].note} · ${l.note}` : l.note) : n[at].note };
          else n.push({ key, item, variant: v, addons: [], qty: l.qty, note: l.note ?? "", ask: optionProblem(item, []) !== null, course: 1 });
        }
        return n;
      });
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
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const unit = (l: Line) => linePrice(l.item, l.variant, l.addons);
  const total = lines.reduce((s, l) => s + unit(l) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const coverOf = (id: string) => stock[id];
  /** Dishes on this ticket the pantry cannot cover, with how far short it is — counted across sizes. */
  const shortfalls = (() => {
    const by = new Map<string, { item: Item; qty: number }>();
    lines.forEach((l) => by.set(l.item.id, { item: l.item, qty: (by.get(l.item.id)?.qty ?? 0) + l.qty }));
    return [...by.values()].map((x) => ({ ...x, cover: coverOf(x.item.id) })).filter((x) => x.cover && x.qty > x.cover.portions);
  })();
  const pickTable = (t: Table) => {
    setTableId(t.id);
    const open = running.find((o) => o.table_id === t.id);
    setBusy(t.id === initialTable ? null : open ?? null);
  };

  const submit = () => start(async () => {
    setErr(null);
    if (type === "dine_in" && !tableId) return setErr("Pick a table");
    // a dish that still owes a choice cannot go: the kitchen would not know which bread, and the bill which price
    const owed = lines.find((l) => l.ask);
    if (owed) { askFor(owed); return setErr(`${owed.item.name} needs a choice first`); }
    // The pantry gets one say, and only one. Warning and then standing aside is the whole point:
    // the shelf is the authority here, not the count.
    if (shortfalls.length > 0 && !warned) return setWarned(true);
    if (type === "room_service" && !room) return setErr("Pick the guest room");
    const label = type === "dine_in" ? (tables.find((t) => t.id === tableId)?.name ?? "Table") : type === "room_service" ? customer.name : type.replace("_", " ");
    const payload = { type, promise: promised, table_id: type === "dine_in" ? tableId : null, customer_name: customer.name || null, customer_phone: customer.phone || null, note: ticketNote.trim() || null,
      items: lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, notes: l.note || undefined, variant_id: l.variant?.id ?? null, addon_ids: l.addons.map((a) => a.id), course: coursing ? l.course : 1 })) };

    // The kitchen ticket prints from this device, so it works with or without internet — one per
    // course, the held ones saying so, the way the server will hand them to the kitchen.
    try {
      const when = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      for (const c of courses) {
        const on = lines.filter((l) => (coursing ? l.course : 1) === c);
        // the ticket-wide request rides on the printed docket too, or the kitchen never sees it
        const course = courses.length > 1 ? (c > 1 ? `COURSE ${c} · HELD — fire from the kitchen screen` : "COURSE 1") : null;
        const heading = [course, ticketNote.trim() ? `** ${ticketNote.trim().toUpperCase()} **` : null].filter(Boolean).join(" · ") || undefined;
        await printKot({ kotNo: "KOT", when, tableOrType: label, heading,
          items: on.map((l) => ({ name: lineName(l.item, l.variant), qty: l.qty, note: l.note || null, extras: lineExtras({ addons: l.addons, components: l.item.components }) })) });
      }
    } catch { /* never block an order because a printer is off */ }

    if (!online) {
      // Offline: keep the order on this device and send it the moment the connection returns.
      await enqueue("place_order", { ...payload, client_id: crypto.randomUUID(), placed_at: new Date().toISOString() }, `Order · ${label} · ${count} items`);
      setLines([]);
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
        <div className="mt-2 grid grid-cols-2 gap-2"><input placeholder="Phone (optional)" inputMode="tel" className="num !py-1.5 !text-xs" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /><input placeholder="Name" className="!py-1.5 !text-xs" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
        </>
      ) : type === "room_service" ? (
        <select className="mt-3" value={room} onChange={(e) => { setRoom(e.target.value); const g = inHouse.find((x) => x.id === e.target.value); setCustomer({ name: g ? `Room ${g.rooms?.number} · ${g.guests?.full_name}` : "", phone: "" }); }}><option value="">Choose in-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2"><input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /><input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
      )}
      {known && type !== "room_service" && <div className="mt-1.5 text-[11px] text-steel">Welcome back{known.name ? `, ${known.name.split(" ")[0]}` : ""} · {known.visits} visit{known.visits === 1 ? "" : "s"}{known.notes ? ` · ${known.notes}` : ""}</div>}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-steel">Ticket</span>
        <button type="button" onClick={() => setCoursing((v) => !v)} aria-pressed={coursing} title="Starters now, mains when the table is ready: every course after the first is held until the kitchen fires it"
          className={cn("h-7 rounded-full px-2.5 text-[11px] font-semibold flex items-center gap-1 transition", coursing ? "bg-ink text-on-label" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)]")}><ListOrdered size={12} /> Courses {coursing ? "on" : "off"}</button>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto ticket-rail pl-4 space-y-3">
        <AnimatePresence initial={false}>
          {lines.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-steel">Tap dishes to add them to this ticket.</motion.p>}
          {lines.map((l) => (
            /* every line is its own card: what it is and a cross on top, how many and what it
               comes to underneath — the shape a guest reads back to you */
            <motion.div key={l.key} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              className="rounded-2xl border border-line bg-[var(--color-bg-3)] p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-snug">{lineName(l.item, l.variant)}</div>
                  {lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <div key={j} className="text-[11px] text-steel truncate">{x}</div>)}
                  {coverOf(l.item.id) && qtyOf(l.item.id) > coverOf(l.item.id)!.portions && <div className="text-[11px] font-semibold text-[var(--color-orange)]">pantry covers {coverOf(l.item.id)!.portions}</div>}
                  {l.ask && <button type="button" onClick={() => askFor(l)} className="mt-0.5 text-[11px] font-semibold text-[var(--color-orange)] underline">Choose options</button>}
                </div>
                {coursing && <button type="button" onClick={() => cycleCourse(l.key)} title="Course — tap to change" className={cn("h-7 min-w-7 px-1.5 rounded-full text-[11px] font-bold border shrink-0", l.course > 1 ? "border-tint text-[var(--color-tint)]" : "border-line text-steel")}>C{l.course}</button>}
                <button type="button" onClick={() => bump(l.key, -l.qty)} aria-label={`Remove ${lineName(l.item, l.variant)}`}
                  className="h-7 w-7 rounded-full bg-[var(--color-fill)] grid place-items-center text-steel hover:text-[var(--color-red)] shrink-0"><X size={13} /></button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => bump(l.key, -1)} aria-label="One less" className="h-8 w-8 rounded-full border border-line grid place-items-center text-steel hover:bg-[var(--color-fill)]"><Minus size={14} /></button>
                <span className="num w-5 text-center font-bold text-sm tabular-nums">{l.qty}</span>
                <button onClick={() => bump(l.key, 1)} aria-label="One more" className="h-8 w-8 rounded-full bg-ink text-on-label grid place-items-center"><Plus size={14} /></button>
                <span className="ml-auto num font-semibold text-sm h-8 px-3 rounded-full bg-[var(--color-bg-2)] border border-line flex items-center">{formatINR(unit(l) * l.qty)}</span>
              </div>
              {l.note || noteOpen.has(l.key)
                ? <input autoFocus={!l.note} className="mt-2 !py-1.5 !text-xs" placeholder="Less spicy, no onion…" value={l.note} onChange={(e) => setNote(l.key, e.target.value)} />
                : <button type="button" onClick={() => setNoteOpen((n) => new Set(n).add(l.key))}
                    className="mt-1.5 text-[11px] font-semibold text-steel hover:text-[var(--color-label)] flex items-center gap-1"><Plus size={11} /> Note for kitchen</button>}
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
      <div className="pt-3 mt-2 border-t border-dashed border-line">
        {/* one request for the whole ticket, the way a guest actually asks it — place_order has
            carried a slot for this all along and the till never offered anywhere to type it */}
        <button type="button" onClick={() => setAskNote((v) => !v)} aria-pressed={askNote || !!ticketNote}
          className={cn("h-8 rounded-full px-3 text-[11px] font-semibold inline-flex items-center gap-1 border transition",
            ticketNote ? "border-tint text-[var(--color-tint)]" : "border-line text-steel hover:text-[var(--color-label)]")}>
          <Plus size={12} /> Cooking request{ticketNote ? ` · ${ticketNote.slice(0, 18)}${ticketNote.length > 18 ? "…" : ""}` : ""}
        </button>
        {askNote && <input autoFocus className="mt-2 !py-1.5 !text-xs" maxLength={200} placeholder="All mild · no onion · serve everything together"
          value={ticketNote} onChange={(e) => setTicketNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setAskNote(false); }} />}
        <div className="mt-3 flex justify-between items-baseline">
          <span className="text-sm text-steel">Total payment <span className="text-[11px]">· {count} item{count === 1 ? "" : "s"}</span></span>
          <span className="num text-2xl font-bold">{formatINR(total + (promised && promise ? total * promise.pct / 100 : 0))}</span>
        </div>
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
        {coursing && courses.length > 1 && <p className="text-[11px] text-steel mt-2">Course 1 goes now. {courses.filter((c) => c > 1).map((c) => `Course ${c}`).join(" and ")} will wait on the kitchen screen until fired.</p>}
        <Button size="lg" className="w-full mt-3" disabled={pending || lines.length === 0} onClick={submit}><Send size={16} /> {pending ? "Sending…" : warned && shortfalls.length > 0 ? "Send anyway" : "Send to kitchen"}</Button>
      </div>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_clamp(280px,32%,380px)] gap-6 -mx-4 md:mx-0 px-4 md:px-0">
      {/* minmax(0,1fr), not 1fr: a 1fr track refuses to go below its content's own minimum, and the
          wider dish cards were pushing the ticket off the right of the screen.
          The ticket rail is a clamp, not a fixed 360px. Fixed, it ate the tablet: at 1080 the dish
          side was handed 364px against the rail's 360 — half the screen for a ticket that is empty
          until you tap something, and dish names wrapping to three lines in the half you actually
          work in. The clamp gives the rail about a third, never under 280 (its content floor) and
          never over 380 (past which it is just a wide empty column). Measured, the dish column goes
          364 -> 444 at 1080 and 478 -> 558 at an iPad in landscape. */}
      <section className="min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/orders" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
          {/* the search is what yields, not the title: `w-full max-w-xs` on the field squeezed the
              heading until "New order" broke across two lines on a tablet */}
          <h1 className="text-2xl md:text-3xl shrink-0 whitespace-nowrap">New order</h1>
          <div className="relative ml-auto min-w-0 flex-1 max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" /><input className="!pl-9" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>

        {/* What is already running, at the top of the screen the waiter is standing in front of.
            The data was here to warn about a busy table; showing it costs nothing and saves the
            trip to the Orders screen to answer "is table six done yet?". */}
        {running.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="eyebrow">Order line</span>
              <span className="num h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{running.length}</span>
              <Link href="/orders" className="ml-auto text-xs font-semibold text-steel hover:text-[var(--color-label)]">All orders →</Link>
            </div>
            <div className="rail-fade flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
              {running.slice(0, 12).map((o) => {
                const n = (o.order_items ?? []).reduce((t, i) => t + Number(i.qty), 0);
                return (
                  <Link key={o.id} href={`/orders/${o.id}`} className="feather feather-lift shrink-0 w-52 p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm truncate flex-1">{o.dining_tables?.name ?? "Table"}</span>
                      <span className="num text-[11px] text-steel">#{o.order_no}</span>
                    </div>
                    <div className="text-[11px] text-steel mt-0.5 num">{n} item{n === 1 ? "" : "s"} · {fmtSince(o.created_at)}</div>
                    <div className="mt-2"><Pill tone="preparing">in progress</Pill></div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
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
        <div className="rail-fade flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {[{ id: "all", name: "All" }, ...categories].map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full px-4 h-9 text-sm font-semibold", cat === c.id ? "bg-ink text-on-label" : "bg-card border border-line")}>{c.name}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {visible.map((it) => {
            const qty = qtyOf(it.id); const tp = tilePrice(it); const asks = hasOptions(it);
            const c = coverOf(it.id);
            return (
              /* The stepper is a sibling of the tap target, not a child of it: a button inside a
                 button is not valid markup, and the dish has to stay a real button for the keyboard. */
              <motion.div key={it.id} layout className={cn("feather relative flex flex-col transition-colors", qty > 0 && "bg-[var(--color-green-2)] ring-1 ring-[var(--color-tint)]")}>
                <motion.button whileTap={{ scale: 0.985 }} onClick={() => tap(it)} className="text-left p-2.5 flex items-start gap-3 flex-1">
                  <Thumb item={it} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[11px] text-steel truncate flex-1">{catName(it.category_id)}</span>
                      {/* a dish that asks a question, or is a meal of other dishes, says so here */}
                      {it.is_combo && <Layers size={11} className="text-steel shrink-0" aria-label="Combo" />}
                      {asks && <SlidersHorizontal size={11} className="text-steel shrink-0" aria-label="Has options" />}
                      <span className="num text-sm font-semibold shrink-0">{tp.from ? <span className="text-[11px] font-normal text-steel">from </span> : null}{formatINR(tp.price)}</span>
                    </span>
                    <span className="block font-semibold text-sm mt-0.5 leading-snug line-clamp-2">{it.name}</span>
                    {c?.portions === 0 && <span className="block mt-1 text-[11px] font-semibold text-[var(--color-orange)]">Pantry short{c.short[0] ? ` · ${c.short[0].name}` : ""}</span>}
                    {!!c?.portions && c.portions <= 5 && <span className="block mt-1 text-[11px] text-steel num">{c.portions} left in the pantry</span>}
                  </span>
                </motion.button>
                {/* the count lives on the dish, so a miscount is fixed where it happened */}
                <div className="flex items-center gap-2 pl-[68px] pr-2.5 pb-2.5">
                  <button type="button" onClick={() => takeOne(it)} disabled={qty === 0} aria-label={`One less ${it.name}`}
                    className="h-8 w-8 rounded-full border border-line grid place-items-center text-steel enabled:hover:bg-[var(--color-fill)] disabled:opacity-30"><Minus size={14} /></button>
                  <span className={cn("num text-sm tabular-nums w-5 text-center", qty ? "font-bold" : "text-steel")}>{qty}</span>
                  <button type="button" onClick={() => tap(it)} aria-label={`One more ${it.name}`}
                    className="h-8 w-8 rounded-full bg-ink text-on-label grid place-items-center"><Plus size={14} /></button>
                  <AnimatePresence>{qty > 0 && (
                    <motion.button type="button" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                      onClick={() => clearItem(it)} aria-label={`Take ${it.name} off the ticket`}
                      className="ml-auto h-8 w-8 rounded-full bg-[var(--color-fill)] grid place-items-center text-steel hover:text-[var(--color-red)]"><X size={14} /></motion.button>
                  )}</AnimatePresence>
                </div>
              </motion.div>
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
      {/* the question a dish asks: size, extras, how many */}
      <OptionChooser item={chooser?.item ?? null} initialQty={chooser?.qty ?? 1} initialNote={chooser?.note ?? ""} onClose={() => setChooser(null)}
        onAdd={(v, a, n, note) => { if (chooser) putLine(chooser.item, v, a, n, note, chooser.replace); }} />
    </div>
  );
}

/**
 * The dish's own picture where there is one, and a legible stand-in where there is not: the same
 * card either way, rather than a hole the day the owner has not uploaded sixty photographs.
 * The veg / non-veg mark sits on the corner of it, which is where Indian menus put it.
 */
function Thumb({ item }: { item: Item }) {
  return (
    <span className="relative h-14 w-14 rounded-2xl overflow-hidden shrink-0 grid place-items-center bg-[var(--color-fill)]">
      {item.image_url
        // eslint-disable-next-line @next/next/no-img-element -- owner-supplied URLs from any host; next/image would need every one allow-listed
        ? <img src={item.image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        : <span className="font-display text-xl text-steel select-none">{item.name.slice(0, 1).toUpperCase()}</span>}
      <span className={cn("absolute bottom-0.5 right-0.5 h-4 w-4 rounded-[5px] grid place-items-center", item.is_veg ? "bg-[var(--color-mint-2)]" : "bg-[var(--color-chili-2)]")}
        title={item.is_veg ? "Vegetarian" : "Non-vegetarian"}>
        {item.is_veg ? <Leaf size={9} className="text-mint" /> : <Drumstick size={9} className="text-chili" />}
      </span>
    </span>
  );
}
