"use client";
import type { Transition, Variants } from "framer-motion";

/**
 * One motion vocabulary for the whole product. Four springs, and every animation in the app is
 * built from them, so a sheet, a page and a flip tile all feel like the same machine.
 *
 *   snap   — a control answering a finger: fast, barely overshoots
 *   glide  — things arriving on screen: cards, rows, panels
 *   settle — heavy things: sheets, pages, the deck
 *   flip   — the split-flap turn; a curve, not a spring, because a flap is mechanical
 *
 * Durations are short on purpose: this is used mid-service, one-handed, on a ₹8,000 phone.
 */
export const snap: Transition = { type: "spring", stiffness: 520, damping: 32, mass: .6 };
export const glide: Transition = { type: "spring", stiffness: 300, damping: 30, mass: .8 };
export const settle: Transition = { type: "spring", stiffness: 220, damping: 28, mass: .9 };
export const flipT: Transition = { duration: .42, ease: [.32, .72, 0, 1] };
export const fast: Transition = { duration: .16, ease: [.16, 1, .3, 1] };

/** Cards and rows arriving: a short rise with the blur coming off, staggered down the list. */
export const listV: Variants = { hidden: {}, show: { transition: { staggerChildren: .035, delayChildren: .02 } } };
export const itemV: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: glide },
  exit: { opacity: 0, y: -6, filter: "blur(4px)", transition: fast },
};
/** A pushed page: slides from the right and settles, the previous one dimming behind it. */
export const pageV: Variants = {
  hidden: { opacity: 0, x: 28, scale: .985 },
  show: { opacity: 1, x: 0, scale: 1, transition: settle },
  exit: { opacity: 0, x: -14, scale: .99, transition: fast },
};
/** Bottom sheet on phones, centred card on desktop. */
export const sheetV: Variants = {
  hidden: { y: "6%", scale: .97, opacity: 0 },
  show: { y: 0, scale: 1, opacity: 1, transition: settle },
  exit: { y: "4%", scale: .98, opacity: 0, transition: fast },
};
/** A number changing on a flip tile: the old face folds away, the new one falls in. */
export const flipV: Variants = {
  hidden: { rotateX: 90, opacity: 0 },
  show: { rotateX: 0, opacity: 1, transition: flipT },
  exit: { rotateX: -90, opacity: 0, transition: { duration: .2, ease: [.32, .72, 0, 1] } },
};
/** Press feedback shared by every tappable surface. */
export const press = { whileTap: { scale: .96 }, transition: snap } as const;
export const pressCard = { whileTap: { scale: .985 }, whileHover: { y: -2 }, transition: snap } as const;

/** True when the person has asked their system for less movement. Every animation checks this. */
export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
