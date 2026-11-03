import type { CSSProperties } from "react";
import s from "./Headline.module.css";

/**
 * The sign-in wall's headline (2026-11-03, the owner's iPad: "upgrade this — ultra modern, unique"). Three glass word tokens —
 * Orders, Rooms, Stock, in the live board's own hues (kitchen orange, front desk blue, pantry violet) — joined by a line a light
 * runs along, each lighting as it passes; then "All on one board." in a slow sheen; then what it does as two chips.
 * Pure CSS motion, still for reduced motion. Each visible phrase is one text node, so the whole-app Tamil / Hindi pass
 * translates it whole; the h1's full sentence is kept for screen readers.
 */
const WORDS = [
  { k: "orders", word: "Orders", hue: "var(--color-orange)", icon: "M7 21h10M12 3a5 5 0 0 0-5 5c0 2 1 3 1 5h8c0-2 1-3 1-5a5 5 0 0 0-5-5Z" },
  { k: "rooms", word: "Rooms", hue: "var(--color-blue)", icon: "M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 18h18M7 9V6h10v3" },
  { k: "stock", word: "Stock", hue: "var(--color-violet)", icon: "M4 7l8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4" },
] as const;
const FACTS = [
  { k: "kitchen", text: "Phone orders reach the kitchen at once", icon: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z" },
  { k: "stock", text: "Stock updates by itself", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" },
] as const;

const Svg = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

export function Headline() {
  return (
    <div className={s.wrap} data-auth-headline>
      <h1 className={s.h1}>
        <span className="sr-only">Orders, rooms and stock on one board.</span>
        <span className={s.tokens} aria-hidden>
          {WORDS.map((w, i) => (
            <span key={w.k} className={s.tokenSlot} style={{ "--hue": w.hue, "--i": i } as CSSProperties}>
              {i > 0 && <span className={s.wire}><span className={s.spark} /></span>}
              <span className={s.token} data-word={w.k}>
                <span className={s.tokenIcon}><Svg d={w.icon} size={18} /></span>
                <span className={s.tokenWord}>{w.word}</span>
              </span>
            </span>
          ))}
        </span>
        <span className={s.big} aria-hidden>All on one board.</span>
      </h1>
      <ul className={s.facts}>
        {FACTS.map((f, i) => (
          <li key={f.k} className={s.fact} style={{ "--i": i } as CSSProperties}>
            <span className={s.factIcon}><Svg d={f.icon} size={14} /></span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
