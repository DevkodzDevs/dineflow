"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MapPin, Phone, Clock, Percent, Check, ChevronLeft, ChevronRight, Minus, Plus, Bike, ShoppingBag, UtensilsCrossed, BedDouble, Users, CalendarDays, Building2, TreePalm, Trash2, User, Wallet, AlertCircle, Send, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { Button, Field, Segmented, Sheet, Select, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { DishImage } from "@/components/menu/DishImage";
import { slots as fetchSlots, reserve, placeOrder, trackToken } from "../actions";
import { OptionChooser } from "@/components/OptionChooser";
import { hasOptions, linePrice, lineKey, lineName, lineExtras, tilePrice, billTax, type Variant, type Addon, type AddonGroup } from "@dineflow/shared";
import { GuestNotice } from "@/components/legal/GuestNotice";
import { TableCalls } from "./TableCalls";
import { StoreCover, coverKind } from "./StoreCover";
import { DishArt } from "./DishArt";
import { TableOrders, keepTableOrder } from "./TableOrders";
import { reach } from "@/lib/reach";

/** As the storefront sends it: the add-on groups are carried once on the property, and a dish
 *  names the ones it offers by id. `resolve` below puts them back together for the screen. */
type RawItem = { id: string; name: string; price: number; gst_rate?: number | null; is_veg: boolean; description: string | null; available: boolean; online?: boolean; image_url?: string | null; image_credit?: string | null; variants?: Variant[]; addon_group_ids?: string[]; is_combo?: boolean; components?: { name: string; qty: number }[] };
type Item = Omit<RawItem, "addon_group_ids"> & { addon_groups?: AddonGroup[] };
/** One basket line: a dish with the size and extras it was chosen with. */
type CartLine = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number };
type Cat = { id: string; name: string; items: RawItem[] };
type Offer = { id: string; title: string; kind: string; value: number; scope: string; min_order: number; code: string | null; from_time?: string | null; to_time?: string | null; days?: number[] | null };
type D = { table?: { id: string; name: string; zone: string } | null; slug: string; name: string; type: string; tagline: string | null; addon_groups?: AddonGroup[]; cuisines: string[]; price_for_two: number | null; rating: number | null; rating_count: number; address: string | null; phone: string | null; photos: string[]; opens_at: string; closes_at: string; gst_rate: number; gst_collect?: boolean; dining: boolean; delivery: boolean; takeaway: boolean; rooms: boolean; min_order: number; delivery_fee: number; packing_charge: number; open_now: boolean; online_paused?: boolean; menu: Cat[]; offers: Offer[]; reviews: { guest: string; rating: number; body: string; reply: string | null; at: string }[] };
type Slot = { time: string; left: number; full: boolean; offer_id: string | null; offer: string | null; offer_pct: number | null };

const KIND_WORD = { restaurant: "Restaurant", hotel: "Hotel", resort: "Resort" } as const;
const KIND_ICON = { restaurant: UtensilsCrossed, hotel: Building2, resort: TreePalm } as const;

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
/** A refusal from the server, as a sentence for a guest — a database message nobody should read becomes "ask a waiter". */
const nice = (m: string) => /operator|function|relation|column|syntax|violates|null value|permission/i.test(m) ? "Something went wrong on our side — please try again, or ask a waiter." : m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
/* the kitchen notes a guest reaches for most — one tap puts it in, a second takes it out */
const QUICK_NOTES = ["Less spicy", "Extra spicy", "No onion", "No garlic", "Jain"];

export function StorefrontClient({ slug, d, initialSlots, tab, tableToken = null, busy = null }: { slug: string; d: D; initialSlots: Slot[]; tab: "book" | "order"; tableToken?: string | null; busy?: { paused_until: string | null; extra_min: number } | null }) {
  /* Reached from the code on a table: the menu is for ordering at that table and nothing else — no booking tab, no delivery, no address. */
  const atTable = !!(tableToken && d.table);
  const kind = coverKind(d.type, d.rooms); const KindIcon = KIND_ICON[kind];
  /* what the server refused, said on the page — public pages have no ToastProvider, so a toast here was silence */
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"book" | "order">(tableToken && d.table ? "order" : d.dining ? tab : "order");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ kind: "book" | "order"; data: Record<string, unknown> } | null>(null);

  /* ── table booking ── */
  const [date, setDate] = useState(today()); const [party, setParty] = useState(2);
  const [slotList, setSlotList] = useState<Slot[]>(initialSlots); const [slot, setSlot] = useState<Slot | null>(null);
  const [guest, setGuest] = useState({ full_name: "", phone: "", email: "" });
  const [occasion, setOccasion] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { start(async () => { const r = await reach(() => fetchSlots(slug, date, party)); if ("slots" in r) { setSlotList(r.slots as Slot[]); setSlot(null); } }); }, [slug, date, party]); // eslint-disable-line

  /* ── ordering ── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chooser, setChooser] = useState<Item | null>(null);
  const [omode, setOmode] = useState<"delivery" | "takeaway" | "dine_in">(tableToken && d.table ? "dine_in" : d.delivery ? "delivery" : "takeaway");
  const [addr, setAddr] = useState(""); const [cartOpen, setCartOpen] = useState(false);
  /* The groups arrive once; a dish names the ones it offers. Rebuilt here, so everything below —
     the tiles, the chooser, the pricing — sees a dish with its add-ons on it, as it always did. */
  const menu = useMemo(() => {
    const byId = new Map((d.addon_groups ?? []).map((g) => [g.id, g]));
    const resolve = (i: RawItem): Item => ({ ...i, addon_groups: (i.addon_group_ids ?? []).map((id) => byId.get(id)).filter((g): g is AddonGroup => !!g) });
    return d.menu.map((c) => ({ ...c, items: c.items.map(resolve) }));
  }, [d.menu, d.addon_groups]);
  const flat = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  /* 0132: a dish off online is not sold for delivery or takeaway — at the table it is; one the guest already added
     leaves the basket when they switch to delivery or takeaway (the server would drop it anyway) */
  const sells = (i: { available: boolean; online?: boolean }) => i.available && (omode === "dine_in" || i.online !== false);
  useEffect(() => { setCart((c) => c.filter((l) => sells(l.item))); }, [omode]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = cart.filter((l) => l.qty > 0 && sells(l.item));
  const sub = lines.reduce((t, l) => t + linePrice(l.item, l.variant, l.addons) * l.qty, 0);
  /* 0144: the offer the server honours — a flat % or a flat amount, on its days (0–6 from Sunday, 7 also Sunday) and
     between its hours, IST, for this kind of order — the one taking the most off. A happy hour or a free item takes
     nothing off here (it never did on the server; the page showed it off and the order then failed). GST to the paise
     as the server rounds it, the total to the rupee. */
  const offOf = (o: Offer) => (o.kind === "flat_pct" ? r2((sub * Number(o.value)) / 100) : Math.min(Number(o.value), sub));
  const ist = new Date(Date.now() + 5.5 * 3600e3); const dow = ist.getUTCDay(); const hms = ist.toISOString().slice(11, 19);
  const onNow = (o: Offer) => (o.kind === "flat_pct" || o.kind === "flat_amount") && (!o.days?.length || o.days.includes(dow) || (dow === 0 && o.days.includes(7))) && (!o.from_time || !o.to_time || (hms >= o.from_time && hms <= o.to_time));
  const bestOffer = d.offers.filter((o) => [omode === "dine_in" ? "dining" : "delivery", "both"].includes(o.scope) && sub >= Number(o.min_order) && onNow(o)).sort((a, b) => offOf(b) - offOf(a))[0];
  const disc = bestOffer ? offOf(bestOffer) : 0;
  const fee = omode === "dine_in" ? 0 : (omode === "delivery" ? Number(d.delivery_fee) : 0) + Number(d.packing_charge);
  /* 0146/0147: the bill's own sum (billTax = the database's bill_tax) — each dish at its own GST rate, packing and delivery
     taxed with the food, no GST where the property may not collect it — so the basket is the quote and the quote the bill */
  const tax = billTax(lines.map((l) => ({ rate: l.item.gst_rate ?? Number(d.gst_rate), amount: linePrice(l.item, l.variant, l.addons) * l.qty })), r2(sub - disc + fee), d.gst_collect !== false);
  const gst = r2(tax.cgst + tax.sgst);
  const gstRates = [...new Set(tax.lines.map((t) => t.rate))];
  const total = Math.round(sub - disc + fee + gst);
  const count = lines.reduce((t, l) => t + l.qty, 0);
  const qtyOf = (id: string) => cart.filter((l) => l.item.id === id).reduce((t, l) => t + l.qty, 0);
  const put = (item: Item, variant: Variant | null, addons: Addon[], n: number) => setCart((c) => {
    const key = lineKey(item.id, variant?.id, addons.map((a) => a.id)); const at = c.findIndex((l) => l.key === key);
    if (at < 0) return n > 0 ? [...c, { key, item, variant, addons, qty: n }] : c;
    const next = [...c]; const q = next[at].qty + n; if (q <= 0) next.splice(at, 1); else next[at] = { ...next[at], qty: q }; return next;
  });
  const bumpLine = (key: string, n: number) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + n } : l)).filter((l) => l.qty > 0));
  /** The tile's own + and −: a dish that asks a question opens it; − takes one off its last line, whichever size. */
  const add = (id: string, n: number) => {
    const item = flat.find((i) => i.id === id); if (!item) return;
    if (n > 0) { if (hasOptions(item)) setChooser(item); else put(item, null, [], n); }
    else { const last = [...cart].reverse().find((l) => l.item.id === id); if (last) bumpLine(last.key, n); }
  };

  /* The basket survives a trip away and back (2026-10-27: the privacy link, the browser's Back, a reload): this tab only,
     per place and table — the lines by id, the name, phone and note, and whether the sheet was open. */
  const bk = `df-basket:${slug}:${tableToken ?? ""}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(bk) ?? "null") as { lines?: { id: string; v: string | null; a: string[]; q: number }[]; guest?: typeof guest; note?: string; addr?: string; open?: boolean } | null;
      if (v) {
        const back = (v.lines ?? []).flatMap((l): CartLine[] => {
          const item = flat.find((i) => i.id === l.id); if (!item || !(l.q > 0)) return [];
          const variant = item.variants?.find((x) => x.id === l.v) ?? null; const addons = (item.addon_groups ?? []).flatMap((g) => g.addons).filter((a) => l.a.includes(a.id));
          return [{ key: lineKey(item.id, variant?.id, addons.map((a) => a.id)), item, variant, addons, qty: Math.min(99, l.q) }];
        });
        if (back.length) setCart(back);
        if (v.guest) setGuest((g) => ({ ...g, ...v.guest }));
        if (v.note) setNote(v.note); if (v.addr) setAddr(v.addr);
        if (v.open && back.length) setCartOpen(true);
      }
    } catch { /* nothing kept, or a private window */ }
    restored.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restored.current) return;
    try { sessionStorage.setItem(bk, JSON.stringify({ lines: cart.map((l) => ({ id: l.item.id, v: l.variant?.id ?? null, a: l.addons.map((a) => a.id), q: l.qty })), guest, note, addr, open: cartOpen })); } catch { /* full or private */ }
  }, [cart, guest, note, addr, cartOpen, bk]);
  useEffect(() => { setErr(null); }, [cartOpen, mode]);
  const toggleNote = (w: string) => setNote((n) => { const parts = n.split(",").map((x) => x.trim()).filter(Boolean); return (parts.includes(w) ? parts.filter((x) => x !== w) : [...parts, w]).join(", "); });

  /* at a table the guest stays on the menu: the basket empties and the order's live card takes the top (TableOrders);
     anywhere else the confirmation page, with its tracking link */
  const placeNow = () => start(async () => {
    setErr(null);
    const r = await reach(() => placeOrder(slug, { ...guest, address: addr }, lines.map((l) => ({ id: l.item.id, qty: l.qty, variant_id: l.variant?.id ?? null, addon_ids: l.addons.map((a) => a.id) })), omode, note, bestOffer?.id ?? null, atTable ? tableToken : null));
    if ("error" in r) { setErr(nice(r.error!)); return; }
    const o = r.order as Record<string, unknown>;
    if (atTable) { keepTableOrder(slug, tableToken!, String(o.id)); setCart([]); setNote(""); setCartOpen(false); }
    else { setCartOpen(false); setDone({ kind: "order", data: o }); }
  });

  if (done) return <Confirmation kind={done.kind} data={done.data} name={d.name} slug={slug} />;
  const tableBanner = atTable && (
    <div className="mb-5 rounded-2xl border border-[var(--color-tint)] bg-[var(--color-green-2)] px-4 py-3 flex items-center gap-3" data-table-banner>
      <UtensilsCrossed size={18} className="text-[var(--color-tint)] shrink-0" />
      <div className="min-w-0"><div className="font-semibold">Ordering at Table {d.table!.name}</div><div className="text-xs text-[var(--color-label-2)]">Place your order — it comes to your table. Pay when you&apos;re done.</div></div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-32">
      {/* hero: the property's photo, or a drawn cover for its kind (StoreCover, 2026-10-23) — glass controls on top,
          the name and the facts on glass chips at the foot; the page slides up over its bottom edge on a phone */}
      <header className="store-hero relative h-[17rem] md:h-80 overflow-hidden text-white" data-store-hero={kind}>
        <StoreCover kind={kind} photo={d.photos?.[0]} />
        <div className="absolute inset-0 store-cover-shade" />
        <div className="absolute top-0 inset-x-0 max-w-4xl mx-auto px-4 pt-4 flex items-center justify-between gap-3">
          {atTable ? <span /> : <Link href="/dine" aria-label="Back" className="h-11 w-11 rounded-full cover-glass grid place-items-center text-white active:scale-95 transition"><ChevronLeft size={20} /></Link>}
          <span className="cover-glass h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-semibold" data-store-kind><KindIcon size={14} aria-hidden /> {KIND_WORD[kind]}</span>
        </div>
        <div className="absolute bottom-0 inset-x-0 max-w-4xl mx-auto px-5 pb-10 sm:pb-6">
          <h1 className="font-display text-[36px] md:text-5xl leading-[1.02] [text-shadow:0_2px_18px_rgb(0_0_0/.45)]">{d.name}</h1>
          {d.tagline && <p className="mt-1 text-[14px] text-white/80 line-clamp-1">{d.tagline}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[12.5px] font-semibold" data-store-facts>
            {d.rating ? <span className="cover-glass h-8 px-2.5 rounded-full inline-flex items-center gap-1"><Star size={13} fill="currentColor" className="text-[var(--cv-star)]" aria-hidden /><span className="num">{d.rating}</span><span className="text-white/65 font-medium num">({d.rating_count})</span></span> : null}
            {d.cuisines?.length ? <span className="cover-glass h-8 px-2.5 rounded-full inline-flex items-center min-w-0 max-w-full"><span className="truncate">{d.cuisines.join(" · ")}</span></span> : null}
            {d.price_for_two ? <span className="cover-glass h-8 px-2.5 rounded-full inline-flex items-center"><span className="num">{formatINR(d.price_for_two, { whole: true })}</span>&nbsp;for two</span> : null}
            <span className="cover-glass h-8 px-2.5 rounded-full inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", d.open_now ? "bg-[var(--cv-open)] animate-pulse" : "bg-[var(--cv-closed)]")} aria-hidden />
              {d.open_now ? "Open now" : "Closed"}<span className="text-white/65 font-medium num">· {d.opens_at.slice(0, 5)}–{d.closes_at.slice(0, 5)}</span>
            </span>
          </div>
        </div>
      </header>

      {/* once the guest has an order here, its live card says where they are — the Ordering at Table banner steps aside */}
      <main className="relative max-w-4xl mx-auto px-5 py-5 -mt-5 sm:mt-0 rounded-t-[26px] sm:rounded-none bg-[var(--color-bg)] [&:has([data-table-orders])_[data-table-banner]]:hidden">
        {/* the property has switched online orders off, or paused them (0133): said before anyone fills a basket; a guest at
            a table (the QR) still orders */}
        {d.online_paused && !d.table && <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-orange)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-orange)_10%,var(--color-bg-2))] px-4 py-3 flex items-center gap-3 text-[14px] font-semibold" data-online-paused>
          <Clock size={18} className="shrink-0 text-[var(--color-orange)]" aria-hidden />Not taking online orders right now. Please check back soon.</div>}
        {/* Phone: address and phone as one contact card, each a full-width row with its own action
            (directions, call). Side by side they both wrapped mid-line. Wider screens keep the line. */}
        {d.address && (
          <div className="sm:hidden card !p-0 mb-4 overflow-hidden divide-y divide-[var(--color-separator)]">
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.name}, ${d.address}`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 min-h-[60px]">
              <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-green-2)] text-[var(--color-green)]"><MapPin size={18} /></span>
              <span className="flex-1 min-w-0 text-[14px] leading-snug text-[var(--color-label)] line-clamp-2">{d.address}</span>
              <span className="shrink-0 text-[13px] font-semibold text-[var(--color-green)]">Directions</span>
            </a>
            {d.phone && (
              <a href={`tel:${d.phone}`} className="flex items-center gap-3 px-4 py-3 min-h-[60px]">
                <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-blue-2)] text-[var(--color-blue)]"><Phone size={18} /></span>
                <span className="flex-1 min-w-0 num text-[15px] font-semibold text-[var(--color-label)] whitespace-nowrap">{d.phone}</span>
                <span className="shrink-0 h-9 px-4 rounded-full grid place-items-center text-[13px] font-semibold bg-[var(--color-label)] text-[var(--color-on-label)]">Call</span>
              </a>
            )}
          </div>
        )}
        {d.address && <div className="hidden sm:flex items-center gap-4 text-sm text-[var(--color-label-2)] mb-4"><span className="flex items-center gap-1.5"><MapPin size={14} /> {d.address}</span>{d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1.5 py-3 -my-3 hover:text-[var(--color-label)]"><Phone size={14} /> {d.phone}</a>}</div>}

        {d.offers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 [scrollbar-width:none]">
            {d.offers.map((o) => (
              <div key={o.id} className="card px-4 py-3 shrink-0 border-dashed !border-[var(--color-champagne)]">
                <div className="flex items-center gap-2 font-semibold text-sm"><Percent size={14} className="text-[var(--color-tint)]" /> {o.title}</div>
                <div className="text-xs text-[var(--color-label-2)] mt-0.5">{o.min_order > 0 ? `on orders above ${formatINR(o.min_order)}` : "on every order"}{o.code ? ` · code ${o.code}` : ""}</div>
              </div>
            ))}
          </div>
        )}

        {tableBanner}
        {!atTable && <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Segmented value={mode} onChange={setMode} options={[
            ...(d.dining ? [{ value: "book" as const, label: <span className="flex items-center gap-1.5"><UtensilsCrossed size={13} /> Book a table</span> }] : []),
            ...(d.delivery || d.takeaway ? [{ value: "order" as const, label: <span className="flex items-center gap-1.5"><Bike size={13} /> Order online</span> }] : []),
          ]} />
          {d.rooms && <Link href={`/book/${slug}`} className="chip"><BedDouble size={14} /> Book a room</Link>}
        </div>}

        {/* ── BOOK A TABLE ── */}
        {mode === "book" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="card p-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Date"><input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className="num" /></Field>
                <Field label="How many"><div className="flex gap-1.5 flex-wrap">{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <button key={n} onClick={() => setParty(n)} className={cn("chip !h-9 !px-3.5 min-w-11 justify-center", party === n && "on")}>{n}</button>)}</div></Field>
              </div>
              <div className="mt-5">
                <div className="eyebrow mb-2">Pick a time</div>
                {slotList.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">No times left today. Try tomorrow.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {slotList.map((s) => (
                      <button key={s.time} disabled={s.full} onClick={() => setSlot(s)}
                        className={cn("relative rounded-xl px-3.5 py-2 text-sm font-semibold transition border", slot?.time === s.time ? "bg-[var(--color-ink)] text-[var(--color-bg-2)] border-transparent" : "bg-[var(--color-bg-2)] border-[var(--color-separator)] hover:border-[var(--color-line-2)]", s.full && "opacity-35 line-through cursor-not-allowed")}>
                        {s.time}
                        {s.offer_pct ? <span className="absolute -top-2 -right-1.5 pill pill-gold !text-[10px] !py-0">{s.offer_pct}% off</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                {slot?.offer && <p className="text-sm mt-3 p-3 rounded-xl bg-[var(--color-champagne-2)]"><b>{slot.offer}</b> applies at {slot.time} — taken off your bill at the table.</p>}
              </div>
            </div>

            <AnimatePresence>{slot && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-5">
                <h2 className="text-xl mb-4">Your details</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Name"><input value={guest.full_name} onChange={(e) => setGuest({ ...guest, full_name: e.target.value })} /></Field>
                  <Field label="Phone"><input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className="num" /></Field>
                  <Field label="Occasion (optional)"><Select value={occasion} onChange={setOccasion} placeholder="Just dining" options={[{ value: "", label: "Just dining" }, { value: "Birthday", label: "🎂 Birthday" }, { value: "Anniversary", label: "💍 Anniversary" }, { value: "Business", label: "💼 Business meal" }, { value: "Family", label: "👨‍👩‍👧 Family get-together" }]} /></Field>
                  <Field label="Anything we should know"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Window table, high chair…" /></Field>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm border-t border-[var(--color-separator)] pt-3">
                  <span className="text-[var(--color-label-2)] flex items-center gap-1.5"><CalendarDays size={14} /> {date} · {slot.time} · <Users size={13} /> {party}</span>
                  {slot.offer_pct ? <span className="pill pill-gold">{slot.offer_pct}% off</span> : null}
                </div>
                {err && <div role="alert" className="mt-4 flex gap-2.5 rounded-[16px] bg-[var(--color-red-2)] text-[var(--color-red)] px-3.5 py-3 text-[13.5px] font-semibold" data-book-error><AlertCircle size={18} className="shrink-0 mt-px" aria-hidden />{err}</div>}
                <Button size="lg" className="w-full mt-4" loading={pending} disabled={!guest.full_name || !guest.phone}
                  onClick={() => start(async () => { const r = await reach(() => reserve(slug, guest, date, slot.time, party, occasion, note, slot.offer_id)); if ("error" in r) setErr(nice(r.error!)); else setDone({ kind: "book", data: r.booking as Record<string, unknown> }); })}>
                  Confirm booking
                </Button>
                <p className="text-xs text-[var(--color-label-3)] mt-2 text-center">Free to book, no card needed. Call the restaurant to cancel any time.</p>
                <GuestNotice property={d.name} use="for this booking" className="mt-1" />
              </motion.div>
            )}</AnimatePresence>
          </motion.div>
        )}

        {/* ── ORDER ONLINE ── */}
        {mode === "order" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* the kitchen's pace, said before a basket is filled — a guest at a table is never paused */}
            {/* at a table: call a waiter, ask for the bill or water, rate the meal (0103) */}
            {atTable && <TableOrders slug={slug} token={tableToken!} />}
            {atTable && <TableCalls slug={slug} token={tableToken!} table={d.table!.name} />}
            {!tableToken && busy?.paused_until && <div className="mb-5 rounded-2xl bg-[var(--color-red-2)] text-[var(--color-red)] px-4 py-3 text-sm"><b>Not taking online orders right now.</b> Back at {new Date(busy.paused_until).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} — the menu is here to look at.</div>}
            {!tableToken && !busy?.paused_until && (busy?.extra_min ?? 0) > 0 && <div className="mb-5 rounded-2xl bg-[rgb(255_179_64/.14)] text-[var(--color-orange)] px-4 py-3 text-sm"><b>The kitchen is busy.</b> Orders are taking about {busy!.extra_min} minutes longer than usual.</div>}
            {menu.map((c) => c.items.length > 0 && (
              <section key={c.id} className="mb-7">
                <div className="flex items-baseline gap-2 mb-3"><h2 className="text-xl">{c.name}</h2><span className="text-[12.5px] font-semibold text-[var(--color-label-3)] num">{c.items.length} {c.items.length === 1 ? "dish" : "dishes"}</span></div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {c.items.map((i) => <DishCard key={i.id} i={i} cat={c.name} sells={sells(i)} qty={qtyOf(i.id)} onAdd={() => add(i.id, 1)} onLess={() => add(i.id, -1)} />)}
                </div>
              </section>
            ))}
          </motion.div>
        )}

        {d.reviews.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl mb-3">What people said</h2>
            <div className="space-y-3">{d.reviews.slice(0, 5).map((v, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-center gap-2"><span className="pill pill-ready"><Star size={11} fill="currentColor" /> {v.rating}</span><span className="font-semibold text-sm">{v.guest ?? "Guest"}</span><span className="text-xs text-[var(--color-label-3)] ml-auto">{new Date(v.at).toLocaleDateString("en-IN")}</span></div>
                {v.body && <p className="text-sm mt-2">{v.body}</p>}
                {v.reply && <p className="text-sm mt-2 pl-3 border-l-2 border-[var(--color-champagne)] text-[var(--color-label-2)]"><b>Reply:</b> {v.reply}</p>}
              </div>))}</div>
          </section>
        )}
      </main>

      {/* The basket bar (2026-10-27, the owner: "not looking good"): one capsule in the page's ink — the bag with its count on a
          badge, the total large with what was saved under it, and View order as its own bright key. Gone while the sheet is up. */}
      <AnimatePresence>{mode === "order" && lines.length > 0 && !cartOpen && (
        <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] inset-x-3 z-40 max-w-xl mx-auto" data-basket-bar>
          <button type="button" onClick={() => setCartOpen(true)} aria-label={`View your order — ${count} item${count === 1 ? "" : "s"}, ${formatINR(total)}`}
            className="w-full h-[68px] rounded-[26px] px-2.5 flex items-center gap-3 bg-[var(--color-label)] text-[var(--color-on-label)] shadow-[0_22px_44px_-18px_rgb(0_0_0/.6)] active:scale-[.985] transition">
            <span className="relative h-12 w-12 shrink-0 rounded-[18px] grid place-items-center bg-[color-mix(in_srgb,var(--color-on-label)_12%,transparent)]" aria-hidden>
              <ShoppingBag size={21} />
              <motion.span key={count} initial={{ scale: .4 }} animate={{ scale: 1 }} className="absolute -top-1.5 -right-1.5 h-[22px] min-w-[22px] px-1 rounded-full grid place-items-center text-[11.5px] font-extrabold num bg-[var(--color-tint)] text-[var(--color-on-tint)] ring-2 ring-[var(--color-label)]" data-basket-count>{count}</motion.span>
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-display num text-[22px] leading-none" data-basket-total>{formatINR(total)}</span>
              <span className={cn("block mt-1 text-[12px] font-semibold truncate", disc > 0 ? "text-[color-mix(in_srgb,var(--color-tint)_55%,var(--color-on-label))]" : "opacity-70")}>{disc > 0 ? `You save ${formatINR(disc)}` : `${count} item${count === 1 ? "" : "s"} · with GST`}</span>
            </span>
            <span className="shrink-0 h-12 pl-4 pr-2.5 rounded-[18px] inline-flex items-center gap-0.5 text-[14.5px] font-bold bg-[var(--color-tint)] text-[var(--color-on-tint)]">View order<ChevronRight size={18} strokeWidth={2.6} aria-hidden /></span>
          </button>
        </motion.div>
      )}</AnimatePresence>

      {/* The order sheet (2026-10-27, the owner: "upgrade this design"): where it goes (the table as a card, or delivery /
          takeaway), each line a card with the food mark, its price and a 44px stepper (the bin at one), Add more; the bill
          on its own panel with To pay large and the saving as a chip; the guest's details with icons, the kitchen note with
          one-tap notes; how to pay; a refusal said in red right above the button; and Place order pinned to the foot with
          the total on it (the Sheet's own pinned footer). */}
      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your order">
        <div className="space-y-5" data-order-sheet>
          {atTable ? (
            <div className="flex items-center gap-3 rounded-[18px] bg-[var(--color-green-2)] px-3.5 py-3" data-sheet-table>
              <span className="h-11 w-11 rounded-[15px] grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] shrink-0" aria-hidden><UtensilsCrossed size={19} /></span>
              <span className="min-w-0"><span className="block text-[15.5px] font-bold leading-tight">Table {d.table!.name}</span><span className="block text-[12.5px] text-[var(--color-label-2)] mt-0.5">Dine-in · brought to your table</span></span>
            </div>
          ) : (d.delivery && d.takeaway) && <Segmented value={omode as "delivery" | "takeaway"} onChange={setOmode} className="w-full" options={[{ value: "delivery", label: "Delivery" }, { value: "takeaway", label: "Takeaway" }]} />}

          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-extrabold uppercase tracking-[.12em] text-[var(--color-label-2)]">{count} item{count === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => setCartOpen(false)} className="-my-2 -mr-2 h-11 px-3 rounded-full inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-tint)] hover:bg-[var(--color-fill)]" data-add-more><Plus size={15} strokeWidth={2.6} aria-hidden />Add more</button>
            </div>
            <div className="space-y-2" data-sheet-lines>
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-3 rounded-[18px] bg-[var(--color-bg)] border border-[var(--color-separator)] p-2.5 pl-3.5" data-sheet-line>
                  <FoodMark veg={l.item.is_veg} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-semibold leading-snug truncate">{lineName(l.item, l.variant)}</span>
                    {lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <span key={j} className="block text-[12px] text-[var(--color-label-2)] truncate">{x}</span>)}
                    <span className="block mt-0.5 text-[13.5px] font-bold num">{formatINR(linePrice(l.item, l.variant, l.addons) * l.qty)}</span>
                  </span>
                  <div className="flex items-center h-11 rounded-[14px] bg-[var(--color-fill)] shrink-0" data-sheet-stepper>
                    <button type="button" onClick={() => bumpLine(l.key, -1)} className="h-11 w-11 grid place-items-center rounded-[14px] active:scale-90 transition" aria-label={l.qty === 1 ? `Remove ${l.item.name}` : `One less ${l.item.name}`}>{l.qty === 1 ? <Trash2 size={16} className="text-[var(--color-red)]" /> : <Minus size={16} strokeWidth={2.6} />}</button>
                    <span className="num w-6 text-center text-[15px] font-bold" aria-live="polite">{l.qty}</span>
                    <button type="button" onClick={() => bumpLine(l.key, 1)} className="h-11 w-11 grid place-items-center rounded-[14px] active:scale-90 transition" aria-label={`One more ${l.item.name}`}><Plus size={16} strokeWidth={2.6} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[20px] bg-[var(--color-bg)] border border-[var(--color-separator)] p-4" data-sheet-bill>
            <div className="space-y-2 text-[14px]">
              <Row k="Item total" v={sub} />
              {disc > 0 && <Row k={bestOffer!.title} v={-disc} good />}
              {fee > 0 && <Row k={omode === "delivery" ? "Delivery & packing" : "Packing"} v={fee} />}
              {gst > 0 && <Row k={gstRates.length === 1 ? `GST ${gstRates[0]}%` : "GST"} v={gst} />}
            </div>
            <div className="mt-3 pt-3 border-t border-dashed border-[var(--color-line-2)] flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[12px] font-extrabold uppercase tracking-[.1em] text-[var(--color-label-2)]">To pay</span>
                {disc > 0 && <span className="mt-1 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)] num"><Check size={12} strokeWidth={3} aria-hidden />You save {formatINR(disc)}</span>}
              </span>
              <span className="font-display num text-[30px] leading-none" data-sheet-total>{formatINR(total)}</span>
            </div>
          </section>
          {!atTable && sub < Number(d.min_order) && <p className="text-sm text-[var(--color-red)]">Add {formatINR(Number(d.min_order) - sub)} more — the minimum order here is {formatINR(d.min_order)}.</p>}

          <section className="space-y-3" data-sheet-details>
            <span className="block text-[11.5px] font-extrabold uppercase tracking-[.12em] text-[var(--color-label-2)]">Your details</span>
            <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Field label="Name"><div className="relative"><User size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-label-3)] pointer-events-none" aria-hidden /><input aria-label="Name" autoComplete="name" value={guest.full_name} onChange={(e) => setGuest({ ...guest, full_name: e.target.value })} placeholder="Your name" className="!pl-11" /></div></Field>
              <Field label="Phone"><div className="relative"><Phone size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-label-3)] pointer-events-none" aria-hidden /><input aria-label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} placeholder="10-digit mobile" className="num !pl-11" /></div></Field>
            </div>
            {omode === "delivery" && <Field label="Delivery address"><textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Door number, street, landmark" /></Field>}
            <Field label="Note for the kitchen"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less spicy, no onion…" /></Field>
            <div className="flex gap-2 overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]" data-quick-notes>
              {QUICK_NOTES.map((w) => { const on = note.split(",").map((x) => x.trim()).includes(w); return (
                <button key={w} type="button" onClick={() => toggleNote(w)} aria-pressed={on} className={cn("shrink-0 h-11 px-3.5 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition", on ? "bg-[var(--color-label)] text-[var(--color-on-label)] border-transparent" : "border-[var(--color-separator)] text-[var(--color-label-2)] hover:border-[var(--color-line-2)]")}>
                  {on && <Check size={13} strokeWidth={3} aria-hidden />}{w}</button>); })}
            </div>
          </section>

          <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-fill)] px-3.5 py-3 text-[13px] text-[var(--color-label-2)]" data-pay-note>
            <Wallet size={18} className="shrink-0 text-[var(--color-label)]" aria-hidden />
            <span>{atTable ? "Pay at the table when you're done — cash, UPI or card." : `Pay on ${omode === "delivery" ? "delivery" : "pickup"} — cash, UPI or card. The restaurant confirms within a few minutes.`}</span>
          </div>
          {err && <div role="alert" className="flex gap-2.5 rounded-[16px] bg-[var(--color-red-2)] text-[var(--color-red)] px-3.5 py-3 text-[13.5px] font-semibold" data-order-error><AlertCircle size={18} className="shrink-0 mt-px" aria-hidden />{err}</div>}
          {(!guest.full_name || !guest.phone) && <p className="text-center text-[12.5px] text-[var(--color-label-3)]" data-order-needs>Add your name and phone to place the order</p>}
          <GuestNotice property={d.name} use="for this order" />
          <div>
            <button type="button" onClick={placeNow} disabled={pending || !guest.full_name || !guest.phone || (!atTable && sub < Number(d.min_order)) || (omode === "delivery" && !addr)}
              className="w-full h-14 rounded-[18px] pl-5 pr-2 flex items-center gap-3 bg-[var(--color-tint)] text-[var(--color-on-tint)] text-[16px] font-bold shadow-[0_16px_30px_-16px_color-mix(in_srgb,var(--color-tint)_90%,transparent)] disabled:opacity-45 active:scale-[.985] transition" data-place-order>
              {pending ? <LoaderCircle size={20} className="animate-spin shrink-0" aria-hidden /> : <Send size={18} className="shrink-0" aria-hidden />}
              <span className="flex-1 text-left">{pending ? "Placing…" : "Place order"}</span>
              <span className="h-10 px-3.5 rounded-[13px] grid place-items-center bg-[color-mix(in_srgb,var(--color-on-tint)_18%,transparent)] font-display num text-[19px]">{formatINR(total)}</span>
            </button>
          </div>
        </div>
      </Sheet>
      {/* the question a dish asks: size, extras, how many */}
      <OptionChooser item={chooser} withNote={false} onClose={() => setChooser(null)} onAdd={(v, a, q) => { if (chooser) put(chooser, v, a, q); }} />
    </div>
  );
}

/** The Indian food mark: a green square with a dot is vegetarian, a red one with a triangle is not. */
const FoodMark = ({ veg }: { veg: boolean }) => (
  <span role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"} className="h-[15px] w-[15px] shrink-0 rounded-[3px] border-[1.5px] grid place-items-center bg-[var(--color-bg-2)]" style={{ borderColor: veg ? "var(--color-green)" : "var(--color-red)" }}>
    {veg ? <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-green)]" /> : <span className="h-0 w-0 border-x-[4px] border-x-transparent border-b-[7px] border-b-[var(--color-red)]" />}
  </span>
);

/** + on a dish, or − n + once it is in the basket (2026-10-27, the owner: "no ADD — only a plus icon is enough"): a 44px
 *  round key in the tint, ringed in the card's colour, riding the photo's corner; the stepper sits centred under the photo.
 *  A dish that asks a question (a size, add-ons) opens the chooser on its own — it is never added blind. */
function AddControl({ name, qty, onAdd, onLess, custom }: { name: string; qty: number; onAdd: () => void; onLess: () => void; custom: boolean }) {
  return qty ? (
    <div className="flex items-center h-11 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] ring-[3px] ring-[var(--color-bg-2)] shadow-[0_12px_24px_-12px_color-mix(in_srgb,var(--color-tint)_85%,transparent)]" data-dish-stepper>
      <button type="button" onClick={onLess} className="h-11 w-11 grid place-items-center rounded-full active:scale-90 transition" aria-label={`One less ${name}`}><Minus size={17} strokeWidth={2.8} /></button>
      <span className="num w-5 text-center font-extrabold text-[15px]" aria-live="polite">{qty}</span>
      <button type="button" onClick={onAdd} className="h-11 w-11 grid place-items-center rounded-full active:scale-90 transition" aria-label={`One more ${name}`}><Plus size={17} strokeWidth={2.8} /></button>
    </div>
  ) : (
    <button type="button" onClick={onAdd} aria-label={`Add ${name}${custom ? " — choose options" : ""}`} data-dish-add
      className="h-11 w-11 rounded-full grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] ring-[3px] ring-[var(--color-bg-2)] shadow-[0_12px_24px_-12px_color-mix(in_srgb,var(--color-tint)_85%,transparent)] active:scale-90 hover:brightness-110 transition">
      <Plus size={22} strokeWidth={2.8} aria-hidden />
    </button>
  );
}

/** A dish on the storefront (2026-10-27, the owner: "the cards are not looking good"): the food mark (and Combo), the name on
 *  two lines at most, the description, then the price at the foot; a dish with choices says what it asks ("2 sizes ·
 *  add-ons") as a tappable line that opens the chooser. On the right always a picture — the photo, or the dish's drawn
 *  plate (DishArt) — with + on its corner. In the basket the card is ringed in the tint and says how many. */
function DishCard({ i, cat, sells, qty, onAdd, onLess }: { i: Item; cat: string; sells: boolean; qty: number; onAdd: () => void; onLess: () => void }) {
  const tp = tilePrice(i); const custom = hasOptions(i);
  const asks = [(i.variants?.length ?? 0) > 1 ? `${i.variants!.length} sizes` : null, (i.addon_groups?.length ?? 0) > 0 ? "add-ons" : null].filter(Boolean).join(" · ") || "Options";
  return (
    <article className={cn("relative flex gap-3 rounded-[22px] bg-[var(--color-bg-2)] p-2.5 ring-1 ring-[var(--color-separator)] shadow-[0_14px_32px_-26px_rgb(0_0_0/.55)] transition-shadow", qty > 0 && "!ring-2 !ring-[color-mix(in_srgb,var(--color-tint)_55%,transparent)]", !sells && "opacity-60")} data-dish-row>
      <div className="flex-1 min-w-0 flex flex-col pl-1.5 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap min-h-5">
          <FoodMark veg={i.is_veg} />
          {i.is_combo && <span className="h-5 px-2 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-[var(--color-violet-2)] text-[var(--color-violet)] inline-flex items-center">Combo</span>}
          {qty > 0 && <span className="h-5 px-2 rounded-full text-[10.5px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)] inline-flex items-center num" data-in-basket>{qty} in basket</span>}
        </div>
        {/* a div, not an h3: headings take the condensed display face, and a dish name reads better in the body face */}
        <div role="heading" aria-level={3} className="mt-1 text-[15.5px] font-bold leading-snug text-[var(--color-label)] line-clamp-2">{i.name}</div>
        {i.is_combo && (i.components?.length ?? 0) > 0 && <p className="mt-1 text-[12.5px] text-[var(--color-label-2)] line-clamp-2">Comes with {i.components!.map((c) => `${c.qty}× ${c.name}`).join(", ")}</p>}
        {i.description && <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--color-label-2)] line-clamp-2">{i.description}</p>}
        {/* the foot: the price, and what a dish with choices asks as a small chip beside it (a 44px target by its ::before) */}
        <div className="mt-auto pt-2 pb-0.5 flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
          <span className="inline-flex items-baseline gap-1">
            {tp.from && <span className="text-[11.5px] font-semibold text-[var(--color-label-2)]">from</span>}
            <span className="num text-[17px] font-bold text-[var(--color-label)]" data-dish-price>{formatINR(tp.price, { whole: true })}</span>
          </span>
          {custom && sells && <button type="button" onClick={onAdd} aria-label={`Choose ${asks} for ${i.name}`} className="relative h-7 px-2.5 rounded-full inline-flex items-center gap-1 text-[11.5px] font-bold bg-[color-mix(in_srgb,var(--color-orange)_14%,transparent)] text-[var(--color-orange)] max-w-full before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']" data-dish-options><SlidersHorizontal size={12} aria-hidden className="shrink-0" /><span className="truncate">{asks}</span></button>}
        </div>
      </div>
      <div className="relative shrink-0 w-[104px] sm:w-[124px] pb-2.5 self-start">
        {i.image_url
          ? <DishImage src={i.image_url} w={330} alt={i.name} title={i.image_credit ?? undefined} className={cn("h-[104px] sm:h-[124px] w-full rounded-[18px] object-cover bg-[var(--color-fill)]", !sells && "grayscale")} data-dish-photo />
          : <DishArt name={i.name} category={cat} veg={i.is_veg} dim={!sells} className="h-[104px] sm:h-[124px] w-full rounded-[18px]" />}
        {/* a library photo carries its author and licence (CC BY / BY-SA): illustrative, and credited */}
        {i.image_url && i.image_credit && <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] rounded-full bg-black/45 backdrop-blur-sm px-1.5 py-px text-[8.5px] leading-tight text-white/90 truncate" data-photo-credit>Illustrative · {i.image_credit.replace(/^Photo: /, "")}</span>}
        {!sells ? <div className="absolute bottom-1 inset-x-0 flex justify-center"><span className="pill pill-served" data-not-sold={i.available ? "online" : "out"}>{i.available ? "not online" : "sold out"}</span></div>
          : qty ? <div className="absolute bottom-0 -inset-x-2 flex justify-center"><AddControl name={i.name} qty={qty} onAdd={onAdd} onLess={onLess} custom={custom} /></div>
          : <div className="absolute bottom-0 -right-0.5"><AddControl name={i.name} qty={qty} onAdd={onAdd} onLess={onLess} custom={custom} /></div>}
      </div>
    </article>
  );
}

const Row = ({ k, v, good }: { k: string; v: number; good?: boolean }) => <div className="flex justify-between gap-3"><span className="min-w-0 truncate text-[var(--color-label-2)]">{k}</span><span className={cn("num shrink-0 font-semibold", good && "text-[var(--color-green)]")}>{v < 0 ? `− ${formatINR(-v)}` : formatINR(v)}</span></div>;

function Confirmation({ kind, data, name, slug }: { kind: "book" | "order"; data: Record<string, unknown>; name: string; slug: string }) {
  const d = data as never as { no?: number; ref?: string; date?: string; time?: string; party?: number; offer?: string; discount_pct?: number; total?: number; eta?: number; mode?: string; table?: string; accepted?: boolean; order_no?: number; phone?: string; address?: string; id?: string };
  return (
    <div className="min-h-dvh grid place-items-center p-6 aurora">
      <motion.div initial={{ opacity: 0, y: 14, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="material-thick p-8 max-w-md w-full text-center rounded-[28px]">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: .15, type: "spring", stiffness: 400, damping: 18 }} className="h-16 w-16 rounded-3xl bg-[var(--color-green-2)] grid place-items-center mx-auto text-[var(--color-green)]"><Check size={30} strokeWidth={3} /></motion.span>
        <h1 className="text-3xl mt-5">{kind === "book" ? <>Table <em>booked</em></> : <>Order <em>placed</em></>}</h1>
        <p className="text-[var(--color-label-2)] mt-1.5">{name}</p>
        <div className="card p-4 mt-5 text-left text-sm space-y-1.5">
          {kind === "book" ? (<>
            <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Reference</span><span className="num font-bold">#{d.no}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-label-2)]">When</span><span className="num">{d.date} · {d.time}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Party</span><span className="num">{d.party} people</span></div>
            {d.offer && <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Offer</span><span className="font-semibold">{d.offer}{d.discount_pct ? ` · ${d.discount_pct}% off` : ""}</span></div>}
          </>) : (<>
            <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Reference</span><span className="num font-bold">{d.ref}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-label-2)]">{d.mode === "delivery" ? "Arriving in" : "Ready in"}</span><span className="num">~{d.eta} min</span></div>
            <div className="flex justify-between text-base font-bold pt-1.5 border-t border-[var(--color-separator)]"><span>To pay</span><span className="num">{formatINR(Number(d.total ?? 0))}</span></div>
          </>)}
        </div>
        <p className="text-sm text-[var(--color-label-2)] mt-4">{kind === "book" ? "Show this number at the door — they already have your booking." : d.mode === "dine_in" ? (d.accepted ? `The kitchen has it${d.order_no ? ` as order #${d.order_no}` : ""}. It comes to Table ${d.table ?? ""}. Pay at the table when you are done.` : `The counter will confirm it in a moment and send it to the kitchen. It comes to Table ${d.table ?? ""}.`) : "The kitchen has it. Pay on delivery — cash, UPI or card."}</p>
        <div className="flex gap-2 mt-5">
          {d.phone && <a href={`tel:${d.phone}`} className="flex-1"><Button variant="gray" className="w-full"><Phone size={15} /> Call</Button></a>}
          {kind === "order" && d.mode !== "dine_in" && <TrackLink id={d.id} phone={d.phone} />}
          <Link href={`/dine/${slug}`} className="flex-1"><Button className="w-full">Done</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}

/** Track your order (0140): the link appears once the order's own token comes back for the phone that placed it. */
function TrackLink({ id, phone }: { id?: string; phone?: string }) {
  const [tok, setTok] = useState<string | null>(null);
  useEffect(() => { if (!id || !phone) return; void trackToken(id, phone).then((r) => { if ("token" in r && r.token) setTok(r.token); }); }, [id, phone]);
  if (!tok) return null;
  return <Link href={`/track/${tok}`} className="flex-1" data-track-link><Button variant="gray" className="w-full"><MapPin size={15} /> Track</Button></Link>;
}
