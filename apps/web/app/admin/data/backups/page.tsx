import { createClient } from "@/lib/supabase/server";
import { projectRef } from "@/lib/backup/supabaseApi";
import { BackupsClient } from "./BackupsClient";
import type { Overview, Settings, Backup, DataServer, NodeFile, Env } from "../types";
export const metadata = { title: "Backups · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Backups, for the connected server: the cloud's list with Download / Check / Off-site, or a node's files with its jobs. */
export default async function BackupsPage() {
  const s = await createClient();
  const [sv, st, ov] = await Promise.all([s.rpc("data_servers_get"), s.rpc("data_settings_get"), s.rpc("data_overview")]);
  const servers = (sv.data ?? []) as DataServer[]; const active = servers.find((x) => x.active) ?? servers[0];
  const env: Env = { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: process.env.VERCEL_REGION ?? null, ref: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), roundTrip: 0, anonKey: "", url: "" };
  const props = (ov.data as Overview | null)?.properties ?? [];
  if (active.kind === "cloud") {
    const { data: bk } = await s.from("data_backups").select("id, kind, status, label, restaurant_id, started_at, finished_at, file_path, size_bytes, raw_bytes, tables, rows_total, files, files_bytes, verified_at, verify_ok, verify_note, offsite_at, offsite_ok, offsite_note, error, server_id")
      .eq("server_id", active.id).order("started_at", { ascending: false }).limit(60);
    return <BackupsClient server={active} servers={servers} settings={st.data as Settings} backups={(bk ?? []) as Backup[]} files={[]} properties={props} env={env} at={new Date().toISOString()} />;
  }
  const { data: files } = await s.rpc("data_server_files", { p_id: active.id });
  return <BackupsClient server={active} servers={servers} settings={st.data as Settings} backups={[]} files={(files ?? []) as NodeFile[]} properties={props} env={env} at={new Date().toISOString()} />;
}
