import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { OPTION_SELECTS } from "@/lib/menuOptions";

/**
 * The master login reads every property on a few tables (2026-10-21). Eleven tables' policies end in
 * `or is_platform_admin()` — customers, the loyalty ledger, suppliers, purchase orders and their lines, night audits,
 * and a dish's options (variants, add-on groups and add-ons, the dish↔group links, combo parts) — so a screen that read
 * them without `restaurant_id` showed the master, standing inside one property, every property's rows: the till offered
 * other properties' sizes, Customers listed other properties' guests.
 *
 * Every other login's rows are already only its property's (RLS), so these screens still ask in parallel with the
 * session — no extra round trip — and only for the master ask again, pinned to the property it opened.
 */
type DB = Awaited<ReturnType<typeof createClient>>;

type Who = { isAdmin: boolean; restaurant: { id: string } };

/** Any read: what came back in parallel for everyone, or — for the master only — the same read again, pinned. */
export async function pinned<T>(session: Who, mine: T, again: (rid: string) => PromiseLike<T>): Promise<T> {
  return session.isAdmin ? await again(session.restaurant.id) : mine;
}

/** A dish's options: sizes, add-on groups (with their add-ons), which dish has which group, a combo's parts. */
export function optionReads(s: DB, rid?: string) {
  const v = s.from("menu_variants").select(OPTION_SELECTS.variants).eq("is_active", true).order("sort_order");
  const g = s.from("addon_groups").select(OPTION_SELECTS.groups).eq("is_active", true).order("sort_order");
  const l = s.from("menu_item_addon_groups").select(OPTION_SELECTS.links);
  const c = s.from("combo_items").select(OPTION_SELECTS.combos);
  return rid
    ? [v.eq("restaurant_id", rid), g.eq("restaurant_id", rid), l.eq("restaurant_id", rid), c.eq("restaurant_id", rid)] as const
    : [v, g, l, c] as const;
}

/** For the master only, the options again pinned to the property it is standing in; anyone else's are kept. */
export async function optionsFor<T extends readonly unknown[]>(s: DB, session: Who, mine: T) {
  return pinned(session, mine, async (rid) => (await Promise.all(optionReads(s, rid))) as unknown as T);
}
