"use client";
import { useEffect, useState, useTransition } from "react";
import { Gauge, Pause, Timer, Info } from "lucide-react";
import { cn, useToast } from "@/components/ui";
import { setRush } from "./actions";

type Pace = { rush_extra_min: number; rush_until: string | null; online_paused_until: string | null };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Rush hour, as Zomato's restaurant app has it: when the kitchen is swamped it can add time to every
 * quoted online order for the next hour, or stop taking online orders for half an hour. A guest
 * ordering at a table by QR is never turned away. The storefront says so in plain words.
 */
export function KitchenPace({ initial }: { initial: Pace }) {
  const toast = useToast();
  const [pace, setPace] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const paused = pace.online_paused_until && new Date(pace.online_paused_until).getTime() > now ? pace.online_paused_until : null;
  const extra = pace.rush_until && new Date(pace.rush_until).getTime() > now ? pace.rush_extra_min : 0;
  const mode = paused ? "pause" : extra >= 30 ? "30" : extra > 0 ? "15" : "normal";
  const go = (extra: number, pause = false, mins = pause ? 30 : 60) => start(async () => {
    const r = await setRush(extra, mins, pause);
    if ("error" in r) { toast(r.error ?? "Could not change the pace", "err"); return; }
    setPace(r.pace);
    toast(pause ? `Online orders paused until ${time(r.pace.online_paused_until!)}` : extra ? `Quoting ${extra} minutes longer until ${time(r.pace.rush_until!)}` : "Back to the normal pace");
  });
  const opts = [
    { k: "normal", label: "Normal", hint: "Usual times", Icon: Gauge, run: () => go(0) },
    { k: "15", label: "Busy", hint: "+15 min", Icon: Timer, run: () => go(15) },
    { k: "30", label: "Very busy", hint: "+30 min", Icon: Timer, run: () => go(30) },
    { k: "pause", label: "Pause", hint: "30 min", Icon: Pause, run: () => go(0, true) },
  ];
  /* Phone: a status tile and the state on its own line, a 2×2 grid of big option tiles, a readable
     note. From sm up the classes put back the original one-row segmented control unchanged. */
  const ToneIcon = paused ? Pause : extra ? Timer : Gauge;
  const tone = paused ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : extra ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]";
  return (
    <div className="feather p-4 mb-5">
      <div className="flex items-start sm:items-center gap-3 sm:gap-2 mb-3.5 sm:mb-3">
        <span className={cn("sm:hidden h-11 w-11 rounded-2xl grid place-items-center shrink-0", tone)}><ToneIcon size={20} /></span>
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
          <span className="text-[16px] sm:text-[15px] font-semibold">Kitchen pace</span>
          <span className={cn("text-[12.5px] sm:text-xs leading-snug", paused ? "text-[var(--color-red)] font-semibold" : extra ? "text-[var(--color-orange)] font-semibold" : "text-[var(--color-label-2)]")}>
            {paused ? `Online orders paused until ${time(paused)}` : extra ? `+${extra} min on every quote until ${time(pace.rush_until!)}` : "Online orders are quoted the usual time"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-1.5 sm:p-1 sm:rounded-2xl sm:bg-[var(--color-fill)]">
        {opts.map(({ k, label, hint, Icon, run }) => (
          <button key={k} type="button" disabled={pending} onClick={run} aria-pressed={mode === k}
            className={cn("min-w-0 max-sm:!min-h-[60px] rounded-2xl px-3.5 flex items-center gap-3 text-left transition-colors sm:min-h-[52px] sm:rounded-xl sm:px-1.5 sm:flex-col sm:justify-center sm:gap-0.5 sm:text-center",
              mode === k ? (k === "pause" ? "bg-[var(--color-red)] text-white" : k === "normal" ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_3px_rgb(0_0_0/.2)] max-sm:ring-1 max-sm:ring-[var(--color-separator)]" : "bg-[var(--color-orange)] text-[#1a1206]") : "bg-[var(--color-fill)] sm:bg-transparent text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
            <Icon size={20} className="sm:hidden shrink-0" />
            <span className="min-w-0 flex flex-col sm:items-center">
              <span className="flex items-center gap-1 text-[15px] sm:text-[13px] font-semibold"><Icon size={14} className="hidden sm:block shrink-0" /><span className="truncate">{label}</span></span>
              <span className="text-[12px] sm:text-[10.5px] opacity-80 truncate max-w-full">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="flex items-start gap-2 sm:block text-[12px] sm:text-[11px] leading-relaxed sm:leading-normal text-[var(--color-label-2)] mt-3 sm:mt-2"><Info size={14} className="sm:hidden shrink-0 mt-0.5" /><span>Busy lasts an hour, a pause half an hour, then the kitchen is back to normal on its own. Table QR orders are never paused.</span></p>
    </div>
  );
}
