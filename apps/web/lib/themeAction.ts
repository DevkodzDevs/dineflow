"use server";
import { createClient } from "@/lib/supabase/server";

/** Remember the person's light/dark choice on their login (user_prefs via set_my_theme), so every
 *  device they sign in on follows it. Signed out, or offline, it quietly does nothing: the cookie
 *  still carries the choice on this device. */
export async function saveTheme(mode: "dark" | "paper" | "system") {
  try { const s = await createClient(); await s.rpc("set_my_theme", { p_theme: mode }); } catch { /* best effort */ }
  return { ok: true as const };
}
