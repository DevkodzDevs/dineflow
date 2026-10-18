import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { TasksClient, type List, type Run } from "./TasksClient";
export const metadata = { title: "Checklists" };
export const dynamic = "force-dynamic";

/** Opening, closing and any-time duties: today's ticks, and the last week at a glance. Everyone on the staff. */
export default async function TasksPage() {
  const today = todayIST(); const weekAgo = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10);
  const s = await createClient();
  const [session, { data: lists }, { data: runs }] = await Promise.all([
    requireSession(),
    s.from("checklists").select("id, name, shift, items, is_active, sort_order").order("sort_order"),
    s.from("checklist_runs").select("checklist_id, run_date, done, completed_at").gte("run_date", weekAgo),
  ]);
  const editor = ["owner", "manager", "supervisor"].includes(session.profile.role);
  return (
    <>
      <PageHeader eyebrow="The day's duties" title="Checklists" sub="Tick each duty as it is done — your name and the time go with it. Opening and closing lists the owner writes once; a missed one shows." />
      <TasksClient lists={(lists ?? []) as List[]} runs={(runs ?? []) as Run[]} today={today} editor={editor} />
    </>
  );
}
