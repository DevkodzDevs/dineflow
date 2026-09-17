import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "./AdminClient";
export const metadata = { title: "Master control" };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const s = await createClient();
  const [{ data: tenants }, { data: keys }, { data: log }, { data: boxes }, { data: access }] = await Promise.all([
    s.rpc("admin_overview"),
    s.from("membership_keys").select("*").order("created_at", { ascending: false }).limit(50),
    s.from("admin_log").select("*").order("created_at", { ascending: false }).limit(30),
    // one read serves two props: which modules are switched on, and the DineFlow code to show
    // under each property name. admin_overview is left alone rather than widened.
    s.from("restaurants").select("id, enabled_modules, code"),
    s.rpc("admin_box_status"),
  ]);
  const rows = (access ?? []) as { id: string; enabled_modules: string[] | null; code: string | null }[];
  return <AdminClient tenants={(tenants ?? []) as never} keys={(keys ?? []) as never} log={(log ?? []) as never} tab={tab === "keys" ? "keys" : "properties"} boxes={(boxes ?? []) as never} access={rows} codes={rows.map((r) => ({ id: r.id, code: r.code }))} />;
}
