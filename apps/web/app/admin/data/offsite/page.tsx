import { createClient } from "@/lib/supabase/server";
import { projectRef } from "@/lib/backup/supabaseApi";
import { OffsitePanel } from "../CarePanel";
import { CLOUD_ID, type Settings, type Backup, type Env } from "../types";
export const metadata = { title: "Outside copies & plans · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Outside copies & plans: what is free and what is paid; the S3 copy; Supabase's own backups. */
export default async function OffsitePage() {
  const s = await createClient();
  const [st, bk] = await Promise.all([s.rpc("data_settings_get"), s.from("data_backups").select("id, kind, status, label, restaurant_id, started_at, finished_at, file_path, size_bytes, raw_bytes, tables, rows_total, files, files_bytes, verified_at, verify_ok, verify_note, offsite_at, offsite_ok, offsite_note, error, server_id").eq("server_id", CLOUD_ID).eq("status", "done").order("started_at", { ascending: false }).limit(20)]);
  const env: Env = { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: process.env.VERCEL_REGION ?? null, ref: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), roundTrip: 0, anonKey: "", url: "" };
  return <OffsitePanel settings={st.data as Settings} env={env} backups={(bk.data ?? []) as Backup[]} />;
}
