"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => ["/tomorrow", "/inventory", "/dashboard"].forEach((p) => revalidatePath(p));

export async function getForecast(date: string) {
  const s = await createClient(); const { data, error } = await s.rpc("forecast_day", { p_date: date });
  if (error) return { error: error.message }; return { ok: true, forecast: data };
}
export async function saveForecast(date: string, covers?: number) {
  const s = await createClient(); const { error } = await s.rpc("save_forecast", { p_date: date, p_covers: covers ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function buyList(date: string, items: unknown[]) {
  const s = await createClient(); const { data, error } = await s.rpc("buy_purchase_list", { p_date: date, p_items: items });
  if (error) return { error: error.message }; bump(); return { ok: true, count: data as number };
}
export async function saveChefNotes(date: string, notes: Record<string, number>) {
  const s = await createClient(); const { error } = await s.rpc("record_chef_notes", { p_date: date, p_notes: notes });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function gradePast() { const s = await createClient(); await s.rpc("grade_forecasts"); bump(); return { ok: true }; }
