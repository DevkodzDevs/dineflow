"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, Bike, ChefHat, PackageCheck, CheckCircle2, ClipboardList, MapPin, ExternalLink, XCircle, RefreshCw } from "lucide-react";
import { trackOrder, type Track } from "../actions";

/* the stages a delivery goes through, and what the page says at each; a takeaway ends at "Ready to collect" */
const STAGES = [
  { k: "placed", label: "Placed", Icon: ClipboardList, say: "The restaurant has your order." },
  { k: "cooking", label: "Cooking", Icon: ChefHat, say: "The kitchen is on it." },
  { k: "ready", label: "Ready", Icon: PackageCheck, say: "Packed and waiting for the rider." },
  { k: "on_the_way", label: "On the way", Icon: Bike, say: "Your rider is coming." },
  { k: "delivered", label: "Delivered", Icon: CheckCircle2, say: "Enjoy your meal!" },
] as const;
const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const since = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "just now" : m === 1 ? "1 min ago" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/**
 * Track your order (0140, 2026-10-24): the stage big, the rider with a call button and a live map while the trip is on, the
 * order under it. Asks the server every 8 s and whenever the page comes back to the front; nothing to install, no sign-in.
 */
export function TrackClient({ token, initial, demo = false }: { token: string; initial: Track | null; demo?: boolean }) {
  const [t, setT] = useState<Track | null>(initial);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { if (demo) return; setBusy(true); try { const r = await trackOrder(token); if ("track" in r && r.track) setT(r.track); } finally { setBusy(false); } };
  useEffect(() => {
    if (demo) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 8000);
    const vis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [token, demo]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return (
    <div className="min-h-dvh grid place-items-center p-6 aurora"><div className="material-thick p-8 max-w-md w-full text-center rounded-[28px]">
      <XCircle size={40} className="mx-auto text-[var(--color-label-2)]" /><h1 className="text-2xl mt-4">This link is not valid</h1>
      <p className="text-sm text-[var(--color-label-2)] mt-2">It may have expired, or the address is incomplete. Call the restaurant and give them your order number.</p></div></div>);
  const takeaway = t.mode === "takeaway" || t.mode === "pickup";
  const stages = takeaway ? STAGES.filter((s) => s.k !== "on_the_way").map((s) => (s.k === "delivered" ? { ...s, label: "Collected", say: "Collected — enjoy!" } : s.k === "ready" ? { ...s, label: "Ready to collect", say: "Come and collect it at the counter." } : s)) : STAGES;
  const cancelled = t.status === "cancelled";
  const idx = cancelled ? -1 : Math.max(0, stages.findIndex((s) => s.k === t.status));
  const cur = cancelled ? null : stages[idx];
  const done = t.status === "delivered";
  const live = t.rider && !done && !cancelled;
  const map = t.position ? `https://maps.google.com/maps?q=${t.position.lat},${t.position.lng}&z=15&output=embed` : null;
  return (
    <div className="min-h-dvh aurora p-4 sm:p-6" data-track={t.status}>
      <div className="max-w-md mx-auto space-y-3">
        <div className="flex items-center justify-between gap-2 px-1 pt-2">
          <div className="min-w-0"><div className="text-[12px] font-semibold uppercase tracking-[.14em] text-[var(--color-label-2)] truncate">{t.property.name}</div><div className="text-[15px] font-bold truncate">Order {t.ref}</div></div>
          {!demo && <button type="button" onClick={() => void refresh()} aria-label="Refresh" className="h-10 w-10 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-label-2)]"><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></button>}
        </div>
        {demo && <p className="text-[12px] text-center text-[var(--color-label-2)] px-2">A sample — this is what your customer sees.</p>}

        {/* the stage, big */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="material-thick rounded-[28px] p-6 text-center" data-stage>
          <span className={`mx-auto h-16 w-16 rounded-[22px] grid place-items-center ${cancelled ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : done ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]"}`}>
            {cancelled ? <XCircle size={30} /> : cur ? <cur.Icon size={30} /> : null}
          </span>
          <h1 className="text-3xl mt-4" data-stage-word>{cancelled ? "Cancelled" : cur?.label}</h1>
          <p className="text-sm text-[var(--color-label-2)] mt-1.5">{cancelled ? "This order was cancelled. Call the restaurant if that is a surprise." : cur?.say}</p>
          {!done && !cancelled && t.eta_min != null && t.status !== "placed" && <p className="text-sm mt-2 num">About <b>{t.eta_min} min</b>{t.status === "on_the_way" && t.timeline.picked_up ? ` from pickup (${since(t.timeline.picked_up)})` : ""}</p>}
          {!cancelled && (
            <div className="flex items-center gap-1 mt-5" aria-label="Progress">
              {stages.map((s, i) => <div key={s.k} className="flex-1 min-w-0"><div className={`h-1.5 rounded-full ${i <= idx ? "bg-[var(--color-green)]" : "bg-[var(--color-fill-2)]"}`} /><div className={`text-[10px] mt-1.5 truncate ${i <= idx ? "font-semibold" : "text-[var(--color-label-2)]"}`}>{s.label}</div></div>)}
            </div>
          )}
        </motion.div>

        {/* the rider: a name, a call, the map while the trip is on */}
        {t.rider && !cancelled && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06 }} className="material-thick rounded-[28px] overflow-hidden" data-rider>
            <div className="p-4 flex items-center gap-3">
              <span className="h-12 w-12 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)] font-bold text-lg shrink-0">{(t.rider.name ?? "R").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><div className="font-bold truncate">{t.rider.name ?? "Your rider"}</div><div className="text-[12.5px] text-[var(--color-label-2)]">{done ? "Delivered your order" : t.status === "on_the_way" ? "Bringing your order" : "Will bring your order"}</div></div>
              {t.rider.phone && !done && <a href={`tel:${t.rider.phone}`} className="h-11 px-4 rounded-full inline-flex items-center gap-1.5 bg-[var(--color-green)] text-[var(--color-on-tint)] font-semibold text-sm" data-call-rider><Phone size={15} /> Call</a>}
            </div>
            {live && (map ? (
              <div data-map>
                <iframe title="Where your rider is" src={map} className="w-full h-56 border-0 block" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                <div className="px-4 py-2.5 flex items-center justify-between gap-2 text-[12px] text-[var(--color-label-2)]">
                  <span className="flex items-center gap-1 min-w-0"><MapPin size={12} className="shrink-0" /> <span className="truncate">Rider's position · {since(t.position!.at)}</span></span>
                  <a href={`https://maps.google.com/?q=${t.position!.lat},${t.position!.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold shrink-0">Open in Maps <ExternalLink size={12} /></a>
                </div>
              </div>
            ) : <p className="px-4 pb-4 text-[12.5px] text-[var(--color-label-2)] flex items-center gap-1.5" data-no-position><MapPin size={13} /> The rider has not shared a location yet.</p>)}
          </motion.div>
        )}

        {/* the order */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 }} className="material-thick rounded-[28px] p-5" data-order>
          <ul className="text-sm space-y-1.5">{t.items.map((i, n) => <li key={n} className="flex justify-between gap-3"><span className="min-w-0 truncate">{i.name}</span><span className="num shrink-0 text-[var(--color-label-2)]">× {i.qty}</span></li>)}</ul>
          {t.total != null && <div className="flex justify-between font-bold mt-3 pt-3 border-t border-[var(--color-separator)]"><span>Total</span><span className="num">{fmt(Number(t.total))}</span></div>}
          {t.timeline.placed && <p className="text-[12px] text-[var(--color-label-2)] mt-2">Placed {since(t.timeline.placed)}{t.timeline.delivered ? ` · delivered ${since(t.timeline.delivered)}` : ""}</p>}
        </motion.div>

        {t.property.phone && <a href={`tel:${t.property.phone}`} className="block"><span className="w-full h-12 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-bg-2)] font-semibold text-sm" data-call-property><Phone size={15} /> Call {t.property.name}</span></a>}
        <p className="text-center text-[11px] text-[var(--color-label-2)] pt-2">Powered by DineFlow</p>
      </div>
    </div>
  );
}
