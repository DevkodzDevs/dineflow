import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "./AdminClient";
import { PlansCard, type PlanRow } from "./PlansCard";
import { platformReady } from "@/lib/platformPay";
export const metadata = { title: "Master control" };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { tab, error } = await searchParams;
  const s = await createClient();
  // sweep expired demo sandboxes before loading the estate list (Master control only, since 0098)
  try { await s.rpc("sweep_expired_demos"); } catch { /* best effort */ }
  // the names follow the order of the reads — access and boxes used to be the other way round, so the
  // property codes, the Access sheet's current modules and the "On a Box" filter each got the other's rows
  const [{ data: tenants }, { data: keys }, { data: log }, { data: access }, { data: boxes }, { data: defaultPassword }, { data: plans }] = await Promise.all([
    s.rpc("admin_overview"),
    s.from("membership_keys").select("*").order("created_at", { ascending: false }).limit(50),
    s.from("admin_log").select("*").order("created_at", { ascending: false }).limit(30),
    // real properties only — demo sandboxes are excluded; 0175: the property's own add-on list rides along
    s.from("restaurants").select("id, enabled_modules, enabled_features, code, chain_id").is("demo_expires_at", null),
    s.rpc("admin_box_status"),
    // 0098: true while this login still signs in with the password migration 0011 shipped with
    s.rpc("master_password_is_default"),
    // 0151: the plans and their prices (Keys tab); 0175: and their add-ons — read on every tab, the Access sheet says which
    // plan a property follows (two rows)
    s.from("plans").select("key, label, property_types, monthly, yearly, is_active, updated_at, features").order("key", { ascending: false }),
  ]);
  const rows = (access ?? []) as { id: string; enabled_modules: string[] | null; enabled_features: string[] | null; code: string | null; chain_id: string | null }[];
  return (<>
    <AdminClient tenants={(tenants ?? []) as never} keys={(keys ?? []) as never} log={(log ?? []) as never} tab={tab === "keys" ? "keys" : "properties"} boxes={(boxes ?? []) as never} access={rows} codes={rows.map((r) => ({ id: r.id, code: r.code }))} chains={rows.filter((r) => r.chain_id && r.chain_id !== r.id).map((r) => ({ id: r.id, head: r.chain_id! }))} openError={error ?? null} defaultPassword={defaultPassword === true}
      plans={((plans ?? []) as PlanRow[]).map((p) => ({ key: p.key, label: p.label, property_types: p.property_types, is_active: p.is_active, features: p.features }))} />
    {tab === "keys" && <div className="px-4 sm:px-6 pb-10 max-w-6xl mx-auto"><PlansCard plans={(plans ?? []) as PlanRow[]} online={platformReady()} /></div>}
  </>);
}
