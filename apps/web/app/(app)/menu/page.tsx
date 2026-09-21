import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { MenuClient } from "./MenuClient";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const s = await createClient();
  // the session is fetched alongside the menu, not in front of it — one round trip, not two
  const [session, { data: categories }, { data: items }, { data: ingredients }, { data: recipes }] = await Promise.all([
    requireSession(),
    s.from("categories").select("*").order("sort_order"),
    s.from("menu_items").select("*").order("name"),
    s.from("ingredients").select("id, name, unit").eq("is_active", true).order("name"),
    s.from("recipe_items").select("menu_item_id, ingredient_id, qty"),
  ]);
  return (
    <>
      <PageHeader eyebrow="What you serve" title="Menu & recipes" />
      <MenuClient categories={categories ?? []} items={items ?? []} ingredients={ingredients ?? []} recipes={recipes ?? []} ai={aiEnabled()} stations={session.restaurant.kds_stations ?? []} />
    </>
  );
}
