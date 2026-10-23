import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { IntelligenceClient, type Compare, type Engineering, type Exceptions } from "./IntelligenceClient";
export const metadata = { title: "Intelligence" };
export const dynamic = "force-dynamic";

/** Owner, managers and supervisors: the people who act on margins and exceptions. The RPCs check the same. */
const SEES = ["owner", "manager"];   // 2026-10-20: the owner's and managers' (it was every supervisor's too) — sections.ts FRESH

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = [7, 28, 90].includes(Number(d)) ? Number(d) : 28;
  // the session and this screen's queries in one round trip, not two — the queries are checked by RLS and the RPCs
  // themselves, so nothing is shown before the role gate below; it only stops waiting on the session first (2026-10-18)
  const s = await createClient();
  const [session, [{ data: eng, error: e1 }, { data: ex, error: e2 }, { data: cmp, error: e3 }]] = await Promise.all([requireSession(), Promise.all([
    s.rpc("menu_engineering", { p_days: days }),
    s.rpc("exceptions_summary", { p_days: days }),
    s.rpc("day_compare"),
  ])]);
  if (!SEES.includes(session.profile.role)) redirect("/dashboard?locked=intelligence");
  const error = e1?.message ?? e2?.message ?? e3?.message ?? null;
  return (
    <>
      <PageHeader eyebrow="DineFlow Intelligence" title="Intelligence" accent="& exceptions"
        sub="What earns, what is given away" />
      <IntelligenceClient days={days} engineering={(eng ?? null) as Engineering | null} exceptions={(ex ?? null) as Exceptions | null} compare={(cmp ?? null) as Compare | null} error={error} />
    </>
  );
}
