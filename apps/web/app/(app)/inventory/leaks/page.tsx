import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { LeaksClient } from "./LeaksClient";
export const metadata = { title: "Leak finder" };
export const dynamic = "force-dynamic";
export default async function Leaks() {
  const s = await createClient(); await requireSession();
  const [{ data: report }, { data: ingredients }] = await Promise.all([s.rpc("leak_report", { p_days: 30 }), s.from("ingredients").select("id, name, unit, current_stock").eq("is_active", true).order("name")]);
  return <LeaksClient report={(report ?? { items: [] }) as never} ingredients={ingredients ?? []} />;
}
