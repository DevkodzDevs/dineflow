import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { Button } from "@/components/ui";
import { OrderDetail } from "./OrderDetail";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createClient(); const session = await requireSession();
  const { data: order } = await s.from("orders").select("*, dining_tables(name), kots(id, kot_no, status, created_at), order_items(*)").eq("id", id).maybeSingle();
  if (!order) notFound();
  const canBill = ["owner", "manager", "cashier"].includes(session.profile.role);
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
        <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order #{order.order_no}</div><h1 className="text-3xl">{order.dining_tables?.name ?? (order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery")}{order.customer_name ? ` · ${order.customer_name}` : ""}</h1></div>
        <div className="ml-auto page-actions">
          {order.status === "open" && <Link href={`/orders/new?table=${order.table_id ?? ""}`}><Button variant="outline"><Plus size={16} /> Add items</Button></Link>}
          {order.status === "open" && canBill && <Link href={`/billing/${order.id}`}><Button><Receipt size={16} /> Bill</Button></Link>}
        </div>
      </div>
      <OrderDetail order={order as never} />
    </>
  );
}
