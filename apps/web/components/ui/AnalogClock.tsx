"use client";
import { useEffect, useState } from "react";
import { clsx as cn } from "clsx";

const IST = 330 * 60 * 1000; // the business day is Asia/Kolkata, which has no daylight saving

/**
 * A wall clock for the Control room header — a round face with minute dots and hour bars (12, 3, 6, 9
 * longer), rounded hour and minute hands in the ink colour and a slim red second hand with a disc near
 * its tip, the way a station clock has it. Colours are tokens, so the face is white with a black ring
 * in paper and graphite with a light ring in dark.
 *
 * The hands are placed from the time in India each second, by script — not by a CSS animation. The
 * app turns every animation off under `prefers-reduced-motion` (globals.css), which would leave CSS
 * hands standing at twelve. The second hand ticks with a short transition; at midnight, when its
 * angle drops back, the transition is skipped so it does not sweep backwards round the dial.
 * Before mount there are no hands (no server/client mismatch); they fade in.
 */
export function AnalogClock({ className }: { className?: string }) {
  const [s, setS] = useState<{ t: number; jump: boolean } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + IST);
      const t = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
      setS((p) => ({ t, jump: !!p && t < p.t }));
    };
    tick();
    // fall in step with the real second, so the hand ticks when the second changes
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => { tick(); every = setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
    const back = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(first); if (every) clearInterval(every); document.removeEventListener("visibilitychange", back); };
  }, []);

  const t = s?.t ?? 0;
  const hour = t / 120, minute = t / 10, second = t * 6; // degrees: 360 per 12 h, per hour, per minute
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60);
  const label = s ? `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}` : "Clock";
  const at = (deg: number) => ({ transform: `rotate(${deg}deg)` });

  return (
    <svg viewBox="0 0 100 100" className={cn("analog-clock", className)} role="img" aria-label={label} data-time={s ? `${hh}:${String(mm).padStart(2, "0")}` : undefined}>
      <circle cx="50" cy="50" r="49" className="ac-bezel" />
      <circle cx="50" cy="50" r="46" className="ac-face" />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
        if (i % 5) return <circle key={i} cx={50 + 41.5 * sin} cy={50 - 41.5 * cos} r="0.75" className="ac-dot" />;
        const quarter = i % 15 === 0, r1 = quarter ? 33.5 : 36;
        return <line key={i} x1={50 + r1 * sin} y1={50 - r1 * cos} x2={50 + 42 * sin} y2={50 - 42 * cos} className="ac-tick" strokeWidth={quarter ? 3.4 : 2.2} />;
      })}
      <g className={cn("ac-hands", s && "on")}>
        <g className="ac-hand" data-hand="hour" style={at(hour)}><line x1="50" y1="57" x2="50" y2="28" className="ac-hour" /></g>
        <g className="ac-hand" data-hand="minute" style={at(minute)}><line x1="50" y1="59" x2="50" y2="14.5" className="ac-min" /></g>
        <g className={cn("ac-hand ac-sec", !s?.jump && "ticks")} data-hand="second" style={at(second)}>
          <line x1="50" y1="64" x2="50" y2="20" /><circle cx="50" cy="18" r="3.4" />
        </g>
        <circle cx="50" cy="50" r="2.4" className="ac-cap" />
      </g>
    </svg>
  );
}
