import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnlineClient } from "./OnlineClient";
export const metadata = { title: "Online orders" };
export const dynamic = "force-dynamic";
export default async function OnlineOrders() {
  const s = await createClient();
  const [{ data: orders }, { data: channels }, { data: menu }] = await Promise.all([
    s.from("online_orders").select("*, order_channels(kind, label, prep_minutes)").gte("placed_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("placed_at", { ascending: false }),
    s.from("order_channels").select("*"),
    s.from("menu_items").select("id, name, price").eq("is_active", true).order("name"),
  ]);
  return (<><PageHeader eyebrow="Swiggy · Zomato · your website" title="Online" accent="orders" sub="Orders arrive here, you accept, and the kitchen gets the same ticket as a table order." /><OnlineClient orders={(orders ?? []) as never} channels={channels ?? []} menu={menu ?? []} /></>);
}
