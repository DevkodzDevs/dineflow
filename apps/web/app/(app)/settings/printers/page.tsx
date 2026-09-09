import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { PrintersClient } from "./PrintersClient";
export const metadata = { title: "Printers" };
export const dynamic = "force-dynamic";
export default async function PrintersPage() {
  const s = await createClient(); const session = await requireSession();
  const { data } = await s.from("printers").select("*").order("kind");
  return (<><PageHeader eyebrow="Hardware" title="Thermal" accent="printers" sub="58 mm or 80 mm kitchen and bill printers over Bluetooth, USB or the LAN." /><PrintersClient printers={data ?? []} restaurant={session.restaurant} /></>);
}
