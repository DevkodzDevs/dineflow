import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { InventoryClient } from "./InventoryClient";

export const metadata = { title: "Pantry" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const s = await createClient();
  // every list is asked for by this property's id: purchase orders, their lines and suppliers are also open to a
  // platform admin (RLS), so a master acting as a property saw every property's orders — with no ingredient names,
  // ingredients being this property's alone (2026-10-21)
  const session = await requireSession(); const rid = session.restaurant.id;
  const [{ data: ingredients }, { data: ledger }, { data: purchases }, { data: suppliers }, { data: orders }, { data: wastage }] = await Promise.all([
    s.from("ingredients").select("*").eq("restaurant_id", rid).eq("is_active", true).order("name"),
    s.from("stock_ledger").select("id, ingredient_id, qty, reason, sub_reason, note, created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(60),
    s.from("purchases").select("id, supplier, invoice_no, total, purchased_at, po_id").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(20),
    // the people the property buys from, and what it has asked them for
    s.from("suppliers").select("*").eq("restaurant_id", rid).eq("is_active", true).order("name"),
    s.from("purchase_orders").select("id, po_no, status, expected_on, notes, total, created_at, sent_at, received_at, supplier_id, purchase_id, suppliers(name, phone), purchase_order_items(id, ingredient_id, qty, unit_cost, received_qty)")
      .eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(40),
    s.rpc("wastage_summary", { p_days: 30 }),
  ]);
  return (
    <>
      <InventoryClient ingredients={ingredients ?? []} ledger={ledger ?? []} purchases={purchases ?? []} suppliers={suppliers ?? []} orders={(orders ?? []) as never} wastage={(wastage ?? null) as never} restaurant={session.restaurant.name} />
    </>
  );
}
