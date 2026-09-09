"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { BedDouble, Users, Check, Phone, MapPin, CalendarDays } from "lucide-react";
import { Button, Field, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";

type RT = { id: string; name: string; base_rate: number; capacity: number; amenities: string[] };
type P = { id: string; name: string; tagline: string | null; address: string | null; phone: string | null; cover_url: string | null; policies: string | null; check_in_time: string; check_out_time: string; room_gst_rate: number; advance_pct: number; room_types: RT[] };
const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export function BookClient({ slug, property }: { slug: string; property: P }) {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ from: today, to: tomorrow, adults: 2, children: 0 });
  const [avail, setAvail] = useState<Record<string, { free: number; rate: number; stop: boolean }>>({});
  const [pick, setPick] = useState<RT | null>(null);
  const [g, setG] = useState({ full_name: "", phone: "", email: "", note: "" });
  const [done, setDone] = useState<{ booking_id: string; nights: number; rate: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const nights = Math.max(1, Math.round((new Date(f.to).getTime() - new Date(f.from).getTime()) / 86400000));

  useEffect(() => { (async () => { const { data } = await sb().rpc("public_availability", { p_slug: slug, p_from: f.from, p_to: f.to }); setAvail((data as never) ?? {}); })(); }, [slug, f.from, f.to]);

  const book = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    const { data, error } = await sb().rpc("public_book", { p_slug: slug, p_room_type_id: pick.id, p_check_in: f.from, p_check_out: f.to, p_guest: g, p_adults: f.adults, p_children: f.children });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data as never);
  };

  if (done) return (
    <div className="min-h-dvh grid place-items-center p-6 aurora">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-8 max-w-md text-center">
        <span className="h-14 w-14 rounded-2xl bg-mint-2 text-ink grid place-items-center mx-auto"><Check size={26} /></span>
        <h1 className="text-3xl mt-4">Booking <em>confirmed</em></h1>
        <p className="text-steel mt-2">{property.name} · {pick?.name} · <span className="num">{f.from} → {f.to}</span></p>
        <div className="feather p-4 mt-4 num text-left text-sm"><div className="flex justify-between"><span className="text-steel">{done.nights} night × {formatINR(Number(done.rate))}</span><span>{formatINR(Number(done.total))}</span></div><div className="flex justify-between text-xs text-steel mt-1"><span>+ {property.room_gst_rate}% GST at check-in</span><span>{formatINR(Number(done.total) * property.room_gst_rate / 100)}</span></div></div>
        <p className="text-sm text-steel mt-4">We have your number{g.phone ? ` (${g.phone})` : ""}. Check-in from {property.check_in_time.slice(0, 5)}, check-out by {property.check_out_time.slice(0, 5)}.</p>
        {property.phone && <a href={`tel:${property.phone}`} className="mt-4 inline-flex"><Button variant="outline"><Phone size={15} /> Call the property</Button></a>}
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-porcelain">
      <header className="ink-panel"><div className="max-w-5xl mx-auto px-5 py-10">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Direct booking · no commission</div>
        <h1 className="font-display text-4xl md:text-5xl text-white mt-2">{property.name}</h1>
        {property.tagline && <p className="text-white/70 mt-2 max-w-lg">{property.tagline}</p>}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-white/60">{property.address && <span className="flex items-center gap-1.5"><MapPin size={14} /> {property.address}</span>}{property.phone && <a href={`tel:${property.phone}`} className="flex items-center gap-1.5 hover:text-white"><Phone size={14} /> {property.phone}</a>}<span className="flex items-center gap-1.5"><CalendarDays size={14} /> Check-in {property.check_in_time.slice(0, 5)} · out {property.check_out_time.slice(0, 5)}</span></div>
      </div></header>

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-6">
        <div className="glass p-5 grid sm:grid-cols-4 gap-3 -mt-14 relative">
          <Field label="Check-in"><input type="date" className="num" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value >= f.to ? new Date(new Date(e.target.value).getTime() + 86400000).toISOString().slice(0, 10) : f.to })} /></Field>
          <Field label="Check-out"><input type="date" className="num" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Adults"><input type="number" min={1} className="num" value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></Field>
          <Field label="Children"><input type="number" min={0} className="num" value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} /></Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {property.room_types.map((rt) => { const a = avail[rt.id]; const free = a?.free ?? 0; const rate = Number(a?.rate ?? rt.base_rate); const out = !a || a.stop || free <= 0;
            return (
              <motion.button key={rt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} disabled={out} onClick={() => setPick(rt)}
                className={cn("feather feather-lift p-5 text-left disabled:opacity-50 disabled:cursor-not-allowed", pick?.id === rt.id && "!border-saffron shadow-glow")}>
                <div className="flex items-start justify-between"><span className="h-11 w-11 rounded-2xl bg-champagne-2 grid place-items-center"><BedDouble size={19} /></span>
                  <div className="text-right"><div className="num text-2xl font-semibold">{formatINR(rate)}</div><div className="text-xs text-steel">per night + {property.room_gst_rate}% GST</div></div></div>
                <h3 className="text-xl mt-3 font-sans font-semibold">{rt.name}</h3>
                <div className="text-xs text-steel flex items-center gap-1 mt-1"><Users size={12} /> sleeps {rt.capacity}{rt.amenities?.length ? ` · ${rt.amenities.slice(0, 3).join(" · ")}` : ""}</div>
                <div className="mt-3 text-sm">{out ? <span className="text-chili font-semibold">Not available for these dates</span> : free <= 2 ? <span className="text-chili font-semibold">Only {free} left</span> : <span className="text-mint font-semibold">{free} rooms available</span>}</div>
              </motion.button>); })}
        </div>

        {pick && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="feather p-6">
            <h2 className="text-2xl">Your details</h2>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Field label="Full name"><input value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} required /></Field>
              <Field label="Phone"><input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} required /></Field>
              <Field label="Email"><input value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></Field>
              <Field label="Anything we should know"><input value={g.note} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="Late arrival, extra bed…" /></Field>
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-dashed border-line pt-3">
              <span className="text-sm text-steel">{pick.name} · {nights} night{nights > 1 ? "s" : ""} × {formatINR(Number(avail[pick.id]?.rate ?? pick.base_rate))}</span>
              <span className="num text-3xl font-semibold">{formatINR(nights * Number(avail[pick.id]?.rate ?? pick.base_rate))}</span>
            </div>
            <p className="text-xs text-steel mt-1">Pay at the property. {property.room_gst_rate}% GST is added on the final invoice.</p>
            {property.policies && <p className="text-xs text-steel mt-2">{property.policies}</p>}
            {err && <p className="text-sm text-chili mt-2">{err}</p>}
            <Button size="lg" className="w-full mt-4" disabled={busy || !g.full_name || !g.phone} onClick={book}>{busy ? "Confirming…" : "Confirm booking"}</Button>
          </motion.div>
        )}
      </main>
      <footer className="text-center text-xs text-steel py-8">Powered by DineFlow</footer>
    </div>
  );
}
