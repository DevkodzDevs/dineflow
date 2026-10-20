import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { DEPARTMENTS, POSITIONS, ROLE_LABEL, hierarchyFor, type Role } from "@dineflow/shared";
import { TasksClient, type List, type Run, type Choice, type Who } from "./TasksClient";
import { myDept } from "./dept";
export const metadata = { title: "Checklists" };
export const dynamic = "force-dynamic";

/** Jobs a list can be for: everyone below the people who write the lists (they see every list anyway). */
const JOBS: Role[] = ["waiter", "cashier", "chef", "frontdesk", "housekeeping", "store", "employee", "supervisor_2"];

/**
 * Opening, closing and any-time duties: today's ticks, and the last week at a glance. Each list says who it is for —
 * by team (0122), by job and by position (0123) — and RLS hands a person only the lists for everyone and for their own
 * team, job or position; the owner, managers and supervisors (who write them) get every list, and the choices: the
 * teams this kind of property has, the jobs, and the positions people on the staff hold, each with how many people.
 */
export default async function TasksPage() {
  const today = todayIST(); const weekAgo = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10);
  const s = await createClient();
  const [session, { data: lists }, { data: runs }] = await Promise.all([
    requireSession(),
    s.from("checklists").select("id, name, shift, items, is_active, sort_order, departments, jobs, positions").order("sort_order"),
    s.from("checklist_runs").select("checklist_id, run_date, done, completed_at").gte("run_date", weekAgo),
  ]);
  const editor = ["owner", "manager", "supervisor"].includes(session.profile.role);
  // who stands where — no names, only team, job and position, so the editor can say how many people a list reaches
  let people: Who[] = [];
  if (editor) {
    const { data: staff } = await s.from("profiles").select("role, department, position").eq("restaurant_id", session.profile.restaurant_id).eq("is_active", true);
    people = (staff ?? []).filter((p) => !["owner", "manager", "supervisor"].includes(p.role)).map((p) => ({ d: myDept(p.role, p.department), j: p.role as string, p: (p.position as string | null) ?? null }));
  }
  const count = (f: (w: Who) => boolean) => people.filter(f).length;
  const used = (col: "departments" | "jobs" | "positions") => new Set((lists ?? []).flatMap((l) => (l[col] as string[] | null) ?? []));
  const me: Who = { d: myDept(session.profile.role, session.profile.department ?? null), j: session.profile.role, p: session.profile.position ?? null };

  // teams: this kind of property's, plus any someone stands in or a list is for (a restaurant's front-desk host reads
  // as Front office, which a restaurant does not list) — under its own name, never a bare key
  const teams: Choice[] = hierarchyFor(session.restaurant.property_type).map((d) => ({ key: d.key, label: d.label, people: count((w) => w.d === d.key) }));
  const usedTeams = used("departments");
  for (const d of DEPARTMENTS) if (!teams.some((t) => t.key === d.key) && (usedTeams.has(d.key) || people.some((w) => w.d === d.key) || me.d === d.key)) teams.push({ key: d.key, label: d.label, people: count((w) => w.d === d.key) });
  // jobs: the ones someone does here, or a list is for
  const usedJobs = used("jobs");
  const jobs: Choice[] = JOBS.filter((j) => usedJobs.has(j) || people.some((w) => w.j === j) || me.j === j).map((j) => ({ key: j, label: ROLE_LABEL[j], people: count((w) => w.j === j) }));
  // positions: the ones someone on the staff holds, or a list is for, grouped by their team
  const usedPos = used("positions");
  const positions: Choice[] = POSITIONS.filter((p) => (usedPos.has(p.key) || people.some((w) => w.p === p.key) || me.p === p.key) && !["owner", "manager", "supervisor"].includes(p.role))
    .filter((p, i, a) => a.findIndex((x) => x.key === p.key) === i)
    .map((p) => ({ key: p.key, label: p.title, people: count((w) => w.p === p.key), team: p.dept }));

  return (
    <>
      <PageHeader eyebrow="The day's duties" title="Checklists" sub="Tick each duty as it is done — your name and the time go with it. Each list is for everyone, or for the teams, jobs and positions it names; you see the ones that are yours." />
      <TasksClient lists={(lists ?? []) as List[]} runs={(runs ?? []) as Run[]} today={today} editor={editor}
        teams={teams} jobs={jobs} positions={positions} people={people} me={me} />
    </>
  );
}
