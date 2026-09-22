import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { CustomersClient, type Overview } from "./CustomersClient";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const s = await createClient();
  const [session, { data: overview }, { data: customers }] = await Promise.all([
    requireSession(),
    s.rpc("customers_overview"),
    s.from("customers").select("*").order("last_visit_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000),
  ]);
  const r = session.restaurant;
  return (
    <>
      <PageHeader eyebrow="Who eats with you" title="Customers" />
      <CustomersClient overview={(overview ?? {}) as Overview} customers={(customers ?? []) as never} restaurant={r.name}
        loyalty={{ enabled: !!r.loyalty_enabled, earnPct: Number(r.loyalty_earn_pct ?? 5), pointValue: Number(r.loyalty_point_value ?? 1), minRedeem: Number(r.loyalty_min_redeem ?? 50) }} />
    </>
  );
}
