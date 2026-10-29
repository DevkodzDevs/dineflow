import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { BillClient } from "./BillClient";
export const dynamic = "force-dynamic";

export default async function BillPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ bill?: string }> }) {
  const { orderId } = await params; const { bill: isBill } = await searchParams;
  const s = await createClient();
  // route accepts either an order id, or a bill id when ?bill=1 — only that lookup has to come first
  const [session, oid] = await Promise.all([
    requireSession(),
    isBill ? s.from("bills").select("order_id").eq("id", orderId).maybeSingle().then((r) => r.data?.order_id as string | undefined) : Promise.resolve(orderId),
  ]);
  if (!oid) notFound();
  const [{ data: order }, { data: bill }, { data: inHouse }] = await Promise.all([
    // 0146: the channel (an aggregator pays the GST — section 9(5)) and the bill's credit notes ride along in the same reads
    s.from("orders").select("*, dining_tables(name), order_items(*), order_channels(kind)").eq("id", oid).maybeSingle(),
    s.from("bills").select("*, payments(*), credit_notes(*)").eq("order_id", oid).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    session.restaurant.property_type === "restaurant" ? Promise.resolve({ data: [] }) : s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
  ]);
  if (!order) notFound();
  // who generated the bill (bills.created_by) — shown on the bill beside who is at the counter now (2026-10-24)
  const creator = (bill as { created_by?: string | null } | null)?.created_by;
  const billedBy = creator ? ((await s.from("profiles").select("full_name").eq("id", creator).maybeSingle()).data?.full_name as string | undefined) ?? null : null;
  return <BillClient order={order as never} bill={bill as never} restaurant={session.restaurant} cashier={session.profile.full_name} billedBy={billedBy} inHouse={(inHouse ?? []) as never} />;
}
