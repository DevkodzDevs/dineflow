"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { Flip, reducedMotion } from "./flip";
import { shuffleFrame, settleSteps, countFrames, clockText, clockTone, twelveHour } from "@/lib/flap";

/* ═══ Flap numbers (2026-10-20, the owner's six approved designs) ═══════════════════════════════════════
   The numbers people watch all day, on the app's own split-flap tile (Flip in ./flip — no second tile):
     FlapShuffle  a count that shuffles and settles left → right when it changes   — control room, front desk, kitchen
     FlapSpell    a word or code whose letters flick and land                       — order board call, Pulse's table, kitchen stations
     FlapPercent  a count up to a percentage with a bar filling under it            — occupancy, checklists
     FlapClock    a ticking age (mm:ss, then h:mm) or a fixed time, amber → red     — KOT age, booking times, waits, "in since"
     FlapMini     one or two small tiles that flip in a badge or a button           — till counts, "n new" badges
     FlapBreathe  a count inside a softly pulsing ring while something waits        — parties waiting, new online orders
   Every one: the server and the first paint show the settled value (no hydration mismatch, no layout shift); it
   animates only when the value changes after that; a screen reader hears the settled value, never a shuffle frame;
   with reduce-motion on, the value simply changes. Money is never a flap — flaps count things (design-system.md). */
const cn = (...a: Parameters<typeof clsx>) => clsx(...a);
type Tone = "live" | "alert" | "warn";
type Size = "md" | "sm" | "xs";

/** The value to draw: the settled one, or a frame of its settle while it changes. */
function useSettle(target: string): { shown: string; busy: boolean } {
  const [shown, setShown] = useState(target); const [busy, setBusy] = useState(false);
  const last = useRef(target);
  useEffect(() => {
    if (target === last.current) return;
    last.current = target;
    if (reducedMotion()) { setShown(target); return; }
    const steps = settleSteps(target); let step = 0;
    setBusy(true); setShown(shuffleFrame(target, 0));
    const id = setInterval(() => { step++; setShown(shuffleFrame(target, step)); if (step >= steps) { clearInterval(id); setBusy(false); } }, 110);
    return () => { clearInterval(id); setShown(target); setBusy(false); };
  }, [target]);
  return { shown, busy };
}

/** A number counted from its last value to the new one in eight steps (the percent counter). */
function useCount(target: number): number {
  const [n, setN] = useState(target); const last = useRef(target);
  useEffect(() => {
    if (target === last.current) return;
    const from = last.current; last.current = target;
    if (reducedMotion()) { setN(target); return; }
    const frames = countFrames(from, target, 8); let i = 0;
    const id = setInterval(() => { setN(frames[i]); if (++i >= frames.length) clearInterval(id); }, 70);
    return () => { clearInterval(id); setN(target); };
  }, [target]);
  return n;
}

/* one 1-second ticker for every clock on the page (not one timer per tile); 0 until the page is on the device */
let now = 0; let timer: ReturnType<typeof setInterval> | undefined; const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  if (!timer) { now = Date.now(); timer = setInterval(() => { now = Date.now(); subs.forEach((s) => s()); }, 1000); }
  return () => { subs.delete(f); if (!subs.size && timer) { clearInterval(timer); timer = undefined; } };
};
const idle = () => () => {};
/** The ticker's time, every second — or, with `on` false, never subscribed (a fixed time needs no ticking). */
export const useNow = (on = true) => useSyncExternalStore(on ? subscribe : idle, () => (on ? now : 0), () => 0);

type Common = { label?: string; say?: string; tone?: Tone; size?: Size; tile?: string; className?: string; bare?: boolean };

/** A small flap (an "xs" one, or one given its own height) gets the compact proportions and never goes below 30px —
 *  a 30px tile sets its digits at ~19px, the smallest that still reads at a glance (2026-10-20, after the first
 *  browser pass found 17–26px tiles squeezed to narrow black capsules). */
const MIN_TILE = "30px";
const fit = (tile: string | undefined, size: Size) => {
  const small = size === "xs" || !!tile;
  return { tile: tile ? `max(${MIN_TILE}, ${tile})` : size === "xs" ? MIN_TILE : undefined, compact: small };
};

/** 1 · A count that shuffles and settles when it changes. `pad` gives a lone digit its leading zero (as Flip does). */
export function FlapShuffle({ value, pad = 2, label, say, tone, size = "sm", tile, className, bare }: Common & { value: number | string; pad?: number }) {
  const raw = String(value); const target = pad > 0 && /^\d+$/.test(raw) ? raw.padStart(pad, "0") : raw;
  const { shown, busy } = useSettle(target); const f = fit(tile, size);
  return <Flip value={shown} pad={0} size={size} tone={tone} tile={f.tile} compact={f.compact} bare={bare} fast={busy} className={className} label={label} say={say ?? (label ? `${raw} ${label}` : raw)} />;
}

/** 2 · A word or code whose letters flick and land ("#14", "T4", "GRILL"). Shown in capitals. */
export function FlapSpell({ text, label, say, tone, size = "sm", tile, className, bare }: Common & { text: string }) {
  const target = text.toUpperCase(); const { shown, busy } = useSettle(target); const f = fit(tile, size);
  return <Flip value={shown} pad={0} size={size} tone={tone} tile={f.tile} compact={f.compact} bare={bare} fast={busy} className={className} label={label} say={say ?? text} />;
}

/** 3 · A percentage counted up (or down) to its value, with a bar filling under the tiles. */
export function FlapPercent({ value, bar = true, label, say, tone, size = "sm", tile, className, bare }: Common & { value: number; bar?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value))); const n = useCount(v); const f = fit(tile, size);
  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      {/* the bar sits in the gap under the tile, not below it, so a label lines up with its neighbours' labels */}
      <span className="relative inline-flex">
        <Flip value={`${n}%`} pad={0} size={size} tone={tone ?? (v >= 100 ? "live" : undefined)} tile={f.tile} compact={f.compact} bare={bare} say={say ?? `${v}%${label ? ` ${label}` : ""}`} />
        {bar && <span className="flap-bar" aria-hidden><i style={{ width: `${n}%` }} /></span>}
      </span>
      {label && <span className="flip-label">{label}</span>}
    </span>
  );
}

/**
 * 4 · A clock in tiles. `since` (an ISO time): the age, ticking — mm:ss, then h:mm after an hour — amber at `hurry`
 * minutes and red at `late`. `at` ("13:00" / "13:00:00"): a fixed time on a 12-hour face, its AM/PM beside it.
 * The age is drawn once the page is on the device (the server cannot know the second); until then an invisible
 * placeholder holds its place, so nothing moves.
 */
export function FlapClock({ since, at, hurry, late, label, say, tone, size = "sm", tile, className, bare, half = true }: Common & { since?: string | null; at?: string | null; hurry?: number | null; late?: number | null; half?: boolean }) {
  const t = useNow(!at && !!since); const f = fit(tile, size);
  if (at) {
    const [face, ap] = twelveHour(at);
    return (
      <span className={cn("inline-flex items-end gap-1.5", className)}>
        <FlapShuffle value={face} pad={0} size={size} tone={tone} tile={tile} bare={bare} say={say ?? `${face} ${ap}`} />
        {half && <span className="flap-ap" aria-hidden>{ap}</span>}
        {label && <span className="flip-label">{label}</span>}
      </span>
    );
  }
  const start = since ? Date.parse(since) : NaN;
  if (!t || Number.isNaN(start)) {
    return <span className={cn("invisible", className)} aria-hidden><Flip value="00:00" pad={0} size={size} tile={f.tile} compact={f.compact} bare={bare} /></span>;
  }
  const ms = t - start;
  return <Flip key="on" value={clockText(ms)} pad={0} size={size} tile={f.tile} compact={f.compact} bare={bare} className={className} label={label} quiet
    tone={tone ?? clockTone(ms, hurry, late)} say={say ?? `${Math.floor(ms / 60000)} minutes`} />;
}

/** 5 · One or two small tiles flipping on change — for a badge, a chip or a button. */
export function FlapMini({ value, say, tone, tile = MIN_TILE, className }: Omit<Common, "size" | "bare" | "label"> & { value: number | string }) {
  return <FlapShuffle value={value} pad={0} size="xs" tile={tile} bare tone={tone} say={say ?? String(value)} className={cn("flap-mini", className)} />;
}

/** 6 · A count whose tile glows outward from its own edge while something is waiting (`on`, by default when the count is
 *  above 0). The glow is a box-shadow outside the tile's border — it never crosses the digits — and the wrapper keeps
 *  room for it. `tone="alert"` glows red. */
export function FlapBreathe({ value, on, label, say, tone = "live", size = "sm", tile, className, pad = 2 }: Common & { value: number; on?: boolean; pad?: number }) {
  const active = on ?? value > 0;
  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <span className={cn("flap-breathe", active && "on", tone === "alert" && "alert")}><FlapShuffle value={value} pad={pad} tone={active ? tone : undefined} size={size} tile={tile} say={say ?? `${value}${label ? ` ${label}` : ""}`} /></span>
      {label && <span className="flip-label">{label}</span>}
    </span>
  );
}
