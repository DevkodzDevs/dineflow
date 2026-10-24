"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Phone, Navigation, PackageCheck, CheckCircle2, MapPin, Banknote, BadgeCheck, XCircle, LocateFixed } from "lucide-react";
import { riderSet, type Ride } from "../../track/actions";

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * The rider's page (0140, 2026-10-24): the drop — who, where (Navigate opens the maps app), a call — the food, and three
 * big buttons: Share my location (the browser's own GPS, sent every ten seconds or fifty metres while the page is open,
 * nothing installed), Picked up, Delivered. Cash to collect is said in red so nobody rides off without it.
 */
export function RideClient({ token, initial, demo = false }: { token: string; initial: Ride | null; demo?: boolean }) {
  const [r, setR] = useState<Ride | null>(initial);
  const [sharing, setSharing] = useState(false); const [sent, setSent] = useState<string | null>(null); const [geoErr, setGeoErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watch = useRef<number | null>(null); const last = useRef<{ t: number; lat: number; lng: number } | null>(null);
  const send = async (status: "picked_up" | "delivered" | null, lat: number | null, lng: number | null) => {
    if (demo) { if (status) setR((x) => x && { ...x, status, picked_up_at: x.picked_up_at ?? new Date().toISOString(), delivered_at: status === "delivered" ? new Date().toISOString() : x.delivered_at }); if (lat != null) setSent(new Date().toISOString()); return; }
    const res = await riderSet(token, status, lat, lng);
    if ("state" in res && res.state) { setR((x) => x && { ...x, status: res.state!.status as Ride["status"], located_at: res.state!.located_at, picked_up_at: res.state!.picked_up_at, delivered_at: res.state!.delivered_at }); if (lat != null) setSent(res.state.located_at); }
  };
  const stop = () => { if (watch.current != null && "geolocation" in navigator) navigator.geolocation.clearWatch(watch.current); watch.current = null; setSharing(false); };
  const share = () => {
    if (!("geolocation" in navigator)) { setGeoErr("This phone's browser cannot share a location."); return; }
    setGeoErr(null); setSharing(true);
    watch.current = navigator.geolocation.watchPosition((p) => {
      const now = Date.now(), { latitude: lat, longitude: lng } = p.coords; const l = last.current;
      const far = !l || Math.hypot((lat - l.lat) * 111000, (lng - l.lng) * 111000 * Math.cos((lat * Math.PI) / 180)) > 50;
      if (!l || now - l.t > 10000 || far) { last.current = { t: now, lat, lng }; void send(null, lat, lng); }
    }, (e) => { setGeoErr(e.code === 1 ? "Location is blocked for this page — allow it in the browser's site settings." : "Could not read the location."); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
  useEffect(() => () => stop(), []);
  // keep the screen on while the trip is being shared, where the phone allows it
  useEffect(() => { let lock: { release: () => Promise<void> } | null = null; if (sharing && "wakeLock" in navigator) (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {}); return () => { void lock?.release(); }; }, [sharing]);
  if (!r) return (
    <div className="min-h-dvh grid place-items-center p-6 aurora"><div className="material-thick p-8 max-w-md w-full text-center rounded-[28px]">
      <XCircle size={40} className="mx-auto text-[var(--color-label-2)]" /><h1 className="text-2xl mt-4">This link is not valid</h1><p className="text-sm text-[var(--color-label-2)] mt-2">Ask the counter to send the delivery link again.</p></div></div>);
  const done = r.status === "delivered"; const picked = r.status === "picked_up" || done;
  const nav = r.customer.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.customer.address)}` : null;
  return (
    <div className="min-h-dvh aurora p-4 sm:p-6" data-ride={r.status}>
      <div className="max-w-md mx-auto space-y-3">
        <div className="px-1 pt-2"><div className="text-[12px] font-semibold uppercase tracking-[.14em] text-[var(--color-label-2)]">{r.property.name} · delivery</div><div className="text-[15px] font-bold">Order {r.ref}{r.rider ? ` · ${r.rider}` : ""}</div></div>
        {demo && <p className="text-[12px] text-center text-[var(--color-label-2)] px-2">A sample — this is what your rider sees. Nothing here is saved.</p>}

        {/* the drop */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="material-thick rounded-[28px] p-5" data-drop>
          <div className="text-[12px] font-bold uppercase tracking-[.1em] text-[var(--color-label-2)]">Deliver to</div>
          <div className="text-xl font-bold mt-1">{r.customer.name ?? "Customer"}</div>
          {r.customer.address && <p className="text-sm text-[var(--color-label-2)] mt-1 leading-snug">{r.customer.address}</p>}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {nav ? <a href={nav} target="_blank" rel="noreferrer" className="h-12 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-label)] text-[var(--color-on-label)] font-semibold text-sm" data-navigate><Navigation size={16} /> Navigate</a> : <span />}
            {r.customer.phone ? <a href={`tel:${r.customer.phone}`} className="h-12 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-bg-2)] font-semibold text-sm" data-call-customer><Phone size={16} /> Call customer</a> : <span />}
          </div>
          <div className={`mt-4 rounded-2xl px-4 py-3 flex items-center gap-2.5 font-bold ${r.prepaid ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]"}`} data-collect={r.prepaid ? "paid" : "cash"}>
            {r.prepaid ? <><BadgeCheck size={20} /> Paid online — nothing to collect</> : <><Banknote size={20} /> Collect {fmt(Number(r.total ?? 0))} in cash</>}
          </div>
        </motion.div>

        {/* the food */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06 }} className="material-thick rounded-[28px] p-5" data-food>
          <ul className="text-sm space-y-1.5">{r.items.map((i, n) => <li key={n} className="flex justify-between gap-3"><span className="min-w-0 truncate">{i.name}</span><span className="num shrink-0 font-bold">× {i.qty}</span></li>)}</ul>
          {r.total != null && <div className="flex justify-between font-bold mt-3 pt-3 border-t border-[var(--color-separator)]"><span>Total</span><span className="num">{fmt(Number(r.total))}</span></div>}
        </motion.div>

        {/* the trip */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 }} className="material-thick rounded-[28px] p-5 space-y-3" data-trip>
          {done ? (
            <div className="text-center py-2" data-done><CheckCircle2 size={44} className="mx-auto text-[var(--color-green)]" /><div className="text-2xl font-bold mt-2">Delivered</div><p className="text-sm text-[var(--color-label-2)]">{r.delivered_at ? `at ${clock(r.delivered_at)} · ` : ""}thank you.</p></div>
          ) : (<>
            <button type="button" onClick={sharing ? stop : share} aria-pressed={sharing} data-share-location
              className={`w-full h-14 rounded-full inline-flex items-center justify-center gap-2 font-bold text-[15px] ${sharing ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-bg-2)]"}`}>
              {sharing ? <LocateFixed size={20} className="animate-pulse" /> : <MapPin size={20} />}{sharing ? "Sharing my location" : "Share my location"}
            </button>
            <p className="text-[12px] text-center text-[var(--color-label-2)]" data-share-state>{geoErr ?? (sharing ? (sent ? `Sent ${clock(sent)} · the customer can see you coming` : "Waiting for the first fix…") : "Tap to let the customer see you coming. Keep this page open.")}</p>
            {!picked ? (
              <button type="button" disabled={busy} data-picked-up onClick={() => { setBusy(true); void send("picked_up", last.current?.lat ?? null, last.current?.lng ?? null).finally(() => setBusy(false)); }}
                className="w-full h-16 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-green)] text-[var(--color-on-tint)] font-bold text-lg"><PackageCheck size={22} /> Picked up</button>
            ) : (
              <button type="button" disabled={busy} data-delivered onClick={() => { if (!confirm("Delivered to the customer?")) return; setBusy(true); void send("delivered", last.current?.lat ?? null, last.current?.lng ?? null).then(stop).finally(() => setBusy(false)); }}
                className="w-full h-16 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-green)] text-[var(--color-on-tint)] font-bold text-lg"><CheckCircle2 size={22} /> Delivered</button>
            )}
            {picked && r.picked_up_at && <p className="text-[12px] text-center text-[var(--color-label-2)]">Picked up at {clock(r.picked_up_at)}</p>}
          </>)}
        </motion.div>
        {r.property.phone && <a href={`tel:${r.property.phone}`} className="block"><span className="w-full h-12 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-bg-2)] font-semibold text-sm"><Phone size={15} /> Call {r.property.name}</span></a>}
        <p className="text-center text-[11px] text-[var(--color-label-2)] pt-2">Powered by DineFlow</p>
      </div>
    </div>
  );
}
