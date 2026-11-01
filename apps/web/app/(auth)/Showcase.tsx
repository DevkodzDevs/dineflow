"use client";
import { useEffect, useState, type CSSProperties } from "react";
import s from "./Showcase.module.css";

/**
 * The sign-in wall's live board (2026-11-02, the owner: "the space under the clock is empty — ultra modern, 3D, animated;
 * don't touch the flap clock"). A glass panel tilted in perspective, four tiles of what DineFlow runs — the kitchen, the
 * front desk, the pantry, the till — one lifting toward the viewer every few seconds, a bar chart of the evening growing
 * under them, a lit floor and a soft orb behind. Pure CSS motion (no library on this route); still for reduced motion.
 * The words are the product's own, not a real property's.
 */
const TILES = [
  { k: "kitchen", hue: "var(--color-orange)", icon: "M7 21h10M12 3a5 5 0 0 0-5 5c0 2 1 3 1 5h8c0-2 1-3 1-5a5 5 0 0 0-5-5Z", label: "Kitchen", title: "Table 4 · 2 dishes", pill: "Cooking" },
  { k: "desk", hue: "var(--color-blue)", icon: "M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 18h18M7 9V6h10v3", label: "Front desk", title: "Room 204 · Meera", pill: "Checked in" },
  { k: "pantry", hue: "var(--color-violet)", icon: "M4 7l8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4", label: "Pantry", title: "Paneer · 2.4 kg", pill: "Reorder" },
  { k: "till", hue: "var(--color-green)", icon: "M3 7h18v10H3zM7 12h.01M12 12a2 2 0 1 0 0-.01M17 12h.01", label: "Till", title: "Bill 218 · ₹1,240", pill: "Paid · UPI" },
] as const;
const BARS = [38, 52, 44, 68, 60, 82, 74, 96];

export function Showcase() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const i = setInterval(() => setOn((x) => (x + 1) % TILES.length), 2800);
    return () => clearInterval(i);
  }, []);
  return (
    <div className={s.stage} aria-hidden data-auth-showcase>
      <div className={s.orb} />
      <div className={s.floor} />
      <div className={s.panel}>
        <div className={s.head}>
          <span className={s.live}><span className={s.liveDot} />Live</span>
          <span className={s.headTitle}>Tonight, on one board</span>
          <span className={s.headNum}>32 covers</span>
        </div>
        <div className={s.grid}>
          {TILES.map((t, i) => (
            <div key={t.k} className={s.tile} data-on={i === on} style={{ "--hue": t.hue, "--i": i } as CSSProperties}>
              <span className={s.icon}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              </span>
              <span className={s.text}>
                <span className={s.label}>{t.label}</span>
                <span className={s.title}>{t.title}</span>
              </span>
              <span className={s.pill}><span className={s.pillDot} />{t.pill}</span>
            </div>
          ))}
        </div>
        <div className={s.chart}>
          {BARS.map((h, i) => <span key={i} className={s.bar} style={{ "--h": `${h}%`, "--i": i } as CSSProperties} />)}
        </div>
      </div>
    </div>
  );
}
