import { createClient } from "@/lib/supabase/server";
import { OverviewClient } from "./OverviewClient";
import type { Overview, Settings, Backup, DataServer } from "./types";
export const metadata = { title: "Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Overview: the protection strip for the connected server, Back up now, and what the storage holds. */
export default async function DataOverviewPage() {
  const s = await createClient();
  const [ov, st, sv] = await Promise.all([s.rpc("data_overview"), s.rpc("data_settings_get"), s.rpc("data_servers_get")]);
  const servers = (sv.data ?? []) as DataServer[]; const settings = st.data as Settings;
  const active = servers.find((x) => x.active) ?? servers[0];
  const { data: bk } = await s.from("data_backups").select("id, kind, status, label, restaurant_id, started_at, finished_at, file_path, size_bytes, raw_bytes, tables, rows_total, files, files_bytes, verified_at, verify_ok, verify_note, offsite_at, offsite_ok, offsite_note, error, server_id")
    .eq("server_id", active?.id ?? "").order("started_at", { ascending: false }).limit(10);
  return <OverviewClient overview={ov.data as Overview} settings={settings} servers={servers} backups={(bk ?? []) as Backup[]} env={{ cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) }} />;
}
