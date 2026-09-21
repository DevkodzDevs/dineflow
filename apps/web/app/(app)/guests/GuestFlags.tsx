"use client";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { cn, useToast } from "@/components/ui";
import { saveGuestFlags } from "./actions";

/** The star and the one-line profile a five-star desk keeps on every returning guest. Saves as you go. */
export function GuestFlags({ id, vip: v0, preferences: p0 }: { id: string; vip: boolean; preferences: string | null }) {
  const [vip, setVip] = useState(v0); const [pref, setPref] = useState(p0 ?? ""); const [saved, setSaved] = useState(p0 ?? "");
  const [pending, start] = useTransition(); const toast = useToast();
  const save = (nextVip: boolean, nextPref: string) => start(async () => { const r = await saveGuestFlags(id, nextVip, nextPref); if ("error" in r && r.error) toast(r.error, "err"); else setSaved(nextPref); });
  return (
    <div className="flex items-center gap-2">
      <button type="button" title={vip ? "VIP — click to clear" : "Mark as VIP"} disabled={pending} onClick={() => { const n = !vip; setVip(n); save(n, pref); }}
        className={cn("h-8 w-8 grid place-items-center rounded-full border transition-colors shrink-0", vip ? "bg-champagne-2 border-champagne text-champagne" : "border-line text-steel hover:text-[var(--color-label)]")}>
        <Star size={14} className={vip ? "fill-current" : ""} />
      </button>
      <input value={pref} onChange={(e) => setPref(e.target.value)} onBlur={() => { if (pref !== saved) save(vip, pref); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="High floor, no feather pillows, late check-out…" className="!h-8 text-xs flex-1 min-w-[200px]" />
    </div>
  );
}
