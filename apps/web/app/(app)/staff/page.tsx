import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { modulesFor } from "@dineflow/shared";
import { StaffClient } from "./StaffClient";
import { StaffAttendance } from "./StaffAttendance";
import { StaffLeave, type LeaveRow } from "./StaffLeave";
import { todayIST } from "@/lib/format";
export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";
export default async function StaffPage() {
  const s = await createClient(); const session = await requireSession(); const today = todayIST();
  // 0127: who decides leave — the owner, managers, and a supervisor for their own team (RLS narrows them)
  const decides = ["owner", "manager", "supervisor", "supervisor_2"].includes(session.profile.role);
  const [{ data: staff }, { data: invites }, { data: dom }, { data: att }, leave] = await Promise.all([
    // filtered as well as trusted to RLS: a screen that lists people should say which people it means
    s.from("profiles").select("id, full_name, email, phone, contact_email, contact_verified_at, staff_code, role, is_active, created_at, allowed_modules, must_change_password, position, position_title, department, reports_to, joined_on")
      .eq("restaurant_id", session.profile.restaurant_id).order("created_at"),
    s.from("invites").select("code, role, expires_at, used_by").is("used_by", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    // stored on the property, so a rename never strands the logins already issued
    s.rpc("staff_login_domain", { p_rid: session.profile.restaurant_id }),
    s.from("staff_attendance").select("profile_id, in_at, out_at, hours, method_in").eq("work_date", today),
    decides ? s.from("staff_leave").select("id, profile_id, from_date, to_date, days, kind, reason, status, decision_note, created_at").order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: null }),
  ]);
  const methods = (session.restaurant.attendance_methods as string[] | undefined) ?? ["manual", "qr"];
  // what the person doing the managing holds themselves — they can only pass on what is in here
  const myModules = modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null);
  const onDuty = (att ?? []).filter((a) => a.in_at && !a.out_at).length;
  const names = Object.fromEntries((staff ?? []).map((p) => [p.id as string, p.full_name as string]));
  const leaveRows = ((leave.data ?? []) as LeaveRow[]).sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));
  return (<><StaffClient onDuty={onDuty} me={session.userId} myRole={session.profile.role} myModules={myModules} type={session.restaurant.property_type} enabled={session.restaurant.enabled_modules ?? null} duty={(att ?? []) as never} staff={(staff ?? []) as never} invites={invites ?? []} loginDomain={(dom as string) ?? "dineflow.cloud"} />
    <StaffAttendance today={today} staff={(staff ?? []) as never} att={att ?? []} methods={methods} canMark={["owner", "manager", "supervisor"].includes(session.profile.role)} property={session.restaurant.name} />
    {decides && <StaffLeave rows={leaveRows} names={names} me={session.userId} />}</>);
}
