"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Star, MapPin, Clock, Percent, UtensilsCrossed, Bike, BedDouble, Ticket } from "lucide-react";
import { Segmented, Button, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { discover } from "./actions";

type P = { slug: string; name: string; type: string; cuisines: string[]; price_for_two: number | null; rating: number | null; rating_count: number; district: string | null; address: string | null; photo: string | null; dining: boolean; delivery: boolean; takeaway: boolean; rooms: boolean; open_now: boolean; km: number | null; offers: { title: string; kind: string; value: number }[] };

export function DiscoverClient({ initial, q: q0, city: c0, mode: m0 }: { initial: P[]; q: string; city: string; mode: string }) {
  const [q, setQ] = useState(q0); const [city, setCity] = useState(c0); const [mode, setMode] = useState(m0 || "all");
  const [list, setList] = useState<P[]>(initial); const [pending, start] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => start(async () => { const r = await discover(q, city, mode === "all" ? "" : mode); if ("list" in r) setList(r.list as P[]); }), 300);
    return () => clearTimeout(t);
  }, [q, city, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <header className="ink-panel"><div className="max-w-5xl mx-auto px-5 py-10">
        <div className="eyebrow text-white/50">DineFlow</div>
        <h1 className="font-display text-4xl md:text-5xl text-white mt-2">Eat out, order in, <em>stay over</em></h1>
        <p className="text-white/60 mt-2 max-w-lg">Book a table with an offer, order food to your door, or find a room — straight from the places themselves, with no commission in between.</p>
        <div className="material mt-6 flex items-center gap-2 px-4 py-2">
          <Search size={18} className="text-[var(--color-label-3)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place, a cuisine, or a dish" className="!bg-transparent !border-0 !shadow-none !px-0 flex-1" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="!bg-transparent !border-0 !shadow-none !px-0 !w-28 hidden sm:block border-l" />
        </div>
      </div></header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Segmented value={mode} onChange={setMode} options={[{ value: "all", label: "All" }, { value: "dining", label: <span className="flex items-center gap-1.5"><UtensilsCrossed size={13} /> Dining</span> }, { value: "delivery", label: <span className="flex items-center gap-1.5"><Bike size={13} /> Delivery</span> }, { value: "rooms", label: <span className="flex items-center gap-1.5"><BedDouble size={13} /> Stay</span> }]} />
          <Link href="/dine/track" className="chip ml-auto"><Ticket size={14} /> Track an order</Link>
        </div>

        {list.length === 0 ? (
          <div className="card p-12 text-center"><p className="text-lg font-semibold">Nothing here yet</p><p className="text-sm text-[var(--color-label-2)] mt-1.5 max-w-sm mx-auto">{pending ? "Looking…" : "No place matches that. Try a different search, or ask the property to switch on its storefront in Settings."}</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {list.map((p, i) => (
                <motion.div key={p.slug} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ delay: Math.min(i * 0.03, .3) }}>
                  <Link href={`/dine/${p.slug}`} className="card feather-lift block overflow-hidden h-full">
                    <div className="h-40 bg-gradient-to-br from-[var(--color-champagne)] to-[var(--color-ink)] relative">
                      {p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}
                      {p.offers.length > 0 && <span className="absolute bottom-3 left-3 pill pill-gold shadow"><Percent size={11} /> {p.offers[0].title}</span>}
                      {!p.open_now && <span className="absolute top-3 right-3 pill pill-alert">closed now</span>}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0"><h3 className="text-lg font-semibold truncate">{p.name}</h3>
                          <div className="text-xs text-[var(--color-label-2)] truncate">{p.cuisines?.join(" · ") || p.type}</div></div>
                        {p.rating && <span className="pill pill-ready shrink-0"><Star size={11} fill="currentColor" /> {p.rating}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-xs text-[var(--color-label-2)]">
                        {p.price_for_two && <span className="num">{formatINR(p.price_for_two)} for two</span>}
                        {p.district && <span className="flex items-center gap-1"><MapPin size={11} /> {p.district}{p.km ? ` · ${p.km} km` : ""}</span>}
                      </div>
                      <div className="flex gap-1.5 mt-3">
                        {p.dining && <span className="pill pill-pending"><UtensilsCrossed size={10} /> Book a table</span>}
                        {p.delivery && <span className="pill pill-pending"><Bike size={10} /> Delivery</span>}
                        {p.rooms && <span className="pill pill-pending"><BedDouble size={10} /> Rooms</span>}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
      <footer className="text-center text-xs text-[var(--color-label-3)] py-10">Powered by DineFlow · every booking goes straight to the property</footer>
    </div>
  );
}
