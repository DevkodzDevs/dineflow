import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { optionReads, optionsFor } from "@/lib/scoped";
import { findStandardRecipe, modulesFor, type StandardRecipe } from "@dineflow/shared";
import { MenuClient } from "./MenuClient";
import { canSetOnline } from "@/lib/online";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const s = await createClient();
  // the session is fetched alongside the menu, not in front of it — one round trip, not two
  const [session, { data: categories }, { data: items }, { data: ingredients }, { data: recipes }, v0, g0, l0, c0] = await Promise.all([
    requireSession(),
    s.from("categories").select("*").order("sort_order"),
    s.from("menu_items").select("*").order("name"),
    s.from("ingredients").select("id, name, unit").eq("is_active", true).order("name"),
    s.from("recipe_items").select("menu_item_id, ingredient_id, qty"),
    // the options a dish offers: sizes, add-on groups, and a combo's parts
    ...optionReads(s),
  ]);
  // the master reads every property's options (lib/scoped.ts): only for it, ask again for this property
  const [{ data: variants }, { data: groups }, { data: links }, { data: combos }] = await optionsFor(s, session, [v0, g0, l0, c0] as const);
  /* The library's plate for each of this property's dishes, found here and sent with the page. The library itself
     (packages/shared/src/recipes.ts, ~220 kB) stays on the server: imported by the screen it was most of the Menu's
     JavaScript, and the reason its first visit took ~0.9 s (measured 2026-10-18). */
  const std: Record<string, StandardRecipe> = {};
  for (const it of items ?? []) { const r = findStandardRecipe(it.name); if (r) std[it.id] = r; }
  return (
    <>
      <MenuClient canOnline={canSetOnline(session.profile.role, modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null))} categories={categories ?? []} items={items ?? []} ingredients={ingredients ?? []} recipes={recipes ?? []} std={std} ai={aiEnabled()} stations={session.restaurant.kds_stations ?? []} gstRate={Number(session.restaurant.gst_rate ?? 5)}
        variants={(variants ?? []) as never} groups={(groups ?? []) as never} links={links ?? []} combos={combos ?? []} />
    </>
  );
}
