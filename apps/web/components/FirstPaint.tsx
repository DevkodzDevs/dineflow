"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PresenceContext } from "framer-motion";

/* "Already here": what AnimatePresence tells its children with initial={false}; then the same context
   with `initial` left alone. It must stay an object — swapped for null, framer-motion takes a different
   hook path on the next render and React throws #311 (hooks changed between renders). */
const register = () => () => {};
const SETTLED = { id: "first-paint", isPresent: true, initial: false as const, register };
const LIVE = { id: "first-paint", isPresent: true, register };

/**
 * Content that is on the page when it arrives is shown, not faded in.
 *
 * Fifty-odd places — every StatTile through <Reveal>, most page sections, the top bar — enter with
 * `initial={{ opacity: 0 }}`. framer-motion renders that on the server as `style="opacity:0"`, so the
 * HTML a phone receives is invisible until the animation library has downloaded, parsed and run. On a
 * first visit over 4G with a mid-range CPU that held the page blank for ~1.5 s after its HTML had
 * already arrived (LCP waits for it).
 *
 * For the first render only — the server render and the hydration that follows it — this provides
 * the same "initial: false" presence context AnimatePresence gives its children, so framer-motion
 * renders every motion element in its `animate` state: visible in the HTML, and no entrance animation
 * on hydration. After that `initial` is dropped from the context, so a screen opened by navigation, a sheet, a
 * toast or a list item added later animates in exactly as before.
 */
export function FirstPaint({ children }: { children: ReactNode }) {
  const [first, setFirst] = useState(true);
  useEffect(() => { setFirst(false); }, []);
  return <PresenceContext.Provider value={first ? SETTLED : LIVE}>{children}</PresenceContext.Provider>;
}
