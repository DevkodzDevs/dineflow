import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { screenKey } from "../actions";
import { ScreensClient } from "./ScreensClient";

export const metadata = { title: "Screens & feedback" };
export const dynamic = "force-dynamic";

/** The TV by the counter, the self-order kiosk and the feedback QR — three links, each to print or open. */
export default async function ScreensPage() {
  const session = await requireSession();
  const r = await screenKey(false);
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Self-service</div><h1 className="text-3xl">Screens & feedback</h1></div>
      </div>
      <ScreensClient base={base} name={session.restaurant.name} slug={session.restaurant.booking_slug ?? null} initialKey={"key" in r ? r.key! : null} />
    </>
  );
}
