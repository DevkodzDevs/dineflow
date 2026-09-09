"use client";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, tap } from "./index";

/** "dark" (the board), "paper" (a bright room) or "system" (follow the device). Stored in a cookie so the server renders the right one. */
export type ThemeMode = "dark" | "paper" | "system";
const KEY = "df-theme";

export function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "dark") : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  document.cookie = `${KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", resolved === "paper" ? "#17171c" : "#0a0a0d");
}
export function readTheme(): ThemeMode {
  const m = document.cookie.match(/(?:^|; )df-theme=(dark|paper|system)/); return (m?.[1] as ThemeMode) ?? "dark";
}
/** Runs before paint so a light-mode user never sees a dark flash (and vice versa). */
export const THEME_BOOT = `(function(){try{var m=(document.cookie.match(/(?:^|; )df-theme=(dark|paper|system)/)||[])[1]||"dark";var r=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"paper":"dark"):m;document.documentElement.setAttribute("data-theme",r);}catch(e){}})();`;

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  useEffect(() => { setMode(readTheme()); const mq = matchMedia("(prefers-color-scheme: light)"); const f = () => { if (readTheme() === "system") applyTheme("system"); }; mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  return { mode, set: (m: ThemeMode) => { setMode(m); applyTheme(m); tap(); } };
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
