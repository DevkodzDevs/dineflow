import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { InventoryClient } from "./InventoryClient";

export const metadata = { title: "Pantry" };

export default async function InventoryPage() {
  const s = await createClient();
  const [{ data: ingredients }, { data: ledger }, { data: purchases }] = await Promise.all([
    s.from("ingredients").select("*").eq("is_active", true).order("name"),
    s.from("stock_ledger").select("id, ingredient_id, qty, reason, note, created_at").order("created_at", { ascending: false }).limit(60),
    s.from("purchases").select("id, supplier, invoice_no, total, purchased_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <>
      <PageHeader eyebrow="What's on the shelves" title="Pantry" actions={<Link href="/inventory/leaks" className="btn btn-gray"><Droplets size={16} /> Leak finder</Link>} />
      <InventoryClient ingredients={ingredients ?? []} ledger={ledger ?? []} purchases={purchases ?? []} />
    </>
  );
}
