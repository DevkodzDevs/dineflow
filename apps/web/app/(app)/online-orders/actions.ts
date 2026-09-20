"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { askJson } from "@/lib/ai";
const bump = () => ["/online-orders", "/kitchen", "/orders", "/dashboard"].forEach((p) => revalidatePath(p));
export async function acceptOnline(id: string) { const s = await createClient(); const { data, error } = await s.rpc("accept_online_order", { p_id: id }); if (error) return { error: error.message }; bump(); return { ok: true, orderId: data as string }; }
export async function rejectOnline(id: string, reason: string) { const s = await createClient(); const { error } = await s.from("online_orders").update({ status: "rejected", raw: { reason } }).eq("id", id); if (error) return { error: error.message }; bump(); return { ok: true }; }
export async function setOnlineStatus(id: string, status: string) { const s = await createClient(); await s.from("online_orders").update({ status }).eq("id", id); bump(); return { ok: true }; }
/** Map an unrecognised aggregator line to one of your dishes, so it matches from now on. */
export async function mapDish(menuItemId: string, channelKind: string, ref: string) {
  const s = await createClient();
  const { data: mi } = await s.from("menu_items").select("external_refs").eq("id", menuItemId).single();
  const refs = { ...((mi?.external_refs as Record<string, string>) ?? {}), [channelKind]: ref };
  const { error } = await s.from("menu_items").update({ external_refs: refs }).eq("id", menuItemId);
  if (error) return { error: error.message }; revalidatePath("/online-orders"); return { ok: true };
}
export async function saveChannel(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { kind: String(fd.get("kind")), label: String(fd.get("label")), outlet_ref: (fd.get("outlet_ref") as string) || null, api_base: (fd.get("api_base") as string) || null, api_key: (fd.get("api_key") as string) || null, commission_pct: Number(fd.get("commission_pct") || 0), prep_minutes: Number(fd.get("prep_minutes") || 20), auto_accept: fd.get("auto_accept") === "on", is_live: fd.get("is_live") === "on" };
  const { error } = await (id ? s.from("order_channels").update(row).eq("id", id) : s.from("order_channels").insert(row));
  if (error) return { error: error.message }; revalidatePath("/channels"); return { ok: true };
}
export async function deleteChannel(id: string) { const s = await createClient(); await s.from("order_channels").delete().eq("id", id); revalidatePath("/channels"); return { ok: true }; }

/* ── AI: which dish on the menu an aggregator line means ──────────────────────────────────── */
const mapSchema = z.object({
  matches: z.array(z.object({
    line: z.string(),
    menu_item_id: z.string().nullable().describe("An id from the menu list, or null when nothing on the menu is the same dish"),
    confidence: z.number().min(0).max(1),
  })),
});
/**
 * Swiggy writes "Chkn Biryani (Full)" and the menu says "Chicken Biryani". This proposes the match;
 * mapDish() still only runs when the person confirms it. Ids the model did not get from the menu
 * list are thrown away here.
 */
export async function suggestDishMap(lines: string[]) {
  const wanted = [...new Set(lines.map((l) => String(l).trim()).filter(Boolean))].slice(0, 30);
  if (!wanted.length) return { error: "Nothing to match." };
  const s = await createClient();
  const { data: menu } = await s.from("menu_items").select("id, name, price, is_veg").eq("is_active", true).order("name");
  if (!menu?.length) return { error: "The menu is empty." };
  const known = new Map(menu.map((m) => [m.id, m]));
  const r = await askJson({
    schema: mapSchema, effort: "low",
    system: `You match item names from a food-delivery aggregator to the dishes on a restaurant's own menu. Aggregators abbreviate, add portion sizes like (Half)/(Full)/(1 pc), and misspell. Match on the dish itself. A portion size is not a different dish. When no menu dish is the same food, answer null — never the nearest thing.`,
    user: `Aggregator lines:\n${wanted.map((l) => `- ${l}`).join("\n")}\n\nMenu (id · name · ₹ · veg):\n${menu.map((m) => `${m.id} · ${m.name} · ${m.price} · ${m.is_veg ? "veg" : "non-veg"}`).join("\n")}`,
  });
  if (!r.ok) return { error: r.error };
  const matches = r.data.matches
    .filter((m) => wanted.includes(m.line))
    .map((m) => ({ line: m.line, menu_item_id: m.menu_item_id && known.has(m.menu_item_id) ? m.menu_item_id : null, name: m.menu_item_id ? known.get(m.menu_item_id)?.name ?? null : null, confidence: Math.round(m.confidence * 100) }));
  return { ok: true as const, matches };
}
