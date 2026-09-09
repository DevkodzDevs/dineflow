import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui";
import { OrdersClient } from "./OrdersClient";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const s = await createClient();
  const [{ data: tables }, { data: orders }] = await Promise.all([
    s.from("dining_tables").select("*").order("sort_order"),
    s.from("orders").select("id, order_no, type, table_id, customer_name, status, created_at, order_items(id, name_snapshot, qty, price_snapshot, status)").eq("status", "open").order("created_at"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Front of house" title="Orders" actions={<Link href="/orders/new"><Button><Plus size={16} /> New order</Button></Link>} />
      <OrdersClient tables={tables ?? []} orders={(orders ?? []) as never} />
    </>
  );
}
