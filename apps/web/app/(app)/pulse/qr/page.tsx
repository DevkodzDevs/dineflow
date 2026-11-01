import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { QrClient } from "./QrClient";
export const metadata = { title: "Join by QR" };
export const dynamic = "force-dynamic";

/**
 * The door QR on a screen of its own (2026-10-20 — it was a card at the foot of Pulse). Guests scan it and join the
 * waiting list from their own phone. Gated like Pulse: the app layout maps the first path segment, "pulse", to the
 * pulse module.
 *
 * The waiting list beside the code (2026-10-31, the owner: "show here the waiting list … speak out the name"): the
 * same rows Pulse reads (`walkins` waiting or called, oldest first), and the floor (`table_pulse`, today's bookings
 * that hold a table) only so Seat can offer the tables that fit — the same reads as Pulse, one trip.
 */
export default async function JoinByQr() {
  const s = await createClient();
  const [session, { data: queue }, { data: pulse }, { data: booked }] = await Promise.all([
    requireSession(),
    s.from("walkins").select("id, token, name, phone, party, quoted_min, status, joined_at, called_at, table_id").in("status", ["waiting", "called"]).order("joined_at"),
    s.rpc("table_pulse"),
    s.from("reservations").select("id, table_id, guest_name, party_size, at_time").eq("on_date", todayIST()).in("status", ["requested", "confirmed"]).not("table_id", "is", null).order("at_time"),
  ]);
  /* The join-the-queue link is handed to a guest, so it needs a whole address: the same variable and fallback as
     the storefront, booking-page and proof links. */
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const tables = ((pulse as { tables?: unknown[] } | null)?.tables ?? []) as never;
  return <QrClient slug={session.restaurant.booking_slug ?? ""} base={base} listed={!!session.restaurant.is_listed} restaurant={session.restaurant.name}
    queue={(queue ?? []) as never} tables={tables} booked={(booked ?? []) as never} />;
}
