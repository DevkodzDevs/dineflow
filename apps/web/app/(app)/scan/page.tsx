import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScanClient } from "./ScanClient";
export const metadata = { title: "Scan" };
export const dynamic = "force-dynamic";
export default async function ScanPage() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: categories }, { data: recent }] = await Promise.all([
    s.from("categories").select("id, name").order("sort_order"),
    s.from("scan_log").select("id, source, kind, action, created_at, result").order("created_at", { ascending: false }).limit(12),
  ]);
  return (
    <>
      <PageHeader eyebrow="Point the camera at anything" title="Smart" accent="scan" sub="Vegetables, packets, dishes, room doors, worker ID cards, DineFlow QR labels — each lands in the right place." />
      <ScanClient categories={categories ?? []} recent={(recent ?? []) as never} aiEnabled={!!process.env.ANTHROPIC_API_KEY} propertyType={session.restaurant.property_type} />
    </>
  );
}
