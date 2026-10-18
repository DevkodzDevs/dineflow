import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { SvcHead } from "@/components/ui/Service";
import { OnlineClient } from "./OnlineClient";
import { KitchenPace } from "./KitchenPace";
import { requireSession } from "@/lib/auth";
import Link from "next/link";
import { Landmark } from "lucide-react";
export const metadata = { title: "Online orders" };
export const dynamic = "force-dynamic";
export default async function OnlineOrders() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: orders }, { data: channels }, { data: menu }] = await Promise.all([
    s.from("online_orders").select("*, order_channels(kind, label, prep_minutes)").gte("placed_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("placed_at", { ascending: false }),
    s.from("order_channels").select("id, kind, label, is_live"),
    s.from("menu_items").select("id, name, price").eq("is_active", true).order("name"),
  ]);
  return (<><SvcHead icon="online" title="Online orders" sub="Swiggy, Zomato and your website — accept them quickly; the kitchen gets the same ticket as a table"
    actions={["owner", "manager"].includes(session.profile.role) ? <Link href="/online-orders/payouts" className="svc-btn quiet sm !px-5" data-payouts-link><Landmark size={18} aria-hidden /> Payouts</Link> : undefined} /><KitchenPace initial={{ rush_extra_min: Number(session.restaurant.rush_extra_min ?? 0), rush_until: (session.restaurant.rush_until as string | null) ?? null, online_paused_until: (session.restaurant.online_paused_until as string | null) ?? null }} /><OnlineClient ai={aiEnabled()} orders={(orders ?? []) as never} channels={channels ?? []} menu={menu ?? []} /></>);
}
