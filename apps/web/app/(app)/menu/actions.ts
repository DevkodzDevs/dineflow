"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { menuItemSchema, findStandardRecipe } from "@dineflow/shared";
import { z } from "zod/v4";
import { askJson, VOICE } from "@/lib/ai";
import { requireSession } from "@/lib/auth";

const ok = () => { revalidatePath("/menu"); revalidatePath("/orders"); return { ok: true }; };

export async function saveCategory(fd: FormData) {
  const s = await createClient();
  const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), sort_order: Number(fd.get("sort_order") || 0) };
  const q = id ? s.from("categories").update(row).eq("id", id) : s.from("categories").insert(row);
  const { error } = await q; if (error) return { error: error.message }; return ok();
}
/** Station routing: the kitchen board shows a category's dishes only on the station that makes them. */
export async function setCategoryStation(id: string, station: string | null) {
  const s = await createClient(); const { error } = await s.from("categories").update({ station: station || null }).eq("id", id);
  if (error) return { error: error.message }; revalidatePath("/kitchen"); return ok();
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
    station: fd.get("station") || null,
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
/** Give a dish the library's standard recipe for one plate. Ingredients the pantry lacks are created on the
 *  way, so this works on a brand-new property with an empty pantry; the reply says how many were added. */
export async function applyStandardRecipe(menuItemId: string, dishName: string) {
  const std = findStandardRecipe(dishName);
  if (!std) return { error: `No standard recipe for "${dishName}" yet — map its ingredients by hand.` };
  const s = await createClient();
  const { data, error } = await s.rpc("apply_standard_recipe", { p_menu_item: menuItemId, p_lines: std.lines });
  if (error) return { error: error.message };
  revalidatePath("/menu"); revalidatePath("/inventory"); revalidatePath("/kitchen");
  const r = (data ?? {}) as { created?: number; mapped?: number; skipped?: string[] };
  return { ok: true, dish: std.dish, created: r.created ?? 0, mapped: r.mapped ?? 0, skipped: r.skipped ?? [] };
}
/** Replace the whole recipe of a dish: [{ingredient_id, qty}] */
export async function saveRecipe(menuItemId: string, rows: { ingredient_id: string; qty: number }[]) {
  const s = await createClient();
  await s.from("recipe_items").delete().eq("menu_item_id", menuItemId);
  const clean = rows.filter((r) => r.ingredient_id && r.qty > 0).map((r) => ({ ...r, menu_item_id: menuItemId }));
  if (clean.length) { const { error } = await s.from("recipe_items").insert(clean); if (error) return { error: error.message }; }
  return ok();
}

/* ── AI: fill in a dish from its name ─────────────────────────────────────────────────────── */
const dishSchema = z.object({
  description: z.string().max(300).describe("One or two sentences a guest would read on the menu"),
  is_veg: z.boolean(),
  price_inr: z.number().int().min(0).describe("A sensible menu price in rupees for this property"),
  prep_minutes: z.number().int().min(1).max(240).describe("Kitchen time from ticket to pass"),
});
/** Everything the dish form asks for, from the name alone. Nothing is saved; the form is filled and the person presses Save. */
export async function suggestDish(name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: "Type the dish name first." };
  const session = await requireSession(); const s = await createClient();
  // the property's own prices anchor the suggestion — a ₹90 dosa house and a ₹900 one are both right
  const { data: peers } = await s.from("menu_items").select("name, price, is_veg").eq("is_active", true).order("price").limit(40);
  const r = await askJson({
    schema: dishSchema, effort: "low",
    system: `You fill in a dish for a menu at ${session.restaurant.name}, a ${session.restaurant.property_type} in India. ${VOICE} Descriptions name what is in the dish and how it is cooked, never how the guest will feel. Price in the same band as the property's existing dishes.`,
    user: `Dish: "${clean}"\nThe property's current menu (name · ₹ · veg): ${(peers ?? []).map((p) => `${p.name} · ${p.price} · ${p.is_veg ? "veg" : "non-veg"}`).join("; ") || "empty so far"}`,
  });
  return r.ok ? { ok: true as const, ...r.data } : { error: r.error };
}

/* ── AI: a recipe mapped onto this property's own pantry ──────────────────────────────────── */
const recipeSchema = z.object({
  rows: z.array(z.object({
    ingredient_id: z.string().describe("An id from the pantry list, exactly as given"),
    qty: z.number().positive().describe("Amount for ONE portion, in that ingredient's own unit"),
  })).max(20),
  missing: z.array(z.string().max(40)).max(10).describe("Ingredients the dish needs that the pantry does not stock"),
});
/**
 * Proposes the recipe lines for a dish using only ingredients this property actually stocks. The
 * model may only pick ids from the list it is given, and anything it invents is dropped here before
 * it reaches the screen — the pantry is the authority on what exists, not the model.
 */
export async function suggestRecipe(dishName: string) {
  const clean = dishName.trim().slice(0, 80);
  if (!clean) return { error: "The dish has no name." };
  const session = await requireSession(); const s = await createClient();
  const { data: pantry } = await s.from("ingredients").select("id, name, unit").eq("is_active", true).order("name");
  if (!pantry?.length) return { error: "Add ingredients in Pantry first." };
  const known = new Map(pantry.map((i) => [i.id, i]));
  const r = await askJson({
    schema: recipeSchema, effort: "medium",
    system: `You write recipes for the kitchen at ${session.restaurant.name}, a ${session.restaurant.property_type} in India. Quantities are for one plated portion as a restaurant serves it, in the unit the pantry keeps each ingredient in (kg means kilograms: 0.18 for 180 g; l means litres; pcs means pieces). Use only ingredients from the pantry list, by their exact id. Salt, water and oil in tiny amounts may be skipped. If a dish needs something the pantry does not stock, list it under missing rather than substituting something that is not right.`,
    user: `Dish: "${clean}"\nPantry (id · name · unit):\n${pantry.map((i) => `${i.id} · ${i.name} · ${i.unit}`).join("\n")}`,
  });
  if (!r.ok) return { error: r.error };
  const rows = r.data.rows.filter((x) => known.has(x.ingredient_id)).map((x) => ({ ingredient_id: x.ingredient_id, qty: Math.round(x.qty * 1000) / 1000 }));
  if (!rows.length) return { error: `Nothing in the pantry fits "${clean}"${r.data.missing.length ? ` — it would need ${r.data.missing.join(", ")}` : ""}.` };
  return { ok: true as const, rows, missing: r.data.missing };
}
