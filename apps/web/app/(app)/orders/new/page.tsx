import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { withOptions, OPTION_SELECTS } from "@/lib/menuOptions";
import { PosClient } from "./PosClient";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table } = await searchParams;
  const s = await createClient();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: categories }, { data: items }, { data: tables }, { data: inHouse }, { data: stock }, { data: running }, { data: variants }, { data: groups }, { data: links }, { data: combos }] = await Promise.all([
    requireSession(),
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_available, is_combo").order("name"),
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
    // how many portions of each dish the pantry can still cover, so the till can say so before a
    // waiter promises it to a table rather than after the kitchen has picked the ticket up
    s.rpc("menu_stock"),
    // the orders already running on a table, so tapping an occupied one can offer the open ticket
    s.from("orders").select("id, order_no, table_id").eq("status", "open").not("table_id", "is", null),
    // sizes, add-on groups and combo parts: what a dish asks before it goes on a ticket
    s.from("menu_variants").select(OPTION_SELECTS.variants).eq("is_active", true),
    s.from("addon_groups").select(OPTION_SELECTS.groups).eq("is_active", true),
    s.from("menu_item_addon_groups").select(OPTION_SELECTS.links),
    s.from("combo_items").select(OPTION_SELECTS.combos),
  ]);
  const menu = withOptions(items ?? [], (variants ?? []) as never, (groups ?? []) as never, links ?? [], combos ?? []);
  return <PosClient categories={categories ?? []} items={menu as never} tables={tables ?? []} initialTable={table ?? null}
    inHouse={(inHouse ?? []) as never} stock={(stock ?? {}) as never} running={(running ?? []) as never} ai={aiEnabled()}
    promise={session.restaurant.promise_enabled ? { minutes: Number(session.restaurant.promise_minutes ?? 30), pct: Number(session.restaurant.promise_pct ?? 0) } : null} />;
}
