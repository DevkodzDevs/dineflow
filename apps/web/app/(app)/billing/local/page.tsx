import { requireSession } from "@/lib/auth";
import { LocalBill } from "./LocalBill";

export const metadata = { title: "Bill" };
export const dynamic = "force-dynamic";

/**
 * The bill with no line (2026-11-22, offline Step 2). One page for every order — the order is named in the query (`?c=` an
 * order still on this device, `?o=` an open order from the device's copy of the floor) and read in the browser, so the one
 * copy the service worker keeps of this address serves them all. Nothing is asked of the database here beyond the session:
 * the property's tax settings travel in the page.
 */
export default async function LocalBillPage() {
  const session = await requireSession();
  return <LocalBill restaurant={session.restaurant} cashier={session.profile.full_name} />;
}
