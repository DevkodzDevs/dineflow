import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsClient, type Summary, type KitchenSpeed, type HotelKpis, type AuditRow } from "./ReportsClient";
import type { Breakdown } from "./Breakdown";
import type { Extra } from "./tables";
import { todayIST } from "@/lib/format";
export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "7" } = await searchParams; const n = Math.min(90, Math.max(1, Number(days)));
  const s = await createClient();
  /**
   * One call each, already added up. This used to fetch every paid bill, every order line and every
   * stock ledger row inside the window and total them in the browser — which PostgREST silently
   * truncated at 1000 rows, so a ninety-day report quietly described about two days. Ninety days
   * now costs the same as one: a few dozen summary rows either way. Speed of service and the rooms
   * KPIs come the same way. The rooms ones are asked for by every property, restaurant or not: they
   * answer with zeros where there are no rooms, and the page used to spend a whole round trip to
   * Mumbai finding out which kind of property it was before it would ask anything at all.
   */
  // The session travels with the page's own rows rather than in front of them: one round trip
  // to Mumbai, not two. The rooms queries are asked unconditionally — a restaurant has none, so
  // they come back empty, and waiting to learn which kind of property this is cost more than
  // the empty answers do.
  // the same window as IST dates, for the reports that count by day (0105 report_extra)
  const to = todayIST(); const from = new Date(Date.parse(to) - (n - 1) * 86400000).toISOString().slice(0, 10);
  const [session, { data: summary }, { data: closes }, { data: kitchen }, { data: rooms }, { data: audits }, { data: breakdown }, { data: extra }] = await Promise.all([
    requireSession(),
    s.rpc("report_summary", { p_days: n }),
    s.from("day_closes").select("business_date, orders_count, total_sales, cash, upi, card, other, notes")
      .order("business_date", { ascending: false }).limit(30),
    s.rpc("kitchen_speed", { p_days: n }),
    s.rpc("hotel_kpis", { p_days: n }),
    s.from("night_audits").select("business_date, occupancy_pct, adr, revpar, room_revenue, no_shows, discrepancies").order("business_date", { ascending: false }).limit(14),
    // by category, hour, type and cashier; discounts, cancellations, sizes and add-ons — one call, already added up
    s.rpc("sales_breakdown", { p_days: n }),
    // payments, every dish, staff, cancellations, expenses, sales less expenses — owner, manager, supervisor only
    s.rpc("report_extra", { p_from: from, p_to: to }),
  ]);
  // The rooms panels draw themselves from whether `rooms` came back with anything, so there is
  // nothing left here that needs to know the property type.
  return (
    <>
      <PageHeader eyebrow="How the business is doing" title="Reports" />
      <ReportsClient days={n} summary={(summary ?? {}) as Summary} closes={closes ?? []} kitchen={(kitchen ?? null) as KitchenSpeed | null} hotel={(rooms ?? null) as HotelKpis | null} audits={(audits ?? []) as AuditRow[]} breakdown={(breakdown ?? null) as Breakdown | null}
        extra={(extra ?? null) as Extra | null} property={session.restaurant.name} />
    </>
  );
}
