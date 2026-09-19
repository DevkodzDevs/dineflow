import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { modulesFor } from "@dineflow/shared";
import { PageHeader } from "@/components/shell/PageHeader";
import { StaffClient } from "./StaffClient";
export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";
export default async function StaffPage() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: staff }, { data: invites }, { data: dom }] = await Promise.all([
    // filtered as well as trusted to RLS: a screen that lists people should say which people it means
    s.from("profiles").select("id, full_name, email, phone, contact_email, contact_verified_at, staff_code, role, is_active, created_at, allowed_modules, must_change_password")
      .eq("restaurant_id", session.profile.restaurant_id).order("created_at"),
    s.from("invites").select("code, role, expires_at, used_by").is("used_by", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    // stored on the property, so a rename never strands the logins already issued
    s.rpc("staff_login_domain", { p_rid: session.profile.restaurant_id }),
  ]);
  // what the person doing the managing holds themselves — they can only pass on what is in here
  const myModules = modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null);
  return (<><PageHeader eyebrow="Who's on shift" title="Staff" /><StaffClient me={session.userId} myRole={session.profile.role} myModules={myModules} type={session.restaurant.property_type} enabled={session.restaurant.enabled_modules ?? null} staff={(staff ?? []) as never} invites={invites ?? []} loginDomain={(dom as string) ?? "dineflow.in"} /></>);
}
