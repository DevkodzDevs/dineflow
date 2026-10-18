import { modulesFor } from "@dineflow/shared";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { withOptions, OPTION_SELECTS } from "@/lib/menuOptions";
import { KioskClient } from "./KioskClient";

export const metadata = { title: "Order here" };
export const dynamic = "force-dynamic";

/** Self-order on the property's own tablet (Settings → Screens & feedback). Signed in as staff who can take orders. */
export default async function KioskPage() {
  const s = await createClient();
  const [session, { data: categories }, { data: items }, { data: variants }, { data: groups }, { data: links }, { data: combos }] = await Promise.all([
    requireSession(),
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_combo, image_url, description").eq("is_active", true).eq("is_available", true).order("name"),
    s.from("menu_variants").select(OPTION_SELECTS.variants).eq("is_active", true),
    s.from("addon_groups").select(OPTION_SELECTS.groups).eq("is_active", true),
    s.from("menu_item_addon_groups").select(OPTION_SELECTS.links),
    s.from("combo_items").select(OPTION_SELECTS.combos),
  ]);
  const mods = modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null);
  if (!mods.includes("orders")) return (
    <div className="h-full grid place-items-center p-6 text-center"><div className="max-w-md"><div className="text-2xl font-extrabold">This login cannot take orders</div><p className="mt-2 text-[15px] text-[var(--color-label-2)]">Sign the kiosk tablet in with a staff login that has Orders.</p></div></div>
  );
  const menu = withOptions(items ?? [], (variants ?? []) as never, (groups ?? []) as never, links ?? [], combos ?? []);
  return <KioskClient name={session.restaurant.name} logo={(session.restaurant.logo_url as string | null) ?? null} categories={categories ?? []} items={menu as never} />;
}
