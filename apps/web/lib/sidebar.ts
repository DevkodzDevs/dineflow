/**
 * The sidebar's looks (2026-10-23, the owner: "a minimise for the left bar — icons only — and five or six designs to choose
 * from, each fitting every section and every screen; the iPad keeps its own as its default; the phone is not touched").
 *
 * `html[data-sidebar]` carries the look; globals.css (the sidebar block) draws each from 768px up — below that a phone has
 * the bottom bar and no sidebar. SIDEBAR_BOOT sets it in <head> before the first paint, so nothing jumps: the look this
 * device chose (localStorage df-sidebar), else "rail" under 1280 (every iPad, as before) and "full" from 1280 (as before).
 * Collapse folds the open looks to their icon look and remembers which to unfold to (df-sidebar-was).
 */
export const SIDEBAR_STYLES = [
  { key: "full", label: "Classic", hint: "The whole menu, with headings" },
  { key: "compact", label: "Compact", hint: "Narrower, with tighter rows" },
  { key: "rail", label: "Icons", hint: "Icons only; ☰ opens the menu" },
  { key: "dock", label: "Icons and words", hint: "A small word under each icon" },
  { key: "floating", label: "Floating", hint: "The whole menu on a card" },
  { key: "float-rail", label: "Floating icons", hint: "Icons on a floating card" },
] as const;
export type SidebarStyle = (typeof SIDEBAR_STYLES)[number]["key"];
const KEYS = SIDEBAR_STYLES.map((s) => s.key) as readonly string[];
const KEY = "df-sidebar", WAS = "df-sidebar-was";
/** the looks that show icons only, with ☰ opening the whole menu over the page */
export const ICON_LOOKS: readonly SidebarStyle[] = ["rail", "dock", "float-rail"];

/** Runs in <head>, before the body paints. Kept in step with KEYS by a unit test (sidebar.test.ts). */
export const SIDEBAR_BOOT = `(function(){var d=document.documentElement,s=null;try{s=localStorage.getItem('${KEY}')}catch(e){}var ok=${JSON.stringify(KEYS)};d.setAttribute('data-sidebar',ok.indexOf(s)>-1?s:(innerWidth<1280?'rail':'full'))})()`;

export const defaultSidebar = (width: number): SidebarStyle => (width < 1280 ? "rail" : "full");
export function chosenSidebar(): SidebarStyle | null {
  try { const s = localStorage.getItem(KEY); return s && KEYS.includes(s) ? (s as SidebarStyle) : null; } catch { return null; }
}
export const currentSidebar = (): SidebarStyle => (document.documentElement.getAttribute("data-sidebar") as SidebarStyle | null) ?? defaultSidebar(window.innerWidth);
/** Choose a look on this device (null: back to the default for the width); applies at once and tells the screen. */
export function setSidebar(s: SidebarStyle | null) {
  try { if (s) localStorage.setItem(KEY, s); else localStorage.removeItem(KEY); } catch { /* the look still applies for this visit */ }
  document.documentElement.setAttribute("data-sidebar", s ?? defaultSidebar(window.innerWidth));
  window.dispatchEvent(new Event("df-sidebar"));
}
/** The fold: an open look goes to its icon look; an icon look unfolds to the one it was folded from (else Classic, or
 *  Floating for the floating icons). */
export const foldedOf = (s: SidebarStyle): SidebarStyle => (s === "floating" ? "float-rail" : "rail");
export function toggleFold() {
  const now = currentSidebar();
  if (ICON_LOOKS.includes(now)) {
    let was: string | null = null; try { was = localStorage.getItem(WAS); } catch { /* none */ }
    setSidebar(was && KEYS.includes(was) && !ICON_LOOKS.includes(was as SidebarStyle) ? (was as SidebarStyle) : now === "float-rail" ? "floating" : "full");
  } else {
    try { localStorage.setItem(WAS, now); } catch { /* fine */ }
    setSidebar(foldedOf(now));
  }
}
