"use client";
import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/components/ui";
import { SIDEBAR_STYLES, chosenSidebar, currentSidebar, setSidebar, type SidebarStyle } from "@/lib/sidebar";

/** A drawing of a look: the dark bar at its width (floating on a card, icons, icons over words), the page beside it. */
function Sketch({ k }: { k: SidebarStyle }) {
  const icons = k === "rail" || k === "dock" || k === "float-rail";
  const float = k === "floating" || k === "float-rail";
  const w = k === "full" ? 34 : k === "compact" ? 27 : k === "floating" ? 31 : k === "dock" ? 17 : 13;
  return (
    <span className="relative block h-[58px] w-full rounded-[10px] overflow-hidden bg-[var(--color-fill)]" aria-hidden>
      <span className={cn("absolute flex flex-col gap-[4px] bg-[#16161b]", float ? "left-[4px] top-[4px] bottom-[4px] rounded-[7px] shadow-[0_3px_8px_rgb(0_0_0/.35)]" : "left-0 top-0 bottom-0", icons ? "items-center pt-[7px]" : "px-[5px] pt-[7px]")} style={{ width: `${w}%` }}>
        {Array.from({ length: 5 }, (_, i) => icons
          ? <span key={i} className="flex flex-col items-center gap-[2px]"><span className={cn("h-[4px] w-[4px] rounded-[1.5px]", i === 1 ? "bg-[var(--color-tint)]" : "bg-white/45")} />{k === "dock" && <span className="h-[1.5px] w-[8px] rounded bg-white/25" />}</span>
          : <span key={i} className="flex items-center gap-[3px]"><span className={cn("h-[4px] w-[4px] shrink-0 rounded-[1.5px]", i === 1 ? "bg-[var(--color-tint)]" : "bg-white/45")} /><span className={cn("h-[2px] rounded flex-1", i === 1 ? "bg-white/70" : "bg-white/25")} /></span>)}
      </span>
      <span className="absolute right-[6px] top-[8px] flex flex-col gap-[5px]" style={{ left: `calc(${w}% + ${float ? 10 : 7}px)` }}>
        <span className="h-[5px] w-3/5 rounded bg-[var(--color-label-3)] opacity-60" /><span className="h-[12px] rounded-[3px] bg-[var(--color-bg-2)]" /><span className="h-[12px] rounded-[3px] bg-[var(--color-bg-2)]" />
      </span>
    </span>
  );
}

/**
 * Menu style, on My profile → This device (2026-10-23): the six looks as drawings; a tap applies one at once and keeps it on
 * this device. "As the screen" goes back to the default — icons on an iPad, the whole menu on a laptop. Hidden on a phone,
 * which has the bottom bar and no sidebar.
 */
export function SidebarPicker({ inSheet = false }: { inSheet?: boolean }) {
  const [now, setNow] = useState<SidebarStyle | null>(null); const [chosen, setChosen] = useState<SidebarStyle | null>(null);
  useEffect(() => { const sync = () => { setNow(currentSidebar()); setChosen(chosenSidebar()); }; sync(); window.addEventListener("df-sidebar", sync); window.addEventListener("resize", sync); return () => { window.removeEventListener("df-sidebar", sync); window.removeEventListener("resize", sync); }; }, []);
  return (
    <div className="max-md:hidden" data-sidebar-picker>
      <div className={cn("mb-2 flex items-center gap-2", inSheet ? "min-h-9" : "mt-6")}><span className="text-[13px] font-semibold text-[var(--color-label-2)] flex-1">{inSheet ? "Six looks · this device" : "Menu style"}</span>
        {chosen && <button type="button" onClick={() => setSidebar(null)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-bold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]" data-sidebar-reset><RotateCcw size={13} aria-hidden />As the screen</button>}</div>
      <div className={cn("grid gap-2.5", inSheet ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 lg:grid-cols-6")} role="radiogroup" aria-label="Menu style">
        {SIDEBAR_STYLES.map((s) => { const on = now === s.key; return (
          <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => setSidebar(s.key)} title={s.hint} data-sidebar-style={s.key}
            className={cn("relative min-w-0 text-left rounded-[16px] p-2 border transition-colors", on ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_8%,var(--color-bg-2))]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] hover:bg-[var(--color-fill)]")}>
            <Sketch k={s.key} />
            <span className="mt-2 flex items-center gap-1.5 min-w-0"><span className="text-[13px] font-bold truncate flex-1">{s.label}</span>{on && <Check size={14} strokeWidth={3} className="shrink-0 text-[var(--color-tint)]" aria-hidden />}</span>
            <span className="block text-[11.5px] text-[var(--color-label-2)] leading-snug line-clamp-2">{s.hint}</span>
          </button>); })}
      </div>
      <p className="mt-2 text-[12px] text-steel">{chosen ? "Kept on this device" : "Follows screen size"}</p>
    </div>
  );
}
