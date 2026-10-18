"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OutletLive = {
  id: string; name: string; type: string; city: string | null; membership: string; current: boolean;
  trial_ends_at?: string | null; membership_ends_at?: string | null;   // 0109
  open_orders: number; busy_tables: number; tables: number; late: number; sales: number; bills: number;
  paid: Record<string, number>; expenses: number; online_new: number; on_duty: number; week: { day: string; sales: number }[];
};

/** Stand this sign-in in another outlet (0106 outlet_switch), or back home with `null`. The whole app follows. */
export async function switchOutlet(id: string | null) {
  const s = await createClient(); const { data, error } = await s.rpc("outlet_switch", { p_restaurant: id });
  if (error) return { error: error.message };
  revalidatePath("/", "layout"); return { ok: true as const, id: data as string };
}
/** Every outlet, live (0106 chain_overview) — the chain screen asks again every 20 seconds. */
export async function chainOverview() {
  const s = await createClient(); const { data, error } = await s.rpc("chain_overview");
  if (error) return { error: error.message }; return { ok: true as const, list: (data ?? []) as OutletLive[] };
}
/** Open a new outlet from this one (owner only), with or without its menu. */
export async function createOutlet(name: string, copyMenu: boolean) {
  const s = await createClient(); const { data, error } = await s.rpc("outlet_create", { p_name: name, p_copy_menu: copyMenu });
  if (error) return { error: error.message };
  revalidatePath("/", "layout"); return { ok: true as const, id: data as string };
}
/** This outlet's menu to others (owner or manager): dishes matched by name, prices when asked; nothing deleted. */
export async function pushMenu(targets: string[], prices: boolean) {
  const s = await createClient(); const { data, error } = await s.rpc("chain_push_menu", { p_targets: targets, p_prices: prices });
  if (error) return { error: error.message };
  return { ok: true as const, result: data as Record<string, { categories: number; added: number; updated: number; sizes: number; addon_groups?: number; addons?: number }> };
}
/** Let a manager or supervisor open another outlet, or stop them (owner only). */
export async function grantOutlet(user: string, outlet: string, on: boolean) {
  const s = await createClient(); const { error } = await s.rpc("outlet_grant", { p_user: user, p_restaurant: outlet, p_on: on });
  if (error) return { error: error.message };
  revalidatePath("/chain"); return { ok: true as const };
}
