import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChannelsClient } from "./ChannelsClient";
export const metadata = { title: "Channels" };
export const dynamic = "force-dynamic";
export default async function Channels() {
  const s = await createClient(); const session = await requireSession();
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: ota }, { data: chans }, { data: types }, { data: log }, { data: avail }] = await Promise.all([
    s.from("ota_channels").select("*").order("created_at"),
    s.from("order_channels").select("*").order("created_at"),
    s.from("room_types").select("id, name, base_rate").eq("is_active", true),
    s.from("ota_sync_log").select("*").order("created_at", { ascending: false }).limit(20),
    session.restaurant.property_type === "restaurant" ? Promise.resolve({ data: [] }) : s.rpc("availability", { p_from: from, p_to: to }),
  ]);
  return (<><PageHeader eyebrow="Where your orders and bookings come from" title="Channels" accent="& sync" sub="Aggregators for food, OTAs for rooms, and your own commission-free booking page." />
    <ChannelsClient base={base} ota={ota ?? []} orderChannels={chans ?? []} types={types ?? []} log={log ?? []} avail={(avail ?? []) as never} restaurant={session.restaurant as never} /></>);
}
