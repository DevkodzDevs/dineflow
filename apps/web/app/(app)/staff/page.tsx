import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { StaffClient } from "./StaffClient";
export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";
export default async function StaffPage() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: staff }, { data: invites }] = await Promise.all([
    s.from("profiles").select("id, full_name, email, role, is_active, created_at, allowed_modules").order("created_at"),
    s.from("invites").select("code, role, expires_at, used_by").is("used_by", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  return (<><PageHeader eyebrow="Who's on shift" title="Staff" /><StaffClient me={session.userId} myRole={session.profile.role} type={session.restaurant.property_type} enabled={session.restaurant.enabled_modules ?? null} staff={(staff ?? []) as never} invites={invites ?? []} /></>);
}
