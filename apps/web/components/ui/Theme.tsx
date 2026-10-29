"use client";
import { Moon, Sun, MonitorSmartphone, Palette, Sparkles, Crown, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn, tap } from "./index";
import { saveTheme } from "@/lib/themeAction";
import { lookFor, readThemeCookie, type ThemeChoice } from "@/lib/themeLook";

/** "dark" (the board), "paper" (a bright room), "colour" (bright colours on deep indigo, 0117), "bright"
 *  (bright colours on a light page, 0118), "royal" (navy, burgundy and gold on ivory, solid colours, 0119) or "system" (follow the device — dark or paper, whichever it asks
 *  for). The choice is kept in a cookie on the device and on the person's login (user_prefs, 0078); until
 *  someone chooses, the app follows the device.
 *
 *  "bright" is drawn as the paper theme with a palette on top — <html data-theme="paper" data-palette="bright">
 *  — so every rule written for dark text on a light surface stays right without being repeated. */
export type ThemeMode = ThemeChoice;
/** The bar colour a phone draws above the page, per theme. */
const BAR: Record<string, string> = { dark: "#0a0a0d", paper: "#1b1d23", colour: "#0c0624", bright: "#4c1d95", royal: "#14213d" };
const KEY = "df-theme";
/** What <html> wears for a choice: its data-theme, and its data-palette (or none) — lib/themeLook.ts, tested. */
const look = (mode: ThemeMode) => lookFor(mode, matchMedia("(prefers-color-scheme: light)").matches);
const wear = (html: HTMLElement, l: { theme: string; palette: string | null }) => {
  if (html.getAttribute("data-theme") !== l.theme) html.setAttribute("data-theme", l.theme);
  if (l.palette) { if (html.getAttribute("data-palette") !== l.palette) html.setAttribute("data-palette", l.palette); }
  else if (html.hasAttribute("data-palette")) html.removeAttribute("data-palette");
};

export function applyTheme(mode: ThemeMode) {
  wear(document.documentElement, look(mode));
  document.cookie = `${KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", BAR[mode === "system" ? look(mode).theme : mode] ?? BAR.dark);
}
export function readTheme(): ThemeMode { return readThemeCookie(document.cookie); }
/** Runs before paint so a light-mode user never sees a dark flash (and vice versa). */
export const THEME_BOOT = `(function(){try{var m=(document.cookie.match(/(?:^|; )df-theme=(dark|paper|colour|bright|royal|system)/)||[])[1]||"system";var h=document.documentElement;var p=m==="bright"||m==="royal";var r=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"paper":"dark"):p?"paper":m;h.setAttribute("data-theme",r);if(p)h.setAttribute("data-palette",m);}catch(e){}})();`;

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");
  useEffect(() => { setMode(readTheme()); const mq = matchMedia("(prefers-color-scheme: light)"); const f = () => { if (readTheme() === "system") applyTheme("system"); }; mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  // a choice made here is the person's choice: applied now, and saved to their login for every device
  return { mode, set: (m: ThemeMode) => { setMode(m); applyTheme(m); tap(); void saveTheme(m); } };
}

const OPTIONS: { v: ThemeMode; label: string; Icon: typeof Moon; hint: string }[] = [
  { v: "dark", label: "Dark", Icon: Moon, hint: "Kitchen or night" },
  { v: "paper", label: "Light", Icon: Sun, hint: "Daylight counters" },
  { v: "colour", label: "Colourful dark", Icon: Palette, hint: "Bright on deep blue" },
  { v: "bright", label: "Colourful light", Icon: Sparkles, hint: "Bright on light" },
  { v: "royal", label: "Royal classic", Icon: Crown, hint: "Navy, maroon, gold" },
  { v: "system", label: "Follow device", Icon: MonitorSmartphone, hint: "Matches your device" },
];
/** A small swatch of each theme, so the choice is seen before it is made. */
const SWATCH: Record<ThemeMode, string> = {
  dark: "linear-gradient(135deg, #15161b 0 55%, #3fbe7c 55% 70%, #1d1f26 70%)",
  paper: "linear-gradient(135deg, #efece5 0 55%, #17794a 55% 70%, #fffdf9 70%)",
  colour: "linear-gradient(135deg, #2a1166 0 30%, #ff5ca8 30% 50%, #ffb547 50% 62%, #2fe1f5 62% 76%, #2ee6a0 76%)",
  bright: "linear-gradient(135deg, #f6f1ff 0 34%, #ec4899 34% 50%, #f97316 50% 62%, #06b6d4 62% 76%, #8b5cf6 76%)",
  royal: "linear-gradient(135deg, #faf6ee 0 40%, #1e3a8a 40% 62%, #8b1d3b 62% 80%, #b8913a 80%)",
  system: "linear-gradient(135deg, #15161b 0 50%, #efece5 50%)",
};

/** The Settings screen's six choices, as cards. */
export function ThemePicker() {
  const { mode, set } = useTheme();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-theme-picker>
      {OPTIONS.map(({ v, label, Icon, hint }) => (
        <button key={v} type="button" onClick={() => set(v)} aria-pressed={mode === v} data-theme-option={v} className={cn("feather text-left p-4 flex gap-3 items-start transition min-w-0", mode === v ? "ring-2 ring-[var(--color-tint)]" : "hover:bg-[var(--color-fill)]")}>
          <span className={cn("h-11 w-11 rounded-xl grid place-items-center shrink-0 ring-1 ring-[var(--color-separator)]", mode === v ? "text-white" : "text-white/90")} style={{ background: SWATCH[v] }}><Icon size={18} className="drop-shadow-[0_1px_2px_rgb(0_0_0/.6)]" /></span>
          <span className="min-w-0"><span className="block font-semibold text-[15px]">{label}</span><span className="block text-[13px] text-[var(--color-label-2)] mt-0.5">{hint}</span></span>
        </button>
      ))}
    </div>
  );
}

/** The top bar's theme button: a small menu of the six choices, showing the one in use. */
export function ThemeButton() {
  const { mode, set } = useTheme();
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<string>("dark");
  useEffect(() => { const h = document.documentElement; setNow(h.getAttribute("data-palette") ?? h.getAttribute("data-theme") ?? "dark"); }, [mode]);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const Cur = now === "royal" ? Crown : now === "bright" ? Sparkles : now === "paper" ? Sun : now === "colour" ? Palette : Moon;
  const cur = OPTIONS.find((o) => o.v === mode) ?? OPTIONS[OPTIONS.length - 1];
  return (
    <div ref={box} className="relative" data-theme-menu>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={`Theme: ${cur.label}`} title={`Theme: ${cur.label}`}
        className="h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)] text-[var(--color-label-2)]"><Cur size={20} /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-24px)] rounded-2xl bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[var(--shadow-pop)] p-1.5">
          <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-2)]">Theme</div>
          {OPTIONS.map(({ v, label, Icon }) => (
            <button key={v} type="button" role="menuitemradio" aria-checked={mode === v} data-theme-option={v} onClick={() => { set(v); setOpen(false); }}
              className={cn("w-full !min-h-12 rounded-xl px-3 flex items-center gap-3 text-left text-[15px] font-semibold hover:bg-[var(--color-fill)]", mode === v && "bg-[var(--color-fill)]")}>
              <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0 text-white ring-1 ring-[var(--color-separator)]" style={{ background: SWATCH[v] }}><Icon size={15} className="drop-shadow-[0_1px_2px_rgb(0_0_0/.6)]" /></span>
              <span className="flex-1">{label}</span>{mode === v && <Check size={16} className="text-[var(--color-tint)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the page should be wearing right now for this device's cookie (or the device, if none). */
const resolved = () => look(readTheme());

/**
 * Holds the page to the chosen theme. The server always sends <html data-theme="dark"> (it cannot see
 * the device's setting) and THEME_BOOT corrects it before paint — but when React has to rebuild a
 * page's tree it re-applies the server's <html> attributes, and that page flipped back to dark while
 * every other page stayed light (Front desk, measured 2026-10-07). This watches the attribute and puts
 * the right value back the moment anything changes it, and follows the device live under "system".
 */
export function ThemeKeeper() {
  useEffect(() => {
    const html = document.documentElement;
    const fix = () => wear(html, resolved());
    fix();
    const mo = new MutationObserver(fix); mo.observe(html, { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
    const mq = matchMedia("(prefers-color-scheme: light)"); const sys = () => { if (readTheme() === "system") fix(); };
    mq.addEventListener("change", sys);
    return () => { mo.disconnect(); mq.removeEventListener("change", sys); };
  }, []);
  return null;
}

/**
 * Adopts the theme saved on the signed-in person's login. Rendered by the app layout with the value
 * session_bundle carried, so a phone that has never seen this person still opens in their theme.
 * Nothing saved yet → leave the device's own setting alone.
 */
export function ThemeSync({ pref }: { pref: ThemeMode | null | undefined }) {
  useEffect(() => { if (pref && pref !== readTheme()) applyTheme(pref); }, [pref]);
  return null;
}
