import { createClient } from "@/lib/supabase/server";
import { projectRef } from "@/lib/backup/supabaseApi";
import { ServerPanel } from "../panels";
import type { Server, Env } from "../types";
export const metadata = { title: "Database health · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Database health: the live Postgres as an administrator sees it. */
export default async function HealthPage() {
  const s = await createClient(); const t0 = Date.now();
  const { data, error } = await s.rpc("data_server"); const roundTrip = Date.now() - t0;
  if (error || !data) return <div className="card p-5 text-[14px]">The health check could not run: {error?.message}</div>;
  const env: Env = { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: process.env.VERCEL_REGION ?? null, ref: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), roundTrip, anonKey: "", url: "" };
  return <ServerPanel sv={data as Server} env={env} />;
}
