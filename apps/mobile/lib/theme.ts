import { Platform, Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext } from "react";

/** Flip — a split-flap board on a graphite wall. "dark" is the board; "paper" is a bright room; "system" follows the phone. */
export type ThemeMode = "dark" | "paper" | "system";
export type Resolved = "dark" | "paper";

const DARK = {
  bg: "#17171c", card: "#1f2027", bg3: "#2a2b34", bezel: "#0a0a0d",
  fill: "rgba(255,255,255,0.07)", fill2: "rgba(255,255,255,0.12)", line: "rgba(255,255,255,0.09)",
  label: "#f4f4f1", label2: "#9a9aa6", label3: "#62626e",
  tint: "#4cd964", tint2: "#8ff0a1", champagne: "#cfcfd6", green: "#4cd964", green2: "rgba(76,217,100,0.16)", red: "#ff453a", red2: "rgba(255,69,58,0.16)", blue: "#64a9ff", blue2: "rgba(100,169,255,0.16)", orange: "#ffb340",
  porcelain: "#17171c", ink: "#f4f4f1", ink2: "#e6e6e3", steel: "#9a9aa6", saffron: "#4cd964", saffron2: "#8ff0a1", mint: "#4cd964", mint2: "rgba(76,217,100,0.16)", chili: "#ff453a", chili2: "rgba(255,69,58,0.16)",
  onTint: "#06120a", paper: "#fdfcf8",
};
const PAPER: typeof DARK = {
  ...DARK,
  bg: "#f4f4f1", card: "#ffffff", bg3: "#e9e9e5", bezel: "#17171c",
  fill: "rgba(23,23,28,0.06)", fill2: "rgba(23,23,28,0.10)", line: "rgba(23,23,28,0.10)",
  label: "#17171c", label2: "rgba(23,23,28,0.62)", label3: "rgba(23,23,28,0.38)",
  tint: "#2fb84d", tint2: "#4cd964", champagne: "#6d6d78", green: "#2fb84d", green2: "rgba(47,184,77,0.14)", red: "#e5322d", red2: "rgba(229,50,45,0.12)", blue: "#1f7aea", blue2: "rgba(31,122,234,0.12)", orange: "#d98a12",
  porcelain: "#f4f4f1", ink: "#17171c", ink2: "#23232b", steel: "rgba(23,23,28,0.62)", saffron: "#2fb84d", saffron2: "#4cd964", mint: "#2fb84d", mint2: "rgba(47,184,77,0.14)", chili: "#e5322d", chili2: "rgba(229,50,45,0.12)",
};
/** The live palette. Screens read C.* at render; switching theme re-keys the tree so they all re-render. */
export const C: typeof DARK = { ...DARK };
/** The flip tile is the brand — it stays a dark split-flap in both themes. */
export const FLIP = { face: "#f4f4f1", top: "#2a2b34", bottom: "#1f2027", edge: "#0a0a0d", pin: "#33343e", live: "#4cd964", alert: "#ff453a" } as const;

const KEY = "df-theme";
export function resolve(mode: ThemeMode): Resolved { return mode === "system" ? (Appearance.getColorScheme() === "light" ? "paper" : "dark") : mode; }
export function applyPalette(r: Resolved) { Object.assign(C, r === "paper" ? PAPER : DARK); }
export async function loadThemeMode(): Promise<ThemeMode> { try { const v = await AsyncStorage.getItem(KEY); return (v as ThemeMode) || "dark"; } catch { return "dark"; } }
export async function saveThemeMode(m: ThemeMode) { try { await AsyncStorage.setItem(KEY, m); } catch { /* keep going */ } }

export const ThemeContext = createContext<{ mode: ThemeMode; resolved: Resolved; set: (m: ThemeMode) => void }>({ mode: "dark", resolved: "dark", set: () => {} });
export const useTheme = () => useContext(ThemeContext);

export const F = {
  display: "Oswald",
  sans: Platform.select({ ios: "System", default: "Manrope_500Medium" })!,
  sansBold: Platform.select({ ios: "System", default: "Manrope_700Bold" })!,
  mono: "Oswald",
};
export const R = 22;
export const shadow = { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 } as const;
export const spring = { damping: 18, stiffness: 320, mass: 0.7 } as const;
