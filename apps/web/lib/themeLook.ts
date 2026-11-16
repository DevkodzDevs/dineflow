/** What <html> wears for a theme choice (components/ui/Theme.tsx): its data-theme and its data-palette, or none.
 *  Four themes since 2026-11-16 (0186): "dark", "paper", "royal" (0119 — the paper theme with a palette on top) and "ember"
 *  (the dark theme with a palette on top); "system" follows the device, dark or paper. The two colourful themes of
 *  0117/0118 ("colour", "bright") were retired by 0186: a cookie or saved choice still carrying either reads as "system". */
export type ThemeChoice = "dark" | "paper" | "royal" | "ember" | "system";
export type Palette = "royal" | "ember";
export type Look = { theme: "dark" | "paper"; palette: Palette | null };
export function lookFor(mode: ThemeChoice, deviceIsLight: boolean): Look {
  if (mode === "system") return { theme: deviceIsLight ? "paper" : "dark", palette: null };
  if (mode === "royal") return { theme: "paper", palette: mode };
  if (mode === "ember") return { theme: "dark", palette: mode };
  return { theme: mode, palette: null };
}
export const THEME_CHOICES: ThemeChoice[] = ["dark", "paper", "royal", "ember", "system"];
export const isThemeChoice = (v: unknown): v is ThemeChoice => typeof v === "string" && (THEME_CHOICES as string[]).includes(v);
export const readThemeCookie = (cookie: string): ThemeChoice => (cookie.match(/(?:^|; )df-theme=(dark|paper|royal|ember|system)(?:;|$)/)?.[1] as ThemeChoice) ?? "system";
