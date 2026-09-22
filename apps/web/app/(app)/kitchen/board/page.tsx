import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { BoardClient } from "./BoardClient";
export const metadata = { title: "Order board" };
export const dynamic = "force-dynamic";

/**
 * The customer-facing board — the screen above a McDonald's counter that says which numbers are
 * being prepared and which are ready to collect. It is a signed-in page put on a spare display, so
 * nothing about the property leaks to the street; a guest sees order numbers and where they sit.
 */
export default async function BoardPage() {
  const s = await createClient(); const session = await requireSession();
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await s.from("kots").select("id, kot_no, status, created_at, ready_at, orders(order_no, type, customer_name, dining_tables(name))")
    .in("status", ["pending", "preparing", "ready"]).eq("held", false).gte("created_at", since).order("created_at").limit(120);
  return <BoardClient kots={(data ?? []) as never} name={session.restaurant.name} />;
}
