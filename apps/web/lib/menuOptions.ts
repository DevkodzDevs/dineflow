import type { Optioned } from "@dineflow/shared";

/** The rows the option tables hold, as the pages read them. */
export type VariantRow = { id: string; menu_item_id: string; name: string; price: number; is_default: boolean; sort_order?: number };
export type AddonRow = { id: string; name: string; price: number; is_veg: boolean; is_available: boolean; is_active?: boolean; sort_order?: number; ingredient_id?: string | null; ingredient_qty?: number | null };
export type GroupRow = { id: string; name: string; min_select: number; max_select: number; sort_order?: number; is_active?: boolean; addons: AddonRow[] };
export type LinkRow = { menu_item_id: string; group_id: string };
export type ComboRow = { combo_id: string; menu_item_id: string; qty: number };

/**
 * Folds the option rows onto the dishes, so a screen gets each dish with its own sizes, its add-on
 * groups (only the add-ons that can be sold today) and, for a combo, the names of its parts.
 */
export function withOptions<T extends { id: string; name: string; price: number; is_combo?: boolean }>(
  items: T[], variants: VariantRow[], groups: GroupRow[], links: LinkRow[], combos: ComboRow[],
): (T & Optioned)[] {
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const bySort = (a: { sort_order?: number; name: string }, b: { sort_order?: number; name: string }) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
  return items.map((m) => ({
    ...m,
    price: Number(m.price),
    variants: variants.filter((v) => v.menu_item_id === m.id).sort(bySort).map((v) => ({ id: v.id, name: v.name, price: Number(v.price), is_default: v.is_default })),
    addon_groups: links.filter((l) => l.menu_item_id === m.id)
      .map((l) => groupById.get(l.group_id)).filter((g): g is GroupRow => !!g && g.is_active !== false).sort(bySort)
      .map((g) => ({ id: g.id, name: g.name, min: g.min_select, max: g.max_select,
        addons: g.addons.filter((a) => a.is_active !== false && a.is_available).sort(bySort).map((a) => ({ id: a.id, name: a.name, price: Number(a.price), is_veg: a.is_veg })) }))
      .filter((g) => g.addons.length > 0 || g.min > 0),
    is_combo: !!m.is_combo,
    components: combos.filter((c) => c.combo_id === m.id).map((c) => ({ name: nameOf.get(c.menu_item_id) ?? "—", qty: c.qty })),
  }));
}

/** The queries every screen that sells or edits the menu needs, run together. */
export const OPTION_SELECTS = {
  variants: "id, menu_item_id, name, price, is_default, sort_order",
  groups: "id, name, min_select, max_select, sort_order, is_active, addons(id, name, price, is_veg, is_available, is_active, sort_order, ingredient_id, ingredient_qty)",
  links: "menu_item_id, group_id",
  combos: "combo_id, menu_item_id, qty",
} as const;
