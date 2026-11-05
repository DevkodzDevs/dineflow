import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServerDashboard } from "./ServerDashboard";
import { ServerPanel } from "../../panels";
import type { DataServer, NodeFile, Command, Settings, Server, Env } from "../../types";
import { projectRef } from "@/lib/backup/supabaseApi";
export const metadata = { title: "Server · Data · Master control" };
export const dynamic = "force-dynamic";

/** One server's dashboard: status, machine, controls, files held, job log, setup. The cloud's shows the database's health. */
export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await createClient();
  const [sv, st] = await Promise.all([s.rpc("data_servers_get"), s.rpc("data_settings_get")]);
  const servers = (sv.data ?? []) as DataServer[]; const me = servers.find((x) => x.id === id);
  if (!me) notFound();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (me.kind === "cloud") {
    const t0 = Date.now(); const { data: health } = await s.rpc("data_server"); const roundTrip = Date.now() - t0;
    const env: Env = { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: process.env.VERCEL_REGION ?? null, ref: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), roundTrip, anonKey: "", url };
    return <ServerDashboard server={me} servers={servers} files={[]} commands={[]} settings={st.data as Settings} at={new Date().toISOString()} setup={{ url, anonKey: "", base: "" }} env={env}
      cloudHealth={health ? <ServerPanel sv={health as Server} env={env} /> : null} />;
  }
  const [files, cmds] = await Promise.all([s.rpc("data_server_files", { p_id: id }), s.rpc("data_server_commands", { p_id: id, p_limit: 40 })]);
  return <ServerDashboard server={me} servers={servers} files={(files.data ?? []) as NodeFile[]} commands={(cmds.data ?? []) as Command[]} settings={st.data as Settings} at={new Date().toISOString()}
    setup={{ url, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", base: process.env.NEXT_PUBLIC_CLOUD_URL || "" }} env={{ cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: null, ref: null, roundTrip: 0, anonKey: "", url }} />;
}
