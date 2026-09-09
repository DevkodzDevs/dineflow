"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Looks up a scanned code: our own QR (df:room:<id>, df:ing:<id>, df:dish:<id>, df:lab:<code>) or a product barcode. */
export async function lookupCode(code: string) {
  const s = await createClient();
  const c = code.trim();
  const own = /^df:(room|ing|dish|lab|book):(.+)$/.exec(c);
  if (own) {
    const [, kind, id] = own;
    if (kind === "room") { const { data } = await s.from("rooms").select("id, number, floor, status, room_types(name, base_rate)").eq("id", id).maybeSingle(); if (data) { const { data: b } = await s.from("bookings").select("id, guests(full_name), check_out").eq("room_id", id).eq("status", "checked_in").maybeSingle(); return { kind: "room", room: data, booking: b }; } }
    if (kind === "ing") { const { data } = await s.from("ingredients").select("*").eq("id", id).maybeSingle(); if (data) return { kind: "ingredient", ingredient: data }; }
    if (kind === "dish") { const { data } = await s.from("menu_items").select("*").eq("id", id).maybeSingle(); if (data) return { kind: "dish", dish: data }; }
    if (kind === "lab") { const { data } = await s.from("labourers").select("*").eq("code", id.toUpperCase()).maybeSingle(); if (data) return { kind: "labour", labourer: data }; }
    if (kind === "book") { const { data } = await s.from("bookings").select("id, booking_no, status, rooms(number), guests(full_name)").eq("id", id).maybeSingle(); if (data) return { kind: "booking", booking: data }; }
    return { kind: "unknown", code: c };
  }
  // product barcode (EAN/UPC) or a labour badge typed as code
  const { data: ing } = await s.from("ingredients").select("*").eq("barcode", c).maybeSingle();
  if (ing) return { kind: "ingredient", ingredient: ing, viaBarcode: true };
  const { data: dish } = await s.from("menu_items").select("*").eq("barcode", c).maybeSingle();
  if (dish) return { kind: "dish", dish };
  const { data: lab } = await s.from("labourers").select("*").eq("code", c.toUpperCase()).maybeSingle();
  if (lab) return { kind: "labour", labourer: lab };
  const { data: room } = await s.from("rooms").select("id, number, floor, status, room_types(name, base_rate)").eq("number", c).maybeSingle();
  if (room) return { kind: "room", room, booking: null };
  return { kind: "unknown", code: c };
}

/** Scan result → new ingredient (product) in the pantry, with optional opening/purchase stock. */
export async function createProductFromScan(p: { name: string; unit: string; category?: string | null; brand?: string | null; barcode?: string | null; pack_qty?: number | null; cost_per_unit?: number; reorder_level?: number; qty?: number; reason?: "purchase" | "opening"; note?: string }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: ing, error } = await s.from("ingredients").insert({ name: p.name, unit: p.unit, category: p.category ?? null, brand: p.brand ?? null, barcode: p.barcode || null, pack_qty: p.pack_qty ?? null, cost_per_unit: p.cost_per_unit ?? 0, reorder_level: p.reorder_level ?? 0 }).select("id").single();
  if (error) return { error: error.message.includes("duplicate") ? "A product with this barcode already exists — scan it again to add stock." : error.message };
  if (p.qty && p.qty > 0) await s.from("stock_ledger").insert({ ingredient_id: ing.id, qty: p.qty, reason: p.reason ?? "purchase", note: p.note ?? "from scan", created_by: user?.id });
  await s.from("scan_log").insert({ source: "photo", kind: "ingredient", action: "create_product", target_id: ing.id, created_by: user?.id });
  ["/inventory", "/scan", "/dashboard"].forEach((x) => revalidatePath(x)); return { ok: true, id: ing.id };
}
/** Existing product scanned → add/remove stock. */
export async function stockFromScan(ingredientId: string, qty: number, reason: "purchase" | "wastage" | "adjustment" | "opening", direction: "in" | "out", note?: string) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const signed = reason === "wastage" || direction === "out" ? -Math.abs(qty) : Math.abs(qty);
  const { error } = await s.from("stock_ledger").insert({ ingredient_id: ingredientId, qty: signed, reason, note: note ?? "from scan", created_by: user?.id });
  if (error) return { error: error.message };
  await s.from("scan_log").insert({ source: "barcode", kind: "ingredient", action: `stock_${direction}`, target_id: ingredientId, created_by: user?.id });
  ["/inventory", "/scan", "/dashboard"].forEach((x) => revalidatePath(x)); return { ok: true };
}
/** Scan result → new dish on the menu. */
export async function createDishFromScan(p: { name: string; price: number; is_veg?: boolean; description?: string | null; barcode?: string | null; category_id?: string | null }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data, error } = await s.from("menu_items").insert({ name: p.name, price: p.price, is_veg: p.is_veg ?? true, description: p.description ?? null, barcode: p.barcode || null, category_id: p.category_id ?? null }).select("id").single();
  if (error) return { error: error.message };
  await s.from("scan_log").insert({ source: "photo", kind: "dish", action: "create_dish", target_id: data.id, created_by: user?.id });
  ["/menu", "/orders", "/scan"].forEach((x) => revalidatePath(x)); return { ok: true, id: data.id };
}
/** Scan result → new labourer. */
export async function createLabourFromScan(p: { full_name: string; phone?: string | null; skill?: string | null; daily_wage?: number; id_type?: string | null; id_last4?: string | null; address?: string | null; notes?: string | null }) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: code } = await s.rpc("next_labour_code");
  const { data, error } = await s.from("labourers").insert({ code, full_name: p.full_name, phone: p.phone ?? null, skill: p.skill ?? null, daily_wage: p.daily_wage ?? 0, id_type: p.id_type ?? null, id_last4: p.id_last4 ?? null, address: p.address ?? null, notes: p.notes ?? null }).select("id, code").single();
  if (error) return { error: error.message };
  await s.from("scan_log").insert({ source: "photo", kind: "labour", action: "create_labour", target_id: data.id, created_by: user?.id });
  ["/labour", "/scan"].forEach((x) => revalidatePath(x)); return { ok: true, id: data.id, code: data.code };
}
/** Labour badge scanned → punch in/out. */
export async function punch(code: string) {
  const s = await createClient(); const { data, error } = await s.rpc("labour_punch", { p_code: code });
  if (error) return { error: error.message }; revalidatePath("/labour"); return { ok: true, ...(data as { name: string; event: string; hours?: number }) };
}
/** Room scanned → quick status change. */
export async function roomQuick(roomId: string, action: "cleaning" | "available" | "maintenance") {
  const s = await createClient();
  if (action === "available") { await s.from("housekeeping_tasks").update({ status: "done" }).eq("room_id", roomId).neq("status", "done"); await s.from("rooms").update({ status: "available" }).eq("id", roomId).neq("status", "occupied"); }
  else { await s.from("rooms").update({ status: action }).eq("id", roomId).neq("status", "occupied"); await s.from("housekeeping_tasks").insert({ room_id: roomId, kind: action === "cleaning" ? "clean" : "maintenance" }); }
  ["/rooms", "/housekeeping", "/scan"].forEach((x) => revalidatePath(x)); return { ok: true };
}
