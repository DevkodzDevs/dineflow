import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { BillClient } from "./BillClient";
export const dynamic = "force-dynamic";

export default async function BillPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ bill?: string }> }) {
  const { orderId } = await params; const { bill: isBill } = await searchParams;
  const s = await createClient(); const session = await requireSession();
  // route accepts either an order id, or a bill id when ?bill=1
  let oid = orderId;
  if (isBill) { const { data: b } = await s.from("bills").select("order_id").eq("id", orderId).maybeSingle(); if (!b) notFound(); oid = b.order_id; }
  const { data: order } = await s.from("orders").select("*, dining_tables(name), order_items(*)").eq("id", oid).maybeSingle();
  if (!order) notFound();
  const { data: bill } = await s.from("bills").select("*, payments(*)").eq("order_id", oid).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: inHouse } = session.restaurant.property_type === "restaurant" ? { data: [] } : await s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in");
  return <BillClient order={order as never} bill={bill as never} restaurant={session.restaurant} cashier={session.profile.full_name} inHouse={(inHouse ?? []) as never} />;
}
