import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PosClient } from "./PosClient";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table } = await searchParams;
  const s = await createClient();
  const session = await requireSession();
  const [{ data: categories }, { data: items }, { data: tables }, { data: inHouse }, { data: stock }, { data: running }] = await Promise.all([
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_available").order("name"),
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
    // how many portions of each dish the pantry can still cover, so the till can say so before a
    // waiter promises it to a table rather than after the kitchen has picked the ticket up
    s.rpc("menu_stock"),
    // the orders already running on a table, so tapping an occupied one can offer the open ticket
    s.from("orders").select("id, order_no, table_id").eq("status", "open").not("table_id", "is", null),
  ]);
  return <PosClient categories={categories ?? []} items={(items ?? []) as never} tables={tables ?? []} initialTable={table ?? null}
    inHouse={(inHouse ?? []) as never} stock={(stock ?? {}) as never} running={(running ?? []) as never} ai={aiEnabled()}
    promise={session.restaurant.promise_enabled ? { minutes: Number(session.restaurant.promise_minutes ?? 30), pct: Number(session.restaurant.promise_pct ?? 0) } : null} />;
}
