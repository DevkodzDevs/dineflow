/** What <html> wears for a theme choice (components/ui/Theme.tsx): its data-theme and its data-palette, or none.
 *  "bright" (0118) and "royal" (0119) are the paper theme with a palette on top; "system" follows the device, dark
 *  or paper. */
export type ThemeChoice = "dark" | "paper" | "colour" | "bright" | "royal" | "system";
export type Palette = "bright" | "royal";
export type Look = { theme: "dark" | "paper" | "colour"; palette: Palette | null };
export function lookFor(mode: ThemeChoice, deviceIsLight: boolean): Look {
  if (mode === "system") return { theme: deviceIsLight ? "paper" : "dark", palette: null };
  if (mode === "bright" || mode === "royal") return { theme: "paper", palette: mode };
  return { theme: mode, palette: null };
}
export const THEME_CHOICES: ThemeChoice[] = ["dark", "paper", "colour", "bright", "royal", "system"];
export const readThemeCookie = (cookie: string): ThemeChoice => (cookie.match(/(?:^|; )df-theme=(dark|paper|colour|bright|royal|system)(?:;|$)/)?.[1] as ThemeChoice) ?? "system";
