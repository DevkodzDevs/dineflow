"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wrote } from "@/lib/wrote";
import { menuItemSchema, findStandardRecipe } from "@dineflow/shared";
import { z } from "zod/v4";
import { askJson, aiEnabled, VOICE } from "@/lib/ai";
import { requireSession, featureOn } from "@/lib/auth";
import { menuPhotoSchema, toImportDishes, newCategories, matchCategory, normCategory, normName, findExisting, gstRateOk, hsnOk, type ImportDish, type ImportVariant, type ExistingDish } from "@/lib/menuImport";

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
    station: fd.get("station") || null, is_combo: fd.get("is_combo") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // 0146: the dish's own GST rate (blank = the property's) and HSN / SAC (blank = restaurant service, 996331)
  const gr = String(fd.get("gst_rate") ?? "").trim(), hsn = String(fd.get("hsn") ?? "").replace(/s/g, "");
  if (gr !== "" && ![0, 5, 12, 18, 28, 40].includes(Number(gr))) return { error: "GST is 0, 5, 12, 18, 28 or 40%" };
  if (hsn && !/^[0-9]{4,8}$/.test(hsn)) return { error: "HSN / SAC is 4 to 8 digits" };
  const tax: { gst_rate?: number | null; hsn?: string | null } = fd.has("gst_rate") ? { gst_rate: gr === "" ? null : Number(gr), hsn: hsn || null } : {};
  const id = fd.get("id") as string | null;
  // the photo rides along as three hidden fields; empty means none (0088)
  const url = String(fd.get("image_url") ?? "").trim();
  const photo = url ? photoSchema.safeParse({ url, credit: String(fd.get("image_credit") ?? "") || null, source: String(fd.get("image_source") ?? "") || null }) : null;
  if (photo && !photo.success) return { error: photo.error.issues[0].message };
  const row = { ...parsed.data, ...tax, image_url: photo?.success ? photo.data.url : null, image_credit: photo?.success ? photo.data.credit ?? null : null, image_source: photo?.success ? photo.data.source ?? null : null };
  const q = id ? s.from("menu_items").update(row).eq("id", id).select("id").single() : s.from("menu_items").insert(row).select("id").single();
  const { data, error } = await q; if (error) return { error: error.message };
  /* A combo's parts ride along as JSON: [{menu_item_id, qty}]. A dish that stops being a combo
     loses its parts, so the kitchen ticket stops listing them. */
  const parts = String(fd.get("parts") ?? "");
  if (parsed.data.is_combo && parts) {
    const r = await saveCombo(data.id, JSON.parse(parts) as { menu_item_id: string; qty: number }[]); if ("error" in r) return r;
  } else if (!parsed.data.is_combo) { const { error: ce } = await s.from("combo_items").delete().eq("combo_id", data.id); if (ce) return { error: ce.message }; }
  return ok();
}

/* ── options: sizes, add-on groups, combo parts ─────────────────────────────────────────── */
/** Replace the sizes a dish is sold in. Rows that still carry an id are updated, so past order
 *  lines keep pointing at the size they were sold as; rows that are gone are deleted. */
export async function saveVariants(menuItemId: string, rows: { id?: string; name: string; price: number; is_default: boolean }[]) {
  const s = await createClient();
  const clean = rows.map((r, i) => ({ id: r.id, name: r.name.trim().slice(0, 40), price: Math.max(0, Number(r.price) || 0), is_default: !!r.is_default, sort_order: i })).filter((r) => r.name);
  if (clean.length && !clean.some((r) => r.is_default)) clean[0].is_default = true;
  const keep = clean.map((r) => r.id).filter((x): x is string => !!x);
  const gone = s.from("menu_variants").delete().eq("menu_item_id", menuItemId);
  const { error: e1 } = await (keep.length ? gone.not("id", "in", `(${keep.join(",")})`) : gone);
  if (e1) return { error: e1.message };
  for (const r of clean) {
    const row = { menu_item_id: menuItemId, name: r.name, price: r.price, is_default: r.is_default, sort_order: r.sort_order, is_active: true };
    const { error } = await (r.id ? s.from("menu_variants").update(row).eq("id", r.id) : s.from("menu_variants").insert(row));
    if (error) return { error: error.message };
  }
  return ok();
}
/** Which add-on groups this dish offers. */
export async function setItemGroups(menuItemId: string, groupIds: string[]) {
  const s = await createClient();
  const { error: e1 } = await s.from("menu_item_addon_groups").delete().eq("menu_item_id", menuItemId); if (e1) return { error: e1.message };
  if (groupIds.length) { const { error } = await s.from("menu_item_addon_groups").insert(groupIds.map((group_id) => ({ menu_item_id: menuItemId, group_id }))); if (error) return { error: error.message }; }
  return ok();
}
/** The same group on every dish of a category — "Choose your bread" on every curry in one go. */
export async function addGroupToCategory(categoryId: string, groupId: string) {
  const s = await createClient();
  const { data: dishes } = await s.from("menu_items").select("id").eq("category_id", categoryId).eq("is_active", true);
  if (!dishes?.length) return { error: "That category has no dishes." };
  const { error } = await s.from("menu_item_addon_groups").upsert(dishes.map((d) => ({ menu_item_id: d.id, group_id: groupId })), { onConflict: "menu_item_id,group_id", ignoreDuplicates: true });
  if (error) return { error: error.message }; revalidatePath("/menu"); return { ok: true as const, dishes: dishes.length };
}
export async function saveAddonGroup(fd: FormData) {
  const s = await createClient();
  const id = String(fd.get("id") ?? "");
  const min = Math.max(0, Number(fd.get("min_select") || 0)), max = Math.max(0, Number(fd.get("max_select") || 0));
  if (max > 0 && min > max) return { error: "The minimum cannot be more than the maximum." };
  const row = { name: String(fd.get("name") ?? "").trim().slice(0, 60), min_select: min, max_select: max, sort_order: Number(fd.get("sort_order") || 0) };
  if (!row.name) return { error: "Give the group a name." };
  const { error } = await (id ? s.from("addon_groups").update(row).eq("id", id) : s.from("addon_groups").insert(row));
  if (error) return { error: error.message }; return ok();
}
export async function deleteAddonGroup(id: string) {
  const s = await createClient(); const { error } = await s.from("addon_groups").delete().eq("id", id);
  if (error) return { error: error.message }; return ok();
}
export async function saveAddon(fd: FormData) {
  const s = await createClient();
  const id = String(fd.get("id") ?? "");
  const row = {
    group_id: String(fd.get("group_id")), name: String(fd.get("name") ?? "").trim().slice(0, 60), price: Math.max(0, Number(fd.get("price") || 0)),
    is_veg: fd.get("is_veg") !== "off", ingredient_id: String(fd.get("ingredient_id") || "") || null,
    ingredient_qty: fd.get("ingredient_id") && Number(fd.get("ingredient_qty")) > 0 ? Number(fd.get("ingredient_qty")) : null,
  };
  if (!row.name) return { error: "Give the add-on a name." };
  const { error } = await (id ? s.from("addons").update(row).eq("id", id) : s.from("addons").insert(row));
  if (error) return { error: error.message }; return ok();
}
export async function toggleAddon(id: string, available: boolean) {
  const s = await createClient(); const bad = wrote(await s.from("addons").update({ is_available: available }).eq("id", id).select("id"), "That add-on could not be changed."); if (bad) return bad; return ok();
}
export async function deleteAddon(id: string) {
  const s = await createClient(); const { error } = await s.from("addons").delete().eq("id", id);
  if (error) return { error: error.message }; return ok();
}
/** Replace what a combo is made of: [{menu_item_id, qty}]. A combo cannot contain itself. */
export async function saveCombo(comboId: string, rows: { menu_item_id: string; qty: number }[]) {
  const s = await createClient();
  const clean = rows.filter((r) => r.menu_item_id && r.menu_item_id !== comboId && r.qty > 0).map((r) => ({ combo_id: comboId, menu_item_id: r.menu_item_id, qty: Math.round(r.qty) }));
  const { error: e1 } = await s.from("combo_items").delete().eq("combo_id", comboId); if (e1) return { error: e1.message };
  if (clean.length) { const { error } = await s.from("combo_items").insert(clean); if (error) return { error: error.message }; }
  return ok();
}
export async function toggleAvailable(id: string, value: boolean) {
  const s = await createClient(); const bad = wrote(await s.from("menu_items").update({ is_available: value }).eq("id", id).select("id"), "That dish could not be changed."); if (bad) return bad; return ok();
}
export async function deleteMenuItem(id: string) {
  const s = await createClient(); const r = await s.from("menu_items").delete().eq("id", id).select("id");
  if (r.error?.code === "23503") return { error: "This dish is on past orders. Switch it off instead." };
  const bad = wrote(r, "That dish could not be deleted."); if (bad) return bad; return ok();
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
/** Every active dish without a recipe that the library knows gets its standard plate, and the pantry
 *  gains any ingredient it lacked — the same as pressing "Use it" on each. At most 60 a press. */
export async function autoRecipes() {
  const s = await createClient(); await requireSession();
  const { data: items, error } = await s.from("menu_items").select("id, name").eq("is_active", true).order("name");
  if (error) return { error: error.message };
  const { data: have } = await s.from("recipe_items").select("menu_item_id");
  const mapped = new Set((have ?? []).map((r) => r.menu_item_id));
  let done = 0, created = 0; const unknown: string[] = []; const failed: string[] = [];
  for (const it of (items ?? []).filter((i) => !mapped.has(i.id)).slice(0, 60)) {
    const std = findStandardRecipe(it.name);
    if (!std) { unknown.push(it.name); continue; }
    const { data, error: e } = await s.rpc("apply_standard_recipe", { p_menu_item: it.id, p_lines: std.lines });
    if (e) { failed.push(it.name); continue; }
    done++; created += (data as { created?: number } | null)?.created ?? 0;
  }
  revalidatePath("/menu"); revalidatePath("/inventory"); revalidatePath("/kitchen"); revalidatePath("/orders/new");
  return { ok: true as const, done, created, unknown, failed };
}
/** Replace the whole recipe of a dish: [{ingredient_id, qty}] */
export async function saveRecipe(menuItemId: string, rows: { ingredient_id: string; qty: number }[]) {
  const s = await createClient();
  { const { error } = await s.from("recipe_items").delete().eq("menu_item_id", menuItemId); if (error) return { error: error.message }; }
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

/* ── AI: a printed menu, photographed, into dishes ────────────────────────────────────────── */
// (ImportDish is imported from "@/lib/menuImport" where it is needed: a "use server" file may export only async functions —
//  Turbopack refuses even a type re-export here, though the webpack production build let it through, 2026-11-10)
const AI_OFF = "AI help is not switched on for this property — Master control → Access → Add-ons turns it on.";

/**
 * Reads one photo of a printed or handwritten menu into dishes to review — "menu photo to a working POS in two
 * minutes" (2026-11-09). The schema and everything derived from it live in lib/menuImport.ts; the client calls
 * this once per photo, in parallel, and merges the pages. Nothing is written here; importDishes() writes.
 * A paid call: it needs the server's key (`aiEnabled`) and the property's `ai` add-on (0175).
 */
export async function readMenuPhoto(image: string): Promise<{ ok: true; dishes: ImportDish[] } | { error: string }> {
  if (!/^data:image\//.test(image)) return { error: "That file is not a photo." };
  const session = await requireSession();
  if (!aiEnabled() || !featureOn(session, "ai")) return { error: AI_OFF };
  const r = await askJson({ schema: menuPhotoSchema, effort: "low", images: [image], maxTokens: 16000,
    system: `You read a photographed restaurant menu from India and list every dish exactly as printed. Never invent a dish, a price or a description. Keep the menu's own section headings as categories. A dish printed with several prices (Half/Full, Quarter/Half/Full, S/M/L, 250 ml/500 ml) is ONE dish with one price entry per size, lowest first, each labelled as printed. A menu in Tamil, Hindi or another script: give the English name a waiter would use and keep the printed name in name_local. Veg from the green square or the dish; mark non-veg when it has meat, fish or egg. packaged_goods is only a sealed product sold as bought — bottled water, a canned or bottled soft drink — never a juice, lassi, lime soda or tea made here.`,
    user: `List every dish on this photo of the menu at ${session.restaurant.name}.` });
  if (!r.ok) return { error: r.error };
  return { ok: true, dishes: toImportDishes(r.data, { gst_rate: Number(session.restaurant.gst_rate ?? 5), gst_scheme: session.restaurant.gst_scheme ?? null }) };
}

export type ImportRow = ImportDish & { mode: "add" | "update" };
/**
 * Adds the dishes the owner kept from the photos. Missing sections first (`sort_order` 100+), then the dishes —
 * available, prep 15 min, the dish's GST rate and HSN when the reading set one (0146) — then the sizes
 * (`menu_variants`, the lowest the default) for a dish read in sizes. Idempotent: a dish already on the menu
 * (normalised name, same section) is **skipped** unless the row says `update` — then its price and sizes change and
 * nothing else — so a second photo of the same page never doubles the menu.
 */
export async function importDishes(rows: ImportRow[]) {
  const s = await createClient(); await requireSession();
  const clean = rows.filter((r) => r.name.trim()).slice(0, 150);
  if (!clean.length) return { error: "Tick at least one dish." };
  for (const r of clean) {
    if (!gstRateOk(r.gst_rate ?? null)) return { error: `${r.name}: GST is 0, 5, 12, 18, 28 or 40%` };
    if (!hsnOk(r.hsn ?? null)) return { error: `${r.name}: HSN / SAC is 4 to 8 digits` };
  }
  const [{ data: cats }, { data: have }] = await Promise.all([s.from("categories").select("id, name"), s.from("menu_items").select("id, name, category_id, price")]);
  const catId = new Map((cats ?? []).map((c) => [normCategory(String(c.name)), c.id as string]));
  const catName = new Map((cats ?? []).map((c) => [c.id as string, String(c.name)]));
  // sections the menu lacks, created first
  for (const name of newCategories(clean, [...catName.values()])) {
    const { data, error } = await s.from("categories").insert({ name, sort_order: 100 + catId.size }).select("id").single();
    if (error) return { error: error.message };
    catId.set(normCategory(name), data.id as string); catName.set(data.id as string, name);
  }
  const idFor = (category: string) => { const m = matchCategory(category, [...catName.values()]); return m ? catId.get(normCategory(m)) ?? null : null; };
  const existing: ExistingDish[] = (have ?? []).map((i) => ({ id: i.id as string, name: String(i.name), category: i.category_id ? catName.get(i.category_id as string) ?? null : null, price: Number(i.price) }));
  const toAdd: { row: Record<string, unknown>; variants: ImportVariant[] }[] = []; let updated = 0, skipped = 0; const added = new Set<string>();
  for (const r of clean) {
    const dup = findExisting(r, existing);
    const price = r.variants.length >= 2 ? Math.min(...r.variants.map((v) => v.price)) : r.price;
    if (dup) {
      if (r.mode !== "update") { skipped++; continue; }
      const { error } = await s.from("menu_items").update({ price }).eq("id", dup.id); if (error) return { error: error.message };
      if (r.variants.length >= 2) { const v = await saveVariants(dup.id, r.variants.map((x, i) => ({ name: x.name, price: x.price, is_default: i === 0 }))); if ("error" in v) return v; }
      updated++; continue;
    }
    if (added.has(normName(r.name))) { skipped++; continue; }   // the same dish twice in one batch
    const parsed = menuItemSchema.safeParse({ name: r.name.trim(), category_id: idFor(r.category), price,
      is_veg: r.is_veg, is_available: true, prep_minutes: 15, description: r.description.trim() || null, station: null, is_combo: false });
    if (!parsed.success) return { error: `${r.name}: ${parsed.error.issues[0].message}` };
    added.add(normName(r.name));
    toAdd.push({ row: { ...parsed.data, gst_rate: r.gst_rate ?? null, hsn: r.hsn ?? null }, variants: r.variants.length >= 2 ? r.variants : [] });
  }
  if (toAdd.length) {
    const { data, error } = await s.from("menu_items").insert(toAdd.map((t) => t.row)).select("id, name");
    if (error) return { error: error.message };
    // the sizes, matched back to their dish by name (insert keeps the order, but the name is the safer key)
    const idByName = new Map((data ?? []).map((d) => [normName(String(d.name)), d.id as string]));
    const sizes = toAdd.flatMap((t) => { const id = idByName.get(normName(String(t.row.name))); return id ? t.variants.map((v, i) => ({ menu_item_id: id, name: v.name.trim().slice(0, 40), price: Math.max(0, Number(v.price) || 0), is_default: i === 0, sort_order: i, is_active: true })) : []; });
    if (sizes.length) { const { error: ve } = await s.from("menu_variants").insert(sizes); if (ve) return { error: ve.message }; }
  }
  ok();
  return { ok: true as const, added: toAdd.length, updated, skipped };
}

/* ── dish photos (0088) ─────────────────────────────────────────────────────────────────── */
/** Photos for a dish name, best first — Wikipedia's lead photo of the dish, then Commons. Never writes. */
export async function findPhotos(name: string, category?: string | null) {
  const session = await requireSession();
  const { allow } = await import("@/lib/ratelimit");
  if (!allow(`photos:${session.userId}`, 60, 10 * 60_000)) return { error: "Too many photo searches — wait a few minutes." };
  const { findDishPhotos } = await import("@/lib/dishPhotos");
  return { ok: true as const, photos: await findDishPhotos(name, category, 8) };
}
/* 2026-10-25 (audit): the host itself is checked — `includes("/storage/…/menu/")` let a photo come from any site that put
   that text in its path (guests' browsers would then call that site from the storefront, the kiosk and the TV). A photo is
   https, from Wikimedia or this project's own storage; a credit link is https only. */
const ownStorage = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host; } catch { return ""; } })();
const photoUrlOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && (/^(upload|thumb)\.wikimedia\.org$/.test(x.host) || (!!ownStorage && x.host === ownStorage && x.pathname.startsWith("/storage/v1/object/public/menu/"))); } catch { return false; } };
const photoSchema = z.object({ url: z.string().url().max(600).refine(photoUrlOk, "Use a Wikimedia photo or one uploaded here"),
  credit: z.string().max(200).nullable().optional(), source: z.string().url().max(600).refine((u) => /^https:\/\//i.test(u), "A credit link starts with https://").nullable().optional() });
/** Put a photo on a dish (or take it off with null). Only a Wikimedia file or the property's own upload. */
export async function setDishPhoto(id: string, photo: { url: string; credit?: string | null; source?: string | null } | null) {
  const s = await createClient();
  if (photo) { const p = photoSchema.safeParse(photo); if (!p.success) return { error: p.error.issues[0].message }; }
  const { error } = await s.from("menu_items").update(photo ? { image_url: photo.url, image_credit: photo.credit ?? null, image_source: photo.source ?? null } : { image_url: null, image_credit: null, image_source: null }).eq("id", id);
  if (error) return { error: error.message }; revalidatePath("/dine", "layout"); return ok();
}
/**
 * Every dish without a photo gets the best one found for it, when the best one is a confident match
 * (the article *is* the dish, or a photo named for all of it). Three at a time — Wikipedia throttles a
 * burst — and at most 40 a run, so a big menu is done in a few presses rather than one long wait.
 */
export async function autoPhotos() {
  const s = await createClient(); await requireSession();
  const { findDishPhotos } = await import("@/lib/dishPhotos");
  const { data: items, error } = await s.from("menu_items").select("id, name, categories(name)").is("image_url", null).eq("is_active", true).order("name").limit(40);
  if (error) return { error: error.message };
  let found = 0; const missed: string[] = [];
  const list = (items ?? []) as unknown as { id: string; name: string; categories: { name: string } | null }[];
  for (let i = 0; i < list.length; i += 3) {
    await Promise.all(list.slice(i, i + 3).map(async (it) => {
      const [best] = await findDishPhotos(it.name, it.categories?.name, 3);
      if (!best || best.score < 6) { missed.push(it.name); return; }
      const { error: e } = await s.from("menu_items").update({ image_url: best.url, image_credit: best.credit, image_source: best.source }).eq("id", it.id);
      if (e) missed.push(it.name); else found++;
    }));
  }
  const { count } = await s.from("menu_items").select("id", { count: "exact", head: true }).is("image_url", null).eq("is_active", true);
  revalidatePath("/dine", "layout"); ok();
  return { ok: true as const, found, missed, left: count ?? 0 };
}
/** A photo the property took itself, into the public `menu` bucket under its own folder (0088). The browser
 *  shrinks it to 900 px first; the bucket refuses anything over 1.5 MB or not PNG/JPEG/WebP. */
export async function uploadDishPhoto(fd: FormData): Promise<{ url?: string; error?: string }> {
  const session = await requireSession(); const s = await createClient();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  if (file.size > 1_572_864) return { error: "Photo is over 1.5 MB — try another." };
  const b = new Uint8Array(await file.arrayBuffer());
  const type = b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? "image/webp" : null;
  if (!type) return { error: "Use a JPG, PNG or WebP photo." };
  const path = `${session.restaurant.id}/dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${type === "image/jpeg" ? "jpg" : type.slice(6)}`;
  const up = await s.storage.from("menu").upload(path, b, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) return { error: /row-level security|unauthori[sz]ed|403/i.test(up.error.message) ? "Only a manager or chef can add menu photos." : up.error.message };
  return { url: s.storage.from("menu").getPublicUrl(path).data.publicUrl };
}
