import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { OPTION_SELECTS } from "@/lib/menuOptions";
import { findStandardRecipe, type StandardRecipe } from "@dineflow/shared";
import { MenuClient } from "./MenuClient";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const s = await createClient();
  // the session is fetched alongside the menu, not in front of it — one round trip, not two
  const [session, { data: categories }, { data: items }, { data: ingredients }, { data: recipes }, { data: variants }, { data: groups }, { data: links }, { data: combos }] = await Promise.all([
    requireSession(),
    s.from("categories").select("*").order("sort_order"),
    s.from("menu_items").select("*").order("name"),
    s.from("ingredients").select("id, name, unit").eq("is_active", true).order("name"),
    s.from("recipe_items").select("menu_item_id, ingredient_id, qty"),
    // the options a dish offers: sizes, add-on groups, and a combo's parts
    s.from("menu_variants").select(OPTION_SELECTS.variants).eq("is_active", true).order("sort_order"),
    s.from("addon_groups").select(OPTION_SELECTS.groups).eq("is_active", true).order("sort_order"),
    s.from("menu_item_addon_groups").select(OPTION_SELECTS.links),
    s.from("combo_items").select(OPTION_SELECTS.combos),
  ]);
  /* The library's plate for each of this property's dishes, found here and sent with the page. The library itself
     (packages/shared/src/recipes.ts, ~220 kB) stays on the server: imported by the screen it was most of the Menu's
     JavaScript, and the reason its first visit took ~0.9 s (measured 2026-10-18). */
  const std: Record<string, StandardRecipe> = {};
  for (const it of items ?? []) { const r = findStandardRecipe(it.name); if (r) std[it.id] = r; }
  return (
    <>
      <MenuClient categories={categories ?? []} items={items ?? []} ingredients={ingredients ?? []} recipes={recipes ?? []} std={std} ai={aiEnabled()} stations={session.restaurant.kds_stations ?? []}
        variants={(variants ?? []) as never} groups={(groups ?? []) as never} links={links ?? []} combos={combos ?? []} />
    </>
  );
}
