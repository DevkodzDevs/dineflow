import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { InventoryClient } from "./InventoryClient";

export const metadata = { title: "Pantry" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const s = await createClient();
  const [session, { data: ingredients }, { data: ledger }, { data: purchases }, { data: suppliers }, { data: orders }, { data: wastage }] = await Promise.all([
    requireSession(),
    s.from("ingredients").select("*").eq("is_active", true).order("name"),
    s.from("stock_ledger").select("id, ingredient_id, qty, reason, sub_reason, note, created_at").order("created_at", { ascending: false }).limit(60),
    s.from("purchases").select("id, supplier, invoice_no, total, purchased_at, po_id").order("created_at", { ascending: false }).limit(20),
    // the people the property buys from, and what it has asked them for
    s.from("suppliers").select("*").eq("is_active", true).order("name"),
    s.from("purchase_orders").select("id, po_no, status, expected_on, notes, total, created_at, sent_at, received_at, supplier_id, purchase_id, suppliers(name, phone), purchase_order_items(id, ingredient_id, qty, unit_cost, received_qty)")
      .order("created_at", { ascending: false }).limit(40),
    s.rpc("wastage_summary", { p_days: 30 }),
  ]);
  return (
    <>
      <PageHeader eyebrow="What's on the shelves" title="Pantry" actions={<Link href="/inventory/leaks" className="btn btn-gray"><Droplets size={16} /> Leak finder</Link>} />
      <InventoryClient ingredients={ingredients ?? []} ledger={ledger ?? []} purchases={purchases ?? []} suppliers={suppliers ?? []} orders={(orders ?? []) as never} wastage={(wastage ?? null) as never} restaurant={session.restaurant.name} />
    </>
  );
}
