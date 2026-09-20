"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newOrderSchema } from "@dineflow/shared";
import { z } from "zod/v4";
import { askJson } from "@/lib/ai";

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
    p_promise: d.promise ?? false,
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

/* ── AI: an order in plain words, turned into cart lines on this property's own menu ──────── */
const spokenOrder = z.object({
  lines: z.array(z.object({
    menu_item_id: z.string().describe("An id from the menu list, exactly as given"),
    qty: z.number().int().min(1).max(50),
    note: z.string().max(120).nullable().describe("Only what changes the cooking: less spicy, no onion, extra gravy. Null when nothing was said."),
  })).max(30),
  table: z.string().max(20).nullable().describe("The table's name exactly as it appears in the tables list, if the order names one"),
  order_type: z.enum(["dine_in", "takeaway", "delivery", "room_service"]).nullable().describe("Only when the words make it clear: parcel/pack/takeaway, deliver, room number"),
  customer_name: z.string().max(60).nullable().describe("A name given for a parcel or delivery, or 'Room 104' for room service"),
  unresolved: z.array(z.string().max(60)).max(10).describe("Things asked for that are not on this menu, in the words used"),
});
/**
 * "Two chicken biryani, one without onion, and a lime soda for table four." The model reads it the
 * way a waiter would — quantity words, Indian-English and transliterated dish names, cooking notes,
 * the table — and answers only in ids from this property's menu. Anything it names that is not on
 * the menu comes back as `unresolved` for the waiter to see, never as the nearest thing.
 *
 * Nothing is placed. The lines land in the cart; the waiter reads them and presses Send.
 */
export async function parseOrder(text: string) {
  const said = text.trim().slice(0, 600);
  if (!said) return { error: "Say or type the order first." };
  const s = await createClient();
  const [{ data: menu }, { data: tables }] = await Promise.all([
    s.from("menu_items").select("id, name, price, is_veg, is_available, categories(name)").eq("is_active", true).order("name"),
    s.from("dining_tables").select("id, name").order("sort_order"),
  ]);
  if (!menu?.length) return { error: "The menu is empty." };
  const known = new Map(menu.map((m) => [m.id, m]));
  const r = await askJson({
    schema: spokenOrder, effort: "low", maxTokens: 2500,
    system: `You take a food order for a restaurant in India from a waiter's spoken or typed words and map it onto the restaurant's own menu. Quantities may be words (two, a couple, half a dozen). Dish names may be shortened, misspelt, in Indian English, or transliterated from Tamil, Hindi, Malayalam, Kannada or Telugu (kozhi = chicken, murgh = chicken, meen = fish, paneer, sabzi, roti, parotta); match on the dish itself. "Without X", "no X", "extra X", "less spicy", "Jain" are cooking notes on that line. "Parcel", "pack", "takeaway" mean takeaway; "deliver" means delivery; "room 104" means room service for Room 104. "Table 4", "T4", "table four" is the table — answer with its name from the list. Use only ids from the menu list. If something ordered is not on the menu at all, put the words under unresolved and do not substitute. A dish marked unavailable is still on the menu — include it; the till will warn.`,
    user: `Order as said: "${said}"\n\nMenu (id · name · ₹ · veg · category · available):\n${menu.map((m) => `${m.id} · ${m.name} · ${m.price} · ${m.is_veg ? "veg" : "non-veg"} · ${(m.categories as unknown as { name?: string } | null)?.name ?? "-"} · ${m.is_available ? "yes" : "sold out today"}`).join("\n")}\n\nTables: ${(tables ?? []).map((t) => t.name).join(", ") || "none"}`,
  });
  if (!r.ok) return { error: r.error };
  const lines = r.data.lines
    .filter((l) => known.has(l.menu_item_id))
    .map((l) => ({ menu_item_id: l.menu_item_id, name: known.get(l.menu_item_id)!.name, qty: l.qty, note: l.note?.trim() || null }));
  const table = r.data.table ? (tables ?? []).find((t) => t.name.toLowerCase() === r.data.table!.toLowerCase()) ?? null : null;
  if (!lines.length && !r.data.unresolved.length) return { error: "Could not make out any dish in that. Try again." };
  return { ok: true as const, lines, table_id: table?.id ?? null, table_name: table?.name ?? null, order_type: r.data.order_type, customer_name: r.data.customer_name, unresolved: r.data.unresolved };
}
