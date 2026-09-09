"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newOrderSchema } from "@dineflow/shared";

const bump = () => ["/orders", "/kitchen", "/billing", "/dashboard", "/inventory"].forEach((p) => revalidatePath(p));

export async function placeOrder(input: unknown) {
  const parsed = newOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = await createClient();
  const d = parsed.data;
  const raw = input as { client_id?: string; placed_at?: string };
  const { data, error } = await s.rpc("place_order", {
    p_type: d.type, p_table_id: d.table_id ?? null, p_items: d.items,
    p_customer: { name: d.customer_name ?? null, phone: d.customer_phone ?? null },
    p_note: null, p_client_id: raw.client_id ?? null, p_placed_at: raw.placed_at ?? null,
  });
  if (error) return { error: error.message };
  bump();
  return { ok: true, orderId: data as string };
}
export async function setItemStatus(id: string, status: string) {
  const s = await createClient(); const { error } = await s.from("order_items").update({ status }).eq("id", id);
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function setKotStatus(kotId: string, status: "preparing" | "ready" | "served") {
  const s = await createClient();
  const { error } = await s.from("order_items").update({ status }).eq("kot_id", kotId).neq("status", "cancelled");
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function cancelOrder(id: string) {
  const s = await createClient();
  await s.from("order_items").update({ status: "cancelled" }).eq("order_id", id);
  const { data: o } = await s.from("orders").update({ status: "cancelled" }).eq("id", id).select("table_id").single();
  if (o?.table_id) await s.from("dining_tables").update({ status: "free" }).eq("id", o.table_id);
  bump(); return { ok: true };
}
export async function setTableStatus(id: string, status: "free" | "reserved") {
  const s = await createClient(); await s.from("dining_tables").update({ status }).eq("id", id); bump(); return { ok: true };
}
