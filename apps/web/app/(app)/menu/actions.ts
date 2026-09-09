"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { menuItemSchema } from "@dineflow/shared";

const ok = () => { revalidatePath("/menu"); revalidatePath("/orders"); return { ok: true }; };

export async function saveCategory(fd: FormData) {
  const s = await createClient();
  const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), sort_order: Number(fd.get("sort_order") || 0) };
  const q = id ? s.from("categories").update(row).eq("id", id) : s.from("categories").insert(row);
  const { error } = await q; if (error) return { error: error.message }; return ok();
}
export async function deleteCategory(id: string) {
  const s = await createClient(); const { error } = await s.from("categories").delete().eq("id", id);
  if (error) return { error: error.message }; return ok();
}
export async function saveMenuItem(fd: FormData) {
  const s = await createClient();
  const parsed = menuItemSchema.safeParse({
    name: fd.get("name"), category_id: fd.get("category_id") || null, price: fd.get("price"),
    is_veg: fd.get("is_veg") === "on", is_available: fd.get("is_available") === "on", prep_minutes: fd.get("prep_minutes"), description: fd.get("description") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = fd.get("id") as string | null;
  const q = id ? s.from("menu_items").update(parsed.data).eq("id", id) : s.from("menu_items").insert(parsed.data);
  const { error } = await q; if (error) return { error: error.message }; return ok();
}
export async function toggleAvailable(id: string, value: boolean) {
  const s = await createClient(); await s.from("menu_items").update({ is_available: value }).eq("id", id); return ok();
}
export async function deleteMenuItem(id: string) {
  const s = await createClient(); const { error } = await s.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message }; return ok();
}
/** Replace the whole recipe of a dish: [{ingredient_id, qty}] */
export async function saveRecipe(menuItemId: string, rows: { ingredient_id: string; qty: number }[]) {
  const s = await createClient();
  await s.from("recipe_items").delete().eq("menu_item_id", menuItemId);
  const clean = rows.filter((r) => r.ingredient_id && r.qty > 0).map((r) => ({ ...r, menu_item_id: menuItemId }));
  if (clean.length) { const { error } = await s.from("recipe_items").insert(clean); if (error) return { error: error.message }; }
  return ok();
}
