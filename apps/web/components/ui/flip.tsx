"use client";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
const cn = (...a: Parameters<typeof clsx>) => clsx(...a);
/* ── The flip family, kept in a module of its own so a page that only needs a clock (the sign-in wall)
   compiles without the whole kit — no animation library, no icon set. ──────────────────────────── */
function Flap({ ch, delay }: { ch: string; delay: number }) {
  const [cur, setCur] = useState(ch); const [prev, setPrev] = useState<string | null>(null); const [n, setN] = useState(0);
  useEffect(() => { if (ch === cur) return; setPrev(cur); setCur(ch); setN((x) => x + 1); const t = setTimeout(() => setPrev(null), 520 + delay); return () => clearTimeout(t); }, [ch, cur, delay]);
  const turning = prev !== null;
  return (
    <span className={cn("flap", /^[.:·\-–]$/.test(cur) && "flap-narrow")} data-turning={turning}>
      {/* an invisible copy of the widest character in play sizes the flap to the glyph — a % or ₹ gets a wider plate than a 1 */}
      <span className="flap-size" aria-hidden>{turning && prev && prev.length ? (prev > cur ? prev : cur) : cur}</span>
      <span className="flap-half flap-top"><span>{cur}</span></span>
      <span className="flap-half flap-bottom"><span>{turning ? prev : cur}</span></span>
      {turning && <span key={`t${n}`} className="flap-half flap-top flap-turn-top" style={{ animationDelay: `${delay}ms` }}><span>{prev}</span></span>}
      {turning && <span key={`b${n}`} className="flap-half flap-bottom flap-turn-bottom" style={{ animationDelay: `${delay}ms` }}><span>{cur}</span></span>}
    </span>
  );
}
export function Flip({ value, label, size = "md", tone, className, pad }: { value: number | string; label?: string; size?: "md" | "sm" | "xs"; tone?: "live" | "alert"; className?: string; pad?: number }) {
  const text = typeof value === "number" && pad ? String(value).padStart(pad, "0") : String(value);
  const chars = text.split("");
  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div className={cn("flip", size !== "md" && size, tone)} aria-live="polite" aria-label={label ? `${text} ${label}` : text}>
        <span className="flip-stage">{chars.map((c, i) => <Flap key={`${chars.length}-${i}`} ch={c} delay={(chars.length - 1 - i) * 70} />)}</span>
        <span className="flip-pin left" /><span className="flip-pin right" />
      </div>
      {label && <div className="flip-label">{label}</div>}
    </div>
  );
}
/* ── Loaders. All built from the flap, so a loading state looks like the board searching for its
   number, not a spinner from somewhere else. ──────────────────────────────────────────────────── */
const DIGITS = "0123456789";
/**
 * Three flaps hunting through digits with a stagger, until `settle` is given — then they land on it.
 * size "xs" fits inside a button; "sm" a card; "md" a page.
 */
export function Loader({ size = "sm", settle, label, tone = "live", className }: { size?: "xs" | "sm" | "md"; settle?: string; label?: string; tone?: "live" | "alert" | "plain"; className?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => { if (settle !== undefined || reducedMotion()) return; const i = setInterval(() => setT((x) => x + 1), 380); return () => clearInterval(i); }, [settle]);
  const chars = settle !== undefined ? settle.padStart(3, " ").slice(-3).split("") : [0, 1, 2].map((i) => DIGITS[(t * 7 + i * 3) % 10]);
  return (
    <span className={cn("inline-flex flex-col items-center", className)} role="status" aria-live="polite" aria-label={label ?? "Loading"}>
      <span className={cn("flip", size === "md" ? "" : size === "sm" ? "sm" : "xs", tone !== "plain" && tone, "loader")}>
        <span className="flip-stage">{chars.map((c, i) => <Flap key={i} ch={c} delay={i * 90} />)}</span>
        <span className="flip-pin left" /><span className="flip-pin right" />
      </span>
      {label && <span className="flip-label">{label}</span>}
    </span>
  );
}
/**
 * The whole screen, while a page or the app itself loads: the mark thinking, the board searching,
 * and a line that changes so the wait never looks stuck. Respects reduce-motion (a still board).
 */
const LINES = ["Setting the board", "Reading the tickets", "Counting the floor", "Checking the till", "Warming the pass"];
export function PageLoader({ line, inline }: { line?: string; inline?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (line) return; const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 1600); return () => clearInterval(t); }, [line]);
  return (
    <div className={cn("grid place-items-center", inline ? "py-20" : "fixed inset-0 z-[60] bg-[var(--color-bg)]")} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-6 loader-in">
        <Loader size="md" />
        <div className="text-[14px] text-[var(--color-label-2)] font-display tracking-wide loader-line" key={line ?? i}>{line ?? LINES[i]}<span className="loader-dots" /></div>
      </div>
    </div>
  );
}
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Timed waits. When the length of a wait is known, show it: minutes and seconds ticking down on
   flaps, with a track emptying beneath. When only the expected length is known, fill towards it and
   never quite claim to be done. ──────────────────────────────────────────────────────────────── */
const mmss = (secs: number) => { const s = Math.max(0, Math.round(secs)); return [String(Math.floor(s / 60)).padStart(2, "0"), String(s % 60).padStart(2, "0")]; };
/**
 * A countdown. `seconds` is the total; it ticks to 0:00 and then says `doneLabel` ("now").
 * Re-render with a new `seconds` (a fresh quote) and it re-syncs without a jump.
 */
export function Countdown({ seconds, label, doneLabel = "now", size = "sm", tone, onDone, className }: { seconds: number; label?: string; doneLabel?: string; size?: "sm" | "md"; tone?: "live" | "alert"; onDone?: () => void; className?: string }) {
  const [end, setEnd] = useState(() => Date.now() + seconds * 1000); const [left, setLeft] = useState(seconds); const total = useRef(seconds);
  useEffect(() => { setEnd(Date.now() + seconds * 1000); total.current = Math.max(seconds, 1); setLeft(seconds); }, [seconds]);
  useEffect(() => { const i = setInterval(() => { const l = Math.max(0, (end - Date.now()) / 1000); setLeft(l); if (l === 0) { clearInterval(i); onDone?.(); } }, 250); return () => clearInterval(i); }, [end, onDone]);
  const [m, sec] = mmss(left); const pct = Math.max(0, Math.min(100, (left / total.current) * 100)); const done = left <= 0;
  return (
    <div className={cn("inline-flex flex-col items-center", className)} role="timer" aria-live="off" aria-label={`${m} minutes ${sec} seconds`}>
      <div className="flex items-center gap-1.5">
        {done ? <Flip value={doneLabel} size={size} tone="live" /> : <><Flip value={m} size={size} tone={tone} /><span className={cn("font-display text-[var(--color-label-3)]", size === "md" ? "text-4xl" : "text-2xl")}>:</span><Flip value={sec} size={size} tone={tone} /></>}
      </div>
      <div className={cn("wait-track", size === "md" ? "w-full" : "w-[calc(100%-8px)]")}><div className={cn("wait-fill", tone === "alert" && "alert", done && "done")} style={{ width: `${done ? 100 : pct}%` }} /></div>
      {label && <div className="flip-label !mt-2">{done ? doneLabel === "now" ? "your table" : label : label}</div>}
    </div>
  );
}
/**
 * A wait whose length is only expected — loading the sample estate, building an APK. The track fills
 * over `expect` seconds, then creeps, so it never claims to be done before the work is. Shows elapsed.
 */
export function Waiting({ expect, line, done, className }: { expect: number; line: string; done?: boolean; className?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => { if (done) return; const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, [done]);
  const pct = done ? 100 : t < expect ? (t / expect) * 88 : 88 + 10 * (1 - Math.exp(-(t - expect) / expect));
  const [m, sec] = mmss(t);
  return (
    <div className={cn("flex items-center gap-4", className)} role="status" aria-live="polite">
      {done ? <Flip value="✓" size="sm" tone="live" /> : <Loader size="sm" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] truncate">{done ? "Done" : line}<span className={cn(!done && "loader-dots")} /></span><span className="num text-[13px] text-[var(--color-label-2)] tabular-nums">{m}:{sec}{!done && t > expect && <span className="text-[var(--color-label-3)]"> · a little longer than usual</span>}</span></div>
        <div className="wait-track w-full mt-2"><div className={cn("wait-fill", done && "done")} style={{ width: `${pct}%`, transition: "width 1s linear" }} /></div>
      </div>
    </div>
  );
}

/** A live clock in three tiles, the way the reference board reads across a kitchen. */
export function FlipClock({ className }: { className?: string }) {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setT(new Date()); tick(); const i = setInterval(tick, 1000); return () => clearInterval(i); }, []);
  if (!t) return null;
  return <div className={cn("flip-row", className)}><Flip value={t.getHours()} pad={2} label="hour" /><Flip value={t.getMinutes()} pad={2} label="min" /><Flip value={t.getSeconds()} pad={2} label="sec" /></div>;
}
