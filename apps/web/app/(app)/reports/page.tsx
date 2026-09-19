import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsClient, type Summary } from "./ReportsClient";
export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "7" } = await searchParams; const n = Math.min(90, Math.max(1, Number(days)));
  const s = await createClient();
  /**
   * One call, already added up. This used to fetch every paid bill, every order line and every stock
   * ledger row inside the window and total them in the browser — which PostgREST silently truncated
   * at 1000 rows, so a ninety-day report quietly described about two days. Ninety days now costs the
   * same as one: a few dozen summary rows either way.
   */
  const [{ data: summary }, { data: closes }] = await Promise.all([
    s.rpc("report_summary", { p_days: n }),
    s.from("day_closes").select("business_date, orders_count, total_sales, cash, upi, card, other, notes")
      .order("business_date", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader eyebrow="How the business is doing" title="Reports" />
      <ReportsClient days={n} summary={(summary ?? {}) as Summary} closes={closes ?? []} />
    </>
  );
}
