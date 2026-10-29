import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { AuditClient, type Event } from "./AuditClient";
export const metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

const SEES = ["owner", "manager"];   // 2026-10-20: the owner's and managers' (the RLS policy on audit_events still lets a supervisor read; the screen is not theirs)
const PAGE = 200;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ days?: string; before?: string }> }) {
  const { days: d, before } = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(d)) ? Number(d) : 7;
  const session = await requireSession();
  if (!SEES.includes(session.profile.role)) redirect("/dashboard?locked=audit");
  const s = await createClient();
  // IST days: "today" starts at midnight in Kolkata, not in UTC
  const ist = new Date(Date.now() + 330 * 60000); ist.setUTCHours(0, 0, 0, 0);
  const since = new Date(ist.getTime() - 330 * 60000 - (days - 1) * 86400000).toISOString();
  let q = s.from("audit_events").select("id, at, actor, action, target_type, target_id, label, reason, before, after, amount").gte("at", since).order("id", { ascending: false }).limit(PAGE);
  if (before && /^\d+$/.test(before)) q = q.lt("id", Number(before));
  const { data: events, error } = await q;
  const actors = [...new Set((events ?? []).map((e) => e.actor).filter(Boolean))] as string[];
  const { data: people } = actors.length ? await s.from("profiles").select("id, full_name").in("id", actors) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  return (
    <>
      <PageHeader eyebrow="Who did what" title="Audit" accent="trail" sub="Locked · read-only" />
      <AuditClient events={(events ?? []) as Event[]} names={names} days={days} more={(events?.length ?? 0) === PAGE} error={error?.message ?? null} />
    </>
  );
}
