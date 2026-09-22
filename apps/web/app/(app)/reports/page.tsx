import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsClient, type Summary, type KitchenSpeed, type HotelKpis, type AuditRow } from "./ReportsClient";
import type { Breakdown } from "./Breakdown";
export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "7" } = await searchParams; const n = Math.min(90, Math.max(1, Number(days)));
  const s = await createClient(); const session = await requireSession();
  const hotel = session.restaurant.property_type !== "restaurant";
  /**
   * One call each, already added up. This used to fetch every paid bill, every order line and every
   * stock ledger row inside the window and total them in the browser — which PostgREST silently
   * truncated at 1000 rows, so a ninety-day report quietly described about two days. Ninety days
   * now costs the same as one: a few dozen summary rows either way. Speed of service and the rooms
   * KPIs come the same way; a restaurant never asks for the rooms.
   */
  const [{ data: summary }, { data: closes }, { data: kitchen }, { data: rooms }, { data: audits }, { data: breakdown }] = await Promise.all([
    s.rpc("report_summary", { p_days: n }),
    s.from("day_closes").select("business_date, orders_count, total_sales, cash, upi, card, other, notes")
      .order("business_date", { ascending: false }).limit(30),
    s.rpc("kitchen_speed", { p_days: n }),
    hotel ? s.rpc("hotel_kpis", { p_days: n }) : Promise.resolve({ data: null }),
    hotel ? s.from("night_audits").select("business_date, occupancy_pct, adr, revpar, room_revenue, no_shows, discrepancies").order("business_date", { ascending: false }).limit(14) : Promise.resolve({ data: [] }),
    // by category, hour, type and cashier; discounts, cancellations, sizes and add-ons — one call, already added up
    s.rpc("sales_breakdown", { p_days: n }),
  ]);
  return (
    <>
      <PageHeader eyebrow="How the business is doing" title="Reports" />
      <ReportsClient days={n} summary={(summary ?? {}) as Summary} closes={closes ?? []} kitchen={(kitchen ?? null) as KitchenSpeed | null} hotel={(rooms ?? null) as HotelKpis | null} audits={(audits ?? []) as AuditRow[]} breakdown={(breakdown ?? null) as Breakdown | null} />
    </>
  );
}
