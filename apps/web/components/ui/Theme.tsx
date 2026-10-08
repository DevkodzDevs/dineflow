"use client";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, tap } from "./index";
import { saveTheme } from "@/lib/themeAction";

/** "dark" (the board), "paper" (a bright room) or "system" (follow the device). The choice is kept
 *  in a cookie on the device and on the person's login (user_prefs, 0078); until someone chooses,
 *  the app follows the device. */
export type ThemeMode = "dark" | "paper" | "system";
const KEY = "df-theme";

export function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "dark") : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  document.cookie = `${KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", resolved === "paper" ? "#17171c" : "#0a0a0d");
}
export function readTheme(): ThemeMode {
  const m = document.cookie.match(/(?:^|; )df-theme=(dark|paper|system)/); return (m?.[1] as ThemeMode) ?? "system";
}
/** Runs before paint so a light-mode user never sees a dark flash (and vice versa). */
export const THEME_BOOT = `(function(){try{var m=(document.cookie.match(/(?:^|; )df-theme=(dark|paper|system)/)||[])[1]||"system";var r=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"paper":"dark"):m;document.documentElement.setAttribute("data-theme",r);}catch(e){}})();`;

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");
  useEffect(() => { setMode(readTheme()); const mq = matchMedia("(prefers-color-scheme: light)"); const f = () => { if (readTheme() === "system") applyTheme("system"); }; mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  // a choice made here is the person's choice: applied now, and saved to their login for every device
  return { mode, set: (m: ThemeMode) => { setMode(m); applyTheme(m); tap(); void saveTheme(m); } };
}

/** Three-way segmented control for the Settings screen. */
export function ThemePicker() {
  const { mode, set } = useTheme();
  const opts: { v: ThemeMode; label: string; Icon: typeof Moon; hint: string }[] = [
    { v: "dark", label: "Dark", Icon: Moon, hint: "The board. Best in a kitchen or at night." },
    { v: "paper", label: "Light", Icon: Sun, hint: "A bright room. Best at a daylight counter." },
    { v: "system", label: "Follow device", Icon: MonitorSmartphone, hint: "Switches with your phone or computer." },
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {opts.map(({ v, label, Icon, hint }) => (
        <button key={v} onClick={() => set(v)} aria-pressed={mode === v} className={cn("feather text-left p-4 flex gap-3 items-start transition", mode === v ? "ring-2 ring-[var(--color-tint)]" : "hover:bg-[var(--color-fill)]")}>
          <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", mode === v ? "bg-[var(--color-tint)] text-[#06120a]" : "bg-[var(--color-fill)]")}><Icon size={18} /></span>
          <span><span className="block font-semibold text-[15px]">{label}</span><span className="block text-[13px] text-[var(--color-label-2)] mt-0.5">{hint}</span></span>
        </button>
      ))}
    </div>
  );
}

/** One-tap toggle for the top bar: flips between dark and light, and shows which one you're on. */
export function ThemeButton() {
  const { mode, set } = useTheme();
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.getAttribute("data-theme") === "paper"); }, [mode]);
  return (
    <button onClick={() => set(light ? "dark" : "paper")} aria-label={light ? "Switch to dark" : "Switch to light"} title={light ? "Switch to dark" : "Switch to light"}
      className="h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)] text-[var(--color-label-2)]">{light ? <Moon size={17} /> : <Sun size={17} />}</button>
  );
}

/** What the page should be wearing right now for this device's cookie (or the device, if none). */
const resolved = () => { const m = readTheme(); return m === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "dark") : m; };

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
    const fix = () => { const want = resolved(); if (html.getAttribute("data-theme") !== want) html.setAttribute("data-theme", want); };
    fix();
    const mo = new MutationObserver(fix); mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
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
