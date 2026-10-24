import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { ConnectionsClient } from "./ConnectionsClient";
export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

/**
 * Connections (2026-10-24, the owner: "every outside link in one page — the food apps, the room sites, Razorpay, the rider's
 * live tracking — easy, and only the owner, or a manager the owner gives it to"). The layout lets in the owner and whoever
 * holds the 'connections' grant (0140). The page gathers what the Channels, Online orders and Settings screens each read, in
 * one round trip, and the client draws it as sections. Keys never come here: has_api_key says whether one is saved, the
 * gateway row answers only the owner (RLS) and even then only booleans cross to the browser.
 */
export default async function ConnectionsPage() {
  const s = await createClient();
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const today = todayIST();
  const [session, { data: ota }, { data: chans }, { data: types }, { data: gw }, { data: who }, { data: riders }, { data: todays }, { data: log }] = await Promise.all([
    requireSession(),
    s.from("ota_channels").select("id, kind, label, mode, room_type_id, import_url, export_token, api_base, hotel_ref, commission_pct, rate_offset_pct, is_live, last_import_at, last_error, has_api_key").order("created_at"),
    s.from("order_channels").select("id, kind, label, outlet_ref, webhook_token, api_base, auto_accept, prep_minutes, commission_pct, is_live, last_sync_at, has_api_key").order("created_at"),
    s.from("room_types").select("id, name, base_rate").eq("is_active", true),
    s.from("payment_gateways").select("key_id, key_secret, webhook_secret, updated_at").maybeSingle(),
    s.from("profiles").select("id, full_name, role, grants").eq("is_active", true).or("role.eq.owner,grants.cs.{connections}").order("role"),
    s.from("profiles").select("id, full_name, phone, position, position_title").eq("is_active", true).or("position.eq.delivery_rider,department.eq.delivery").order("full_name"),
    s.from("online_orders").select("channel_id, status, gross").gte("placed_at", `${today}T00:00:00+05:30`),
    s.from("ota_sync_log").select("id, direction, ok, message, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const r = session.restaurant as unknown as Record<string, unknown>;
  const gateway = { key_id: (gw?.key_id as string | undefined) ?? "", hasSecret: !!gw?.key_secret, hasWebhook: !!gw?.webhook_secret, updated_at: (gw?.updated_at as string | null | undefined) ?? null, readable: gw !== undefined && session.profile.role === "owner" };
  const perChannel: Record<string, { n: number; gross: number }> = {};
  for (const o of todays ?? []) { if (o.status === "rejected" || o.status === "cancelled") continue; const k = String(o.channel_id); perChannel[k] = { n: (perChannel[k]?.n ?? 0) + 1, gross: (perChannel[k]?.gross ?? 0) + Number(o.gross ?? 0) }; }
  return (
    <ConnectionsClient base={base} role={session.profile.role} ota={ota ?? []} orderChannels={chans ?? []} types={types ?? []} gateway={gateway} who={who ?? []} riders={riders ?? []} todays={perChannel} log={log ?? []}
      restaurant={{ id: session.restaurant.id, name: session.restaurant.name, type: session.restaurant.property_type, slug: (r.slug as string | null) ?? null, booking_slug: (r.booking_slug as string | null) ?? null, listed: !!r.is_listed,
        dining: !!r.dining_enabled, ordering: !!r.delivery_enabled || !!r.takeaway_enabled, upi_vpa: (r.upi_vpa as string | null) ?? null, upi_payee: (r.upi_payee as string | null) ?? null,
        tracking: r.delivery_tracking !== false, paused: String(r.online_paused_until ?? "") === "infinity", phone: (r.phone as string | null) ?? null }} />
  );
}
