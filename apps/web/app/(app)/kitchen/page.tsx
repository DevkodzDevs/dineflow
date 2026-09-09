import { createClient } from "@/lib/supabase/server";
import { KitchenClient } from "./KitchenClient";
export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const s = await createClient();
  const { data } = await s.from("kots").select("id, kot_no, status, created_at, orders(order_no, type, customer_name, dining_tables(name)), order_items(id, name_snapshot, qty, status, notes)")
    .in("status", ["pending", "preparing", "ready"]).order("created_at");
  return <KitchenClient initial={(data ?? []) as never} />;
}
