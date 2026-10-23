import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { DEPARTMENTS, POSITIONS, ROLE_LABEL } from "@dineflow/shared";
import { myDept } from "../tasks/dept";
import { MeClient, type Me, type Day } from "./MeClient";
export const metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

const BASE = "id, full_name, email, phone, contact_email, contact_verified_at, role, position, position_title, department, staff_code, joined_on, reports_to";
const SELF = ", display_name, emergency_name, emergency_phone, about, languages, avatar_tone";   // 0125

/**
 * The person's own page (2026-10-20): what the property knows about them — role, position, team, staff code, joined,
 * who they report to, all the owner's to set and shown read-only — the details they keep themselves (0125
 * my_profile_save: the name they go by, phone, contact email, an emergency contact, languages, a line about them, the
 * colour of their circle), their sign-in, today at a glance, and this device's look, language and alerts. Everyone has
 * it, the owner included. Master control acting as an owner has no profile of its own here: it gets the device part.
 */
export default async function MePage() {
  const session = await requireSession();
  const s = await createClient();
  const signOut = <form action="/logout" method="post"><button className="btn btn-gray !h-11 px-4 inline-flex items-center gap-2 text-sm font-semibold" data-me-signout><LogOut size={16} /> Sign out</button></form>;
  if (session.actingAs) return <><PageHeader eyebrow="Your account" title="My profile" actionsInline actions={signOut} /><MeClient me={null} day={null} /></>;

  const today = todayIST();
  // 0125's columns; before it is applied the page still opens, with only the fields that already exist
  const first = await s.from("profiles").select(BASE + SELF).eq("id", session.profile.id).maybeSingle();
  const ready = !first.error;
  const row = ready ? first.data : (await s.from("profiles").select(BASE).eq("id", session.profile.id).maybeSingle()).data;
  const p = (row ?? {}) as Record<string, unknown>;
  const str = (k: string) => (p[k] as string | null) ?? null;

  const [boss, att, lists, runs, jobs] = await Promise.all([
    str("reports_to") ? s.from("profiles").select("full_name, position_title, role").eq("id", str("reports_to")!).maybeSingle() : Promise.resolve({ data: null }),
    s.from("staff_attendance").select("in_at, out_at").eq("profile_id", session.profile.id).eq("work_date", today).order("in_at", { ascending: false }).limit(1),
    s.from("checklists").select("id, items").eq("is_active", true),
    s.from("checklist_runs").select("checklist_id, completed_at").eq("run_date", today),
    s.from("jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"]).or(`assigned_to.eq.${session.profile.id},taken_by.eq.${session.profile.id}`),
  ]);

  const role = (str("role") ?? session.profile.role) as keyof typeof ROLE_LABEL;
  const pos = POSITIONS.find((x) => x.key === str("position"));
  const dept = myDept(role, str("department") ?? pos?.dept ?? null);
  const b = boss.data as { full_name: string; position_title: string | null; role: string } | null;
  const me: Me = {
    full_name: str("full_name") ?? session.profile.full_name,
    login: str("email") ?? "",
    role: ROLE_LABEL[role] ?? role, roleKey: role,
    title: str("position_title") ?? pos?.title ?? null,
    dept: dept, deptLabel: DEPARTMENTS.find((d) => d.key === dept)?.label ?? null,
    staff_code: str("staff_code"), joined_on: str("joined_on"),
    reports_to: b ? { name: b.full_name, title: b.position_title ?? ROLE_LABEL[b.role as keyof typeof ROLE_LABEL] ?? b.role } : null,
    verified: !!p.contact_verified_at, ready,
    details: {
      display_name: str("display_name") ?? "", phone: str("phone") ?? "", contact_email: str("contact_email") ?? "",
      emergency_name: str("emergency_name") ?? "", emergency_phone: str("emergency_phone") ?? "", about: str("about") ?? "",
      languages: (p.languages as string[] | null) ?? [], avatar_tone: str("avatar_tone"),
    },
  };
  const a = (att.data ?? [])[0] as { in_at: string | null; out_at: string | null } | undefined;
  const live = (lists.data ?? []).filter((l) => ((l.items as string[] | null) ?? []).length > 0);
  const day: Day = {
    attendance: role === "owner" ? null : { in_at: a?.in_at ?? null, out_at: a?.out_at ?? null },
    lists: live.length, listsDone: (runs.data ?? []).filter((r) => r.completed_at && live.some((l) => l.id === r.checklist_id)).length,
    jobs: jobs.count ?? 0,
  };
  return (
    <>
      <PageHeader eyebrow="Your account" title="My profile" sub="Your details and sign-in" actionsInline actions={signOut} />
      <MeClient me={me} day={day} />
    </>
  );
}
