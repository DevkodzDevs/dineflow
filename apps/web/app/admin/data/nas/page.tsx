import { createClient } from "@/lib/supabase/server";
import { NasClient, type NasServer } from "./NasClient";
export const metadata = { title: "NAS · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → NAS (0189): the NAS at the property — its backups and its copy of every file — with the two switches and the Add wizard.
 *  Master only (the Data layout's requireAdmin, and every function checks for itself). */
export default async function NasPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  const s = await createClient();
  const { data } = await s.rpc("data_servers_get");
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return <NasClient servers={(data ?? []) as NasServer[]} at={new Date().toISOString()} adding={add === "1"}
    setup={{ url, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", base: process.env.NEXT_PUBLIC_CLOUD_URL || "" }}
    serviceRole={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />;
}
