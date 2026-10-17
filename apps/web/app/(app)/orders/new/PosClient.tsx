"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dishMatch } from "@/lib/tillSearch";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Search, ChevronLeft, ChevronDown, Send, AlertTriangle, Mic, MicOff, Sparkles, Loader2, X, Timer, SlidersHorizontal, Layers, ListOrdered, Armchair, UtensilsCrossed, UserRound, MessageSquarePlus, Clock, Check, MessageSquareText, Repeat, ShoppingBag, Bike, BedDouble, Utensils } from "lucide-react";
import { Button, Sheet, cn, useToast } from "@/components/ui";
import { Say, CatIcon } from "@/components/ui/Say";
import { SVC_ICON, stClass } from "@/components/ui/Service";
import { catIcon } from "@/lib/say";
import { orderState, SVC_WORD } from "@/lib/service";
import { formatINR, fmtSince } from "@/lib/format";
import { Rail } from "@/components/ui/Rail";
import { placeOrder, parseOrder } from "../actions";
import { lookupCustomer } from "../../billing/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import { OptionChooser } from "@/components/OptionChooser";
import { hasOptions, defaultVariant, linePrice, lineKey, lineName, lineExtras, optionProblem, tilePrice, type Optioned, type Variant, type Addon } from "@dineflow/shared";
import Link from "next/link";

type Cat = { id: string; name: string };
type Item = Optioned & { is_veg: boolean; category_id: string | null; is_available: boolean; image_url: string | null; station?: string | null; categories?: { station: string | null } | null };
type Table = { id: string; name: string; status: string };
type Guest = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };
/** What the pantry can still cover, keyed by dish. A dish that is absent has no recipe: it moves no
 *  stock, so there is nothing true to say about it, and it is always sellable. */
type Cover = { portions: number; short: { name: string; unit: string; per: number; stock: number }[] };
type Running = { id: string; order_no: number; table_id: string; created_at: string; order_items: { qty: number; status: string }[]; dining_tables: { name: string } | null; bills?: { status: string }[] | null };

/** One line of the ticket: a dish with the size and extras it was chosen with. The same dish as
 *  Half and as Full is two lines. `ask` marks a line that still owes a required choice — a voice
 *  order can put a dish on the ticket before anyone has said which bread. */
type Line = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number; note: string; ask?: boolean; course: number };

/** the requests a kitchen hears most, to tap instead of type */
/** One dish's requests (the ticket-wide ones are QUICK_NOTES). Joined with " · " like the ticket note. */
const LINE_NOTES = ["Less spicy", "Extra spicy", "No onion", "No garlic", "Jain", "Parcel", "Well done", "No ice"];
const QUICK_NOTES = ["Less spicy", "Extra spicy", "No onion", "No garlic", "Jain", "Kids portion", "Serve together", "Pack separately"];

export function PosClient({ categories, items, tables, initialTable, initialType = null, inHouse = [], stock = {}, running = [], ai = false, promise = null, pairs = {}, popular = {} }: { categories: Cat[]; items: Item[]; tables: Table[]; initialTable: string | null; initialType?: "takeaway" | "delivery" | null; inHouse?: Guest[]; stock?: Record<string, Cover>; running?: Running[]; ai?: boolean; promise?: { minutes: number; pct: number } | null; pairs?: Record<string, { id: string; n: number }[]>; popular?: Record<string, number> }) {
  const router = useRouter();
  // a parcel or a delivery starts from Orders' header button (?type=), a table from the floor (?table=)
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery" | "room_service">(initialType ?? "dine_in");
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
  /* which line's request sheet is open — one sheet for the whole ticket, not a box inside every card */
  const [noteFor, setNoteFor] = useState<string | null>(null);

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

  /* The dishes on screen. Typing searches the whole menu whatever chip is on, best match first
     (dishMatch: the start of the name, of a word, initials — "cb" is Chicken Biryani), so Enter adds
     the top one. "Popular" is the 12 most-ordered here in the last 30 days, most first. */
  const popularIds = useMemo(() => Object.entries(popular).sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => items.some((i) => i.id === id && i.is_available)).slice(0, 12), [popular, items]);
  const visible = useMemo(() => {
    const live = items.filter((i) => i.is_available);
    if (q.trim()) return live.map((i) => [i, dishMatch(i.name, q)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([i]) => i);
    if (cat === "popular") return popularIds.map((id) => live.find((i) => i.id === id)!).filter(Boolean);
    return live.filter((i) => cat === "all" || i.category_id === cat);
  }, [items, cat, q, popularIds]);
  const searchRef = useRef<HTMLInputElement>(null);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const unit = (l: Line) => linePrice(l.item, l.variant, l.addons);
  const total = lines.reduce((s, l) => s + unit(l) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const coverOf = (id: string) => stock[id];
  /* Goes well with: what this property's own guests most often have on the same ticket as the
     dishes already on this one (menu_pairings, last 90 days). Scored across the ticket, so a
     biryani and a starter together pull up what goes with both. Never a dish already on it, never
     one that is sold out or the pantry cannot cover. */
  const goesWith = useMemo(() => {
    const on = new Set(lines.map((l) => l.item.id)); const score = new Map<string, number>();
    on.forEach((id) => (pairs[id] ?? []).forEach((p) => { if (!on.has(p.id)) score.set(p.id, (score.get(p.id) ?? 0) + p.n); }));
    const byId = new Map(items.map((i) => [i.id, i]));
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id))
      .filter((it): it is Item => !!it && it.is_available && !(stock[it.id] && stock[it.id].portions <= 0)).slice(0, 4);
  }, [lines, pairs, items, stock]);
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
          items: on.map((l) => ({ name: lineName(l.item, l.variant), qty: l.qty, note: l.note || null, extras: lineExtras({ addons: l.addons, components: l.item.components }), station: l.item.station ?? l.item.categories?.station ?? null })) });
      }
    } catch {
      // never block an order because a printer is off — but say so: a kitchen with no screen would never see it
      toast("The kitchen ticket did not print — the order is saved. Check the printer, then reprint it from the order.", "err");
    }

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

  /* the keyboard at a counter: "/" jumps to the search, Ctrl/⌘ + Enter sends the ticket */
  const submitRef = useRef(submit); submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitRef.current(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── the ticket rail ── */
  /* The table picker is a row that opens, not fourteen loose chips: a rail that is a third of the
     screen cannot afford a keypad above an empty ticket. Picking closes it again. */
  const [pickOpen, setPickOpen] = useState(false); const [guestOpen, setGuestOpen] = useState(false);
  const tableName = tables.find((t) => t.id === tableId)?.name ?? null;
  const clearTicket = () => { setLines([]); setTicketNote(""); setAskNote(false); setWarned(false); setErr(null); };
  const grand = total + (promised && promise ? total * promise.pct / 100 : 0);
  /* how the order leaves the kitchen, as four picture tiles (Room only while guests are in) */
  const typeTiles = [
    { value: "dine_in" as const, w: "dine_in" as const, Icon: Armchair }, { value: "takeaway" as const, w: "parcel" as const, Icon: ShoppingBag },
    { value: "delivery" as const, w: "delivery" as const, Icon: Bike },
    ...(inHouse.length ? [{ value: "room_service" as const, w: "room" as const, Icon: BedDouble }] : []),
  ];
  const typeWord = (typeTiles.find((t) => t.value === type) ?? typeTiles[0]).w;
  const title = type === "dine_in" ? (tableName ? `Table ${tableName}` : "Pick a table") : null;
  /* the three steps a new order goes through, shown on a phone or a tablet in portrait where the
     ticket is a sheet and not a column beside the dishes: 1 the table, 2 the dishes, 3 send */
  const tableDone = type !== "dine_in" || !!tableId;
  const openPicker = () => { setPickOpen(true); setGuestOpen(false); setCartOpen(true); };
  /** The bar's Send: straight to the kitchen when nothing is missing; otherwise the ticket opens with the reason on it. */
  const sendFromBar = () => {
    if ((type === "dine_in" && !tableId) || lines.some((l) => l.ask) || (shortfalls.length > 0 && !warned) || (type === "room_service" && !room)) setCartOpen(true);
    if (type === "dine_in" && !tableId) setPickOpen(true);
    submit();
  };
  const cats = [{ id: "all", name: "All", icon: "LayoutGrid" }, ...(popularIds.length >= 4 ? [{ id: "popular", name: "Popular", icon: "Star" }] : []), ...categories.map((c) => ({ ...c, icon: catIcon(c.name) }))];
  const catBtn = (c: { id: string; name: string; icon: string }, extra?: string) => (
    <button key={c.id} type="button" onClick={() => { setCat(c.id); setQ(""); }} data-cat={c.id} aria-pressed={cat === c.id && !q} className={cn("svc-cat", extra)}>
      <CatIcon name={c.icon} size={19} className={cn("shrink-0", c.id === "popular" && !(cat === c.id && !q) && "text-[var(--color-orange)]")} /><span className="nm">{c.name}</span>
    </button>
  );

  /* The rail is exactly as tall as the screen it is on, measured, not guessed. A fixed
     calc(100dvh - 3rem) was the viewport's height starting ~200px down the page, under the master
     banner and the search bar, so Total and Send to kitchen sat below the fold until you scrolled.
     Measured from the rail's own top on every scroll and resize; once it is stuck (top 24px) it is
     the viewport less a margin. Only the ticket lines scroll inside it. */
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = railRef.current; if (!el) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!el.offsetParent) return; // below lg the rail is hidden and the sheet is used instead
        // the sticky line sits under the shell's top bar (pinned at the top edge), not at 24px: there
        // the bar covered the rail's head — Dine in / Takeaway / Delivery / Room and the table — as
        // soon as the page scrolled. Measured, so a taller bar moves it. The dish column's search
        // row and category chips stick on the same line (--till-top, --till-head).
        const bar = document.querySelector<HTMLElement>("main header.material");
        // the bar pins at the top edge (it was 16px down, sticky top-4): its height plus a 12px gap
        const line = bar ? bar.offsetHeight + 12 : 24;
        el.style.top = `${line}px`;
        const box = el.parentElement; const head = box?.querySelector<HTMLElement>("[data-till-head]");
        box?.style.setProperty("--till-top", `${line}px`); box?.style.setProperty("--till-head", `${head?.offsetHeight ?? 56}px`);
        // capped at the dish column's own bottom: a rail taller than the column lengthens the page,
        // and the page then scrolls it up off its sticky line. Measured from the sticky line at the
        // least — a rail already pushed above it would otherwise measure from its pushed-up top,
        // keep its full height, and stay pushed.
        const top = Math.max(el.getBoundingClientRect().top, line);
        const floor = (el.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().bottom ?? Infinity;
        el.style.height = `${Math.max(360, Math.min(window.innerHeight - top - 16, floor - top))}px`;
      });
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true); // capture: the shell may scroll an inner element, not the window
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit, true); };
  }, []);

  const CartPanel = (
    /* every block keeps its height; the ticket lines (flex-1 min-h-0) are the only thing that gives */
    <div className="flex flex-col h-full min-h-0 [&>*]:shrink-0" data-cart>
      {/* where it is going, big — and the one button that changes it */}
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="font-display text-[26px] leading-none truncate min-w-0 flex-1" data-cart-title>{title ?? <Say w={typeWord} start />}</h2>
        {type === "dine_in" && (
          <button type="button" onClick={() => { setPickOpen((v) => !v); setGuestOpen(false); }} aria-expanded={pickOpen} data-pick-table
            className={cn("h-10 px-3.5 rounded-full text-[14px] font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors", tableName ? "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint)]")}>
            {tableName ? <Repeat size={15} aria-hidden /> : <Armchair size={15} aria-hidden />}<Say w={tableName ? "change" : "table"} /></button>
        )}
      </div>
      <div className={cn("mt-3 grid gap-1.5", typeTiles.length > 3 ? "grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-label="Order type" data-order-type>
        {typeTiles.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)}
            className={cn("!min-h-12 rounded-[14px] px-1 flex items-center justify-center text-[13.5px] font-extrabold transition-colors min-w-0", typeTiles.length > 3 ? "flex-col gap-0.5 py-1.5" : "gap-1.5",
              type === t.value ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
            <t.Icon size={16} className="shrink-0" aria-hidden /><Say w={t.w} />
          </button>
        ))}
      </div>

      {type === "dine_in" ? (
        <>
          {pickOpen && (
            <div className="mt-2 grid grid-cols-5 gap-1.5" data-table-picker>
              {tables.map((t) => <button key={t.id} type="button" onClick={() => { pickTable(t); setPickOpen(false); }} aria-pressed={tableId === t.id}
                className={cn("h-11 px-1 rounded-xl text-[14px] font-bold border truncate", tableId === t.id ? "bg-ink text-on-label border-ink" : t.status === "occupied" ? "bg-[var(--color-fill)] border-transparent text-steel" : "border-line hover:bg-[var(--color-fill)]")}>{t.name}</button>)}
            </div>
          )}
          {busy && (
            <div className="mt-2 rounded-xl border border-line bg-[var(--color-fill)] p-2.5 text-xs">
              <div className="font-semibold">{tables.find((t) => t.id === busy.table_id)?.name ?? "That table"} already has order #{busy.order_no} running.</div>
              <div className="mt-2 flex gap-2">
                <Link href={`/orders/${busy.id}`} className="btn btn-gray !h-10 !text-xs flex-1 justify-center">Open #{busy.order_no}</Link>
                <button onClick={() => setBusy(null)} className="btn btn-outline !h-10 !text-xs flex-1">Start a separate one</button>
              </div>
            </div>
          )}
          {/* the guest, folded: a phone number makes them a customer, and most tables never give one */}
          <button type="button" onClick={() => { setGuestOpen((v) => !v); setPickOpen(false); }} aria-expanded={guestOpen} data-guest
            className={cn("mt-2 !min-h-11 rounded-xl px-3 flex items-center gap-2 text-left text-[14px] transition-colors", customer.name || customer.phone ? "bg-[var(--color-fill)] font-semibold" : "text-steel hover:bg-[var(--color-fill)]")}>
            <UserRound size={16} className="shrink-0" aria-hidden /><span className="flex-1 truncate">{customer.name || customer.phone || "Guest name or phone (optional)"}</span><ChevronDown size={15} className={cn("shrink-0 transition-transform", guestOpen && "rotate-180")} />
          </button>
          {guestOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input autoFocus placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              <input placeholder="Phone" inputMode="tel" className="num" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") setGuestOpen(false); }} />
            </div>
          )}
        </>
      ) : type === "room_service" ? (
        <select className="mt-3" value={room} onChange={(e) => { setRoom(e.target.value); const g = inHouse.find((x) => x.id === e.target.value); setCustomer({ name: g ? `Room ${g.rooms?.number} · ${g.guests?.full_name}` : "", phone: "" }); }}><option value="">Choose in-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input placeholder="Phone" inputMode="tel" className="num" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
        </div>
      )}
      {known && type !== "room_service" && <div className="mt-1.5 text-[12px] text-steel">Welcome back{known.name ? `, ${known.name.split(" ")[0]}` : ""} · {known.visits} visit{known.visits === 1 ? "" : "s"}{known.notes ? ` · ${known.notes}` : ""}</div>}

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel flex-1">Ticket{count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}</span>
        <button type="button" onClick={() => setCoursing((v) => !v)} aria-pressed={coursing} title="Starters now, mains when the table is ready: every course after the first is held until the kitchen fires it"
          className={cn("h-9 rounded-full px-2.5 text-[11.5px] font-semibold flex items-center gap-1 transition", coursing ? "bg-ink text-on-label" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)]")}><ListOrdered size={12} /> Courses {coursing ? "on" : "off"}</button>
        {lines.length > 0 && <button type="button" onClick={clearTicket} className="h-9 px-2 -mr-1 text-[13px] font-semibold text-steel hover:text-[var(--color-red)]">Clear</button>}
      </div>
      <div className="mt-2 !shrink flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 -mr-2 pr-2 [scrollbar-width:thin]">
        <AnimatePresence initial={false}>
          {lines.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-dashed border-[var(--color-line-2)] grid place-items-center text-center px-6 py-8">
              <div>
                <span className="mx-auto h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-steel"><UtensilsCrossed size={20} /></span>
                <p className="mt-3 text-[15px] font-bold">Nothing on the ticket yet</p>
                <p className="mt-1 text-[13px] text-steel">Tap a dish to add it.</p>
              </div>
            </motion.div>
          )}
          {lines.map((l) => (
            /* one card per line: the veg mark, what it is and what it comes to; then how many, the
               course, the request and the cross — the shape a guest reads back to you */
            <motion.div key={l.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="rounded-2xl bg-[var(--color-fill)] p-3" data-ticket-line>
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-[3px]"><VegMark veg={l.item.is_veg} big /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] leading-snug">{lineName(l.item, l.variant)}</div>
                  {lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <div key={j} className="text-[12px] text-steel truncate">{x}</div>)}
                  {l.qty > 1 && <div className="text-[12px] text-steel num">{formatINR(unit(l), { whole: true })} each</div>}
                  {coverOf(l.item.id) && qtyOf(l.item.id) > coverOf(l.item.id)!.portions && <div className="text-[12px] font-semibold text-[var(--color-orange)]">pantry covers {coverOf(l.item.id)!.portions}</div>}
                  {l.ask && <button type="button" onClick={() => askFor(l)} className="mt-0.5 text-[12px] font-semibold text-[var(--color-orange)] underline !min-h-0">Choose options</button>}
                </div>
                <span className="font-display num text-[19px] leading-none shrink-0 mt-0.5">{formatINR(unit(l) * l.qty, { whole: true })}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 min-w-0">
                <div className="stepper shrink-0">
                  <button type="button" onClick={() => bump(l.key, -1)} aria-label="One less" className="less"><Minus size={16} /></button>
                  <span className="n num !text-[18px]">{l.qty}</span>
                  <button type="button" onClick={() => bump(l.key, 1)} aria-label="One more" className="more"><Plus size={16} /></button>
                </div>
                {coursing && <button type="button" onClick={() => cycleCourse(l.key)} title="Course — tap to change" className={cn("h-10 min-w-10 px-2 rounded-full text-[11px] font-bold border shrink-0", l.course > 1 ? "border-tint text-[var(--color-tint)]" : "border-line text-steel")}>C{l.course}</button>}
                {/* the request, on the line itself: amber with its words once set */}
                <button type="button" onClick={() => setNoteFor(l.key)} aria-label={`Request for ${lineName(l.item, l.variant)}`} data-line-note-btn title={l.note || undefined}
                  className={cn("ml-auto h-10 min-w-0 px-3 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 transition", l.note ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]")}>
                  {l.note ? <MessageSquareText size={14} className="shrink-0" /> : <MessageSquarePlus size={14} className="shrink-0" />}{l.note ? <span className="truncate max-w-[9rem]" data-line-request>{l.note}</span> : <Say w="note" />}</button>
                <button type="button" onClick={() => bump(l.key, -l.qty)} aria-label={`Remove ${lineName(l.item, l.variant)}`}
                  className="h-10 w-10 rounded-full grid place-items-center text-steel hover:text-[var(--color-red)] hover:bg-[var(--color-fill)] shrink-0"><X size={16} /></button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="shrink-0 pt-3 mt-2 border-t border-line">
        {promise && (
          <button type="button" onClick={() => setPromised((v) => !v)} aria-pressed={promised}
            className={cn("mb-2 w-full flex items-center gap-3 rounded-2xl border p-2.5 text-left transition", promised ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-line hover:bg-[var(--color-fill)]")}>
            <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", promised ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-steel")}><Timer size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">On-time promise · {promise.minutes} min</span>
              <span className="block text-[11px] text-steel mt-0.5">{promised ? `+${promise.pct}% on the food. Late and the whole bill is free.` : `Guest pays ${promise.pct}% more. If it is late, the food is free.`}</span>
            </span>
            <span className={cn("num text-xs font-semibold shrink-0", promised ? "text-[var(--color-tint)]" : "text-steel")}>{promised ? `+${formatINR(total * promise.pct / 100)}` : "off"}</span>
          </button>
        )}
        {err && <p className="text-[15px] font-bold text-chili mb-2" data-till-error>{err}</p>}
        {warned && shortfalls.length > 0 && (
          <div className="mb-2 rounded-xl border border-[var(--color-orange)]/40 bg-[var(--color-orange-2)] p-2.5 text-xs">
            <div className="font-semibold text-[var(--color-orange)] flex items-center gap-1.5"><AlertTriangle size={13} /> The pantry is short</div>
            <ul className="mt-1 space-y-0.5 text-steel">
              {shortfalls.map(({ item, qty, cover }) => <li key={item.id}>{item.name} · {qty} ordered, {cover!.portions} covered{cover!.short[0] ? ` (${cover!.short[0].name} is out)` : ""}</li>)}
            </ul>
            <p className="mt-1.5 text-steel">Send it anyway if the shelf says otherwise — the count is only as good as the last delivery someone logged.</p>
          </div>
        )}
        {coursing && courses.length > 1 && <p className="text-[11px] text-steel mb-2">Course 1 goes now. {courses.filter((c) => c > 1).map((c) => `Course ${c}`).join(" and ")} will wait on the kitchen screen until fired.</p>}
        {/* the request for the whole ticket opens in a dialog (an iPad keyboard squeezed it inline); the
            count and the total, big, on the same row */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setAskNote(true)} aria-haspopup="dialog" title={ticketNote || "One request for the whole ticket"} data-note-chip
            className={cn("min-w-0 h-10 rounded-full px-3 text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition",
              ticketNote ? "border-transparent bg-[var(--color-green-2)] text-[var(--color-tint)]" : "border-line text-steel hover:text-[var(--color-label)]")}>
            {ticketNote ? <MessageSquareText size={13} className="shrink-0" /> : <Plus size={12} className="shrink-0" />} <span className="truncate">{ticketNote ? ticketNote : "Cooking request"}</span>
          </button>
          <span className="ml-auto text-right shrink-0">
            <span className="block text-[13px] font-bold text-steel num">{count} dish{count === 1 ? "" : "es"}</span>
            <span className="block font-display num text-[32px] leading-none mt-0.5" data-total>{formatINR(grand)}</span>
          </span>
        </div>
        <button type="button" className="svc-btn go xl w-full mt-3" disabled={pending || lines.length === 0} onClick={submit} data-send>
          <Send size={20} aria-hidden />{pending ? "Sending…" : warned && shortfalls.length > 0 ? "Send anyway" : <Say w="send_kitchen" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_clamp(290px,31%,380px)] gap-6 -mx-4 md:mx-0 px-4 md:px-0">
      {/* minmax(0,1fr), not 1fr: a 1fr track refuses to go below its content's own minimum, and the
          wider dish cards were pushing the ticket off the right of the screen. The ticket rail is a
          clamp — about a third of the screen, never under 290 (its content floor) nor over 380. */}
      {/* At least a stuck rail's height (viewport less top-6 and the 16px foot), so the dish column
          is always long enough for the rail to stick in. */}
      <section className="min-w-0 lg:min-h-[calc(100dvh-2.5rem)]">
        {/* Back, where the order is going, and the search. On a tablet in landscape and up this row
            stays under the top bar as the dishes scroll; on a phone the steps and the search take
            their own full-width lines under it. */}
        <div data-till-head className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-3 lg:flex-nowrap lg:sticky lg:top-[var(--till-top,24px)] lg:z-10 lg:bg-[var(--color-bg)] lg:shadow-[0_-14px_0_var(--color-bg)] lg:-mt-2 lg:pt-2 lg:pb-3 lg:mb-1">
          <Link href="/orders" className="h-12 w-12 shrink-0 grid place-items-center rounded-2xl bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" aria-label="Back"><ChevronLeft size={22} /></Link>
          <div className="min-w-0 flex-1 lg:flex-none">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-steel leading-none">New order</div>
            <h1 className="font-display text-[28px] md:text-[32px] leading-none mt-1 truncate" data-till-title>{title ?? <Say w={typeWord} start />}</h1>
          </div>
          {type === "dine_in" && <button type="button" onClick={openPicker} className="lg:hidden h-11 px-3.5 rounded-full bg-[var(--color-fill)] text-[14px] font-bold inline-flex items-center gap-1.5 shrink-0"><Repeat size={15} aria-hidden /><Say w={tableName ? "change" : "table"} /></button>}
          <div className="svc-steps lg:!hidden basis-full order-2" data-steps>
            <button type="button" onClick={() => (type === "dine_in" ? openPicker() : setCartOpen(true))} className={cn("svc-step", tableDone ? "done" : "now")} data-step="1">
              {tableDone ? <Check size={16} aria-hidden /> : <Armchair size={16} aria-hidden />}<span className="shrink-0">1.</span>{type === "dine_in" && tableName ? <span className="truncate">{tableName}</span> : <Say w={type === "dine_in" ? "table" : typeWord} />}
            </button>
            <div className={cn("svc-step", count > 0 ? "done" : tableDone ? "now" : "")} data-step="2">{count > 0 ? <Check size={16} aria-hidden /> : <Utensils size={16} aria-hidden />}<span className="shrink-0">2.</span><Say w="dishes" /></div>
            <div className={cn("svc-step", count > 0 && "now")} data-step="3"><Send size={15} aria-hidden /><span className="shrink-0">3.</span><Say w="send" /></div>
          </div>
          {/* the search is what yields, not the title */}
          <div className="relative min-w-0 basis-full order-3 lg:order-none lg:basis-auto lg:flex-1 lg:max-w-xl lg:ml-auto" data-till-search><Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
            <input ref={searchRef} className="!h-14 !rounded-[18px] !pl-12 !pr-16 !text-[16px]" placeholder="Find a dish — name, or initials like “cb”" aria-label="Search dishes — a name, a word, or initials; Enter adds the first" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && visible[0]) { e.preventDefault(); tap(visible[0]); setQ(""); } else if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } }} />
            {q ? <button type="button" onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label="Clear the search" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 !min-h-0 rounded-xl grid place-items-center text-steel hover:text-[var(--color-label)]"><X size={17} /></button>
              : <kbd className="hidden lg:grid absolute right-3 top-1/2 -translate-y-1/2 h-6 min-w-6 px-1.5 place-items-center rounded-md border border-line text-[11px] text-steel pointer-events-none" aria-hidden>/</kbd>}
          </div>
        </div>

        {/* What is already running, at the top of the screen the waiter is standing in front of —
            "is table six done yet?" without the trip to Orders. Each ticket wears its state's colour,
            the same as the floor: ordered, cooking, food ready, eating, bill. */}
        {running.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="eyebrow">Order line</span>
              <span className="num h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{running.length}</span>
              <Link href="/orders" className="ml-auto inline-flex items-center min-h-11 pl-2 -my-3 text-xs font-semibold text-steel hover:text-[var(--color-label)]">All orders →</Link>
            </div>
            <Rail className="rail-fade flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]" arrowClassName="!bottom-2" label="Order line">
              {running.slice(0, 12).map((o) => {
                const n = (o.order_items ?? []).reduce((t, i) => t + Number(i.qty), 0);
                const s = orderState(o.order_items ?? [], (o.bills ?? []).some((b) => b.status === "unpaid")); const I = SVC_ICON[s];
                const step = s === "new" ? 1 : s === "cook" ? 2 : 3;
                return (
                  <Link key={o.id} href={`/orders/${o.id}`} data-line={s} className={cn("feather feather-lift shrink-0 w-52 p-3.5 flex flex-col gap-2", stClass(s))}
                    style={s === "ready" ? { background: "color-mix(in srgb, var(--color-green) 10%, var(--color-bg-2))", borderColor: "color-mix(in srgb, var(--color-green) 50%, transparent)" } : undefined}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-xl leading-tight truncate min-w-0">{o.dining_tables?.name ?? "Table"}</span>
                      <span className="svc-chip lone ml-auto shrink-0 !min-h-7 !text-[12px] !px-2.5 !gap-1.5"><I size={13} aria-hidden className={cn(s === "ready" && "animate-pulse")} /><Say w={SVC_WORD[s]} start /></span>
                    </div>
                    <div className="text-[11px] text-steel num flex items-center gap-1.5 min-w-0 whitespace-nowrap"><span>#{o.order_no}</span><span aria-hidden>·</span><span>{n} item{n === 1 ? "" : "s"}</span><span aria-hidden>·</span><span className="inline-flex items-center gap-1 min-w-0 truncate"><Clock size={11} className="shrink-0" />{fmtSince(o.created_at)}</span></div>
                    <div className="grid grid-cols-3 gap-1" aria-hidden data-steps={step}>{[1, 2, 3].map((k) => <span key={k} className="h-1 rounded-full" style={{ background: k <= step ? "var(--st)" : "var(--color-fill)" }} />)}</div>
                  </Link>
                );
              })}
            </Rail>
          </div>
        )}
        {ai && (
          <div className="mb-3">
            <form className={cn("feather flex items-center gap-2 p-2 pl-3.5", !online && "opacity-60")} onSubmit={(e) => { e.preventDefault(); void takeOrder(said); }}>
              <Sparkles size={16} className="text-[var(--color-tint)] shrink-0" />
              <input value={said} onChange={(e) => setSaid(e.target.value)} disabled={!online || reading} className="!border-0 !bg-transparent !shadow-none !px-1 flex-1 min-w-0"
                placeholder={online ? "Say or type the order — “two chicken biryani, one Jain, and a lime soda for table 4”" : "Taking orders by voice needs a connection"} />
              {canHear && <button type="button" onClick={hear} disabled={!online || reading} aria-label={hearing ? "Stop listening" : "Speak the order"}
                className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0 transition", hearing ? "bg-[var(--color-red)] text-white" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)]")}>{hearing ? <MicOff size={16} /> : <Mic size={16} />}</button>}
              <Button type="submit" size="sm" disabled={!online || reading || !said.trim()}>{reading ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : "Add to ticket"}</Button>
            </form>
            {unresolved.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--color-orange)]/40 bg-[var(--color-orange-2)] px-3 py-2 text-xs">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--color-orange)]" />
                <span className="flex-1"><b className="text-[var(--color-orange)]">Not on the menu:</b> {unresolved.join(", ")} — tell the guest, or add the dish in Menu.</span>
                <button type="button" onClick={() => setUnresolved([])} aria-label="Dismiss" className="text-steel hover:text-[var(--color-label)]"><X size={14} /></button>
              </div>
            )}
          </div>
        )}

        {/* The categories: one row across the top at every width — a picture and the word, as tabs. From lg
            the row stays put under the till's head as the dishes scroll. (A 96px column beside the dishes was
            tried first; the owner wanted the row.) */}
        <Rail wrapClassName="mb-3 lg:sticky lg:top-[calc(var(--till-top,24px)+var(--till-head,56px))] lg:z-10 lg:bg-[var(--color-bg)] lg:pt-1 lg:shadow-[0_8px_12px_-8px_var(--color-bg)]" className="rail-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]" arrowClassName="!bottom-1" label="Categories">
          {cats.map((c) => catBtn(c))}
        </Rail>
        <div className="min-w-0">
            {goesWith.length > 0 && (
              <Rail wrapClassName="mb-3" className="rail-fade flex items-center gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]" arrowClassName="!bottom-1" label="Goes well with">
                <span className="eyebrow shrink-0 flex items-center gap-1"><Sparkles size={12} className="text-[var(--color-tint)]" /> Goes well with</span>
                {goesWith.map((it) => (
                  <button key={it.id} type="button" onClick={() => tap(it)}
                    className="shrink-0 h-11 rounded-full pl-2.5 pr-3.5 flex items-center gap-1.5 text-sm font-semibold border border-dashed border-[var(--color-tint)] bg-[var(--color-green-2)] text-[var(--color-label)] hover:brightness-110 transition">
                    <Plus size={14} className="text-[var(--color-tint)]" />{it.name}<span className="num text-xs font-medium text-steel">{(() => { const tp = tilePrice(it); return `${tp.from ? "from " : ""}${formatINR(tp.price, { whole: true })}`; })()}</span>
                  </button>
                ))}
              </Rail>
            )}
            {q.trim() && <p className="mb-3 text-[13px] text-steel" data-search-note>{visible.length ? <>{visible.length} match{visible.length === 1 ? "" : "es"} for “{q.trim()}” · <b className="text-[var(--color-label)]">Enter</b> adds {visible[0].name}</> : <>Nothing matches “{q.trim()}”.</>}</p>}
            {/* Dishes as picture cards: the photo, the veg mark and the name, the price big and one Add.
                Once a dish is on the ticket its count sits on the photo and the Add becomes − and +.
                Two across on a phone, three on a tablet in portrait, as many 176px cards as fit beside
                the categories and the ticket from a tablet in landscape up. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 max-lg:pb-24" data-dish-grid>
              {visible.map((it) => {
                const qty = qtyOf(it.id); const tp = tilePrice(it); const asks = hasOptions(it); const c = coverOf(it.id);
                return (
                  /* The stepper is a sibling of the tap target, not a child of it: a button inside a
                     button is not valid markup, and the dish has to stay a real button for the keyboard. */
                  <div key={it.id} className="svc-dish" data-tile data-on={qty > 0 || undefined}>
                    <button type="button" onClick={() => tap(it)} className="!min-h-0 text-left flex flex-col min-w-0" aria-label={`${it.name} — add one`}>
                      <span className="pic" data-nophoto={!it.image_url || undefined}>
                        {it.image_url
                          // eslint-disable-next-line @next/next/no-img-element -- owner-supplied URLs from any host; next/image would need every one allow-listed
                          ? <img src={it.image_url} alt="" loading="lazy" decoding="async" />
                          : <span className="absolute inset-0 grid place-items-center text-[var(--color-label-3)]"><CatIcon name={catIcon(catName(it.category_id))} size={34} /></span>}
                        {qty > 0 && <span className="qty num">{qty}</span>}
                        {c?.portions === 0 ? <span className="flag short"><AlertTriangle size={12} aria-hidden />Pantry short</span>
                          : !!c?.portions && c.portions <= 5 ? <span className="flag num">{c.portions} left</span>
                          : it.is_combo ? <span className="flag"><Layers size={12} aria-hidden />Combo</span> : null}
                      </span>
                      <span className="flex items-start gap-2 px-3 pt-2.5 min-w-0"><span className="mt-[3px]"><VegMark veg={it.is_veg} big /></span><span className="font-bold text-[15px] leading-snug line-clamp-2 min-w-0">{it.name}</span></span>
                    </button>
                    <div className="mt-auto flex items-center gap-2 px-3 pb-3 pt-2 min-w-0">
                      <span className="font-display num text-[22px] leading-none min-w-0 truncate">{tp.from && <span className="font-sans text-[12px] text-steel">from </span>}{formatINR(tp.price, { whole: true })}</span>
                      {qty > 0
                        ? <div className="stepper ml-auto shrink-0 !gap-1.5">
                            <button type="button" onClick={() => takeOne(it)} aria-label={`One less ${it.name}`} className="less !rounded-xl"><Minus size={17} /></button>
                            <button type="button" onClick={() => tap(it)} aria-label={`One more ${it.name}`} className="more !rounded-xl"><Plus size={18} /></button>
                          </div>
                        : <button type="button" onClick={() => tap(it)} aria-label={`One more ${it.name}`} className="svc-add more ml-auto">{asks ? <SlidersHorizontal size={16} aria-hidden /> : <Plus size={18} aria-hidden />}<Say w={asks ? "choose" : "add"} /></button>}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <p className="col-span-full text-sm text-steel py-8">No dishes match. Check Menu → availability.</p>}
            </div>
        </div>
      </section>
      {/* one dish's request: the floor's usual asks as chips, a box for the rest — in a sheet, so a
          phone keyboard never squeezes the ticket, and the line itself stays two rows tall */}
      {(() => { const ln = lines.find((l) => l.key === noteFor); const parts = (ln?.note ?? "").split(" · ").filter(Boolean); return (
        <Sheet open={!!ln} onClose={() => setNoteFor(null)} title={ln ? `Request · ${lineName(ln.item, ln.variant)}` : "Request"}>
          {ln && <div className="space-y-4" data-line-note>
            <p className="text-[13px] text-steel -mt-1">For this dish only. It prints under the dish on the kitchen ticket.</p>
            <div className="flex flex-wrap gap-2">
              {LINE_NOTES.map((n) => { const on = parts.includes(n); return (
                <button key={n} type="button" aria-pressed={on} onClick={() => setNote(ln.key, (on ? parts.filter((x) => x !== n) : [...parts, n]).join(" · "))} className={cn("chip", on && "on")}>{n}</button>); })}
            </div>
            <textarea rows={2} maxLength={120} value={ln.note} onChange={(e) => setNote(ln.key, e.target.value)} placeholder="Or type it — less salt, extra raita…" className="w-full resize-none !text-[15px] leading-snug" />
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <Button type="button" variant="outline" onClick={() => setNote(ln.key, "")} disabled={!ln.note}>Clear</Button>
              <Button type="button" onClick={() => setNoteFor(null)} data-note-done><Check size={16} /> Done</Button>
            </div>
          </div>}
        </Sheet>); })()}
      <Sheet open={askNote} onClose={() => setAskNote(false)} title="Cooking request">
        <div className="space-y-4" data-note-sheet>
          <p className="text-[13px] text-steel -mt-1">One note for the whole ticket. It prints in capitals at the top of the kitchen ticket.</p>
          <div>
            <textarea autoFocus rows={3} maxLength={200} value={ticketNote} onChange={(e) => setTicketNote(e.target.value)}
              placeholder="All mild · no onion · serve everything together" className="w-full resize-none !text-[15px] leading-snug" />
            <div className="mt-1 text-right text-[11px] text-steel num">{ticketNote.length}/200</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel mb-2">Quick add</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_NOTES.map((q) => { const on = ticketNote.toLowerCase().includes(q.toLowerCase()); return (
                <button key={q} type="button" aria-pressed={on} onClick={() => setTicketNote((t) => on ? t.split(" · ").filter((x) => x.toLowerCase() !== q.toLowerCase()).join(" · ") : (t.trim() ? `${t.trim()} · ${q}` : q).slice(0, 200))}
                  className={cn("chip", on && "on")}>{on ? <Check size={13} /> : <Plus size={13} />} {q}</button>); })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" disabled={!ticketNote} onClick={() => setTicketNote("")}>Clear</Button>
            <Button onClick={() => { setTicketNote((t) => t.trim()); setAskNote(false); }}><Check size={16} /> Done</Button>
          </div>
        </div>
      </Sheet>
      <aside ref={railRef} className="hidden lg:block self-start feather !rounded-[24px] p-4 sticky top-[92px] h-[calc(100dvh-3rem)]">{CartPanel}</aside>
      {/* The phone and tablet bar: a green strip above the tab bar (on a tablet, near the edge) — how
          many and how much on the left, which opens the ticket, and Send to kitchen on the right. It
          is gone, not parked half-hidden, while the ticket is empty. */}
      <div className="lg:hidden fixed inset-x-4 z-30 bottom-[calc(max(10px,env(safe-area-inset-bottom))+78px)] md:bottom-[max(16px,env(safe-area-inset-bottom))] pointer-events-none" data-cart-bar>
        <AnimatePresence>{count > 0 && (
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="pointer-events-auto w-full min-h-[72px] rounded-[22px] bg-[var(--color-tint)] text-[var(--color-on-tint)] flex items-center gap-2 p-2 shadow-[0_18px_40px_-16px_rgb(0_0_0/.7)]">
            <button type="button" onClick={() => setCartOpen(true)} className="!min-h-0 h-14 flex items-center gap-3 shrink-0 text-left rounded-2xl pl-1 pr-1" aria-label="See the ticket">
              <span className="h-11 min-w-11 px-2 rounded-[14px] bg-black/15 grid place-items-center num text-[19px] font-black">{count}</span>
              <span className="min-w-0 leading-tight"><span className="block text-[12.5px] font-bold opacity-75">{count === 1 ? "1 dish" : `${count} dishes`}</span><span className="block font-display num text-[24px] leading-none mt-0.5 whitespace-nowrap">{formatINR(total)}</span></span>
            </button>
            <button type="button" onClick={sendFromBar} disabled={pending} className="!min-h-0 h-14 px-4 ml-auto rounded-2xl bg-[var(--color-on-tint)] text-[var(--color-tint)] font-black text-[16px] inline-flex items-center justify-center gap-2 flex-1 min-w-0 max-w-[15rem]" data-bar-send>
              <Send size={18} aria-hidden className="shrink-0" />{pending ? "Sending…" : <Say w="send_kitchen" />}
            </button>
          </motion.div>)}</AnimatePresence>
      </div>
      <AnimatePresence>
        {cartOpen && (<>
          <motion.div className="lg:hidden cursor-pointer fixed inset-0 z-40 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
          <motion.div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-[24px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] h-[85dvh]" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>{CartPanel}</motion.div>
        </>)}
      </AnimatePresence>
      {/* the question a dish asks: size, extras, how many */}
      <OptionChooser item={chooser?.item ?? null} initialQty={chooser?.qty ?? 1} initialNote={chooser?.note ?? ""} onClose={() => setChooser(null)}
        onAdd={(v, a, n, note) => { if (chooser) putLine(chooser.item, v, a, n, note, chooser.replace); }} />
    </div>
  );
}

/** The veg / non-veg mark the way Indian menus print it: a square with a dot (veg) or a triangle (non-veg) in it. */
function VegMark({ veg, big }: { veg: boolean; big?: boolean }) {
  return (
    <span className={cn("rounded-[3px] border-2 grid place-items-center shrink-0", big ? "h-4 w-4" : "h-3 w-3 !border", veg ? "border-[var(--color-mint)]" : "border-[var(--color-chili)]")} title={veg ? "Vegetarian" : "Non-vegetarian"} role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"}>
      {veg ? <span className={cn("rounded-full bg-[var(--color-mint)]", big ? "h-[7px] w-[7px]" : "h-1.5 w-1.5")} />
        : <span className="h-0 w-0 border-x-[4px] border-x-transparent border-b-[7px] border-b-[var(--color-chili)]" />}
    </span>
  );
}
