import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsClient } from "./ReportsClient";
export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "7" } = await searchParams; const n = Math.min(90, Math.max(1, Number(days)));
  const since = new Date(Date.now() - n * 86400000).toISOString();
  const s = await createClient();
  const [{ data: bills }, { data: items }, { data: ledger }, { data: closes }] = await Promise.all([
    s.from("bills").select("total, paid_at, payments(method, amount)").eq("status", "paid").gte("paid_at", since),
    s.from("order_items").select("name_snapshot, qty, price_snapshot, created_at, orders!inner(status)").neq("status", "cancelled").eq("orders.status", "billed").gte("created_at", since),
    s.from("stock_ledger").select("qty, reason, ingredients(name, unit, cost_per_unit)").gte("created_at", since).in("reason", ["sale", "wastage"]),
    s.from("day_closes").select("business_date, orders_count, total_sales, cash, upi, card, other, notes").order("business_date", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader eyebrow="How the business is doing" title="Reports" />
      <ReportsClient days={n} bills={(bills ?? []) as never} items={(items ?? []) as never} ledger={(ledger ?? []) as never} closes={closes ?? []} />
    </>
  );
}
