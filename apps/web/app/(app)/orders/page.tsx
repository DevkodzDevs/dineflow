import Link from "next/link";
import { ShoppingBag, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { SvcHead } from "@/components/ui/Service";
import { Say } from "@/components/ui/Say";
import { OrdersClient } from "./OrdersClient";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const s = await createClient();
  const [session, { data: tables }, { data: orders }, { data: calls }, { data: cleans }, { data: people }] = await Promise.all([
    requireSession(),
    s.from("dining_tables").select("*").order("sort_order"),
    // a printed, unpaid bill turns the table violet ("Bill"); each dish's own time decides LATE
    s.from("orders").select("id, order_no, type, table_id, customer_name, status, created_at, token_no, bills(status), order_items(id, name_snapshot, qty, price_snapshot, status, created_at)").eq("status", "open").order("created_at"),
    // tables calling from their QR in the last half hour (0103) — a badge on the card until someone answers
    s.from("service_calls").select("id, table_id, kind, created_at").eq("status", "open").gte("created_at", new Date(Date.now() - 30 * 60000).toISOString()).order("created_at"),
    // tables paid and left, not yet cleaned (0111) — and the names of whoever has them
    s.from("table_cleanings").select("id, table_id, status, created_at, assigned_to, taken_by, taken_at").in("status", ["pending", "in_progress"]),
    s.from("profiles").select("id, full_name").eq("is_active", true),
  ]);
  const nameOf = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const cleaning = ((cleans ?? []) as { id: string; table_id: string; status: "pending" | "in_progress"; created_at: string; assigned_to: string | null; taken_by: string | null; taken_at: string | null }[])
    .map((c) => ({ ...c, assigned_name: c.assigned_to ? nameOf.get(c.assigned_to) ?? "someone" : null, taken_name: c.taken_by ? nameOf.get(c.taken_by) ?? "someone" : null }));
  return (
    <>
      {/* dine-in starts from a table on the floor; the header's one button is for an order with no table */}
      <SvcHead icon="orders" title="Orders" sub="Tap a table to order"
        actions={<>
          <Link href="/orders/phone" className="svc-btn quiet sm !px-4" data-phone-order-link><Phone size={18} aria-hidden /> Phone</Link>
          <Link href="/orders/new?type=takeaway" className="svc-btn go sm !px-5" data-new-parcel><ShoppingBag size={19} aria-hidden /><Say w="parcel" /></Link>
        </>} />
      <OrdersClient tables={tables ?? []} orders={(orders ?? []) as never} calls={(calls ?? []) as never} lateAt={Number(session.restaurant.kds_target_minutes ?? 15)}
        cleaning={cleaning} me={session.profile.id} boss={["owner", "manager", "supervisor", "supervisor_2"].includes(session.profile.role)} />
    </>
  );
}
