import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { DEPARTMENTS, POSITIONS, ROLE_LABEL, landsOnMyDay } from "@dineflow/shared";
import { myDept } from "../tasks/dept";
import { HomeClient, type Home } from "./HomeClient";
export const metadata = { title: "My day" };
export const dynamic = "force-dynamic";

/**
 * **My day** (2026-10-20 — the owner: "when staff sign in, straight to their own dashboard"): where everyone but the owner
 * and a manager lands. One round trip reads the person's own day — their open jobs (Work, 0113/0116), today's checklists
 * for them (RLS, 0122/0123), this month's attendance, their leave (0127), their pay rate, advances and finalised
 * payslips (0106's own-row policies; `my_payslips`, 0127), and unread answers from the owner (0124). Each is a tile that
 * opens in full. The owner and managers keep the control room — they are sent there.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const session = await requireSession();
  if (!landsOnMyDay(session.profile.role) || session.actingAs) redirect("/dashboard");
  const { locked } = await searchParams;
  const s = await createClient();
  const me = session.profile.id; const today = todayIST(); const month = today.slice(0, 7);
  const monthStart = `${month}-01`; const weekAgo = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10);
  const from = monthStart < weekAgo ? monthStart : weekAgo;

  const [prof, jobs, done, lists, runs, att, leave, pay, adv, slips, unread] = await Promise.all([
    s.from("profiles").select("full_name, display_name, position, position_title, department, staff_code").eq("id", me).maybeSingle(),
    s.from("jobs").select("id, title, place, priority, due_at, status, assigned_at, assigned_to, taken_by, guest_impact, created_at")
      .in("status", ["pending", "in_progress"]).or(`assigned_to.eq.${me},taken_by.eq.${me}`).order("priority").order("due_at", { ascending: true, nullsFirst: false }).limit(40),
    s.from("jobs").select("id", { count: "exact", head: true }).eq("done_by", me).gte("done_at", `${today}T00:00:00+05:30`),
    s.from("checklists").select("id, name, shift, items, departments, jobs, positions").eq("is_active", true).order("sort_order"),
    s.from("checklist_runs").select("checklist_id, done, completed_at").eq("run_date", today),
    s.from("staff_attendance").select("work_date, in_at, out_at, hours").eq("profile_id", me).gte("work_date", from).order("work_date"),
    s.from("staff_leave").select("id, from_date, to_date, days, kind, reason, status, decision_note, decided_at, created_at").eq("profile_id", me).order("from_date", { ascending: false }).limit(40),
    s.from("staff_pay").select("basis, amount").eq("profile_id", me).maybeSingle(),
    s.from("staff_advances").select("amount, given_on, note").eq("profile_id", me).is("recovered_in", null).order("given_on", { ascending: false }),
    s.rpc("my_payslips", { p_limit: 12 }),
    s.rpc("voice_unread"),
  ]);

  const p = (prof.data ?? {}) as { full_name?: string; display_name?: string | null; position?: string | null; position_title?: string | null; department?: string | null; staff_code?: string | null };
  const pos = POSITIONS.find((x) => x.key === p.position);
  const dept = myDept(session.profile.role, p.department ?? pos?.dept ?? null);
  const attend = ((session.restaurant.attendance_methods as string[] | undefined) ?? []).some((m) => m === "biometric" || m === "selfie");
  const runOf = (id: string) => (runs.data ?? []).find((r) => r.checklist_id === id);
  const home: Home = {
    me, today, locked: locked ?? null, attend,
    name: (p.display_name || p.full_name || session.profile.full_name).split(" ")[0] ?? "",
    fullName: p.display_name || p.full_name || session.profile.full_name,
    title: p.position_title ?? pos?.title ?? ROLE_LABEL[session.profile.role] ?? session.profile.role,
    team: DEPARTMENTS.find((d) => d.key === dept)?.label ?? null, teamKey: dept,
    property: session.restaurant.name,
    jobs: (jobs.data ?? []) as Home["jobs"], doneToday: done.count ?? 0,
    // the lists for them — everyone's, and those naming their team, job or position (a supervisor's RLS hands them every list)
    lists: (lists.data ?? []).filter((l) => ((l.items as string[] | null) ?? []).length).filter((l) => {
      const d = (l.departments as string[] | null) ?? [], j = (l.jobs as string[] | null) ?? [], ps = (l.positions as string[] | null) ?? [];
      return !d.length && !j.length && !ps.length || (!!dept && d.includes(dept)) || j.includes(session.profile.role) || (!!p.position && ps.includes(p.position));
    }).map((l) => ({ id: l.id as string, name: l.name as string, shift: l.shift as string, items: l.items as string[], done: (runOf(l.id)?.done ?? {}) as Record<string, { name: string; at: string }> })),
    attendance: (att.data ?? []) as Home["attendance"],
    leave: (leave.data ?? []) as Home["leave"],
    pay: pay.data ? { basis: pay.data.basis as string, amount: Number(pay.data.amount) } : null,
    advances: (adv.data ?? []).map((a) => ({ amount: Number(a.amount), given_on: a.given_on as string, note: (a.note as string | null) ?? null })),
    payslips: ((slips.data ?? []) as Home["payslips"]) ?? [],
    unread: typeof unread.data === "number" ? unread.data : 0,
  };
  return <HomeClient home={home} />;
}
