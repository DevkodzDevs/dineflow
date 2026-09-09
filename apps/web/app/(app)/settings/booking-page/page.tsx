import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { BookingPageClient } from "./BookingPageClient";
export const metadata = { title: "Booking page" };
export const dynamic = "force-dynamic";
export default async function BookingPageSettings() {
  const s = await requireSession(); const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return (<><PageHeader eyebrow="Commission-free bookings" title="Your booking" accent="page" sub="One link for Instagram, Google and WhatsApp. Bookings land in Front desk." /><BookingPageClient base={base} r={s.restaurant as never} /></>);
}
