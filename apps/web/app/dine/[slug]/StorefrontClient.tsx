"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MapPin, Phone, Clock, Percent, Check, ChevronLeft, Minus, Plus, Bike, ShoppingBag, UtensilsCrossed, BedDouble, Users, CalendarDays, Building2, TreePalm } from "lucide-react";
import { Button, Field, Segmented, Sheet, Select, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { DishImage } from "@/components/menu/DishImage";
import { slots as fetchSlots, reserve, placeOrder } from "../actions";
import { OptionChooser } from "@/components/OptionChooser";
import { hasOptions, linePrice, lineKey, lineName, lineExtras, tilePrice, type Variant, type Addon, type AddonGroup } from "@dineflow/shared";
import { GuestNotice } from "@/components/legal/GuestNotice";
import { TableCalls } from "./TableCalls";
import { StoreCover, coverKind } from "./StoreCover";

/** As the storefront sends it: the add-on groups are carried once on the property, and a dish
 *  names the ones it offers by id. `resolve` below puts them back together for the screen. */
type RawItem = { id: string; name: string; price: number; is_veg: boolean; description: string | null; available: boolean; online?: boolean; image_url?: string | null; image_credit?: string | null; variants?: Variant[]; addon_group_ids?: string[]; is_combo?: boolean; components?: { name: string; qty: number }[] };
type Item = Omit<RawItem, "addon_group_ids"> & { addon_groups?: AddonGroup[] };
/** One basket line: a dish with the size and extras it was chosen with. */
type CartLine = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number };
type Cat = { id: string; name: string; items: RawItem[] };
type Offer = { id: string; title: string; kind: string; value: number; scope: string; min_order: number; code: string | null };
type D = { table?: { id: string; name: string; zone: string } | null; slug: string; name: string; type: string; tagline: string | null; addon_groups?: AddonGroup[]; cuisines: string[]; price_for_two: number | null; rating: number | null; rating_count: number; address: string | null; phone: string | null; photos: string[]; opens_at: string; closes_at: string; gst_rate: number; dining: boolean; delivery: boolean; takeaway: boolean; rooms: boolean; min_order: number; delivery_fee: number; packing_charge: number; open_now: boolean; online_paused?: boolean; menu: Cat[]; offers: Offer[]; reviews: { guest: string; rating: number; body: string; reply: string | null; at: string }[] };
type Slot = { time: string; left: number; full: boolean; offer_id: string | null; offer: string | null; offer_pct: number | null };

const KIND_WORD = { restaurant: "Restaurant", hotel: "Hotel", resort: "Resort" } as const;
const KIND_ICON = { restaurant: UtensilsCrossed, hotel: Building2, resort: TreePalm } as const;

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function StorefrontClient({ slug, d, initialSlots, tab, tableToken = null, busy = null }: { slug: string; d: D; initialSlots: Slot[]; tab: "book" | "order"; tableToken?: string | null; busy?: { paused_until: string | null; extra_min: number } | null }) {
  /* Reached from the code on a table: the menu is for ordering at that table and nothing else — no booking tab, no delivery, no address. */
  const atTable = !!(tableToken && d.table);
  const kind = coverKind(d.type, d.rooms); const KindIcon = KIND_ICON[kind];
  const toast = useToast();
  const [mode, setMode] = useState<"book" | "order">(tableToken && d.table ? "order" : d.dining ? tab : "order");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ kind: "book" | "order"; data: Record<string, unknown> } | null>(null);

  /* ── table booking ── */
  const [date, setDate] = useState(today()); const [party, setParty] = useState(2);
  const [slotList, setSlotList] = useState<Slot[]>(initialSlots); const [slot, setSlot] = useState<Slot | null>(null);
  const [guest, setGuest] = useState({ full_name: "", phone: "", email: "" });
  const [occasion, setOccasion] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { start(async () => { const r = await fetchSlots(slug, date, party); if ("slots" in r) { setSlotList(r.slots as Slot[]); setSlot(null); } }); }, [slug, date, party]); // eslint-disable-line

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
  const bestOffer = d.offers.filter((o) => [omode === "dine_in" ? "dining" : "delivery", "both"].includes(o.scope) && sub >= Number(o.min_order)).sort((a, b) => Number(b.value) - Number(a.value))[0];
  const disc = bestOffer ? (bestOffer.kind === "flat_pct" ? Math.round((sub * Number(bestOffer.value)) / 100) : Math.min(Number(bestOffer.value), sub)) : 0;
  const fee = omode === "dine_in" ? 0 : (omode === "delivery" ? Number(d.delivery_fee) : 0) + Number(d.packing_charge);
  const gst = Math.round(((sub - disc) * Number(d.gst_rate)) / 100);
  const total = Math.round(sub - disc + fee + gst);
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

  if (done) return <Confirmation kind={done.kind} data={done.data} name={d.name} slug={slug} />;
  const tableBanner = atTable && (
    <div className="mb-5 rounded-2xl border border-[var(--color-tint)] bg-[var(--color-green-2)] px-4 py-3 flex items-center gap-3">
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
          <Link href="/dine" aria-label="Back" className="h-11 w-11 rounded-full cover-glass grid place-items-center text-white active:scale-95 transition"><ChevronLeft size={20} /></Link>
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

      <main className="relative max-w-4xl mx-auto px-5 py-5 -mt-5 sm:mt-0 rounded-t-[26px] sm:rounded-none bg-[var(--color-bg)]">
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
                <Button size="lg" className="w-full mt-4" loading={pending} disabled={!guest.full_name || !guest.phone}
                  onClick={() => start(async () => { const r = await reserve(slug, guest, date, slot.time, party, occasion, note, slot.offer_id); if ("error" in r) toast(r.error!, "err"); else setDone({ kind: "book", data: r.booking as Record<string, unknown> }); })}>
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
            {atTable && <TableCalls slug={slug} token={tableToken!} table={d.table!.name} />}
            {!tableToken && busy?.paused_until && <div className="mb-5 rounded-2xl bg-[var(--color-red-2)] text-[var(--color-red)] px-4 py-3 text-sm"><b>Not taking online orders right now.</b> Back at {new Date(busy.paused_until).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} — the menu is here to look at.</div>}
            {!tableToken && !busy?.paused_until && (busy?.extra_min ?? 0) > 0 && <div className="mb-5 rounded-2xl bg-[rgb(255_179_64/.14)] text-[var(--color-orange)] px-4 py-3 text-sm"><b>The kitchen is busy.</b> Orders are taking about {busy!.extra_min} minutes longer than usual.</div>}
            {menu.map((c) => c.items.length > 0 && (
              <section key={c.id} className="mb-7">
                <div className="flex items-baseline gap-2 mb-3"><h2 className="text-xl">{c.name}</h2><span className="text-[12.5px] font-semibold text-[var(--color-label-3)] num">{c.items.length} {c.items.length === 1 ? "dish" : "dishes"}</span></div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {c.items.map((i) => <DishCard key={i.id} i={i} sells={sells(i)} qty={qtyOf(i.id)} onAdd={() => add(i.id, 1)} onLess={() => add(i.id, -1)} />)}
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

      {/* floating basket */}
      <AnimatePresence>{mode === "order" && lines.length > 0 && (
        <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] inset-x-3 z-40 max-w-4xl mx-auto">
          <button onClick={() => setCartOpen(true)} className="material-thick w-full rounded-[22px] px-5 py-3.5 flex items-center gap-3 shadow-[var(--shadow-pop)]">
            <ShoppingBag size={18} /><span className="font-semibold text-sm">{lines.reduce((t, l) => t + l.qty, 0)} item{lines.length > 1 ? "s" : ""}{disc > 0 && <span className="text-[var(--color-green)]"> · saved {formatINR(disc)}</span>}</span>
            <span className="ml-auto num font-bold">{formatINR(total)}</span><span className="pill pill-gold">View basket</span>
          </button>
        </motion.div>
      )}</AnimatePresence>

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your order">
        <div className="space-y-4">
          {atTable ? <p className="text-sm font-semibold">Table {d.table!.name} · dine-in</p> : (d.delivery && d.takeaway) && <Segmented value={omode as "delivery" | "takeaway"} onChange={setOmode} className="w-full" options={[{ value: "delivery", label: "Delivery" }, { value: "takeaway", label: "Takeaway" }]} />}
          <div className="divide-y divide-[var(--color-separator)]">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0 text-sm"><span className="block truncate">{lineName(l.item, l.variant)}</span>{lineExtras({ addons: l.addons, components: l.item.components }).map((x, j) => <span key={j} className="block text-xs text-[var(--color-label-2)] truncate">{x}</span>)}</span>
                <div className="flex items-center gap-1 bg-[var(--color-fill)] rounded-lg h-8 px-1">
                  <button onClick={() => bumpLine(l.key, -1)} className="h-6 w-6 grid place-items-center"><Minus size={13} /></button>
                  <span className="num w-5 text-center text-sm font-semibold">{l.qty}</span>
                  <button onClick={() => bumpLine(l.key, 1)} className="h-6 w-6 grid place-items-center"><Plus size={13} /></button>
                </div>
                <span className="num text-sm w-16 text-right">{formatINR(linePrice(l.item, l.variant, l.addons) * l.qty)}</span>
              </div>
            ))}
          </div>
          <div className="text-sm space-y-1 num border-t border-[var(--color-separator)] pt-3">
            <Row k="Item total" v={sub} />
            {disc > 0 && <Row k={bestOffer!.title} v={-disc} good />}
            {fee > 0 && <Row k={omode === "delivery" ? "Delivery & packing" : "Packing"} v={fee} />}
            <Row k={`GST ${d.gst_rate}%`} v={gst} />
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-[var(--color-label)]"><span>To pay</span><span>{formatINR(total)}</span></div>
          </div>
          {!atTable && sub < Number(d.min_order) && <p className="text-sm text-[var(--color-red)]">Add {formatINR(Number(d.min_order) - sub)} more — the minimum order here is {formatINR(d.min_order)}.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><input value={guest.full_name} onChange={(e) => setGuest({ ...guest, full_name: e.target.value })} /></Field>
            <Field label="Phone"><input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className="num" /></Field>
          </div>
          {omode === "delivery" && <Field label="Delivery address"><textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Door number, street, landmark" /></Field>}
          <Field label="Note for the kitchen"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less spicy, no onion…" /></Field>
          <p className="text-xs text-[var(--color-label-2)]">{atTable ? "Pay at the table — cash, UPI or card." : `Pay on ${omode === "delivery" ? "delivery" : "pickup"} — cash, UPI or card. The restaurant confirms within a few minutes.`}</p>
          <Button size="lg" className="w-full" loading={pending} disabled={!guest.full_name || !guest.phone || (!atTable && sub < Number(d.min_order)) || (omode === "delivery" && !addr)}
            onClick={() => start(async () => {
              const r = await placeOrder(slug, { ...guest, address: addr }, lines.map((l) => ({ id: l.item.id, qty: l.qty, variant_id: l.variant?.id ?? null, addon_ids: l.addons.map((a) => a.id) })), omode, note, bestOffer?.id ?? null, atTable ? tableToken : null);
              if ("error" in r) toast(r.error!, "err"); else { setCartOpen(false); setDone({ kind: "order", data: r.order as Record<string, unknown> }); }
            })}>Place order · {formatINR(total)}</Button>
            <GuestNotice property={d.name} use="for this order" className="mt-2" />
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

/** − n + on a dish, or Add: 44px tall, the buttons 44 wide, so a thumb lands on them. */
function AddControl({ name, qty, onAdd, onLess, custom }: { name: string; qty: number; onAdd: () => void; onLess: () => void; custom: boolean }) {
  return qty ? (
    <div className="flex items-center h-11 rounded-[14px] bg-[var(--color-tint)] text-[var(--color-on-tint)] shadow-[0_10px_22px_-12px_color-mix(in_srgb,var(--color-tint)_80%,transparent)]" data-dish-stepper>
      <button type="button" onClick={onLess} className="h-11 w-11 grid place-items-center rounded-[14px] active:scale-90 transition" aria-label={`One less ${name}`}><Minus size={16} strokeWidth={2.6} /></button>
      <span className="num w-7 text-center font-bold text-[15px]" aria-live="polite">{qty}</span>
      <button type="button" onClick={onAdd} className="h-11 w-11 grid place-items-center rounded-[14px] active:scale-90 transition" aria-label={`One more ${name}`}><Plus size={16} strokeWidth={2.6} /></button>
    </div>
  ) : (
    <button type="button" onClick={onAdd} aria-label={`Add ${name}${custom ? " — choose options" : ""}`} data-dish-add
      className="relative h-11 min-w-[104px] px-5 rounded-[14px] bg-[var(--color-bg-2)] border border-[color-mix(in_srgb,var(--color-tint)_35%,transparent)] text-[var(--color-tint)] text-[14px] font-extrabold tracking-[.06em] shadow-[0_10px_24px_-14px_rgb(0_0_0/.45)] active:scale-95 transition hover:bg-[var(--color-green-2)]">
      ADD<Plus size={12} strokeWidth={3} className="absolute top-1.5 right-2" aria-hidden />
    </button>
  );
}

/** A dish on the storefront (2026-10-23, the owner's "ultra modern" card): the food mark and tags, the name on two lines
 *  at most, the price in whole rupees, the description; the photo on the right with Add riding its foot, or Add on its
 *  own when there is no photo. A dish not sold now is dimmed and says why. */
function DishCard({ i, sells, qty, onAdd, onLess }: { i: Item; sells: boolean; qty: number; onAdd: () => void; onLess: () => void }) {
  const tp = tilePrice(i); const custom = hasOptions(i);
  const notSold = <span className="pill pill-served" data-not-sold={i.available ? "online" : "out"}>{i.available ? "not online" : "sold out"}</span>;
  return (
    <article className={cn("relative flex gap-3.5 rounded-[22px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] p-3.5 sm:p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]", qty > 0 && "border-[color-mix(in_srgb,var(--color-tint)_45%,transparent)]", !sells && "opacity-60")} data-dish-row>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 flex-wrap">
          <FoodMark veg={i.is_veg} />
          {i.is_combo && <span className="h-5 px-2 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-[var(--color-violet-2)] text-[var(--color-violet)] inline-flex items-center">Combo</span>}
          {custom && <span className="h-5 px-2 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-[var(--color-orange-2)] text-[var(--color-orange)] inline-flex items-center">Customisable</span>}
        </div>
        {/* a div, not an h3: headings take the condensed display face, and a dish name reads better in the body face */}
        <div role="heading" aria-level={3} className="mt-2 text-[16.5px] font-bold leading-snug text-[var(--color-label)] line-clamp-2">{i.name}</div>
        <div className="mt-1 flex items-baseline gap-1">
          {tp.from && <span className="text-[12px] font-semibold text-[var(--color-label-2)]">from</span>}
          <span className="num text-[18px] font-bold text-[var(--color-label)]">{formatINR(tp.price, { whole: true })}</span>
        </div>
        {i.is_combo && (i.components?.length ?? 0) > 0 && <p className="mt-1 text-[12.5px] text-[var(--color-label-2)] line-clamp-2">Comes with {i.components!.map((c) => `${c.qty}× ${c.name}`).join(", ")}</p>}
        {i.description && <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-label-2)] line-clamp-2">{i.description}</p>}
        {!i.image_url && <div className="mt-auto pt-3">{sells ? <AddControl name={i.name} qty={qty} onAdd={onAdd} onLess={onLess} custom={custom} /> : notSold}</div>}
      </div>
      {i.image_url && (
        /* with a photo: the photo on the right, the add control riding its bottom edge */
        <div className="relative shrink-0 w-[128px] sm:w-[140px] pb-5 self-start">
          <DishImage src={i.image_url} w={330} alt={i.name} title={i.image_credit ?? undefined} className={cn("h-[124px] sm:h-[132px] w-full rounded-[18px] object-cover bg-[var(--color-fill)]", !sells && "grayscale")} data-dish-photo />
          {/* a library photo carries its author and licence (CC BY / BY-SA): illustrative, and credited */}
          {i.image_credit && <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] rounded-full bg-black/45 backdrop-blur-sm px-1.5 py-px text-[8.5px] leading-tight text-white/90 truncate" data-photo-credit>Illustrative · {i.image_credit.replace(/^Photo: /, "")}</span>}
          <div className="absolute inset-x-0 bottom-0 flex justify-center">{sells ? <AddControl name={i.name} qty={qty} onAdd={onAdd} onLess={onLess} custom={custom} /> : notSold}</div>
        </div>
      )}
    </article>
  );
}

const Row = ({ k, v, good }: { k: string; v: number; good?: boolean }) => <div className="flex justify-between"><span className="text-[var(--color-label-2)]">{k}</span><span className={good ? "text-[var(--color-green)]" : ""}>{formatINR(v)}</span></div>;

function Confirmation({ kind, data, name, slug }: { kind: "book" | "order"; data: Record<string, unknown>; name: string; slug: string }) {
  const d = data as never as { no?: number; ref?: string; date?: string; time?: string; party?: number; offer?: string; discount_pct?: number; total?: number; eta?: number; mode?: string; table?: string; accepted?: boolean; order_no?: number; phone?: string; address?: string };
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
          <Link href={`/dine/${slug}`} className="flex-1"><Button className="w-full">Done</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}
