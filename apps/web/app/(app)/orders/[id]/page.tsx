import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Receipt, Lock, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { Button } from "@/components/ui";
import { mergedRows, mergedTables } from "@/lib/merged";
import { OrderDetail } from "./OrderDetail";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createClient();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: order }, { data: rawTables }, { data: open }, { data: cleans }, { data: mergedFrom }] = await Promise.all([
    requireSession(),
    s.from("orders").select("*, dining_tables(name), bills(status), kots(id, kot_no, status, held, created_at), order_items(*)").eq("id", id).maybeSingle(),
    // where this order could move to, and what it could join
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("orders").select("id, order_no, table_id, dining_tables(name)").eq("status", "open").neq("id", id).order("created_at"),
    // 0166: a table being cleaned is not somewhere to move to (move_order refuses it); it reads "cleaning" in Move's list
    s.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"]),
    // the tables merged into this order (lib/merged.ts): the head reads "T3 + T5"
    mergedRows(s),
  ]);
  const cleaning = new Set(((cleans ?? []) as { table_id: string }[]).map((c) => c.table_id));
  const tables = ((rawTables ?? []) as { id: string; name: string; status: string }[]).map((t) => (cleaning.has(t.id) ? { ...t, status: "cleaning" } : t));
  if (!order) notFound();
  const others = ((open ?? []) as { id: string; table_id: string | null }[]);
  const withTables = order.status === "open" ? (mergedTables(mergedFrom, [{ id: order.id, table_id: order.table_id }, ...others])[order.id] ?? []).map((tid) => tables.find((t) => t.id === tid)?.name).filter((n): n is string => !!n) : [];
  /* the bill is printed (unpaid) or paid: nothing more goes on this order — 0165/0167 refuse it — so Add items is shown switched off
     (2026-11-04, the owner: "when the bill is out, Add items should be disabled") */
  const billed = ((order.bills ?? []) as { status: string }[]).some((b) => b.status === "unpaid" || b.status === "paid");
  const canBill = ["owner", "manager", "cashier"].includes(session.profile.role);
  return (
    <>
      {/* On a phone the title has its own row and the two actions sit under it as an even pair — they
          used to squeeze "Order #1400 / T3" into a narrow column between the back button and two big
          buttons. From sm it is one row again. */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-3 mb-6">
        <div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order #{order.order_no}</div><h1 className="text-3xl leading-tight truncate">{order.dining_tables?.name ? [order.dining_tables.name, ...withTables].join(" + ") : (order.type === "takeaway" ? "Takeaway" : order.type === "room_service" ? "Room service" : "Delivery")}{order.customer_name && <span className="text-steel text-xl"> · {order.customer_name}</span>}</h1>
          {withTables.length > 0 && <div className="mt-1.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12.5px] font-bold num bg-[color-mix(in_srgb,var(--color-blue)_15%,transparent)] text-[var(--color-blue)]" data-merged-head>
            <Link2 size={13} strokeWidth={2.4} aria-hidden />Merged · {withTables.length + 1} tables</div>}</div>
        {order.status === "open" && (
          <div className={`w-full sm:w-auto sm:ml-auto grid ${canBill ? "grid-cols-2" : "grid-cols-1"} sm:flex gap-2`}>
            {billed
              ? <Button variant="outline" className="w-full max-sm:!h-12" disabled data-add-items-blocked aria-label="Add items — the bill is printed; void it to add more" title="The bill is printed — void it to add more"><Lock size={16} /> Add items<span className="text-[12px] font-semibold opacity-75"> · Bill printed</span></Button>
              : <Link href={`/orders/new?table=${order.table_id ?? ""}&add=${order.id}`} className="min-w-0" data-add-items><Button variant="outline" className="w-full max-sm:!h-12"><Plus size={16} /> Add items</Button></Link>}
            {canBill && <Link href={`/billing/${order.id}`} className="min-w-0"><Button className="w-full max-sm:!h-12"><Receipt size={16} /> Bill</Button></Link>}
          </div>
        )}
      </div>
      <OrderDetail order={order as never} tables={tables} open={(open ?? []) as never} />
    </>
  );
}
