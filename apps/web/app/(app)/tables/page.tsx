import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { TablesClient, type TableRow, type OpenOrder, type PaidBill, type Booking, type Clean } from "./TablesClient";
export const metadata = { title: "Tables" };
export const dynamic = "force-dynamic";

/**
 * Every table and everything about it (2026-10-21, the owner: "a Tables menu — click one and see its details
 * completely"): the floor's tables with their live state, and per table the open order and its items, today's bookings
 * on it, today's bills there, its cleaning job and its table-ordering QR. Each list is asked for this property by id.
 */
export default async function TablesPage() {
  const s = await createClient(); const session = await requireSession(); const rid = session.restaurant.id;
  const today = todayIST(); const dayStart = `${today}T00:00:00+05:30`;
  const [{ data: tables }, { data: open }, { data: paid }, { data: booked }, { data: cleaning }, { data: people }] = await Promise.all([
    s.from("dining_tables").select("id, name, capacity, zone, status, sort_order, qr_token").eq("restaurant_id", rid).order("sort_order"),
    s.from("orders").select("id, order_no, table_id, customer_name, created_at, created_by, bills(status, total), order_items(id, name_snapshot, variant_name, qty, price_snapshot, status)")
      .eq("restaurant_id", rid).eq("status", "open").not("table_id", "is", null).order("created_at"),
    s.from("bills").select("id, bill_no, total, paid_at, orders!inner(table_id, created_at)").eq("restaurant_id", rid).eq("status", "paid").gte("paid_at", dayStart).order("paid_at", { ascending: false }),
    s.from("reservations").select("id, table_id, guest_name, guest_phone, party_size, at_time, status, occasion").eq("restaurant_id", rid).eq("on_date", today)
      .in("status", ["requested", "confirmed", "seated"]).not("table_id", "is", null).order("at_time"),
    s.from("table_cleanings").select("id, table_id, status, created_at, taken_by").eq("restaurant_id", rid).in("status", ["pending", "in_progress"]),
    s.from("profiles").select("id, full_name").eq("restaurant_id", rid),
  ]);
  const names = Object.fromEntries((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  return <TablesClient tables={(tables ?? []) as TableRow[]} open={(open ?? []) as unknown as OpenOrder[]} paid={(paid ?? []) as unknown as PaidBill[]} booked={(booked ?? []) as Booking[]}
    cleaning={(cleaning ?? []) as Clean[]} names={names} slug={session.restaurant.booking_slug ?? ""} canEdit={["owner", "manager"].includes(session.profile.role)} />;
}
