import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "./AdminClient";
export const metadata = { title: "Master control" };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { tab, error } = await searchParams;
  const s = await createClient();
  // sweep expired demo sandboxes before loading the estate list (Master control only, since 0098)
  try { await s.rpc("sweep_expired_demos"); } catch { /* best effort */ }
  // the names follow the order of the reads — access and boxes used to be the other way round, so the
  // property codes, the Access sheet's current modules and the "On a Box" filter each got the other's rows
  const [{ data: tenants }, { data: keys }, { data: log }, { data: access }, { data: boxes }, { data: defaultPassword }] = await Promise.all([
    s.rpc("admin_overview"),
    s.from("membership_keys").select("*").order("created_at", { ascending: false }).limit(50),
    s.from("admin_log").select("*").order("created_at", { ascending: false }).limit(30),
    // real properties only — demo sandboxes are excluded
    s.from("restaurants").select("id, enabled_modules, code").is("demo_expires_at", null),
    s.rpc("admin_box_status"),
    // 0098: true while this login still signs in with the password migration 0011 shipped with
    s.rpc("master_password_is_default"),
  ]);
  const rows = (access ?? []) as { id: string; enabled_modules: string[] | null; code: string | null }[];
  return <AdminClient tenants={(tenants ?? []) as never} keys={(keys ?? []) as never} log={(log ?? []) as never} tab={tab === "keys" ? "keys" : "properties"} boxes={(boxes ?? []) as never} access={rows} codes={rows.map((r) => ({ id: r.id, code: r.code }))} openError={error ?? null} defaultPassword={defaultPassword === true} />;
}
