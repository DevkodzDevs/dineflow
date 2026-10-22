"use client";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HandPlatter, Receipt, GlassWater, Footprints, X, Clock } from "lucide-react";
import { answerCall } from "@/app/(app)/orders/actions";

export type LiveCall = { id: string; table_id: string; kind: string; table: string | null; zone: string | null; at: string };
const WHAT: Record<string, { title: (t: string) => string; Icon: typeof HandPlatter; hue: string; hue2: string }> = {
  waiter: { title: (t) => `${t} is calling a waiter`, Icon: HandPlatter, hue: "var(--color-tint)", hue2: "var(--color-green-2)" },
  bill: { title: (t) => `${t} wants the bill`, Icon: Receipt, hue: "var(--color-blue)", hue2: "var(--color-blue-2)" },
  water: { title: (t) => `${t} wants water`, Icon: GlassWater, hue: "var(--color-cyan)", hue2: "var(--color-cyan-2)" },
};
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * A guest asked from the table's QR (2026-10-23, the owner: "send the waiters and supervisors a proper notification, in a
 * dialog with the detail"). Every staff device that hears table calls shows this card: which table, its zone, what they
 * want, when, how long ago. **On my way** answers every open call of that table (service_call_done) — the guest's tile
 * turns "On the way" and the card leaves every other device too (NotifierProvider drops it on the row's UPDATE).
 * **Later** hides it here only; the call stays on Orders. Several calls stack, newest on top. It does not block the
 * screen: no backdrop, so a waiter mid-order can finish first.
 */
export function CallAlert({ calls, onGone }: { calls: LiveCall[]; onGone: (ids: string[]) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!calls.length) return; const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, [calls.length]);
  const top = calls.slice(0, 3);
  return (
    <div className="fixed z-[80] inset-x-3 bottom-[max(84px,calc(env(safe-area-inset-bottom)+76px))] sm:inset-x-auto sm:right-5 sm:bottom-auto sm:top-[104px] sm:w-[360px] flex flex-col gap-2 pointer-events-none" aria-live="assertive">
      <AnimatePresence initial={false}>
        {top.map((c) => {
          const w = WHAT[c.kind] ?? WHAT.waiter; const t = c.table ?? "A table"; const ago = Math.max(0, Math.floor((now - new Date(c.at).getTime()) / 60000));
          const sameTable = calls.filter((x) => x.table_id === c.table_id).map((x) => x.id);
          return (
            <motion.div key={c.id} layout role="alertdialog" aria-labelledby={`call-${c.id}`} data-call-alert={c.kind}
              initial={{ opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}
              style={{ ["--hue" as string]: w.hue, ["--hue-2" as string]: w.hue2 }}
              className="pointer-events-auto rounded-[22px] bg-[var(--color-bg-2)] border border-[color-mix(in_srgb,var(--hue)_40%,var(--color-separator))] shadow-[var(--shadow-pop)] p-3.5 overflow-hidden relative">
              <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--hue)]" aria-hidden />
              <div className="flex items-start gap-3 pl-1.5">
                <span className="h-12 w-12 shrink-0 rounded-[15px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)] call-ring" aria-hidden><w.Icon size={24} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--hue)]">Table call</div>
                  <div id={`call-${c.id}`} className="text-[16px] font-bold leading-snug">{w.title(t)}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[var(--color-label-2)]">
                    <Clock size={12} aria-hidden />
                    {/* one piece per span, so the whole-app Tamil / Hindi can translate each */}
                    {c.zone && <><span>{c.zone}</span><span aria-hidden>·</span></>}<span>{`asked ${hm(c.at)}`}</span><span aria-hidden>·</span><span>{ago ? `${ago} min ago` : "just now"}</span>
                  </div>
                </div>
                <button type="button" aria-label="Hide on this device" onClick={() => onGone([c.id])} className="-mr-1 -mt-1 h-11 w-11 shrink-0 rounded-full grid place-items-center text-[var(--color-label-3)] hover:bg-[var(--color-fill)]"><X size={18} /></button>
              </div>
              <div className="mt-3 flex gap-2 pl-1.5">
                <button type="button" onClick={() => onGone([c.id])} className="btn btn-gray flex-1 !h-11">Later</button>
                <button type="button" disabled={pending} data-call-answer
                  onClick={() => start(async () => { setErr(null); const r = await answerCall(c.table_id); if ("error" in r) setErr(r.error ?? "Could not answer"); else onGone(sameTable); })}
                  className="btn btn-filled flex-[1.6] !h-11 gap-1.5"><Footprints size={16} aria-hidden /> On my way</button>
              </div>
              {err && <p className="mt-2 pl-1.5 text-[12.5px] text-[var(--color-red)]">{err}</p>}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {calls.length > 3 && <div className="pointer-events-auto self-end rounded-full px-3 py-1.5 text-[12px] font-semibold bg-[var(--color-label)] text-[var(--color-on-label)]">+{calls.length - 3} more on Orders</div>}
    </div>
  );
}
