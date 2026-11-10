import { createClient } from "@/lib/supabase/server";
import { requireSession, featureOn } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScanClient } from "./ScanClient";
export const metadata = { title: "Scan" };
export const dynamic = "force-dynamic";
export default async function ScanPage() {
  const s = await createClient();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: categories }, { data: recent }] = await Promise.all([
    requireSession(),
    s.from("categories").select("id, name").order("sort_order"),
    s.from("scan_log").select("id, source, kind, action, created_at, result").order("created_at", { ascending: false }).limit(12),
  ]);
  return (
    <>
      <PageHeader eyebrow="Scan anything" title="Smart" accent="scan" sub="Items, IDs, QR labels" />
      {/* 0175: photos need the server's key and the AI and Photo recognition add-ons; the ID-card path its own (off by default) */}
      <ScanClient categories={categories ?? []} recent={(recent ?? []) as never} aiEnabled={!!process.env.ANTHROPIC_API_KEY && featureOn(session, "ai") && featureOn(session, "scan-vision")}
        idScan={featureOn(session, "ai") && featureOn(session, "scan-id")} propertyType={session.restaurant.property_type} />
    </>
  );
}
