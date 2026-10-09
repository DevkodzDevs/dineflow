import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PulseClient } from "./PulseClient";
export const metadata = { title: "Pulse" };
export const dynamic = "force-dynamic";

export default async function Pulse() {
  const s = await createClient();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: pulse }, { data: queue }] = await Promise.all([
    requireSession(),
    s.rpc("table_pulse"),
    s.from("walkins").select("id, token, name, phone, party, quoted_min, status, joined_at, called_at, table_id").in("status", ["waiting", "called"]).order("joined_at"),
  ]);
  /* The join-the-queue link is handed to a guest, so it needs a whole address. It read an
     env var nothing set, which made it "/queue/slug" with no host. Same variable and same
     fallback as the storefront, booking-page and proof links. */
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <PulseClient pulse={(pulse ?? { tables: [] }) as never} queue={(queue ?? []) as never} slug={session.restaurant.booking_slug ?? ""} base={base} listed={!!session.restaurant.is_listed} restaurant={session.restaurant.name} />;
}
