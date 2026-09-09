"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/proof");

export async function sealAll() {
  const s = await createClient(); const { data, error } = await s.rpc("seal_all_periods", { p_months: 24 });
  if (error) return { error: error.message }; bump(); return { ok: true, sealed: data as number };
}
export async function createLink(v: { label: string; purpose: string; from: string; to: string; days: number; showCosts: boolean }) {
  const s = await createClient();
  const { data, error } = await s.rpc("proof_create", { p_label: v.label, p_purpose: v.purpose, p_from: v.from, p_to: v.to, p_days: v.days, p_show_costs: v.showCosts });
  if (error) return { error: error.message }; bump(); return { ok: true, link: data as { token: string; label: string } };
}
export async function revokeLink(id: string) {
  const s = await createClient(); const { error } = await s.rpc("proof_revoke", { p_id: id });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
