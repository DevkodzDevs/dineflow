"use client";
import { useEffect } from "react";

/**
 * A TV is dark whatever the till is set to (0179, 2026-11-10). The screen layout wrapped its pages in a div with
 * data-theme="dark", but the themes are written on <html> by THEME_BOOT from the df-theme cookie ("system" follows the
 * device's light preference) and `ThemeKeeper` (components/ui/Theme.tsx) puts that theme back the moment anything changes
 * it — so a TV opened from a browser that had used the app in paper, or whose OS is set light, came up light. This marks
 * <html data-screen-dark> for as long as a screen page is open; ThemeKeeper reads the mark and keeps dark instead, and
 * puts the cookie's theme back when the mark goes. No second observer here — two keepers fighting hang the page.
 */
export function ForceDark() {
  useEffect(() => {
    const h = document.documentElement;
    h.setAttribute("data-screen-dark", "");
    h.setAttribute("data-theme", "dark"); h.removeAttribute("data-palette");   // ThemeKeeper sees the mark and agrees
    return () => { h.removeAttribute("data-screen-dark"); h.setAttribute("data-theme", "paper"); /* any change: ThemeKeeper resolves the cookie again */ };
  }, []);
  return null;
}
