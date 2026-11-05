import { createClient } from "@/lib/supabase/server";
import { RecordsClient } from "./RecordsClient";
import type { RecordRow, Activity, DataServer } from "../types";
export const metadata = { title: "Records · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Records: every backup ever made, on every server, with where it is and whether it checked; and what Master control did. */
export default async function RecordsPage() {
  const s = await createClient();
  const [rec, act, sv] = await Promise.all([s.rpc("data_records", { p_limit: 500 }), s.rpc("data_activity", { p_limit: 200 }), s.rpc("data_servers_get")]);
  return <RecordsClient records={(rec.data ?? []) as RecordRow[]} activity={(act.data ?? []) as Activity[]} servers={(sv.data ?? []) as DataServer[]} at={new Date().toISOString()} />;
}
