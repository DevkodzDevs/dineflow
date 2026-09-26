import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChannelsClient } from "./ChannelsClient";
export const metadata = { title: "Channels" };
export const dynamic = "force-dynamic";
export default async function Channels() {
  const s = await createClient();
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: ota }, { data: chans }, { data: types }, { data: log }, { data: avail }] = await Promise.all([
    requireSession(),
    s.from("ota_channels").select("*").order("created_at"),
    s.from("order_channels").select("*").order("created_at"),
    s.from("room_types").select("id, name, base_rate").eq("is_active", true),
    s.from("ota_sync_log").select("*").order("created_at", { ascending: false }).limit(20),
    // asked for unconditionally: a restaurant has no room types so this comes back empty, and
    // the page no longer waits to learn what kind of property it is before it can start
    s.rpc("availability", { p_from: from, p_to: to }),
  ]);
  return (<><PageHeader eyebrow="Where your orders and bookings come from" title="Channels" accent="& sync" sub="Aggregators for food, OTAs for rooms, and your own commission-free booking page." />
    <ChannelsClient base={base} ota={ota ?? []} orderChannels={chans ?? []} types={types ?? []} log={log ?? []} avail={(avail ?? []) as never} restaurant={session.restaurant as never} /></>);
}
