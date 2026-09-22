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
/** Manual stock movement (opening balance, wastage with its reason, adjustment). Purchases use recordPurchase. */
export async function moveStock(fd: FormData) {
  const s = await createClient();
  const parsed = stockMoveSchema.safeParse({ ingredient_id: fd.get("ingredient_id"), qty: fd.get("qty"), reason: fd.get("reason"), note: fd.get("note") || undefined, sub_reason: fd.get("sub_reason") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data: { user } } = await s.auth.getUser();
  const sign = parsed.data.reason === "wastage" ? -1 : fd.get("direction") === "out" ? -1 : 1;
  const { sub_reason, ...row } = parsed.data;
  const { error } = await s.from("stock_ledger").insert({ ...row, qty: sign * parsed.data.qty, sub_reason: parsed.data.reason === "wastage" ? sub_reason ?? "other" : null, created_by: user?.id });
  if (error) return { error: error.message }; return ok();
}
/** A supplier bill recorded after the fact: stock lands at once. `supplierId` links it to the supplier book when one was picked. */
export async function recordPurchase(supplier: string, invoiceNo: string, lines: { ingredient_id: string; qty: number; unit_cost: number }[], supplierId?: string | null) {
  const s = await createClient();
  const clean = lines.filter((l) => l.ingredient_id && l.qty > 0);
  if (!clean.length) return { error: "Add at least one line" };
  const total = clean.reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const { data: { user } } = await s.auth.getUser();
  const { data: p, error } = await s.from("purchases").insert({ supplier, invoice_no: invoiceNo, total, created_by: user?.id, supplier_id: supplierId || null }).select("id").single();
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

/* ── suppliers ──────────────────────────────────────────────────────────────────────────── */
export async function saveSupplier(fd: FormData) {
  const s = await createClient();
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const row = { name: str("name").slice(0, 80), phone: str("phone") || null, email: str("email") || null, gstin: str("gstin").toUpperCase() || null, address: str("address") || null, notes: str("notes") || null, lead_days: Math.max(0, Number(fd.get("lead_days") || 1)) };
  if (!row.name) return { error: "Give the supplier a name." };
  const id = str("id");
  const { error } = await (id ? s.from("suppliers").update(row).eq("id", id) : s.from("suppliers").insert(row));
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "A supplier with that name already exists." : error.message };
  return ok();
}
export async function archiveSupplier(id: string) {
  const s = await createClient(); const { error } = await s.from("suppliers").update({ is_active: false }).eq("id", id);
  if (error) return { error: error.message }; return ok();
}

/* ── purchase orders ────────────────────────────────────────────────────────────────────── */
export type PoLine = { ingredient_id: string; qty: number; unit_cost: number };
/** Create a draft, or rewrite one not yet received. */
export async function savePo(input: { id?: string | null; supplier_id?: string | null; expected_on?: string | null; notes?: string; lines: PoLine[] }) {
  const s = await createClient();
  const lines = input.lines.filter((l) => l.ingredient_id && l.qty > 0).map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit_cost: Math.max(0, Number(l.unit_cost) || 0) }));
  if (!lines.length) return { error: "Add at least one line." };
  const { data, error } = await s.rpc("po_save", { p_id: input.id ?? null, p_supplier_id: input.supplier_id || null, p_expected_on: input.expected_on || null, p_notes: input.notes ?? null, p_lines: lines });
  if (error) return { error: error.message }; ok(); return { ok: true as const, id: data as string };
}
export async function setPoStatus(id: string, status: "draft" | "sent" | "cancelled") {
  const s = await createClient(); const { error } = await s.rpc("po_set_status", { p_id: id, p_status: status });
  if (error) return { error: error.message }; return ok();
}
/** Goods received: what arrived, at the invoice price. Becomes a purchase, so stock lands as it always has. */
export async function receivePo(id: string, lines: { id: string; received_qty: number; unit_cost: number }[], invoiceNo: string, purchasedAt?: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("po_receive", { p_id: id, p_lines: lines, p_invoice_no: invoiceNo || null, p_purchased_at: purchasedAt || null });
  if (error) return { error: error.message };
  ["/inventory", "/neighbours", "/tomorrow", "/dashboard"].forEach((x) => revalidatePath(x));
  return { ok: true as const, purchaseId: data as string };
}
export type Suggestion = { ingredient_id: string; name: string; unit: string; stock: number; reorder_level: number; qty: number; unit_cost: number; supplier_id: string | null; supplier: string | null };
/** Everything below its reorder level, with the last supplier and price: a draft order in one press. */
export async function suggestPo() {
  const s = await createClient(); const { data, error } = await s.rpc("po_suggest");
  if (error) return { error: error.message }; return { ok: true as const, lines: (data ?? []) as Suggestion[] };
}
export type PriceHistory = { history: { on: string; supplier: string | null; qty: number; unit_cost: number; invoice: string | null }[]; by_supplier: { supplier: string | null; unit_cost: number; on: string }[]; low: number | null; high: number | null; last: number | null };
/** What an ingredient has cost, purchase by purchase, and the latest price from each supplier. */
export async function ingredientPrices(ingredientId: string) {
  const s = await createClient(); const { data, error } = await s.rpc("ingredient_prices", { p_ingredient_id: ingredientId });
  if (error) return { error: error.message }; return { ok: true as const, prices: data as PriceHistory };
}
