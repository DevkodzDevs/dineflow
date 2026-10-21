import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { pinned } from "@/lib/scoped";
import { CustomersClient, type Overview } from "./CustomersClient";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const s = await createClient();
  const list = (rid?: string) => { const q = s.from("customers").select("*"); return (rid ? q.eq("restaurant_id", rid) : q).order("last_visit_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000); };
  const [session, { data: overview }, all, { data: feedback }] = await Promise.all([
    requireSession(),
    s.rpc("customers_overview"),
    list(),
    // private ratings from the feedback QR (0103), newest first
    s.from("guest_feedback").select("id, rating, tags, comment, guest_name, guest_phone, status, created_at, dining_tables(name)").order("created_at", { ascending: false }).limit(300),
  ]);
  // the master reads every property's customers (lib/scoped.ts): only for it, ask again for this property
  const { data: customers } = await pinned(session, all, list);
  const r = session.restaurant;
  return (
    <>
      <CustomersClient overview={(overview ?? {}) as Overview} customers={(customers ?? []) as never} restaurant={r.name}
        feedback={(feedback ?? []) as never} initialTab={tab === "feedback" ? "feedback" : "all"}
        loyalty={{ enabled: !!r.loyalty_enabled, earnPct: Number(r.loyalty_earn_pct ?? 5), pointValue: Number(r.loyalty_point_value ?? 1), minRedeem: Number(r.loyalty_min_redeem ?? 50) }} />
    </>
  );
}
