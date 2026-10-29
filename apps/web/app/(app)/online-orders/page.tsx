import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { SvcHead } from "@/components/ui/Service";
import { OnlineClient } from "./OnlineClient";
import { OnlineDishes, type OnlineDish } from "./OnlineDishes";
import { canSetOnline } from "@/lib/online";
import { modulesFor } from "@dineflow/shared";
import { KitchenPace } from "./KitchenPace";
import { OnlineSwitch } from "./OnlineSwitch";
import { requireSession } from "@/lib/auth";
import { headers } from "next/headers";
import type { Delivery, Rider } from "./AssignRider";
import Link from "next/link";
import { Landmark } from "lucide-react";
export const metadata = { title: "Online orders" };
export const dynamic = "force-dynamic";
export default async function OnlineOrders() {
  // the session and this screen's queries in one round trip, not two — the queries are checked by RLS and the RPCs
  // themselves, so nothing is shown before the role gate below; it only stops waiting on the session first (2026-10-18)
  const s = await createClient();
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const [session, { data: orders }, { data: channels }, { data: menu }, { data: deliveries }, { data: riders }] = await Promise.all([
    requireSession(),
    s.from("online_orders").select("*, order_channels(kind, label, prep_minutes)").gte("placed_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("placed_at", { ascending: false }),
    s.from("order_channels").select("id, kind, label, is_live"),
    // every dish, with both switches: the order cards map names to them, the Dishes online sheet switches them (0132)
    s.from("menu_items").select("id, name, price, is_veg, is_available, online_available, categories(name)").eq("is_active", true).order("name"),
    // who is riding what (0140): the deliveries of the last two days, and the staff who ride
    s.from("deliveries").select("online_order_id, rider_name, rider_phone, status, token, rider_token, located_at, eta_min, picked_up_at, delivered_at").gte("created_at", new Date(Date.now() - 2 * 86400000).toISOString()),
    s.from("profiles").select("id, full_name, phone").eq("is_active", true).or("position.eq.delivery_rider,department.eq.delivery").order("full_name"),
  ]);
  const mods = modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null);
  const dishes: OnlineDish[] = ((menu ?? []) as unknown as (Omit<OnlineDish, "category"> & { categories: { name: string } | { name: string }[] | null })[]).map((m) => ({ ...m, category: (Array.isArray(m.categories) ? m.categories[0]?.name : m.categories?.name) ?? null }));
  return (<><SvcHead icon="online" title="Online orders" sub="Swiggy, Zomato, website"
    actions={<>{/* on / off first, where the eye lands (0133); off is a pause with no end — Kitchen pace's 30 minutes is not "off" */}
      <OnlineSwitch off={String(session.restaurant.online_paused_until ?? "") === "infinity"} canEdit={canSetOnline(session.profile.role, mods)} />
      {["owner", "manager"].includes(session.profile.role) && <Link href="/online-orders/payouts" className="svc-btn quiet sm !px-5" data-payouts-link><Landmark size={18} aria-hidden /> Payouts</Link>}</>} /><KitchenPace initial={{ rush_extra_min: Number(session.restaurant.rush_extra_min ?? 0), rush_until: (session.restaurant.rush_until as string | null) ?? null, online_paused_until: (session.restaurant.online_paused_until as string | null) ?? null }} /><div className="mb-5"><OnlineDishes dishes={dishes} canEdit={canSetOnline(session.profile.role, mods)} /></div><OnlineClient deliveries={(deliveries ?? []) as Delivery[]} riders={(riders ?? []) as Rider[]} base={base} property={session.restaurant.name} tracking={(session.restaurant as unknown as { delivery_tracking?: boolean }).delivery_tracking !== false} ai={aiEnabled()} orders={(orders ?? []) as never} channels={channels ?? []} menu={dishes} /></>);
}
