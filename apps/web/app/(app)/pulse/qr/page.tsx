import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { QrClient } from "./QrClient";
export const metadata = { title: "Join by QR" };
export const dynamic = "force-dynamic";

/**
 * The door QR on a screen of its own (2026-10-20 — it was a card at the foot of Pulse). Guests scan it and join the
 * waiting list from their own phone. Gated like Pulse: the app layout maps the first path segment, "pulse", to the
 * pulse module.
 */
export default async function JoinByQr() {
  const session = await requireSession();
  /* The join-the-queue link is handed to a guest, so it needs a whole address: the same variable and fallback as
     the storefront, booking-page and proof links. */
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <QrClient slug={session.restaurant.booking_slug ?? ""} base={base} listed={!!session.restaurant.is_listed} restaurant={session.restaurant.name} />;
}
