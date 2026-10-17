import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { SvcHead } from "@/components/ui/Service";
import { Say } from "@/components/ui/Say";
import { OrdersClient } from "./OrdersClient";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const s = await createClient();
  const [session, { data: tables }, { data: orders }] = await Promise.all([
    requireSession(),
    s.from("dining_tables").select("*").order("sort_order"),
    // a printed, unpaid bill turns the table violet ("Bill"); each dish's own time decides LATE
    s.from("orders").select("id, order_no, type, table_id, customer_name, status, created_at, bills(status), order_items(id, name_snapshot, qty, price_snapshot, status, created_at)").eq("status", "open").order("created_at"),
  ]);
  return (
    <>
      {/* dine-in starts from a table on the floor; the header's one button is for an order with no table */}
      <SvcHead icon="orders" title="Orders" sub="Tap a table to take or see its order"
        actions={<Link href="/orders/new?type=takeaway" className="svc-btn go sm !px-5" data-new-parcel><ShoppingBag size={19} aria-hidden /><Say w="parcel" /></Link>} />
      <OrdersClient tables={tables ?? []} orders={(orders ?? []) as never} lateAt={Number(session.restaurant.kds_target_minutes ?? 15)} />
    </>
  );
}
