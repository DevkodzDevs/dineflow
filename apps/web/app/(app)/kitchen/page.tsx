import { createClient } from "@/lib/supabase/server";
import { KitchenClient, type Needs } from "./KitchenClient";
export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const s = await createClient();
  /**
   * The board shows the last day's service, not everything ever left open. Reading the three live
   * statuses with no time bound meant a ticket nobody marked ready was fetched and rendered for the
   * rest of the property's life, and the board grew heavier every week. Anything older is counted
   * rather than dropped, so the screen can say so instead of silently losing it.
   */
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data }, { data: needs }, { data: stale }] = await Promise.all([
    s.from("kots").select("id, kot_no, status, created_at, orders(order_no, type, customer_name, dining_tables(name)), order_items(id, name_snapshot, qty, status, notes)")
      .in("status", ["pending", "preparing", "ready"]).gte("created_at", since).order("created_at").limit(200),
    s.rpc("kots_needs_live"),
    s.rpc("stale_kot_count", { p_hours: 24 }),
  ]);
  return <KitchenClient initial={(data ?? []) as never} needs={(needs ?? {}) as Needs} stale={(stale as number) ?? 0} />;
}
