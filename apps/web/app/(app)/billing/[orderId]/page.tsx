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
    s.from("orders").select("*, dining_tables(name), order_items(*)").eq("id", oid).maybeSingle(),
    s.from("bills").select("*, payments(*)").eq("order_id", oid).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    session.restaurant.property_type === "restaurant" ? Promise.resolve({ data: [] }) : s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
  ]);
  if (!order) notFound();
  return <BillClient order={order as never} bill={bill as never} restaurant={session.restaurant} cashier={session.profile.full_name} inHouse={(inHouse ?? []) as never} />;
}
