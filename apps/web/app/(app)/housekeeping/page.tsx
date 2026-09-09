import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { HousekeepingClient } from "./HousekeepingClient";
export const metadata = { title: "Housekeeping" };
export const dynamic = "force-dynamic";
export default async function HK() {
  const s = await createClient();
  const [{ data: tasks }, { data: rooms }] = await Promise.all([
    s.from("housekeeping_tasks").select("*, rooms(number, floor)").neq("status", "done").order("created_at"),
    s.from("rooms").select("id, number, floor, status").order("sort_order"),
  ]);
  const { data: done } = await s.from("housekeeping_tasks").select("id, kind, done_at, rooms(number)").eq("status", "done").order("done_at", { ascending: false }).limit(10);
  return (<><PageHeader eyebrow="Rooms division" title="House" accent="keeping" /><HousekeepingClient tasks={(tasks ?? []) as never} rooms={rooms ?? []} done={(done ?? []) as never} /></>);
}
