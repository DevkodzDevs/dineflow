"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ingredientSchema, stockMoveSchema } from "@dineflow/shared";

const ok = () => { revalidatePath("/inventory"); revalidatePath("/dashboard"); return { ok: true }; };

export async function saveIngredient(fd: FormData) {
  const s = await createClient();
  const parsed = ingredientSchema.safeParse({ name: fd.get("name"), unit: fd.get("unit"), reorder_level: fd.get("reorder_level"), cost_per_unit: fd.get("cost_per_unit"), barcode: fd.get("barcode") || null, category: fd.get("category") || null, brand: fd.get("brand") || null, pack_qty: fd.get("pack_qty") || null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = fd.get("id") as string | null;
  const q = id ? s.from("ingredients").update(parsed.data).eq("id", id) : s.from("ingredients").insert(parsed.data);
  const { error } = await q; if (error) return { error: error.message }; return ok();
}
export async function archiveIngredient(id: string) {
  const s = await createClient(); await s.from("ingredients").update({ is_active: false }).eq("id", id); return ok();
}
/** Manual stock movement (opening balance, wastage, adjustment). Purchases use recordPurchase. */
export async function moveStock(fd: FormData) {
  const s = await createClient();
  const parsed = stockMoveSchema.safeParse({ ingredient_id: fd.get("ingredient_id"), qty: fd.get("qty"), reason: fd.get("reason"), note: fd.get("note") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data: { user } } = await s.auth.getUser();
  const sign = parsed.data.reason === "wastage" ? -1 : fd.get("direction") === "out" ? -1 : 1;
  const { error } = await s.from("stock_ledger").insert({ ...parsed.data, qty: sign * parsed.data.qty, created_by: user?.id });
  if (error) return { error: error.message }; return ok();
}
export async function recordPurchase(supplier: string, invoiceNo: string, lines: { ingredient_id: string; qty: number; unit_cost: number }[]) {
  const s = await createClient();
  const clean = lines.filter((l) => l.ingredient_id && l.qty > 0);
  if (!clean.length) return { error: "Add at least one line" };
  const total = clean.reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const { data: { user } } = await s.auth.getUser();
  const { data: p, error } = await s.from("purchases").insert({ supplier, invoice_no: invoiceNo, total, created_by: user?.id }).select("id").single();
  if (error) return { error: error.message };
  const { error: e2 } = await s.from("purchase_items").insert(clean.map((l) => ({ ...l, purchase_id: p.id })));
  if (e2) return { error: e2.message };
  ["/inventory", "/neighbours", "/tomorrow", "/dashboard"].forEach((x) => revalidatePath(x));
  return { ok: true };
}


/** A stock count: the ledger is adjusted so stock equals what was counted, and the gap is what the leak finder reports. */
export async function stockCount(counts: { ingredient_id: string; counted: number }[]) {
  const s = await createClient();
  const { data, error } = await s.rpc("stock_count", { p_counts: counts });
  if (error) return { error: error.message };
  revalidatePath("/inventory"); revalidatePath("/inventory/leaks"); return { ok: true as const, ...(data as { counted: number; gap_value: number }) };
}
