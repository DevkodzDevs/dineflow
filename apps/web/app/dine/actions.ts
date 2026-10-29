"use server";
import { createClient } from "@supabase/supabase-js";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function discover(q: string, city: string, mode: string) {
  const { data, error } = await anon().rpc("dine_discover", { p_q: q || null, p_city: city || null, p_lat: null, p_lng: null, p_mode: mode || null });
  if (error) return { error: error.message }; return { ok: true, list: data as never[] };
}
export async function slots(slug: string, date: string, party: number) {
  const { data, error } = await anon().rpc("dine_slots", { p_slug: slug, p_date: date, p_party: party });
  if (error) return { error: error.message }; return { ok: true, slots: data as never[] };
}
export async function reserve(slug: string, guest: { full_name: string; phone: string; email?: string }, date: string, time: string, party: number, occasion: string, note: string, offer: string | null) {
  const { data, error } = await anon().rpc("dine_reserve", { p_slug: slug, p_guest: guest, p_date: date, p_time: time, p_party: party, p_occasion: occasion || null, p_note: note || null, p_offer: offer });
  if (error) return { error: error.message }; return { ok: true, booking: data as never };
}
/** `table` is the code scanned on a table: the order is dine-in, on that table, with no fee. */
export async function placeOrder(slug: string, guest: { full_name: string; phone: string; address?: string }, items: { id: string; qty: number; note?: string; variant_id?: string | null; addon_ids?: string[] }[], mode: string, note: string, offer: string | null, table: string | null = null) {
  const { data, error } = await anon().rpc("dine_order", { p_slug: slug, p_guest: guest, p_items: items, p_mode: mode, p_note: note || null, p_offer: offer, p_table: table });
  if (error) return { error: error.message }; return { ok: true, order: data as never };
}
/** the tracking token for an order just placed here (0140 dine_track_token): the phone that ordered gets its own link */
export async function trackToken(id: string, phone: string) {
  const { data, error } = await anon().rpc("dine_track_token", { p_id: id, p_phone: phone });
  if (error) return { error: error.message }; return { ok: true as const, token: (data as string | null) ?? null };
}
export async function track(ref: string, phone: string) {
  const { data, error } = await anon().rpc("dine_track", { p_ref: ref, p_phone: phone });
  if (error) return { error: error.message }; return { ok: true, result: data as never };
}
// No review action here: dine_review took unlimited unverified reviews for any listed place and is
// closed to the API since 0098. A guest reviews after paying, by the bill's own link (pay_link_review).
/** The table's QR asks for a waiter, the bill or water (0103 `dine_call`); a second tap answers with the open call. */
export async function callTable(slug: string, table: string, kind: "waiter" | "bill" | "water") {
  const { data, error } = await anon().rpc("dine_call", { p_slug: slug, p_table: table, p_kind: kind });
  if (error) return { error: error.message }; return { ok: true, call: data as { kind: string; status: string; again?: boolean } };
}
export type TableOrder = { id: string; ref: string; at: string; total: number; order_no: number | null; items: { name: string; qty: number }[]; n: number; ready: number; served: number; bill?: number | null; pay?: string | null; stage: "sent" | "accepted" | "cooking" | "ready" | "served" | "bill" | "paid" | "rejected" };
/** Where the orders this phone placed at this table stand (0144 `dine_table_orders`): the table's code and the order's id are both needed. */
export async function tableOrders(slug: string, table: string, ids: string[]) {
  if (!ids.length) return { ok: true as const, orders: [] as TableOrder[] };
  const { data, error } = await anon().rpc("dine_table_orders", { p_slug: slug, p_table: table, p_ids: ids.slice(0, 10) });
  if (error) return { error: error.message }; return { ok: true as const, orders: (data ?? []) as TableOrder[] };
}
/** What this table asked for in the last half hour, and whether someone has gone to it. */
export async function tableCalls(slug: string, table: string) {
  const { data, error } = await anon().rpc("dine_call_status", { p_slug: slug, p_table: table });
  if (error) return { error: error.message }; return { ok: true, calls: (data ?? []) as { kind: string; status: string; at: string; done_at: string | null }[] };
}
