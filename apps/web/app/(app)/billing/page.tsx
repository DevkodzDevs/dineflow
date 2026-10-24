import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { DayClose } from "./DayClose";
import { BillingBoard, type OpenOrder, type TodayBill } from "./BillingBoard";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

/**
 * The counter (redrawn 2026-10-24, the owner: "pro-level billing — smart options, an ultra-modern design, and the name of who
 * billed, from the login"). page.tsx fetches; BillingBoard.tsx draws and filters. Who is at the counter is the signed-in
 * person; who billed each bill is bills.created_by and who took each payment payments.received_by (0139), both named from
 * the property's own people.
 */
export default async function BillingPage() {
  const s = await createClient(); const session = await requireSession();
  const today = todayIST();
  const [{ data: open }, { data: bills }, { data: closes }, { data: people }] = await Promise.all([
    s.from("orders").select("id, order_no, type, token_no, customer_name, created_at, dining_tables(name), order_items(qty, price_snapshot, status)").eq("status", "open").order("created_at"),
    s.from("bills").select("id, bill_no, total, status, created_at, paid_at, created_by, orders(order_no, type, token_no, customer_name, dining_tables(name)), payments(method, amount, received_by)").gte("created_at", `${today}T00:00:00+05:30`).order("created_at", { ascending: false }),
    s.from("day_closes").select("business_date, total_sales, orders_count").order("business_date", { ascending: false }).limit(1),
    s.from("profiles").select("id, full_name").eq("restaurant_id", session.profile.restaurant_id),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  return (
    <>
      <PageHeader eyebrow="Cash & counter" title="Billing" actions={<DayClose today={today} lastClosed={closes?.[0]?.business_date ?? null} />} />
      <BillingBoard open={(open ?? []) as unknown as OpenOrder[]} bills={(bills ?? []) as unknown as TodayBill[]} names={names} cashier={session.profile.full_name} me={session.userId} />
    </>
  );
}
