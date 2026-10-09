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
  /* Phone only (below sm): a status panel tinted by the state, with time left on a bar, over one
     segmented control of big figures (0 · +15 · +30 · pause). Tablets and desktops keep the
     original one-row control below, untouched. */
  const until = paused ?? (extra ? pace.rush_until : null);
  const span = paused ? 30 : 60;
  const left = until ? Math.min(span, Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60000))) : 0;
  const pct = until ? Math.min(100, (left / span) * 100) : 100;
  const pc = paused ? "var(--color-red)" : extra ? "var(--color-orange)" : "var(--color-green)";
  const stateName = paused ? "Paused" : extra >= 30 ? "Very busy" : extra ? "Busy" : "Normal";
  const stateLine = paused ? `Online orders stopped · back at ${time(paused)}` : extra ? `Online quotes +${extra} min · until ${time(pace.rush_until!)}` : "Online orders are quoted the usual time";
  const segs = [
    { k: "normal", big: "0", label: "Normal", run: () => go(0), on: { background: "var(--color-tint)", color: "var(--color-on-tint)" } },
    { k: "15", big: "+15", label: "Busy", run: () => go(15), on: { background: "var(--color-orange)", color: "#1a1206" } },
    { k: "30", big: "+30", label: "Very busy", run: () => go(30), on: { background: "var(--color-orange)", color: "#1a1206" } },
    { k: "pause", big: <Pause size={20} strokeWidth={2.6} />, label: "Pause", run: () => go(0, true), on: { background: "var(--color-red)", color: "#fff" } },
  ];
  return (
    <>
      <div className="sm:hidden mb-5 rounded-[22px] border overflow-hidden transition-colors"
        style={{ background: `color-mix(in srgb, ${pc} 9%, var(--color-card))`, borderColor: `color-mix(in srgb, ${pc} 32%, transparent)` }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 min-h-8">
            <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: pc }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: pc }} /></span>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-label-2)]">Kitchen pace</span>
            {mode !== "normal" && <button type="button" disabled={pending} onClick={() => go(0)} className="ml-auto -my-2 -mr-2 px-2 text-[13px] font-semibold" style={{ color: pc }}>Back to normal</button>}
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="font-display text-[34px] leading-none" style={{ color: pc }}>{stateName}</div>
            {until && <div className="ml-auto num font-display text-[24px] leading-none whitespace-nowrap">{left}<span className="font-sans text-[12.5px] text-[var(--color-label-2)]"> min left</span></div>}
          </div>
          <div className="text-[13px] text-[var(--color-label-2)] mt-1.5">{stateLine}</div>
          {until && <div className="mt-3 h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden" aria-hidden><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: pc }} /></div>}
        </div>
        <div className="px-2">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-[18px] bg-[var(--color-fill)]">
            {segs.map((g) => {
              const on = mode === g.k;
              return (
                <button key={g.k} type="button" disabled={pending} onClick={g.run} aria-pressed={on} aria-label={g.label}
                  className={cn("!min-h-[64px] rounded-[14px] flex flex-col items-center justify-center gap-1 transition-all", on ? "shadow-[0_6px_16px_rgb(0_0_0/.22)]" : "text-[var(--color-label-2)] active:bg-[var(--color-fill-2)]")}
                  style={on ? g.on : undefined}>
                  <span className="font-display text-[22px] leading-none h-[22px] grid place-items-center">{g.big}</span>
                  <span className="text-[11px] font-semibold leading-none">{g.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="px-4 pt-2.5 pb-3.5 text-[11.5px] text-[var(--color-label-2)] flex items-center gap-1.5"><Info size={13} className="shrink-0" /> Busy lasts an hour · a pause 30 min · table QR orders never stop</p>
      </div>

      <div className="hidden sm:block feather p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[15px] font-semibold">Kitchen pace</span>
          <span className={cn("text-xs", paused ? "text-[var(--color-red)] font-semibold" : extra ? "text-[var(--color-orange)] font-semibold" : "text-[var(--color-label-2)]")}>
            {paused ? `Online orders paused until ${time(paused)}` : extra ? `+${extra} min on every quote until ${time(pace.rush_until!)}` : "Online orders are quoted the usual time"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[var(--color-fill)]">
          {opts.map(({ k, label, hint, Icon, run }) => (
            <button key={k} type="button" disabled={pending} onClick={run} aria-pressed={mode === k}
              className={cn("min-w-0 min-h-[52px] rounded-xl px-1.5 flex flex-col items-center justify-center gap-0.5 text-center transition-colors",
                mode === k ? (k === "pause" ? "bg-[var(--color-red)] text-white" : k === "normal" ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_3px_rgb(0_0_0/.2)]" : "bg-[var(--color-orange)] text-[#1a1206]") : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
              <span className="flex items-center gap-1 text-[13px] font-semibold"><Icon size={14} className="shrink-0" /><span className="truncate">{label}</span></span>
              <span className="text-[10.5px] opacity-80 truncate max-w-full">{hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-label-2)] mt-2">Busy lasts an hour, a pause half an hour, then the kitchen is back to normal on its own. Table QR orders are never paused.</p>
      </div>
    </>
  );
}
