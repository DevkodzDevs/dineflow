import { createClient } from "@/lib/supabase/server";
import { CleanupPanel } from "../CarePanel";
import type { Settings } from "../types";
export const metadata = { title: "Clean-up · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Clean-up: rows that pile up and are never read again, previewed before they go. */
export default async function CleanupPage() {
  const s = await createClient(); const { data } = await s.rpc("data_settings_get");
  return <CleanupPanel settings={data as Settings} />;
}
