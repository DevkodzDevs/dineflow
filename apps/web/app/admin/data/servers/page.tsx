import { createClient } from "@/lib/supabase/server";
import { ServersClient } from "./ServersClient";
import type { DataServer } from "../types";
export const metadata = { title: "Servers · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Servers: the three kinds — your own server, your laptop, the cloud — each server's card, Add, Connect, Open. */
export default async function ServersPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  const s = await createClient();
  const { data } = await s.rpc("data_servers_get");
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return <ServersClient servers={(data ?? []) as DataServer[]} at={new Date().toISOString()} addKind={add === "own" || add === "laptop" ? add : null}
    setup={{ url, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", base: process.env.NEXT_PUBLIC_CLOUD_URL || "" }} />;
}
