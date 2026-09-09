import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { SettingsClient } from "./SettingsClient";
export const metadata = { title: "Settings" };
export default async function SettingsPage() {
  const s = await createClient(); const session = await requireSession();
  const { data: tables } = await s.from("dining_tables").select("*").order("sort_order");
  return (<><PageHeader eyebrow="Your restaurant" title="Settings" /><SettingsClient restaurant={session.restaurant as never} tables={tables ?? []} /></>);
}
