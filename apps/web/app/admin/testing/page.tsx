import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { TestingClient, type Run, type Hist } from "./TestingClient";
import { CrashList, type Crash } from "./CrashList";

export const metadata = { title: "Testing · Master control" };
export const dynamic = "force-dynamic";

/**
 * Master control → Testing. The page carries the last result of every suite (one row each from
 * selftest_runs), the properties the function/speed/screen suites can run against, and whether the
 * master is inside a property right now — property screens can only be timed and loaded while
 * acting as one.
 */
export default async function TestingPage() {
  await requireAdmin();
  const s = await createClient();
  const [{ data: runs }, { data: props }, { data: bundle }, { data: crashes }] = await Promise.all([
    s.from("selftest_runs").select("suite, status, ms, checks, ran_at").order("ran_at", { ascending: false }).limit(200),
    s.from("restaurants").select("id, name").is("demo_expires_at", null).order("name"),
    s.rpc("session_bundle"),
    // 0149: the crashes people saw this week, beside the suites (the master reads client_errors)
    s.from("client_errors").select("id, kind, path, name, message, digest, ua, count, first_at, last_at, restaurants(name)").gte("last_at", new Date(Date.now() - 7 * 864e5).toISOString()).order("last_at", { ascending: false }).limit(60),
  ]);
  const last: Record<string, Run> = {};
  /* the run before the last of each suite, as name → status: what got worse (new) and what got better (fixed) */
  const prev: Record<string, Record<string, string>> = {};
  for (const r of (runs ?? []) as Run[]) {
    if (!last[r.suite]) last[r.suite] = r;
    else if (!prev[r.suite]) prev[r.suite] = Object.fromEntries(r.checks.map((c) => [c.name, c.status]));
  }
  const acting = ((bundle as { acting_as?: string | null } | null)?.acting_as) ?? null;
  /* every kept run, oldest first, without its checks: the dots on each row and the trend line */
  const history: Hist[] = ((runs ?? []) as Run[]).map((r) => ({ suite: r.suite, status: r.status, ms: r.ms, ran_at: r.ran_at,
    pass: r.checks.filter((c) => c.status === "pass").length, warn: r.checks.filter((c) => c.status === "warn").length, fail: r.checks.filter((c) => c.status === "fail").length })).reverse();
  const crashRows: Crash[] = ((crashes ?? []) as unknown as (Omit<Crash, "restaurant"> & { restaurants: { name: string } | null })[]).map(({ restaurants, ...c }) => ({ ...c, restaurant: restaurants?.name ?? null }));
  return (
    <div className="space-y-5">
      <TestingClient last={last} prev={prev} history={history} properties={(props ?? []) as { id: string; name: string }[]} acting={acting} />
      <CrashList rows={crashRows} />
    </div>
  );
}
