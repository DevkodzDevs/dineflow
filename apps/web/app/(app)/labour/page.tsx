import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { LabourClient } from "./LabourClient";
export const metadata = { title: "Labour" };
export const dynamic = "force-dynamic";
export default async function LabourPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const { tab, open } = await searchParams; const s = await createClient(); const session = await requireSession(); const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: labourers }, { data: att }, { data: pays }, { data: rooms }, { data: ingredients }] = await Promise.all([
    s.from("labourers").select("*").order("status").order("full_name"),
    s.from("labour_attendance").select("id, labourer_id, work_date, in_at, out_at, hours, wage").gte("work_date", monthStart).order("work_date"),
    s.from("labour_payments").select("id, labourer_id, amount, method, period_from, period_to, created_at").gte("created_at", `${monthStart}T00:00:00+05:30`),
    tab === "labels" ? s.from("rooms").select("id, number, floor").order("sort_order") : Promise.resolve({ data: [] }),
    tab === "labels" ? s.from("ingredients").select("id, name, unit, barcode").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Daily-wage & contract workers" title="Labour" accent="& attendance" sub="Scan a badge to punch in/out. Wages add up automatically." />
      <LabourClient today={today} labourers={(labourers ?? []) as never} attendance={(att ?? []) as never} payments={(pays ?? []) as never} tab={tab === "labels" ? "labels" : tab === "wages" ? "wages" : "today"} openId={open ?? null} rooms={rooms ?? []} ingredients={ingredients ?? []} property={session.restaurant.name} />
    </>
  );
}
