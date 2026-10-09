import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { FolioClient } from "./FolioClient";
export const dynamic = "force-dynamic";
export default async function FolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = await createClient();
  const { data: b } = await s.from("bookings").select("*, guests(*), rooms(number, floor, room_types(name))").eq("id", id).maybeSingle();
  if (!b) notFound();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: charges }, { data: totals }, { data: orders }] = await Promise.all([
    requireSession(),
    s.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
    s.rpc("folio_totals", { p_booking_id: id }),
    s.from("orders").select("id, order_no, order_items(qty, price_snapshot, status)").eq("status", "open"),
  ]);
  // the check-in link goes to a guest, so it needs a whole address — same source as Pulse's queue link
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <FolioClient booking={b as never} charges={charges ?? []} totals={(totals as never[])?.[0] as never} openOrders={(orders ?? []) as never} restaurant={session.restaurant} base={base} />;
}
