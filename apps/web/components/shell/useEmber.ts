"use client";
import { useEffect, useState } from "react";

/**
 * Is the page wearing the Ember theme (0186)? Ember changes the menu's shape — rows fold into drop-downs, a clock sits
 * under the menu, the top bar carries a greeting — and a shape is React's to draw, not CSS's. The server passes what the
 * df-theme cookie said (so the first paint already has the right shape); after that this follows <html data-palette>,
 * which ThemeKeeper and the theme menu write, so switching themes redraws the menu at once.
 */
export function useEmber(initial = false) {
  const [on, setOn] = useState(initial);
  useEffect(() => {
    const h = document.documentElement;
    const read = () => setOn(h.getAttribute("data-palette") === "ember");
    read();
    const mo = new MutationObserver(read); mo.observe(h, { attributes: true, attributeFilter: ["data-palette"] });
    return () => mo.disconnect();
  }, []);
  return on;
}
