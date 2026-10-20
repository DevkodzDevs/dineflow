import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { withOptions, OPTION_SELECTS } from "@/lib/menuOptions";
import { PosClient } from "./PosClient";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string; type?: string }> }) {
  const { table, type } = await searchParams;
  const s = await createClient();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: categories }, { data: items }, { data: tables }, { data: inHouse }, { data: stock }, { data: running }, { data: variants }, { data: groups }, { data: links }, { data: combos }, { data: pairings }, { data: sold }, { data: booked }, { data: cleans }] = await Promise.all([
    requireSession(),
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_available, is_combo, image_url, station, categories(station)").order("name"),
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
    // how many portions of each dish the pantry can still cover, so the till can say so before a
    // waiter promises it to a table rather than after the kitchen has picked the ticket up
    s.rpc("menu_stock"),
    // the orders already running on a table, so tapping an occupied one can offer the open ticket
    s.from("orders").select("id, order_no, table_id, created_at, order_items(qty, status), dining_tables(name), bills(status)").eq("status", "open").not("table_id", "is", null).order("created_at", { ascending: false }),
    // sizes, add-on groups and combo parts: what a dish asks before it goes on a ticket
    s.from("menu_variants").select(OPTION_SELECTS.variants).eq("is_active", true),
    s.from("addon_groups").select(OPTION_SELECTS.groups).eq("is_active", true),
    s.from("menu_item_addon_groups").select(OPTION_SELECTS.links),
    s.from("combo_items").select(OPTION_SELECTS.combos),
    // what this property's guests order together, for "Goes well with" at the till (0080)
    s.rpc("menu_pairings"),
    // what sells most here, for the till's Popular chip: plates in the last 30 days
    s.from("order_items").select("menu_item_id, qty").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).neq("status", "cancelled").not("menu_item_id", "is", null).limit(5000),
    // today's bookings that hold a table, and the tables still being cleaned: with the open orders, what is not free
    s.from("reservations").select("table_id, at_time").eq("on_date", todayIST()).in("status", ["requested", "confirmed"]).not("table_id", "is", null),
    s.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"]),
  ]);
  // A new order picks from the free tables only (2026-10-20, the owner): not one with an open order or marked occupied,
  // not one held — marked reserved, or a booking due from 30 min ago to 2 h from now (IST) — and not one being cleaned.
  const ist = new Date(Date.now() + 5.5 * 3600000); const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const minsOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const notFree: Record<string, "occupied" | "reserved" | "cleaning"> = {};
  for (const c of (cleans ?? []) as { table_id: string }[]) notFree[c.table_id] = "cleaning";
  for (const b of (booked ?? []) as { table_id: string; at_time: string }[]) { const m = minsOf(b.at_time); if (m >= nowMin - 30 && m <= nowMin + 120) notFree[b.table_id] = "reserved"; }
  for (const t of (tables ?? []) as { id: string; status: string }[]) if (t.status === "reserved") notFree[t.id] = "reserved";
  for (const t of (tables ?? []) as { id: string; status: string }[]) if (t.status === "occupied") notFree[t.id] = "occupied";
  for (const o of (running ?? []) as { table_id: string | null }[]) if (o.table_id) notFree[o.table_id] = "occupied";
  const popular: Record<string, number> = {};
  for (const r of (sold ?? []) as { menu_item_id: string; qty: number }[]) popular[r.menu_item_id] = (popular[r.menu_item_id] ?? 0) + Number(r.qty);
  const pairs: Record<string, { id: string; n: number }[]> = {};
  for (const p of (pairings ?? []) as { item: string; pair: string; together: number }[]) (pairs[p.item] ??= []).push({ id: p.pair, n: p.together });
  const menu = withOptions(items ?? [], (variants ?? []) as never, (groups ?? []) as never, links ?? [], combos ?? []);
  return <PosClient categories={categories ?? []} items={menu as never} tables={tables ?? []} initialTable={table ?? null} initialType={type === "takeaway" || type === "delivery" ? type : null}
    inHouse={(inHouse ?? []) as never} stock={(stock ?? {}) as never} running={(running ?? []) as never} ai={aiEnabled()}
    promise={session.restaurant.promise_enabled ? { minutes: Number(session.restaurant.promise_minutes ?? 30), pct: Number(session.restaurant.promise_pct ?? 0) } : null} pairs={pairs} popular={popular} notFree={notFree} />;
}
