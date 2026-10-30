"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dishMatch } from "@/lib/tillSearch";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Search, Send, AlertTriangle, Mic, MicOff, Sparkles, Loader2, X, Timer, SlidersHorizontal, Layers, ListOrdered, Armchair, UtensilsCrossed, UserRound, MessageSquarePlus, Clock, Check, MessageSquareText, Repeat, ShoppingBag, Bike, BedDouble, Utensils, Package, Trash2, IndianRupee, Maximize2, Eye } from "lucide-react";
import { Button, Sheet, cn, useToast, FlapMini } from "@/components/ui";
import { Say, CatIcon } from "@/components/ui/Say";
import { SVC_ICON, stClass } from "@/components/ui/Service";
import { catIcon } from "@/lib/say";
import { orderState, SVC_WORD } from "@/lib/service";
import { formatINR, fmtSince } from "@/lib/format";
import { DishImage } from "@/components/menu/DishImage";
import { Rail } from "@/components/ui/Rail";
import { placeOrder, parseOrder, phoneCard, setDelivery } from "../actions";
import { lookupCustomer } from "../../billing/actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { usePrinters } from "@/lib/print/usePrinter";
import { OptionChooser } from "@/components/OptionChooser";
import { hasOptions, defaultVariant, linePrice, lineKey, lineName, lineExtras, optionProblem, tilePrice, type Optioned, type Variant, type Addon } from "@dineflow/shared";
import Link from "next/link";

type Cat = { id: string; name: string };
type Item = Optioned & { prep_minutes?: number | null; is_veg: boolean; category_id: string | null; is_available: boolean; image_url: string | null; station?: string | null; categories?: { station: string | null } | null };
type Table = { id: string; name: string; status: string };
type Guest = { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null };
/** What the pantry can still cover, keyed by dish. A dish that is absent has no recipe: it moves no
 *  stock, so there is nothing true to say about it, and it is always sellable. */
type Cover = { portions: number; short: { name: string; unit: string; per: number; stock: number }[] };
type Running = { id: string; order_no: number; table_id: string | null; type?: string; token_no?: number | null; customer_name?: string | null; created_at: string; order_items: { qty: number; status: string }[]; dining_tables: { name: string } | null; bills?: { status: string }[] | null };

/** One line of the ticket: a dish with the size and extras it was chosen with. The same dish as
 *  Half and as Full is two lines. `ask` marks a line that still owes a required choice — a voice
 *  order can put a dish on the ticket before anyone has said which bread. */
type Line = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number; note: string; ask?: boolean; course: number };

/** the requests a kitchen hears most, to tap instead of type */
/** One dish's requests (the ticket-wide ones are QUICK_NOTES). Joined with " · " like the ticket note. */
const LINE_NOTES = ["Less spicy", "Extra spicy", "No onion", "No garlic", "Jain", "Parcel", "Well done", "No ice"];
const QUICK_NOTES = ["Less spicy", "Extra spicy", "No onion", "No garlic", "Jain", "Kids portion", "Serve together", "Pack separately"];

export function PosClient({ categories, items, tables, initialTable, initialType = null, inHouse = [], stock = {}, running = [], ai = false, promise = null, pairs = {}, popular = {}, notFree = {}, stockBlock = true }: { categories: Cat[]; items: Item[]; tables: Table[]; initialTable: string | null; initialType?: "takeaway" | "delivery" | null; inHouse?: Guest[]; stock?: Record<string, Cover>; running?: Running[]; ai?: boolean; promise?: { minutes: number; pct: number } | null; pairs?: Record<string, { id: string; n: number }[]>; popular?: Record<string, number>; notFree?: Record<string, "occupied" | "reserved" | "cleaning">; stockBlock?: boolean }) {
  const router = useRouter();
  // a parcel or a delivery starts from Orders' header button (?type=), a table from the floor (?table=)
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery" | "room_service">(initialType ?? "dine_in");
  const [room, setRoom] = useState("");
  const [tableId, setTableId] = useState<string | null>(initialTable);
  const [cat, setCat] = useState("all"); const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  /* The question a dish asks before it goes on the ticket. `replace` is the line being answered
     for — a voice-added dish that still owes a choice — and goes away when the answer lands. */
  const [chooser, setChooser] = useState<{ item: Item; replace?: string; qty?: number; note?: string; verb?: string; variant?: Variant | null; addons?: Addon[] } | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  /* a delivery's address (0105): typed, or filled from the customer's last one when the phone is known */
  const [address, setAddress] = useState("");
  useEffect(() => {
    if (type !== "delivery" || address || customer.phone.replace(/\D/g, "").length < 10) return;
    let on = true;
    phoneCard(customer.phone).then((r) => { if (!on || !("card" in r) || !r.card) return; const a = r.card.customer?.address || r.card.last_address; if (a) setAddress((x) => x || a); });
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the number or the order type changes
  }, [customer.phone, type]);
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
  /* a parcel's details (2026-10-24, the owner: "parcel needs more details"): when it is collected or sent, and how it is packed —
     printed on the kitchen ticket with the order's request ("Pickup by 7:45 PM · Cutlery") */
  const [pickup, setPickup] = useState<number | null>(null); const [packing, setPacking] = useState<string[]>([]);
  const parcelNote = () => {
    if (type !== "takeaway" && type !== "delivery") return [] as string[];
    const when = pickup === null ? null : pickup === 0 ? (type === "delivery" ? "Deliver now" : "Pickup now")
      : `${type === "delivery" ? "Deliver by" : "Pickup by"} ${new Date(Date.now() + pickup * 60000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
    return [when, ...packing].filter(Boolean) as string[];
  };
  /* Which lines have their note field showing. A line that already carries a note always shows it. */
  /* which line's request sheet is open — one sheet for the whole ticket, not a box inside every card */
  const [noteFor, setNoteFor] = useState<string | null>(null);
  /* Prices on the ticket are hidden until asked for (2026-10-30, the owner: "show the product prices and the total only when
     I tap"): the line prices, "₹x each" and the total. The dish count always shows. Remembered per device (df-pos-prices);
     read after mount, so the server's render and the first client render agree. */
  const [showPrices, setShowPrices] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("df-pos-prices") === "1") setShowPrices(true); } catch {} }, []);
  const togglePrices = () => { const next = !showPrices; setShowPrices(next); try { localStorage.setItem("df-pos-prices", next ? "1" : "0"); } catch {} };
  /* the roomy look at the whole ticket: every line with its stepper, course, request and options, and Send */
  const [preview, setPreview] = useState(false);

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
  const setCourse = (key: string, course: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, course } : l)));
  const courses = [...new Set(lines.map((l) => (coursing ? l.course : 1)))].sort();
  /** Tapping a tile — or + — puts the dish straight on the ticket (2026-10-23, the owner: "a tap on the card adds it; only
   *  Choose opens the choices"): a dish in sizes goes in its default size with no add-ons. Only a dish whose add-ons must be
   *  chosen (a group with a minimum) still opens its choices, so nothing half-ordered reaches the kitchen. */
  /* 0137 (2026-10-24, the owner: "if the pantry is short for a product, don't allow orders"): with the owner's switch on, a
     dish the pantry cannot make cannot be added, nor one more than it can make; the server refuses the same ticket anyway */
  const outOf = (it: Item, more = 1) => { const c = coverOf(it.id); return stockBlock && !!c && qtyOf(it.id) + more > c.portions; };
  const refuse = (it: Item) => { const c = coverOf(it.id)!; setErr(c.portions <= 0 ? `${it.name} is out of stock${c.short[0] ? ` — ${c.short[0].name} is finished` : ""}` : `Only ${c.portions} ${it.name} left in the pantry`); };
  const tap = (it: Item) => {
    if (outOf(it)) return refuse(it);
    if (!hasOptions(it)) return putLine(it, null, [], 1);
    if (optionProblem(it, [])) return setChooser({ item: it });
    putLine(it, defaultVariant(it), [], 1);
  };
  /** Choose: the dish's sizes and add-ons, always. */
  const choose = (it: Item) => { if (outOf(it)) return refuse(it); setChooser({ item: it }); };
  /* From the call screen (/orders/phone, ?from=phone): the caller, their address and, for "Same again", the dishes
     of an earlier order in their sizes — add-ons are asked again. Read once and cleared, so a reload starts clean. */
  useEffect(() => {
    if (new URLSearchParams(location.search).get("from") !== "phone") return;
    let h: { type: "delivery" | "takeaway"; name: string; phone: string; address: string; items: { menu_item_id: string | null; variant_id: string | null; qty: number }[] } | null = null;
    try { h = JSON.parse(sessionStorage.getItem("df-phone-order") ?? "null"); sessionStorage.removeItem("df-phone-order"); } catch {}
    if (!h) return;
    setType(h.type); setCustomer({ name: h.name ?? "", phone: h.phone ?? "" }); setAddress(h.address ?? "");
    for (const x of h.items ?? []) {
      const it = items.find((i) => i.id === x.menu_item_id); if (!it || !it.is_available) continue;
      putLine(it, it.variants?.find((v) => v.id === x.variant_id) ?? null, [], Math.max(1, Number(x.qty) || 1));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
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
      toast(n ? `${n} item${n > 1 ? "s" : ""} added${r.table_name ? ` · ${r.table_name}` : ""}` : "Nothing on the menu matched", n ? "ok" : "err");
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
    if (shortfalls.length > 0 && stockBlock) { setWarned(true); return setErr("Not enough in the pantry — reduce or remove the marked dishes"); }
    if (shortfalls.length > 0 && !warned) return setWarned(true);
    if (type === "room_service" && !room) return setErr("Pick the guest room");
    const label = type === "dine_in" ? (tables.find((t) => t.id === tableId)?.name ?? "Table") : type === "room_service" ? customer.name : type.replace("_", " ");
    const payload = { type, promise: promised, table_id: type === "dine_in" ? tableId : null, customer_name: customer.name || null, customer_phone: customer.phone || null, note: ([ticketNote.trim(), ...parcelNote()].filter(Boolean).join(" · ")) || null,
      items: lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, notes: l.note || undefined, variant_id: l.variant?.id ?? null, addon_ids: l.addons.map((a) => a.id), course: coursing ? l.course : 1 })) };

    // The kitchen ticket prints from this device, so it works with or without internet — one per
    // course, the held ones saying so, the way the server will hand them to the kitchen.
    try {
      const when = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      for (const c of courses) {
        const on = lines.filter((l) => (coursing ? l.course : 1) === c);
        // the ticket-wide request rides on the printed docket too, or the kitchen never sees it
        const course = courses.length > 1 ? (c > 1 ? `COURSE ${c} · HELD — fire from the kitchen screen` : "COURSE 1") : null;
        const whole = [ticketNote.trim(), ...parcelNote()].filter(Boolean).join(" · ");   // the parcel's pickup and packing print too
        const heading = [course, whole ? `** ${whole.toUpperCase()} **` : null].filter(Boolean).join(" · ") || undefined;
        await printKot({ kotNo: "KOT", when, tableOrType: label, heading,
          items: on.map((l) => ({ name: lineName(l.item, l.variant), qty: l.qty, note: l.note || null, extras: lineExtras({ addons: l.addons, components: l.item.components }), station: l.item.station ?? l.item.categories?.station ?? null })) });
      }
    } catch {
      // never block an order because a printer is off — but say so: a kitchen with no screen would never see it
      toast("Order saved, but the ticket didn't print. Check the printer and reprint.", "err");
    }

    if (!online) {
      // Offline: keep the order on this device and send it the moment the connection returns.
      // the delivery address goes with it, and is written onto the order as soon as the order lands (0109)
      await enqueue("place_order", { ...payload, client_id: crypto.randomUUID(), placed_at: new Date().toISOString(), delivery_address: type === "delivery" ? address.trim() || null : null }, `Order · ${label} · ${count} items`);
      setLines([]);
      router.push("/orders?queued=1");
      return;
    }
    const r = await placeOrder(payload);
    if ("error" in r) return setErr(r.error!);
    if (type === "delivery" && address.trim()) { const d = await setDelivery(r.orderId!, address.trim()); if ("error" in d) toast(`Order sent — but the address was not saved: ${d.error}. Add it on the order.`, "err"); }
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
  /* the strip at the top: the tables' open tickets for dine-in, the parcels' for a parcel or a delivery (2026-10-24, the owner:
     "a parcel page should not show table details") */
  const parcelLine = type === "takeaway" || type === "delivery";
  const lineOrders = running.filter((o) => parcelLine ? (o.type === "takeaway" || o.type === "delivery") : !!o.table_id);
  const clearTicket = () => { setLines([]); setTicketNote(""); setAskNote(false); setWarned(false); setErr(null); setPickup(null); setPacking([]); };
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
  /** The preview's Send: the same submit; when the table or the room is still missing the preview steps aside for the ticket that asks for it. */
  const sendFromPreview = () => {
    if ((type === "dine_in" && !tableId) || (type === "room_service" && !room)) { setPreview(false); return sendFromBar(); }
    submit();
  };
  /** where the ticket is going, in words, for the preview's title */
  const where = type === "dine_in" ? (tableName ? `Table ${tableName}` : "Dine in") : type === "takeaway" ? "Parcel" : type === "delivery" ? "Delivery" : "Room";
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
        {/* the guest (2026-10-30, the owner: "show it as an icon — tap to expand"): a round person beside Change, the
            name and phone open under the head; once given, the round key wears their initial in the tint (the name is its
            title) — a name on it pushed "Table T4" onto two lines */}
        {type === "dine_in" && (
          <button type="button" onClick={() => { setGuestOpen((v) => !v); setPickOpen(false); }} aria-expanded={guestOpen} data-guest
            aria-label={customer.name || customer.phone ? `Guest: ${customer.name || customer.phone} — change` : "Add guest (optional)"} title={customer.name || customer.phone || "Add guest (optional)"}
            className={cn("relative h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 rounded-full grid place-items-center shrink-0 font-display text-[18px] transition-colors",
              customer.name || customer.phone ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[var(--color-label-2)]",
              guestOpen && "ring-2 ring-offset-2 ring-offset-[var(--color-bg-2)] ring-[color-mix(in_srgb,var(--color-tint)_55%,transparent)]")}>
            {customer.name ? <span aria-hidden data-guest-initial>{customer.name.trim().slice(0, 1).toUpperCase()}</span> : <UserRound size={17} aria-hidden />}
          </button>
        )}
        {type === "dine_in" && (
          <button type="button" onClick={() => { setPickOpen((v) => !v); setGuestOpen(false); }} aria-expanded={pickOpen} data-pick-table
            className={cn("h-10 px-3.5 rounded-full text-[14px] font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors", tableName ? "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint)]")}>
            {tableName ? <Repeat size={15} aria-hidden /> : <Armchair size={15} aria-hidden />}<Say w={tableName ? "change" : "table"} /></button>
        )}
      </div>
      {/* the order type, only while nothing has settled it (2026-10-30, the owner: "when the order is taken from the order
          page, don't show the four buttons — the customer is already dining in"): a ticket for a table is dine-in, so the
          tiles go once a table is on it; counter, parcel, delivery and room still choose here. Change still switches table. */}
      {!(type === "dine_in" && tableId) && (
      <div className={cn("mt-3 grid gap-1.5", typeTiles.length > 3 ? "grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-label="Order type" data-order-type>
        {typeTiles.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)}
            className={cn("!min-h-12 rounded-[14px] px-1 flex items-center justify-center text-[13.5px] font-extrabold transition-colors min-w-0", typeTiles.length > 3 ? "flex-col gap-0.5 py-1.5" : "gap-1.5",
              type === t.value ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
            <t.Icon size={16} className="shrink-0" aria-hidden /><Say w={t.w} />
          </button>
        ))}
      </div>)}

      {/* lg+ (2026-10-24, the owner on an iPad in landscape: "screen broke the design" — the delivery details pushed Send to
          kitchen below the screen): everything between the order type and the footer scrolls as one, the footer stays.
          Below lg this wrapper is display:contents, so the phone and tablet sheet are exactly as they were. */}
      <div className="contents lg:flex lg:flex-col lg:!shrink lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:-mr-2 lg:pr-2 lg:[scrollbar-width:thin] [&>*]:shrink-0" data-cart-scroll>
      {type === "dine_in" ? (
        <>
          {/* A new order picks from the free tables only (2026-10-20, the owner): a table with an open order or marked
              occupied, one held for a booking (marked reserved, or due within two hours) and one being cleaned are left
              out — page.tsx works out `notFree`. The table this order already has always stays, so it can be seen. */}
          {pickOpen && (() => {
            const free = tables.filter((t) => !notFree[t.id] || t.id === tableId);
            const hidden = tables.length - free.length;
            return (
              <div className="mt-2" data-table-picker>
                {free.some((t) => t.id !== tableId)
                  ? <div className="grid grid-cols-5 gap-1.5">
                      {free.map((t) => <button key={t.id} type="button" onClick={() => { pickTable(t); setPickOpen(false); }} aria-pressed={tableId === t.id} data-free-table={t.name}
                        className={cn("h-11 px-1 rounded-xl text-[14px] font-bold border truncate", tableId === t.id ? "bg-ink text-on-label border-ink" : "border-line hover:bg-[var(--color-fill)]")}>{t.name}</button>)}
                    </div>
                  : <p className="rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-[13px] font-semibold" data-no-free-table>No free tables</p>}
                {hidden > 0 && <p className="mt-1.5 text-[12px] text-steel" data-hidden-tables>Free only · {hidden} hidden</p>}
              </div>);
          })()}
          {busy && (
            <div className="mt-2 rounded-xl border border-line bg-[var(--color-fill)] p-2.5 text-xs">
              <div className="font-semibold">{tables.find((t) => t.id === busy.table_id)?.name ?? "That table"} has #{busy.order_no} open</div>
              <div className="mt-2 flex gap-2">
                <Link href={`/orders/${busy.id}`} className="btn btn-gray !h-10 !text-xs flex-1 justify-center">Open #{busy.order_no}</Link>
                <button onClick={() => setBusy(null)} className="btn btn-outline !h-10 !text-xs flex-1">Start a separate one</button>
              </div>
            </div>
          )}
          {/* the guest, folded behind the head's person button: a phone number makes them a customer, and most tables never give one */}
          {guestOpen && (
            <div className="mt-3 grid grid-cols-2 gap-2" data-guest-fields>
              <input autoFocus placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              <input placeholder="Phone" inputMode="tel" className="num" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") setGuestOpen(false); }} />
            </div>
          )}
        </>
      ) : type === "room_service" ? (
        <select className="mt-3" value={room} onChange={(e) => { setRoom(e.target.value); const g = inHouse.find((x) => x.id === e.target.value); setCustomer({ name: g ? `Room ${g.rooms?.number} · ${g.guests?.full_name}` : "", phone: "" }); }}><option value="">Choose in-house guest</option>{inHouse.map((g) => <option key={g.id} value={g.id}>Room {g.rooms?.number} · {g.guests?.full_name}</option>)}</select>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-x-0">
          <input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="lg:!rounded-r-none lg:!text-[15px] lg:!px-3.5" data-cust-name />
          <input placeholder="Phone" inputMode="tel" className="num lg:!rounded-l-none lg:![border-left:1px_solid_var(--color-separator)] lg:!text-[15px] lg:!px-3.5" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} data-cust-phone />
          {type === "delivery" && <textarea placeholder="Delivery address" rows={2} className="col-span-2 lg:!text-[15px] lg:!px-3.5 lg:!py-2.5 lg:!min-h-[68px] lg:resize-none" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} data-delivery-address />}
          <div className="col-span-2 mt-1 space-y-2 lg:mt-1.5 lg:space-y-3" data-parcel-details>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.1em] text-steel mb-1.5 lg:inline-flex lg:items-center lg:gap-1.5"><Clock size={12} className="hidden lg:inline" aria-hidden />{type === "delivery" ? "Deliver" : "Pickup"}</div>
              <div className="flex flex-wrap gap-1.5 lg:grid lg:grid-cols-5 lg:gap-1 lg:p-1 lg:rounded-full lg:bg-[var(--color-fill)]" role="radiogroup" aria-label={type === "delivery" ? "Deliver when" : "Pickup when"}>
                {([[0, "Now"], [15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 hr"]] as const).map(([m, l]) => (
                  <button key={m} type="button" role="radio" aria-checked={pickup === m} onClick={() => setPickup(pickup === m ? null : m)} data-pickup={m}
                    className={cn("h-9 px-3 rounded-full text-[12.5px] font-bold transition-colors lg:px-0 lg:min-w-0 lg:whitespace-nowrap", pickup === m ? "bg-[var(--color-label)] text-[var(--color-on-label)] lg:shadow-[0_6px_14px_-8px_var(--color-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] lg:bg-transparent lg:hover:bg-[var(--color-bg-2)]")}>{l}</button>))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.1em] text-steel mb-1.5 lg:inline-flex lg:items-center lg:gap-1.5"><Package size={12} className="hidden lg:inline" aria-hidden />Packing</div>
              <div className="flex flex-wrap gap-1.5 lg:flex-nowrap lg:overflow-x-auto lg:[scrollbar-width:none] lg:-mr-2 lg:pr-6 lg:[mask-image:linear-gradient(90deg,black_calc(100%-28px),transparent)] lg:[-webkit-mask-image:linear-gradient(90deg,black_calc(100%-28px),transparent)]" data-packing-rail>
                {["Cutlery", "No cutlery", "Extra sauce", "Gravy separate", "Eco bag"].map((p) => { const on = packing.includes(p); return (
                  <button key={p} type="button" aria-pressed={on} onClick={() => setPacking((xs) => on ? xs.filter((x) => x !== p) : [...xs.filter((x) => !(p === "Cutlery" && x === "No cutlery") && !(p === "No cutlery" && x === "Cutlery")), p])} data-packing={p}
                    className={cn("h-9 px-3 rounded-full text-[12.5px] font-bold transition-colors inline-flex items-center gap-1 lg:shrink-0 lg:whitespace-nowrap", on ? "bg-[var(--color-green-2)] text-[var(--color-tint)] ring-1 ring-[var(--color-tint)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>{on && <Check size={13} aria-hidden />}{p}</button>); })}
              </div>
            </div>
          </div>
        </div>
      )}
      {known && type !== "room_service" && <div className="mt-1.5 text-[12px] text-steel">Welcome back{known.name ? `, ${known.name.split(" ")[0]}` : ""} · {known.visits} visit{known.visits === 1 ? "" : "s"}{known.notes ? ` · ${known.notes}` : ""}</div>}

      {/* the ticket's head (2026-10-30, the owner: "only icons"): the word and the count, then four round icons — prices,
          preview, courses, clear — so the head is one short row and the lines get the room */}
      <div className="mt-3 flex items-center gap-1 min-w-0" data-ticket-head>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate">Ticket</span>
          {count > 0 && <span className="num shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold tracking-normal text-[var(--color-label)] grid place-items-center" data-ticket-count={count}>{count}</span>}
        </span>
        <button type="button" onClick={togglePrices} aria-pressed={showPrices} aria-label="Show prices" title={showPrices ? "Hide prices" : "Show prices"} data-pos-prices={showPrices ? "on" : "off"}
          className={cn(HEAD_BTN, showPrices ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]")}><IndianRupee size={16} aria-hidden /></button>
        <button type="button" onClick={() => setPreview(true)} disabled={lines.length === 0} aria-haspopup="dialog" aria-label="Preview ticket" title="Preview ticket" data-pos-preview
          className={cn(HEAD_BTN, "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] disabled:opacity-40 disabled:pointer-events-none")}><Maximize2 size={16} aria-hidden /></button>
        <button type="button" onClick={() => setCoursing((v) => !v)} aria-pressed={coursing} aria-label="Courses" title="Courses — later courses wait to be fired" data-courses
          className={cn(HEAD_BTN, coursing ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]")}><ListOrdered size={16} aria-hidden /></button>
        {lines.length > 0 && <button type="button" onClick={clearTicket} aria-label="Clear ticket" title="Clear ticket" data-clear-ticket
          className={cn(HEAD_BTN, "-mr-1 text-steel hover:text-[var(--color-red)] hover:bg-[var(--color-red-2)]")}><Trash2 size={16} aria-hidden /></button>}
      </div>
      <div className="mt-2 space-y-2 !shrink flex-1 min-h-0 overflow-y-auto overscroll-contain -mr-2 pr-2 [scrollbar-width:thin] lg:!shrink-0 lg:min-h-fit lg:overflow-visible lg:mr-0 lg:pr-0 lg:pb-1" data-ticket-lines>
        <AnimatePresence initial={false}>
          {lines.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-1 rounded-2xl border border-dashed border-[var(--color-line-2)] grid place-items-center text-center px-6 py-8 lg:py-4 lg:px-4">
              <div className="lg:flex lg:items-center lg:gap-3 lg:text-left">
                <span className="mx-auto h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-steel lg:mx-0 lg:h-10 lg:w-10 lg:shrink-0"><UtensilsCrossed size={20} /></span>
                <div className="lg:min-w-0"><p className="mt-3 text-[15px] font-bold lg:mt-0">Ticket empty</p>
                <p className="mt-1 text-[13px] text-steel lg:mt-0.5">Tap a dish</p></div>
              </div>
            </motion.div>
          )}
          {lines.map((l) => {
            const nm = lineName(l.item, l.variant);
            return (
            /* one card per line (2026-10-30, a second pass — the owner: "compact, ultra-modern card, with its buttons"): the
               dish's photo (or its category's icon) with the veg mark on its corner, the name, what it is (size, extras), its
               request and — prices shown — what it comes to; under a hairline inside the card, the capsule stepper (its −
               becomes a bin at one) and the line's keys: Options for a dish with choices, its course, the request. */
            <motion.div key={l.key} layout initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }}
              className="tkt-line" data-ticket-line data-ask={l.ask || undefined}>
              <div className="flex items-start gap-2.5 min-w-0 p-2 pb-1.5">
                <span className="tkt-thumb" aria-hidden>
                  {l.item.image_url ? <DishImage src={l.item.image_url} w={96} /> : <CatIcon name={catIcon(catName(l.item.category_id))} size={19} />}
                  <span className="tkt-veg"><VegMark veg={l.item.is_veg} /></span>
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="font-bold text-[14.5px] leading-tight line-clamp-2 break-words" title={nm}>{nm}</div>
                  {lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <div key={j} className="mt-0.5 text-[12px] text-steel truncate">{x}</div>)}
                  {l.note && <div className="mt-0.5 text-[12px] font-semibold text-[var(--color-orange)] truncate" title={l.note} data-line-request>“{l.note}”</div>}
                  {coverOf(l.item.id) && qtyOf(l.item.id) > coverOf(l.item.id)!.portions && <div className="mt-0.5 text-[12px] font-semibold text-[var(--color-orange)]">pantry covers {coverOf(l.item.id)!.portions}</div>}
                  {l.ask && <button type="button" onClick={() => askFor(l)} className="mt-0.5 text-[12px] font-semibold text-[var(--color-orange)] underline !min-h-0">Choose options</button>}
                </div>
                {showPrices && <span className="text-right shrink-0 pt-0.5">
                  <span className="block font-display num text-[18px] leading-none" data-line-price>{formatINR(unit(l) * l.qty, { whole: true })}</span>
                  {l.qty > 1 && <span className="block mt-1 text-[11px] text-steel num" data-line-each>{formatINR(unit(l), { whole: true })} each</span>}
                </span>}
              </div>
              <div className="tkt-foot">
                <QtyStepper qty={l.qty} name={nm} onLess={() => bump(l.key, -1)} onMore={() => bump(l.key, 1)} slim />
                <span className="ml-auto flex items-center gap-1">
                  {hasOptions(l.item) && <button type="button" onClick={() => askFor(l)} aria-label={`Options for ${nm}`} title="Size and add-ons" data-line-options
                    className={cn(KEY_BTN, l.ask ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)]")}><SlidersHorizontal size={16} aria-hidden /></button>}
                  {coursing && <button type="button" onClick={() => cycleCourse(l.key)} title="Course — tap to change" aria-label={`Course ${l.course} — tap to change`}
                    className={cn(KEY_BTN, "!w-auto px-2.5 text-[11.5px] font-extrabold", l.course > 1 ? "bg-[color-mix(in_srgb,var(--color-tint)_16%,transparent)] text-[var(--color-tint)]" : "text-steel hover:bg-[var(--color-fill-2)]")}>C{l.course}</button>}
                  {/* the request, an icon on the line; amber once it carries words (the words sit under the name) */}
                  <button type="button" onClick={() => setNoteFor(l.key)} aria-label={`Request for ${nm}`} data-line-note-btn data-has-note={l.note ? "" : undefined} title={l.note || "Note"}
                    className={cn(KEY_BTN, l.note ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)]")}>
                    {l.note ? <MessageSquareText size={16} aria-hidden /> : <MessageSquarePlus size={16} aria-hidden />}</button>
                </span>
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </div>

      <div className="shrink-0 pt-3 mt-2 border-t border-line">
        {promise && (
          <button type="button" onClick={() => setPromised((v) => !v)} aria-pressed={promised}
            className={cn("mb-2 w-full flex items-center gap-3 rounded-2xl border p-2.5 text-left transition", promised ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-line hover:bg-[var(--color-fill)]")}>
            <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", promised ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-steel")}><Timer size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">On-time promise · {promise.minutes} min</span>
              <span className="block text-[11px] text-steel mt-0.5">{promised ? `+${promise.pct}% · free if late` : `Adds ${promise.pct}% · free if late`}</span>
            </span>
            <span className={cn("num text-xs font-semibold shrink-0", promised ? "text-[var(--color-tint)]" : "text-steel")}>{promised ? (showPrices ? `+${formatINR(total * promise.pct / 100)}` : "on") : "off"}</span>
          </button>
        )}
        {err && <p className="text-[15px] font-bold text-chili mb-2" data-till-error>{err}</p>}
        {warned && shortfalls.length > 0 && (
          <div className="mb-2 rounded-xl border border-[var(--color-orange)]/40 bg-[var(--color-orange-2)] p-2.5 text-xs">
            <div className="font-semibold text-[var(--color-orange)] flex items-center gap-1.5"><AlertTriangle size={13} /> {stockBlock ? "Not enough in the pantry" : "The pantry is short"}</div>
            <ul className="mt-1 space-y-0.5 text-steel">
              {shortfalls.map(({ item, qty, cover }) => <li key={item.id}>{item.name} · {qty} ordered, {cover!.portions} covered{cover!.short[0] ? ` (${cover!.short[0].name} is out)` : ""}</li>)}
            </ul>
            <p className="mt-1.5 text-steel">{stockBlock ? "Reduce or remove these to send." : "Shelf has it? Send anyway."}</p>
          </div>
        )}
        {coursing && courses.length > 1 && <p className="text-[11px] text-steel mb-2">Course 1 now · {courses.filter((c) => c > 1).map((c) => `Course ${c}`).join(" and ")} held</p>}
        {/* the request for the whole ticket opens in a dialog (an iPad keyboard squeezed it inline); the
            count and the total, big, on the same row */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setAskNote(true)} aria-haspopup="dialog" title={ticketNote || "One request for the whole ticket"} data-note-chip
            className={cn("min-w-0 h-10 rounded-full px-3 text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition",
              ticketNote ? "border-transparent bg-[var(--color-green-2)] text-[var(--color-tint)]" : "border-line text-steel hover:text-[var(--color-label)]")}>
            {ticketNote ? <MessageSquareText size={13} className="shrink-0" /> : <Plus size={12} className="shrink-0" />} <span className="truncate">{ticketNote ? ticketNote : "Cooking request"}</span>
          </button>
          {/* the count always; the total only with prices shown — a tap here shows or hides it, the same switch as the head's ₹ */}
          <button type="button" onClick={togglePrices} aria-pressed={showPrices} aria-label={showPrices ? "Hide total" : "Show total"} data-total-toggle
            className="ml-auto text-right shrink-0 !min-h-10 rounded-xl px-1.5 -mr-1.5 hover:bg-[var(--color-fill)] transition-colors">
            <span className={cn("block font-bold num", showPrices ? "text-[13px] text-steel" : "text-[17px] text-[var(--color-label)]")}>{count} dish{count === 1 ? "" : "es"}</span>
            {showPrices
              ? <span className="block font-display num text-[32px] leading-none mt-0.5" data-total>{formatINR(grand)}</span>
              : <span className="flex items-center justify-end gap-1 text-[11.5px] font-semibold text-steel mt-0.5"><Eye size={12} aria-hidden />Total</span>}
          </button>
        </div>
        <button type="button" className="svc-btn go xl w-full mt-3" disabled={pending || lines.length === 0 || (stockBlock && shortfalls.length > 0)} onClick={submit} data-send>
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
            <input ref={searchRef} className="!h-14 !rounded-[18px] !pl-12 !pr-16 !text-[16px]" placeholder="Search dishes" aria-label="Search dishes; Enter adds the first" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && visible[0]) { e.preventDefault(); tap(visible[0]); setQ(""); } else if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } }} />
            {q ? <button type="button" onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label="Clear the search" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 !min-h-0 rounded-xl grid place-items-center text-steel hover:text-[var(--color-label)]"><X size={17} /></button>
              : <kbd className="hidden lg:grid absolute right-3 top-1/2 -translate-y-1/2 h-6 min-w-6 px-1.5 place-items-center rounded-md border border-line text-[11px] text-steel pointer-events-none" aria-hidden>/</kbd>}
          </div>
        </div>

        {/* What is already running, at the top of the screen the waiter is standing in front of —
            "is table six done yet?" without the trip to Orders. Each ticket wears its state's colour,
            the same as the floor: ordered, cooking, food ready, eating, bill. */}
        {lineOrders.length > 0 && (
          <div className="mb-4" data-order-line={parcelLine ? "parcels" : "tables"}>
            <div className="flex items-center gap-2 mb-2">
              <span className="eyebrow">Order line</span>
              <span className="num h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{lineOrders.length}</span>
              <Link href="/orders" className="ml-auto inline-flex items-center min-h-11 pl-2 -my-3 text-xs font-semibold text-steel hover:text-[var(--color-label)]">All orders →</Link>
            </div>
            <Rail className="rail-fade flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]" arrowClassName="!bottom-2" label="Order line">
              {lineOrders.slice(0, 12).map((o) => {
                const n = (o.order_items ?? []).reduce((t, i) => t + Number(i.qty), 0);
                const s = orderState(o.order_items ?? [], (o.bills ?? []).some((b) => b.status === "unpaid")); const I = SVC_ICON[s];
                const step = s === "new" ? 1 : s === "cook" ? 2 : 3;
                return (
                  <Link key={o.id} href={`/orders/${o.id}`} data-line={s} className={cn("feather feather-lift shrink-0 w-52 p-3.5 flex flex-col gap-2", stClass(s))}
                    style={s === "ready" ? { background: "color-mix(in srgb, var(--color-green) 10%, var(--color-bg-2))", borderColor: "color-mix(in srgb, var(--color-green) 50%, transparent)" } : undefined}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-xl leading-tight truncate min-w-0">{o.dining_tables?.name ?? (o.token_no ? `Token ${o.token_no}` : o.customer_name || (o.type === "delivery" ? "Delivery" : "Parcel"))}</span>
                      <span className="svc-chip lone ml-auto shrink-0 !min-h-7 !text-[12px] !px-2.5 !gap-1.5"><I size={13} aria-hidden className={cn(s === "ready" && "animate-pulse")} /><Say w={SVC_WORD[s]} start /></span>
                    </div>
                    <div className="text-[11px] text-steel num flex items-center gap-1.5 min-w-0 whitespace-nowrap"><span>#{o.order_no}</span><span aria-hidden>·</span><span>{n} item{n === 1 ? "" : "s"}</span><span aria-hidden>·</span>{/* minutes ago: the server and the device can fall either side of a minute — React would log #418 and redraw */}<span className="inline-flex items-center gap-1 min-w-0 truncate" suppressHydrationWarning><Clock size={11} className="shrink-0" />{fmtSince(o.created_at)}</span></div>
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
                placeholder={online ? "Say or type order" : "Needs internet"} />
              {canHear && <button type="button" onClick={hear} disabled={!online || reading} aria-label={hearing ? "Stop listening" : "Speak the order"}
                className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0 transition", hearing ? "bg-[var(--color-red)] text-white" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)]")}>{hearing ? <MicOff size={16} /> : <Mic size={16} />}</button>}
              <Button type="submit" size="sm" disabled={!online || reading || !said.trim()}>{reading ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : "Add to ticket"}</Button>
            </form>
            {unresolved.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--color-orange)]/40 bg-[var(--color-orange-2)] px-3 py-2 text-xs">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--color-orange)]" />
                <span className="flex-1"><b className="text-[var(--color-orange)]">Not on the menu:</b> {unresolved.join(", ")} — tell the guest.</span>
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
                     button is not valid markup, and the dish has to stay a real button for the keyboard.
                     2026-10-21 (the owner, a second time: "not satisfied on desktop, laptop and iPad"; prices cut at a
                     card's foot on a phone): the move is on the photo — Add, or Choose for a dish with sizes or add-ons,
                     or − / + once it is on the ticket — centred on the photo's lower edge (.act, placed in container
                     units so it lands there at any card width); under it the veg mark and name, then the price, the
                     prep time and "customisable". No foot row: nothing sits at the card's edge to be cut, and a short
                     name leaves no hole. The whole card adds, at every width. */
                  <div key={it.id} className="svc-dish" data-tile data-on={qty > 0 || undefined} data-out={(stockBlock && c?.portions === 0) || undefined}>
                    <button type="button" onClick={() => tap(it)} className="!min-h-0 text-left flex flex-col flex-1 min-w-0 after:absolute after:inset-0 after:content-['']" aria-label={`${it.name} — add one`}>
                      <span className="pic" data-nophoto={!it.image_url || undefined}>
                        {it.image_url
                          ? <DishImage src={it.image_url} w={330} />
                          : <span className="absolute inset-0 grid place-items-center text-[var(--color-label-3)]"><CatIcon name={catIcon(catName(it.category_id))} size={34} /></span>}
                        {qty > 0 && <span className="qty qty-flap num" data-qty={qty}><FlapMini value={qty} tile="32px" tone="live" say={`${qty} on the ticket`} /></span>}
                        {c?.portions === 0 ? <span className="flag short"><AlertTriangle size={12} aria-hidden />{stockBlock ? "Out of stock" : "Pantry short"}</span>
                          : !!c?.portions && c.portions <= 5 ? <span className="flag num">{c.portions} left</span>
                          : it.is_combo ? <span className="flag"><Layers size={12} aria-hidden />Combo</span> : null}
                      </span>
                      <span className="flex flex-col flex-1 gap-1.5 px-3 pt-7 pb-3 min-w-0 max-sm:px-2.5 max-sm:pb-2.5">
                        {/* the name on one line (2026-10-21, the owner: "no double lines"): the full width — the veg mark moved down beside
                            the price — and a size down for a long name, so "Paneer butter masala" fits; past that, an ellipsis
                            and the whole name on hover */}
                        <span className={cn("block font-bold leading-snug truncate min-w-0", it.name.length <= 16 ? "text-[15px]" : it.name.length <= 22 ? "text-[13.5px]" : "text-[12.5px]")} title={it.name} data-tile-name>{it.name}</span>
                        {/* the same three lines on every card (2026-10-23, the owner: "the empty space looks awkward — even card
                            heights"): the price row never wraps, and the prep / customisable line is always there (blank when
                            there is nothing to say), so no card has a gap between its name and its price */}
                        <span className="flex items-center gap-1.5 min-w-0" data-tile-price>
                          <VegMark veg={it.is_veg} big />
                          {tp.from && <span className="text-[11.5px] font-semibold text-steel">from</span>}
                          <span className="font-display num text-[20px] leading-tight">{formatINR(tp.price, { whole: true })}</span>
                        </span>
                        <span className="block h-4 text-[11.5px] leading-4 font-semibold text-steel truncate min-w-0" data-tile-meta>
                          {it.prep_minutes ? <><span className="num">{it.prep_minutes}</span> min</> : null}{asks ? <>{it.prep_minutes ? " · " : ""}customisable</> : null}</span>
                      </span>
                    </button>
                    <div className="act">
                      {/* on the ticket, a dish with choices keeps its Choose chip beside − / + (2026-10-30, the owner: "once a
                          dish is added the choose option hides — show it too"): another one with a different size or
                          add-ons is a tap away, not only from the ticket's Options */}
                      {qty > 0
                        ? <div className={cn(asks && "dish-pair !gap-1.5")} data-on-ticket>
                            {asks && <button type="button" onClick={() => choose(it)} aria-label={`Choose options for ${it.name}`} title="Size and add-ons" data-choose className="dish-chip"><SlidersHorizontal size={17} strokeWidth={2.4} aria-hidden /></button>}
                            <div className="stepper shrink-0 !gap-1 rounded-full p-1 bg-[var(--color-bg-2)] shadow-[0_8px_20px_-10px_rgb(0_0_0/.6)] ring-1 ring-[var(--color-separator)]">
                              <button type="button" onClick={() => takeOne(it)} aria-label={`One less ${it.name}`} className="less !rounded-full !h-9 !w-9 !min-h-9"><Minus size={16} /></button>
                              <button type="button" onClick={() => tap(it)} aria-label={`One more ${it.name}`} className="more !rounded-full !h-9 !w-9 !min-h-9"><Plus size={17} /></button>
                            </div>
                          </div>
                        /* the move (2026-10-23, the owner: "compact, modern"): Add is a solid round + in the tint; a dish with
                           choices gets a slim "Choose" pill beside a +, so the card's tap adds and Choose opens the choices */
                        : asks
                          ? <div className="dish-pair">
                              <button type="button" onClick={() => choose(it)} aria-label={`Choose options for ${it.name}`} title="Size and add-ons" data-choose className="dish-chip"><SlidersHorizontal size={17} strokeWidth={2.4} aria-hidden /></button>
                              <button type="button" onClick={() => tap(it)} aria-label={`Add ${it.name}`} title="Add" data-add className="dish-plus"><Plus size={18} strokeWidth={2.8} aria-hidden /></button>
                            </div>
                          : <button type="button" onClick={() => tap(it)} aria-label={`Add ${it.name}`} title="Add" data-add className="dish-plus solo"><Plus size={18} strokeWidth={2.8} aria-hidden /></button>}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <p className="col-span-full text-sm text-steel py-8">No dishes match</p>}
            </div>
        </div>
      </section>
      <aside ref={railRef} className="hidden lg:block self-start feather !rounded-[24px] p-4 sticky top-[92px] h-[calc(100dvh-3rem)]">{CartPanel}</aside>
      {/* The phone and tablet bar: a green strip above the tab bar (on a tablet, near the edge) — how
          many and how much on the left, which opens the ticket, and Send to kitchen on the right. It
          is gone, not parked half-hidden, while the ticket is empty. */}
      <div className="lg:hidden fixed inset-x-4 z-30 bottom-[calc(var(--tabbar)+10px)] md:bottom-[max(16px,env(safe-area-inset-bottom))] pointer-events-none" data-cart-bar>
        <AnimatePresence>{count > 0 && (
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="pointer-events-auto w-full min-h-[72px] rounded-[22px] bg-[var(--color-tint)] text-[var(--color-on-tint)] flex items-center gap-2 p-2 shadow-[0_18px_40px_-16px_rgb(0_0_0/.7)]">
            <button type="button" onClick={() => setCartOpen(true)} className="!min-h-0 h-14 flex items-center gap-3 shrink-0 text-left rounded-2xl pl-1 pr-1" aria-label="See the ticket">
              {/* 2026-10-20: the dish count flips as dishes are added (Flap.tsx) */}<span className="h-11 min-w-11 px-1 grid place-items-center" data-cart-count={count}><FlapMini value={count} tile="34px" say={`${count} dishes`} /></span>
              {showPrices
                ? <span className="min-w-0 leading-tight"><span className="block text-[12.5px] font-bold opacity-75">{count === 1 ? "1 dish" : `${count} dishes`}</span><span className="block font-display num text-[24px] leading-none mt-0.5 whitespace-nowrap">{formatINR(total)}</span></span>
                : <span className="min-w-0 leading-tight font-bold text-[16px] whitespace-nowrap">{count === 1 ? "1 dish" : `${count} dishes`}</span>}
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
      {/* The whole ticket, roomy (2026-10-30, the owner: "one Preview option for the ordered section, with quantity adjust and
          choose options"): every line with the same capsule stepper, its course when courses are on, its request, Options for a
          dish with sizes or add-ons (the tile's own chooser, answering for that line) and Remove; the foot is the count, the
          total when prices are shown (a tap there shows or hides them, as the head's ₹ does) and the same Send to kitchen.
          Rendered after the phone's ticket sheet and before the request sheet and the chooser, so it opens over the one and
          under the others; while one of those is open, Escape and the scrim close that one only. */}
      <Sheet open={preview} onClose={() => { if (noteFor || chooser) return; setPreview(false); }} title={`Ticket · ${where}`} wide>
        <div data-pos-preview-sheet>
          {lines.length === 0
            ? <p className="py-6 text-center text-[14px] text-steel">Ticket empty</p>
            : <ul className="-mt-1">
                {lines.map((l) => { const nm = lineName(l.item, l.variant); const c = coverOf(l.item.id); return (
                  <li key={l.key} className="py-3.5 border-b border-[var(--color-separator)] last:border-b-0" data-preview-line>
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-1"><VegMark veg={l.item.is_veg} big /></span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[16.5px] leading-snug">{nm}</div>
                        {lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <div key={j} className="text-[13px] text-steel">{x}</div>)}
                        {c && qtyOf(l.item.id) > c.portions && <div className="text-[12.5px] font-semibold text-[var(--color-orange)]">pantry covers {c.portions}</div>}
                        {l.ask && <div className="text-[12.5px] font-semibold text-[var(--color-orange)]">Needs a choice — tap Options</div>}
                      </div>
                      {showPrices && <span className="text-right shrink-0">
                        <span className="block font-display num text-[20px] leading-none">{formatINR(unit(l) * l.qty, { whole: true })}</span>
                        {l.qty > 1 && <span className="block mt-1 text-[12px] text-steel num">{formatINR(unit(l), { whole: true })} each</span>}
                      </span>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7 min-w-0">
                      <QtyStepper qty={l.qty} name={nm} onLess={() => bump(l.key, -1)} onMore={() => bump(l.key, 1)} />
                      {coursing && (
                        <div role="radiogroup" aria-label={`Course for ${nm}`} className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-fill)] p-[3px] shrink-0" data-preview-course>
                          {[1, 2, 3].map((k) => (
                            <button key={k} type="button" role="radio" aria-checked={l.course === k} onClick={() => setCourse(l.key, k)}
                              className={cn("h-9 !min-h-9 min-w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:min-w-11 px-2 rounded-full text-[12.5px] font-bold transition-colors",
                                l.course === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-steel hover:text-[var(--color-label)]")}>C{k}</button>))}
                        </div>)}
                      {hasOptions(l.item) && (
                        <button type="button" onClick={() => setChooser({ item: l.item, replace: l.key, qty: l.qty, note: l.note, verb: "Update", variant: l.variant, addons: l.addons })} data-preview-options
                          className={cn(PILL, l.ask ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}><SlidersHorizontal size={15} className="shrink-0" aria-hidden />Options</button>)}
                      <button type="button" onClick={() => setNoteFor(l.key)} aria-label={`Request for ${nm}`} title={l.note || "Note"} data-preview-note
                        className={cn(PILL, "min-w-0 max-w-full", l.note ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                        {l.note ? <MessageSquareText size={15} className="shrink-0" aria-hidden /> : <MessageSquarePlus size={15} className="shrink-0" aria-hidden />}<span className="truncate">{l.note || "Note"}</span></button>
                      <button type="button" onClick={() => bump(l.key, -l.qty)} aria-label={`Remove ${nm}`} data-preview-remove
                        className={cn(PILL, "ml-auto text-steel hover:text-[var(--color-red)] hover:bg-[var(--color-red-2)]")}><X size={15} className="shrink-0" aria-hidden />Remove</button>
                    </div>
                  </li>); })}
              </ul>}
          {err && <p className="mt-3 text-[14px] font-bold text-chili" data-preview-error>{err}</p>}
          {warned && shortfalls.length > 0 && <p className="mt-2 text-[12.5px] font-semibold text-[var(--color-orange)]">{stockBlock ? "Not enough in the pantry — reduce or remove the marked dishes" : "The pantry is short — shelf has it? Send anyway."}</p>}
          {coursing && courses.length > 1 && <p className="mt-2 text-[12px] text-steel">Course 1 now · {courses.filter((k) => k > 1).map((k) => `Course ${k}`).join(" and ")} held</p>}
          <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" onClick={togglePrices} aria-pressed={showPrices} aria-label={showPrices ? "Hide total" : "Show total"} data-preview-total
              className="!min-h-14 rounded-2xl px-4 text-left bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors">
              <span className={cn("block font-bold num", showPrices ? "text-[12.5px] text-steel" : "text-[16px] text-[var(--color-label)]")}>{count} dish{count === 1 ? "" : "es"}</span>
              {showPrices
                ? <span className="block font-display num text-[24px] leading-none mt-0.5">{formatINR(grand)}</span>
                : <span className="flex items-center gap-1 text-[11.5px] font-semibold text-steel mt-0.5"><Eye size={12} aria-hidden />Total</span>}
            </button>
            <button type="button" className="svc-btn go xl w-full min-w-0" disabled={pending || lines.length === 0 || (stockBlock && shortfalls.length > 0)} onClick={sendFromPreview} data-preview-send>
              <Send size={20} aria-hidden />{pending ? "Sending…" : warned && shortfalls.length > 0 ? "Send anyway" : <Say w="send_kitchen" />}
            </button>
          </div>
        </div>
      </Sheet>
      {/* one dish's request: the floor's usual asks as chips, a box for the rest — in a sheet, so a
          phone keyboard never squeezes the ticket, and the line itself stays two rows tall */}
      {(() => { const ln = lines.find((l) => l.key === noteFor); const parts = (ln?.note ?? "").split(" · ").filter(Boolean); return (
        <Sheet open={!!ln} onClose={() => setNoteFor(null)} title={ln ? `Request · ${lineName(ln.item, ln.variant)}` : "Request"}>
          {ln && <div className="space-y-4" data-line-note>
            <p className="text-[13px] text-steel -mt-1">This dish only.</p>
            <div className="flex flex-wrap gap-2">
              {LINE_NOTES.map((n) => { const on = parts.includes(n); return (
                <button key={n} type="button" aria-pressed={on} onClick={() => setNote(ln.key, (on ? parts.filter((x) => x !== n) : [...parts, n]).join(" · "))} className={cn("chip", on && "on")}>{n}</button>); })}
            </div>
            <textarea rows={2} maxLength={120} value={ln.note} onChange={(e) => setNote(ln.key, e.target.value)} placeholder="Or type it…" className="w-full resize-none !text-[15px] leading-snug" />
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <Button type="button" variant="outline" onClick={() => setNote(ln.key, "")} disabled={!ln.note}>Clear</Button>
              <Button type="button" onClick={() => setNoteFor(null)} data-note-done><Check size={16} /> Done</Button>
            </div>
          </div>}
        </Sheet>); })()}
      <Sheet open={askNote} onClose={() => setAskNote(false)} title="Cooking request">
        <div className="space-y-4" data-note-sheet>
          <p className="text-[13px] text-steel -mt-1">Whole order</p>
          <div>
            <textarea autoFocus rows={3} maxLength={200} value={ticketNote} onChange={(e) => setTicketNote(e.target.value)}
              placeholder="All mild · no onion" className="w-full resize-none !text-[15px] leading-snug" />
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
      {/* the question a dish asks: size, extras, how many */}
      <OptionChooser item={chooser?.item ?? null} initialQty={chooser?.qty ?? 1} initialNote={chooser?.note ?? ""} initialVariant={chooser?.variant} initialAddons={chooser?.addons} onClose={() => setChooser(null)} verb={chooser?.verb}
        onAdd={(v, a, n, note) => {
          if (!chooser) return;
          // a line answered again (Options in the preview, or a voice line owing a choice) keeps its course
          const was = chooser.replace ? lines.find((l) => l.key === chooser.replace) : undefined;
          putLine(chooser.item, v, a, n, note, chooser.replace);
          if (was && was.course > 1) { const key = lineKey(chooser.item.id, v?.id, a.map((x) => x.id)); if (!lines.some((l) => l.key === key && l.key !== was.key)) setCourse(key, was.course); }
        }} />
    </div>
  );
}

/** A round icon button in the ticket's head and on a line: 36px under a mouse, 44px under a finger (the kit's :where() floor
 *  would lift it to 40 on a mouse, so the size is stated with ! here). */
/** A key on a ticket card's foot: 32px round under a mouse, 44 under a finger. */
const KEY_BTN = "h-8 w-8 !min-h-8 !min-w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!min-w-11 rounded-full grid place-items-center shrink-0 transition-colors";
const HEAD_BTN = "h-9 w-9 !min-h-9 !min-w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!min-w-11 rounded-full grid place-items-center shrink-0 transition-colors";
/** A worded pill in the preview (Options, Note, Remove). */
const PILL = "h-9 !min-h-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:!min-h-11 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold shrink-0 transition-colors";

/** How many of a line, as one capsule (2026-10-30, the owner: "compact, modern, perfectly fitting"): [ − n + ] on the fill,
 *  the count in the middle in tabular figures. At one the − is a bin and takes the line off — the only way to remove a line
 *  on the rail, so there are not two controls that look alike. 36px buttons under a mouse, 44px under a finger. */
function QtyStepper({ qty, name, onLess, onMore, slim }: { qty: number; name: string; onLess: () => void; onMore: () => void; slim?: boolean }) {
  const last = qty <= 1;
  // slim (the ticket card): 32px under a mouse; a finger still gets 44
  const btn = cn(slim ? "h-8 w-8 !min-h-8 !min-w-8" : "h-9 w-9 !min-h-9 !min-w-9", "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!min-w-11 rounded-full grid place-items-center transition-colors");
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-fill)] p-[3px] shrink-0" data-pos-stepper={qty}>
      <motion.button type="button" whileTap={{ scale: 0.86 }} onClick={onLess} aria-label={last ? `Remove ${name}` : `One less ${name}`} title={last ? "Remove" : "One less"} data-last={last || undefined}
        className={cn(btn, "less", last ? "text-[var(--color-red)] hover:bg-[var(--color-red-2)]" : "text-[var(--color-label)] hover:bg-[var(--color-fill-2)]")}>
        {last ? <Trash2 size={15} aria-hidden /> : <Minus size={16} strokeWidth={2.5} aria-hidden />}
      </motion.button>
      <span className="num tabular-nums min-w-7 px-0.5 text-center text-[15px] font-extrabold leading-none select-none" aria-live="polite">{qty}</span>
      <motion.button type="button" whileTap={{ scale: 0.86 }} onClick={onMore} aria-label={`One more ${name}`} title="One more"
        className={cn(btn, "more bg-[var(--color-label)] text-[var(--color-on-label)] hover:opacity-90")}>
        <Plus size={16} strokeWidth={2.5} aria-hidden />
      </motion.button>
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
