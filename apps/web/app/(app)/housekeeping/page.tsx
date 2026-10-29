import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { HousekeepingClient } from "./HousekeepingClient";
export const metadata = { title: "Housekeeping" };
export const dynamic = "force-dynamic";

export default async function HK() {
  const s = await createClient(); const today = todayIST();
  // the session is fetched alongside the rows, not in front of them — one round trip, not two
  const [session, { data: tasks }, { data: rooms }, { data: stays }, { data: done }, { data: people }] = await Promise.all([
    requireSession(),
    s.from("housekeeping_tasks").select("*, rooms(number, floor)").neq("status", "done").order("created_at"),
    s.from("rooms").select("id, number, floor, status, condition, condition_at").order("sort_order"),
    // who is in which room tonight, so an attendant knows whose bed it is and when they leave
    s.from("bookings").select("room_id, check_out, guests(full_name, vip)").eq("status", "checked_in"),
    s.from("housekeeping_tasks").select("id, kind, done_at, done_by, taken_at, rooms(number)").eq("status", "done").order("done_at", { ascending: false }).limit(10),
    // who has each task, and who a supervisor can give one to (0111)
    s.from("profiles").select("id, full_name, role, position_title, department, position").eq("is_active", true).order("full_name"),
  ]);
  const canInspect = ["owner", "manager", "supervisor", "supervisor_2"].includes(session.profile.role);
  const inspectRule = !!session.restaurant.hk_inspect_required;
  return (
    <>
      <PageHeader eyebrow="Rooms division" title="House" accent="keeping" sub={inspectRule ? "Inspected before sale" : "Clean, then on sale"} />
      <HousekeepingClient today={today} tasks={(tasks ?? []) as never} rooms={(rooms ?? []) as never} stays={(stays ?? []) as never} done={(done ?? []) as never} canInspect={canInspect} inspectRule={inspectRule}
        people={(people ?? []) as never} me={session.profile.id} />
    </>
  );
}
