import { notFound } from "next/navigation";
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
  return <FolioClient booking={b as never} charges={charges ?? []} totals={(totals as never[])?.[0] as never} openOrders={(orders ?? []) as never} restaurant={session.restaurant} />;
}
