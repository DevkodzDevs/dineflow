import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { FlowTestsClient, type Past } from "./FlowTestsClient";

export const metadata = { title: "Flow tests · Master control" };
export const dynamic = "force-dynamic";

/**
 * Master control → Flow tests (2026-11-02): the testing flow ("DineFlow — Full Application Testing Flow"), run by itself
 * from start to end on throwaway properties — the whole application, one menu heading, one flow (an order, a bill, a room
 * booking …) or one page. The runs kept so far come from selftest_runs (suite "flow:<mode>"); Testing leaves those out.
 */
export default async function FlowTestsPage() {
  await requireAdmin();
  const s = await createClient();
  const { data } = await s.from("selftest_runs").select("id, suite, status, ms, checks, ran_at").like("suite", "flow:%").order("ran_at", { ascending: false }).limit(12);
  const past: Past[] = ((data ?? []) as { id: string; suite: string; status: Past["status"]; ms: number; checks: { status: string }[]; ran_at: string }[]).map((r) => ({
    id: r.id, label: r.suite.slice(5), status: r.status, ms: r.ms, ran_at: r.ran_at,
    pass: r.checks.filter((c) => c.status === "pass").length, warn: r.checks.filter((c) => c.status === "warn").length, fail: r.checks.filter((c) => c.status === "fail").length,
  }));
  return <FlowTestsClient past={past} />;
}
