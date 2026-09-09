"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MapPin, Phone, Clock, Percent, Check, ChevronLeft, Minus, Plus, Bike, ShoppingBag, UtensilsCrossed, BedDouble, Leaf, Drumstick, Users, CalendarDays, PartyPopper } from "lucide-react";
import { Button, Field, Segmented, Sheet, Select, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { slots as fetchSlots, reserve, placeOrder } from "../actions";

type Item = { id: string; name: string; price: number; is_veg: boolean; description: string | null; available: boolean };
type Cat = { id: string; name: string; items: Item[] };
type Offer = { id: string; title: string; kind: string; value: number; scope: string; min_order: number; code: string | null };
type D = { slug: string; name: string; type: string; tagline: string | null; cuisines: string[]; price_for_two: number | null; rating: number | null; rating_count: number; address: string | null; phone: string | null; photos: string[]; opens_at: string; closes_at: string; gst_rate: number; dining: boolean; delivery: boolean; takeaway: boolean; rooms: boolean; min_order: number; delivery_fee: number; packing_charge: number; open_now: boolean; menu: Cat[]; offers: Offer[]; reviews: { guest: string; rating: number; body: string; reply: string | null; at: string }[] };
type Slot = { time: string; left: number; full: boolean; offer_id: string | null; offer: string | null; offer_pct: number | null };

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function StorefrontClient({ slug, d, initialSlots, tab }: { slug: string; d: D; initialSlots: Slot[]; tab: "book" | "order" }) {
  const toast = useToast();
  const [mode, setMode] = useState<"book" | "order">(d.dining ? tab : "order");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ kind: "book" | "order"; data: Record<string, unknown> } | null>(null);

  /* ── table booking ── */
  const [date, setDate] = useState(today()); const [party, setParty] = useState(2);
  const [slotList, setSlotList] = useState<Slot[]>(initialSlots); const [slot, setSlot] = useState<Slot | null>(null);
  const [guest, setGuest] = useState({ full_name: "", phone: "", email: "" });
  const [occasion, setOccasion] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { start(async () => { const r = await fetchSlots(slug, date, party); if ("slots" in r) { setSlotList(r.slots as Slot[]); setSlot(null); } }); }, [slug, date, party]); // eslint-disable-line

  /* ── ordering ── */
  const [cart, setCart] = useState<Record<string, number>>({});
  const [omode, setOmode] = useState<"delivery" | "takeaway">(d.delivery ? "delivery" : "takeaway");
  const [addr, setAddr] = useState(""); const [cartOpen, setCartOpen] = useState(false);
  const flat = useMemo(() => d.menu.flatMap((c) => c.items), [d.menu]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ item: flat.find((i) => i.id === id)!, qty })).filter((l) => l.item);
  const sub = lines.reduce((t, l) => t + Number(l.item.price) * l.qty, 0);
  const bestOffer = d.offers.filter((o) => ["delivery", "both"].includes(o.scope) && sub >= Number(o.min_order)).sort((a, b) => Number(b.value) - Number(a.value))[0];
  const disc = bestOffer ? (bestOffer.kind === "flat_pct" ? Math.round((sub * Number(bestOffer.value)) / 100) : Math.min(Number(bestOffer.value), sub)) : 0;
  const fee = (omode === "delivery" ? Number(d.delivery_fee) : 0) + Number(d.packing_charge);
  const gst = Math.round(((sub - disc) * Number(d.gst_rate)) / 100);
  const total = Math.round(sub - disc + fee + gst);
  const add = (id: string, n: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + n) }));

  if (done) return <Confirmation kind={done.kind} data={done.data} name={d.name} slug={slug} />;

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-32">
      {/* hero */}
      <div className="relative h-52 md:h-72 bg-gradient-to-br from-[var(--color-champagne)] to-[var(--color-ink)]">
        {d.photos?.[0] && <img src={d.photos[0]} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgb(13_28_23/.85)] to-transparent" />
        <Link href="/dine" className="absolute top-4 left-4 h-9 w-9 rounded-full material grid place-items-center"><ChevronLeft size={18} /></Link>
        <div className="absolute bottom-4 inset-x-0 px-5 max-w-4xl mx-auto text-white">
          <h1 className="font-display text-3xl md:text-4xl">{d.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-white/75">
            {d.rating && <span className="flex items-center gap-1"><Star size={13} fill="currentColor" className="text-[var(--color-tint-2)]" /> {d.rating} <span className="text-white/50">({d.rating_count})</span></span>}
            <span>{d.cuisines?.join(" · ")}</span>
            {d.price_for_two && <span className="num">{formatINR(d.price_for_two)} for two</span>}
            <span className={cn("flex items-center gap-1", d.open_now ? "text-[var(--color-tint-2)]" : "text-[var(--color-red)]")}><Clock size={12} /> {d.open_now ? "Open now" : "Closed"} · {d.opens_at.slice(0, 5)}–{d.closes_at.slice(0, 5)}</span>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-5 py-5">
        {d.address && <div className="flex items-center gap-4 text-sm text-[var(--color-label-2)] mb-4"><span className="flex items-center gap-1.5"><MapPin size={14} /> {d.address}</span>{d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1.5 hover:text-[var(--color-label)]"><Phone size={14} /> {d.phone}</a>}</div>}

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

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Segmented value={mode} onChange={setMode} options={[
            ...(d.dining ? [{ value: "book" as const, label: <span className="flex items-center gap-1.5"><UtensilsCrossed size={13} /> Book a table</span> }] : []),
            ...(d.delivery || d.takeaway ? [{ value: "order" as const, label: <span className="flex items-center gap-1.5"><Bike size={13} /> Order online</span> }] : []),
          ]} />
          {d.rooms && <Link href={`/book/${slug}`} className="chip"><BedDouble size={14} /> Book a room</Link>}
        </div>

        {/* ── BOOK A TABLE ── */}
        {mode === "book" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="card p-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Date"><input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className="num" /></Field>
                <Field label="How many"><div className="flex gap-1.5 flex-wrap">{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <button key={n} onClick={() => setParty(n)} className={cn("chip !h-9 !px-3.5", party === n && "on")}>{n}</button>)}</div></Field>
              </div>
              <div className="mt-5">
                <div className="eyebrow mb-2">Pick a time</div>
                {slotList.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">No times left today. Try tomorrow.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {slotList.map((s) => (
                      <button key={s.time} disabled={s.full} onClick={() => setSlot(s)}
                        className={cn("relative rounded-xl px-3.5 py-2 text-sm font-semibold transition border", slot?.time === s.time ? "bg-[var(--color-ink)] text-[var(--color-bg-2)] border-transparent" : "bg-[var(--color-bg-2)] border-[var(--color-separator)] hover:border-[var(--color-line-2)]", s.full && "opacity-35 line-through pointer-events-none")}>
                        {s.time}
                        {s.offer_pct ? <span className="absolute -top-2 -right-1.5 pill pill-gold !text-[10px] !py-0">{s.offer_pct}% off</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                {slot?.offer && <p className="text-sm mt-3 p-3 rounded-xl bg-[var(--color-champagne-2)]"><b>{slot.offer}</b> applies at {slot.time} — the discount is taken off your bill at the table.</p>}
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
                <p className="text-xs text-[var(--color-label-3)] mt-2 text-center">Free to book. No card needed. Cancel any time by calling the restaurant.</p>
              </motion.div>
            )}</AnimatePresence>
          </motion.div>
        )}

        {/* ── ORDER ONLINE ── */}
        {mode === "order" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {d.menu.map((c) => c.items.length > 0 && (
              <section key={c.id} className="mb-6">
                <h2 className="text-xl mb-3">{c.name}</h2>
                <div className="space-y-2">
                  {c.items.map((i) => (
                    <div key={i.id} className={cn("card p-4 flex items-start gap-4", !i.available && "opacity-50")}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">{i.is_veg ? <Leaf size={13} className="text-[var(--color-green)]" /> : <Drumstick size={13} className="text-[var(--color-red)]" />}<span className="font-semibold">{i.name}</span></div>
                        <div className="num text-sm text-[var(--color-label-2)] mt-0.5">{formatINR(i.price)}</div>
                        {i.description && <p className="text-xs text-[var(--color-label-2)] mt-1">{i.description}</p>}
                      </div>
                      {i.available ? (cart[i.id] ? (
                        <div className="flex items-center gap-1 bg-[var(--color-tint)] rounded-xl h-9 px-1 shrink-0">
                          <button onClick={() => add(i.id, -1)} className="h-7 w-7 grid place-items-center rounded-lg"><Minus size={14} /></button>
                          <span className="num w-6 text-center font-bold text-sm">{cart[i.id]}</span>
                          <button onClick={() => add(i.id, 1)} className="h-7 w-7 grid place-items-center rounded-lg"><Plus size={14} /></button>
                        </div>
                      ) : <Button size="sm" variant="tinted" onClick={() => add(i.id, 1)}>Add</Button>) : <span className="pill pill-served shrink-0">sold out</span>}
                    </div>
                  ))}
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
          {(d.delivery && d.takeaway) && <Segmented value={omode} onChange={setOmode} className="w-full" options={[{ value: "delivery", label: "Delivery" }, { value: "takeaway", label: "Takeaway" }]} />}
          <div className="divide-y divide-[var(--color-separator)]">
            {lines.map((l) => (
              <div key={l.item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm">{l.item.name}</span>
                <div className="flex items-center gap-1 bg-[var(--color-fill)] rounded-lg h-8 px-1">
                  <button onClick={() => add(l.item.id, -1)} className="h-6 w-6 grid place-items-center"><Minus size={13} /></button>
                  <span className="num w-5 text-center text-sm font-semibold">{l.qty}</span>
                  <button onClick={() => add(l.item.id, 1)} className="h-6 w-6 grid place-items-center"><Plus size={13} /></button>
                </div>
                <span className="num text-sm w-16 text-right">{formatINR(Number(l.item.price) * l.qty)}</span>
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
          {sub < Number(d.min_order) && <p className="text-sm text-[var(--color-red)]">Add {formatINR(Number(d.min_order) - sub)} more — the minimum order here is {formatINR(d.min_order)}.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><input value={guest.full_name} onChange={(e) => setGuest({ ...guest, full_name: e.target.value })} /></Field>
            <Field label="Phone"><input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className="num" /></Field>
          </div>
          {omode === "delivery" && <Field label="Delivery address"><textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Door number, street, landmark" /></Field>}
          <Field label="Note for the kitchen"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less spicy, no onion…" /></Field>
          <p className="text-xs text-[var(--color-label-2)]">Pay on {omode === "delivery" ? "delivery" : "pickup"} — cash, UPI or card. The restaurant confirms within a few minutes.</p>
          <Button size="lg" className="w-full" loading={pending} disabled={!guest.full_name || !guest.phone || sub < Number(d.min_order) || (omode === "delivery" && !addr)}
            onClick={() => start(async () => {
              const r = await placeOrder(slug, { ...guest, address: addr }, lines.map((l) => ({ id: l.item.id, qty: l.qty })), omode, note, bestOffer?.id ?? null);
              if ("error" in r) toast(r.error!, "err"); else { setCartOpen(false); setDone({ kind: "order", data: r.order as Record<string, unknown> }); }
            })}>Place order · {formatINR(total)}</Button>
        </div>
      </Sheet>
    </div>
  );
}

const Row = ({ k, v, good }: { k: string; v: number; good?: boolean }) => <div className="flex justify-between"><span className="text-[var(--color-label-2)]">{k}</span><span className={good ? "text-[var(--color-green)]" : ""}>{formatINR(v)}</span></div>;

function Confirmation({ kind, data, name, slug }: { kind: "book" | "order"; data: Record<string, unknown>; name: string; slug: string }) {
  const d = data as never as { no?: number; ref?: string; date?: string; time?: string; party?: number; offer?: string; discount_pct?: number; total?: number; eta?: number; mode?: string; phone?: string; address?: string };
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
        <p className="text-sm text-[var(--color-label-2)] mt-4">{kind === "book" ? "Show this number at the door. The restaurant has your booking on their screen already." : "The kitchen has it. Pay on delivery — cash, UPI or card."}</p>
        <div className="flex gap-2 mt-5">
          {d.phone && <a href={`tel:${d.phone}`} className="flex-1"><Button variant="gray" className="w-full"><Phone size={15} /> Call</Button></a>}
          <Link href={`/dine/${slug}`} className="flex-1"><Button className="w-full">Done</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}
