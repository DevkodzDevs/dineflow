import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { QrClient } from "./QrClient";
export const metadata = { title: "Join by QR" };
export const dynamic = "force-dynamic";

/**
 * The door QR on a screen of its own (2026-10-20 — it was a card at the foot of Pulse). Guests scan it and join the
 * waiting list from their own phone. Gated like Pulse: the app layout maps the first path segment, "pulse", to the
 * pulse module.
 *
 * The waiting list beside the code (2026-10-31, the owner: "show here the waiting list … speak out the name"): the
 * same rows Pulse reads (`walkins` waiting or called, oldest first). The floor is no longer read here: the list has no
 * table picker since 2026-11-03 (tables are Pulse's), and `walkin_fill` (0164) hands out any table that has freed.
 */
export default async function JoinByQr() {
  const s = await createClient();
  const [session, , { data: queue }] = await Promise.all([
    requireSession(),
    s.rpc("walkin_fill").then(() => null, () => null),
    s.from("walkins").select("id, token, name, phone, party, quoted_min, status, joined_at, called_at, table_id").in("status", ["waiting", "called"]).order("joined_at"),
  ]);
  /* The join-the-queue link is handed to a guest, so it needs a whole address: the same variable and fallback as
     the storefront, booking-page and proof links. */
  const h = await headers();
  /* "How guests use it" hidden on this device (QrClient, df-joinqr-how) — read here so the page is drawn without it */
  const howHidden = (await cookies()).get("df-joinqr-how")?.value === "hidden";
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <QrClient slug={session.restaurant.booking_slug ?? ""} base={base} listed={!!session.restaurant.is_listed} restaurant={session.restaurant.name}
    queue={(queue ?? []) as never} howHidden={howHidden} />;
}
